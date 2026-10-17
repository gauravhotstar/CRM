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

        // Clean, strip text headers/labels, and deduplicate 10-digit numbers
        const cleanNumbers: string[] = []
        for (const p of data.phoneNumbers || []) {
            const digits = String(p || '').replace(/\D/g, '').slice(-10)
            if (digits.length === 10) {
                cleanNumbers.push(digits)
            }
        }
        const uniqueNumbers = Array.from(new Set(cleanNumbers))
        if (uniqueNumbers.length === 0) {
            throw new Error("No valid 10-digit phone numbers found to upload")
        }

        const supabaseAdmin = getSupabaseAdmin()
        const initialNotes = formatIvrMeta(data.notes || '', null, 0)
        const { error: insertError } = await supabaseAdmin.from('ivr_upload_requests').insert({
            tenant_id: profile.tenant_id,
            uploaded_by: user.id,
            campaign_name: data.campaignName,
            did_number: data.didNumber,
            total_contacts: uniqueNumbers.length,
            notes: initialNotes,
            status: 'pending'
        })
        if (insertError) throw insertError

        // Chunk numbers into Excel (.xlsx) files with max 5,000 numbers per file
        const CHUNK_SIZE = 5000
        const totalChunks = Math.ceil(uniqueNumbers.length / CHUNK_SIZE)
        const attachments: Array<{ filename: string, content: string }> = []

        const ExcelJSModule = await import('exceljs')
        const ExcelJS = (ExcelJSModule as any).default || ExcelJSModule
        const safeCampaignName = data.campaignName.replace(/[^a-zA-Z0-9_-]/g, '_')

        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
            const start = chunkIdx * CHUNK_SIZE
            const end = Math.min(start + CHUNK_SIZE, uniqueNumbers.length)
            const batch = uniqueNumbers.slice(start, end)

            const workbook = new ExcelJS.Workbook()
            const worksheet = workbook.addWorksheet('Contacts')

            // Format column 1 as integer number with no scientific notation
            worksheet.getColumn(1).numFmt = '0'

            // Add strictly pure number cells, starting at row 1, with ZERO text headers
            for (const phone of batch) {
                worksheet.addRow([Number(phone)])
            }

            const buffer = await workbook.xlsx.writeBuffer()
            const base64Content = Buffer.from(buffer).toString('base64')

            const filename = totalChunks === 1
                ? `${safeCampaignName}_contacts.xlsx`
                : `${safeCampaignName}_part_${chunkIdx + 1}_of_${totalChunks}_contacts.xlsx`

            attachments.push({
                filename,
                content: base64Content
            })
        }

        const batchSummary = totalChunks > 1
            ? `<p style="margin-top:12px;"><b>Excel Files Attached:</b> Split into ${totalChunks} files (5,000 numbers max each):<br/>` +
              attachments.map((att, i) => {
                  const count = Math.min((i + 1) * CHUNK_SIZE, uniqueNumbers.length) - (i * CHUNK_SIZE)
                  return `&bull; <code>${att.filename}</code> (${count.toLocaleString()} numbers)`
              }).join('<br/>') + '</p>'
            : `<p style="margin-top:12px;"><b>Excel File Attached:</b> <code>${attachments[0].filename}</code> (${uniqueNumbers.length.toLocaleString()} numbers)</p>`

        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        const resendResponse = await resend.emails.send({
            from: 'Hanva CRM <reports@crm.hanva.in>',
            to: 'rajpootsingh260@gmail.com',
            subject: `[IVR Upload] ${org?.name || profile.tenant_id} - ${data.campaignName} - ${uniqueNumbers.length.toLocaleString()} contacts (${totalChunks} ${totalChunks === 1 ? 'Excel' : 'Excels'})`,
            html: `
                <h2>New IVR Upload Request</h2>
                <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-family: sans-serif; font-size: 14px;">
                    <tr><td style="background:#f1f5f9;"><b>Tenant</b></td><td>${org?.name || profile.tenant_id}</td></tr>
                    <tr><td style="background:#f1f5f9;"><b>Campaign</b></td><td>${data.campaignName}</td></tr>
                    <tr><td style="background:#f1f5f9;"><b>DID Number</b></td><td>${data.didNumber}</td></tr>
                    <tr><td style="background:#f1f5f9;"><b>DID Label</b></td><td>${data.didLabel || 'N/A'}</td></tr>
                    <tr><td style="background:#f1f5f9;"><b>Total Contacts</b></td><td>${uniqueNumbers.length.toLocaleString()}</td></tr>
                    <tr><td style="background:#f1f5f9;"><b>Excel Attachments</b></td><td>${totalChunks} file(s) (5,000 numbers each, pure numbers, no headers)</td></tr>
                    <tr><td style="background:#f1f5f9;"><b>Notes</b></td><td>${data.notes || 'None'}</td></tr>
                    <tr><td style="background:#f1f5f9;"><b>Uploaded At</b></td><td>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</td></tr>
                </table>
                ${batchSummary}
            `,
            attachments
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

// Fetch history using admin client to bypass RLS, with 10-minute idle auto-completion
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
    const tenMinutes = 10 * 60 * 1000

    const mapped = await Promise.all((data || []).map(async (item: any, i: number) => {
        const meta = parseIvrMeta(item.notes)

        // For recent requests (last 48 hours), sync 100% exact leads count from DB
        const isRecent = (now - new Date(item.created_at).getTime()) < 48 * 60 * 60 * 1000
        if (isRecent) {
            const nextReq = data[i - 1]; // next more recent request if any
            let q = supabaseAdmin
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', item.created_at)
                .ilike('name', '%IVR%')

            if (nextReq) {
                q = q.lt('created_at', nextReq.created_at)
            }

            const { count: exactLeadCount } = await q
            if (typeof exactLeadCount === 'number' && exactLeadCount !== meta.leads_count) {
                meta.leads_count = exactLeadCount
                // Lazily persist synced count to database
                supabaseAdmin
                    .from('ivr_upload_requests')
                    .update({
                        notes: formatIvrMeta(meta.user_note, meta.last_lead_at, meta.leads_count)
                    })
                    .eq('id', item.id)
                    .then()
            }
        }

        item.meta = meta

        // If request is running but no leads have arrived in the last 10 minutes -> complete it
        if (item.status === 'running') {
            if (meta.last_lead_at) {
                const elapsed = now - new Date(meta.last_lead_at).getTime()
                if (elapsed >= tenMinutes) {
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
    }))

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
    const tenMinutes = 10 * 60 * 1000

    const mapped = (data || []).map((item: any) => {
        const meta = parseIvrMeta(item.notes)
        item.meta = meta

        if (item.status === 'running' && meta.last_lead_at) {
            if (now - new Date(meta.last_lead_at).getTime() >= tenMinutes) {
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
