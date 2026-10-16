'use server'

import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { parseIvrMeta, formatIvrMeta } from "@/lib/ivr-tracker"

const getSupabaseAdmin = () => createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function submitIvrUploadRequest(data: { campaignName: string, didNumber: string, didLabel: string, phoneNumbers: string[], notes: string }) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Unauthorized")

        const { data: profile } = await supabase.from('users').select('tenant_id, full_name').eq('id', user.id).single()
        if (!profile) throw new Error("Profile not found")

        const { data: org } = await supabase.from('organizations').select('name').eq('id', profile.tenant_id).single()

        const supabaseAdmin = getSupabaseAdmin()
        const initialNotes = formatIvrMeta(data.notes || '', null, 0)
        const { error: insertError } = await supabaseAdmin.from('ivr_upload_requests').insert({
            tenant_id: profile.tenant_id,
            uploaded_by: user.id,
            campaign_name: data.campaignName,
            did_number: data.didNumber,
            total_contacts: data.phoneNumbers.length,
            notes: initialNotes,
            status: 'pending'
        })
        if (insertError) throw insertError

        let csvString = "phoneNumber\n" + data.phoneNumbers.join("\n")

        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        const resendResponse = await resend.emails.send({
            from: 'Hanva CRM <reports@crm.hanva.in>',
            to: 'rajpootsingh260@gmail.com',
            subject: `[IVR Upload] ${org?.name || profile.tenant_id} - ${data.campaignName} - ${data.phoneNumbers.length} contacts`,
            html: `<h2>New IVR Upload Request</h2><table><tr><td><b>Tenant</b></td><td>${org?.name}</td></tr><tr><td><b>Campaign</b></td><td>${data.campaignName}</td></tr><tr><td><b>DID Number</b></td><td>${data.didNumber}</td></tr><tr><td><b>DID Label</b></td><td>${data.didLabel || 'N/A'}</td></tr><tr><td><b>Total Contacts</b></td><td>${data.phoneNumbers.length}</td></tr><tr><td><b>Notes</b></td><td>${data.notes || 'None'}</td></tr><tr><td><b>Uploaded At</b></td><td>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</td></tr></table>`,
            attachments: [{ filename: data.campaignName.replace(/[^a-zA-Z0-9]/g,'_') + '_contacts.csv', content: Buffer.from(csvString).toString('base64') }]
        })

        if (resendResponse.error) {
            console.error("Resend Error:", resendResponse.error);
            throw new Error(`Email failed to send: ${resendResponse.error.message}`)
        }

        return { success: true }
    } catch (e: any) {
        console.error("IVR Upload Action Error:", e);
        return { success: false, error: e.message }
    }
}

// Fetch history using admin client to bypass RLS, with 5-minute idle auto-completion
export async function getIvrUploadHistory(tenantId: string) {
    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
        .from('ivr_upload_requests')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20)
    if (error) throw new Error(error.message)

    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000

    const mapped = (data || []).map((item: any) => {
        const meta = parseIvrMeta(item.notes)
        item.meta = meta

        // If request is running but no leads have arrived in the last 5 minutes -> complete it
        if (item.status === 'running') {
            if (meta.last_lead_at) {
                const elapsed = now - new Date(meta.last_lead_at).getTime()
                if (elapsed >= fiveMinutes) {
                    item.status = 'completed'
                    // Lazily persist to DB without blocking response
                    supabaseAdmin
                        .from('ivr_upload_requests')
                        .update({ status: 'completed' })
                        .eq('id', item.id)
                        .then()
                }
            }
        }
        return item
    })

    return mapped
}

// Super admin: get all upload requests across all tenants
export async function getAllIvrUploadRequests() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'super_admin') throw new Error("Not authorized")

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
        .from('ivr_upload_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
    if (error) throw new Error(error.message)

    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000

    const mapped = (data || []).map((item: any) => {
        const meta = parseIvrMeta(item.notes)
        item.meta = meta

        if (item.status === 'running' && meta.last_lead_at) {
            if (now - new Date(meta.last_lead_at).getTime() >= fiveMinutes) {
                item.status = 'completed'
                supabaseAdmin
                    .from('ivr_upload_requests')
                    .update({ status: 'completed' })
                    .eq('id', item.id)
                    .then()
            }
        }
        return item
    })

    return mapped
}

// Super admin: get wallet balance for a tenant
export async function getTenantWallet(tenantId: string) {
    const supabaseAdmin = getSupabaseAdmin()
    const { data } = await supabaseAdmin
        .from('tenant_wallets')
        .select('credits_balance')
        .eq('tenant_id', tenantId)
        .maybeSingle()
    return data?.credits_balance ?? 0
}

// Super admin: get all tenant wallet balances at once
export async function getAllTenantWallets() {
    const supabaseAdmin = getSupabaseAdmin()
    const { data } = await supabaseAdmin
        .from('tenant_wallets')
        .select('tenant_id, credits_balance')
    return data || []
}

// Super admin: adjust credits (plus or minus)
export async function adjustTenantCredits(tenantId: string, amount: number, note: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'super_admin') throw new Error("Not authorized")

    const supabaseAdmin = getSupabaseAdmin()

    // Log the transaction in wallet_ledger (a database trigger automatically updates tenant_wallets)
    if (amount !== 0) {
        const { error } = await supabaseAdmin.from('wallet_ledger').insert({
            tenant_id: tenantId,
            credits: amount,
            transaction_type: amount > 0 ? 'RECHARGE' : 'DEDUCTION',
            description: note || (amount > 0 ? 'Manual Credit Addition (Super Admin)' : 'IVR Campaign Consumption')
        })
        if (error) throw new Error(error.message)
    }

    // Fetch the updated balance
    const { data: existing } = await supabaseAdmin.from('tenant_wallets').select('credits_balance').eq('tenant_id', tenantId).maybeSingle()
    return { newBalance: existing?.credits_balance ?? 0 }
}

// Super admin: update request status
export async function updateIvrRequestStatus(id: string, status: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'super_admin') throw new Error("Not authorized")

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('ivr_upload_requests').update({ status }).eq('id', id)
    if (error) throw new Error(error.message)
    return true
}

export async function getWalletHistory(tenantId: string) {
    const supabaseAdmin = getSupabaseAdmin()
    const { data } = await supabaseAdmin
        .from('wallet_ledger')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50)
    return data || []
}
