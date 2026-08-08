"use server"

import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

export async function fetchSuperAdminAnalytics() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Unauthorized")

        const { data: caller } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (caller?.role !== 'super_admin') {
            throw new Error("Forbidden: Only Super Admins can access global analytics.")
        }

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // Fetch Organizations
        const { data: orgs, error: orgError } = await supabaseAdmin
            .from('organizations')
            .select('id, name')

        if (orgError) throw new Error("Failed to fetch organizations: " + orgError.message)

        // Fetch Users (need id, tenant_id, role, current_status, full_name)
        const { data: users, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, tenant_id, role, current_status, full_name')

        if (userError) throw new Error("Failed to fetch users: " + userError.message)

        // Fetch Leads (need id, tenant_id, assigned_to)
        const { data: leads, error: leadError } = await supabaseAdmin
            .from('leads')
            .select('id, tenant_id, assigned_to')

        if (leadError) throw new Error("Failed to fetch leads: " + leadError.message)

        // Aggregation Logic
        
        // 1. Global KPIs
        const totalTenants = orgs?.length || 0;
        const totalUsers = users?.length || 0;
        const activeUsersToday = users?.filter(u => u.current_status === 'online').length || 0;
        const totalLeads = leads?.length || 0;

        // 2. Tenant breakdown
        // Create a map of orgId -> Org Details
        const tenantMap: Record<string, { id: string, name: string, totalUsers: number, totalTelecallers: number, totalLeads: number }> = {};
        orgs?.forEach(org => {
            tenantMap[org.id] = {
                id: org.id,
                name: org.name,
                totalUsers: 0,
                totalTelecallers: 0,
                totalLeads: 0
            };
        });

        // 3. User & Telecaller Maps
        const telecallerMap: Record<string, { id: string, name: string, tenantName: string, totalLeads: number }> = {};

        users?.forEach(u => {
            if (u.tenant_id && tenantMap[u.tenant_id]) {
                tenantMap[u.tenant_id].totalUsers += 1;
                if (u.role === 'telecaller') {
                    tenantMap[u.tenant_id].totalTelecallers += 1;
                }
            }
            if (u.role === 'telecaller') {
                telecallerMap[u.id] = {
                    id: u.id,
                    name: u.full_name || 'Unknown Telecaller',
                    tenantName: (u.tenant_id && tenantMap[u.tenant_id]) ? tenantMap[u.tenant_id].name : 'Unknown Tenant',
                    totalLeads: 0
                };
            }
        });

        // 4. Lead processing
        leads?.forEach(l => {
            if (l.tenant_id && tenantMap[l.tenant_id]) {
                tenantMap[l.tenant_id].totalLeads += 1;
            }
            if (l.assigned_to && telecallerMap[l.assigned_to]) {
                telecallerMap[l.assigned_to].totalLeads += 1;
            }
        });

        const tenantAnalytics = Object.values(tenantMap).sort((a, b) => b.totalLeads - a.totalLeads);
        const telecallerAnalytics = Object.values(telecallerMap).sort((a, b) => b.totalLeads - a.totalLeads);

        return { 
            success: true, 
            data: {
                kpis: {
                    totalTenants,
                    totalUsers,
                    activeUsersToday,
                    totalLeads
                },
                tenantAnalytics,
                telecallerAnalytics
            }
        }
    } catch (error: any) {
        console.error("Super Admin Analytics Error:", error)
        return { success: false, error: error.message || "Failed to fetch analytics" }
    }
}
