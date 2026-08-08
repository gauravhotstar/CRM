"use server"

import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

export async function provisionNewTenant(formData: {
    orgName: string;
    plan: string;
    industry?: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
}) {
    try {
        const supabase = await createClient()
        
        // 1. SECURITY CHECK: Ensure caller is a Super Admin
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Unauthorized")

        const { data: caller } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (caller?.role !== 'super_admin') {
            throw new Error("Forbidden: Only Super Admins can provision new tenants.")
        }

        // 2. Initialize Admin Bypass Client
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // 3. Create the Organization
        const { data: newOrg, error: orgError } = await supabaseAdmin
            .from('organizations')
            .insert({ 
                name: formData.orgName, 
                plan: formData.plan,
                industry: formData.industry || 'general'
            })
            .select('id').single()

        if (orgError || !newOrg) throw new Error("Failed to create organization: " + orgError?.message)

        // 4. Create the First Admin User in Auth
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: formData.adminEmail,
            password: formData.adminPassword,
            email_confirm: true,
            user_metadata: { full_name: formData.adminName }
        })

        if (authError || !authData.user) {
            // Rollback Org if Auth fails
            await supabaseAdmin.from('organizations').delete().eq('id', newOrg.id);
            throw new Error("Failed to create admin auth user: " + authError?.message)
        }

        // 5. Create the User Profile linked to the new Tenant
        const { error: profileError } = await supabaseAdmin
            .from('users')
            .insert({
                id: authData.user.id,
                email: formData.adminEmail,
                full_name: formData.adminName,
                role: 'admin', // They are the admin of THEIR workspace
                tenant_id: newOrg.id,
                current_status: 'offline'
            })

        if (profileError) throw new Error("Failed to create user profile: " + profileError.message)

        // 6. Initialize blank API settings for the new tenant
        await supabaseAdmin.from('tenant_settings').insert({ tenant_id: newOrg.id })

        await logSystemActivity(user.id, 'PROVISION_TENANT', `Provisioned new tenant: ${formData.orgName}`);

        return { success: true, message: `Successfully provisioned ${formData.orgName}!` }

    } catch (error: any) {
        console.error("Provisioning Error:", error)
        return { success: false, error: error.message || "Failed to provision workspace" }
    }
}

export async function updateTenantSettings(orgId: string, enabledStatuses: string[], workflowTriggers: any, enabledModules: string[]) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Unauthorized")

        const { data: caller } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (caller?.role !== 'super_admin') {
            throw new Error("Forbidden: Only Super Admins can update tenant settings.")
        }

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { error } = await supabaseAdmin
            .from('organizations')
            .update({ 
                enabled_statuses: enabledStatuses,
                workflow_triggers: workflowTriggers,
                enabled_modules: enabledModules
            })
            .eq('id', orgId)

        if (error) throw new Error("Failed to update organization: " + error.message)

        await logSystemActivity(user.id, 'UPDATE_SETTINGS', `Updated settings for tenant: ${orgId}`);

        return { success: true, message: "Tenant settings updated successfully!" }
    } catch (error: any) {
        console.error("Update Error:", error)
        return { success: false, error: error.message || "Failed to update tenant settings" }
    }
}

export async function fetchAllOrganizations() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Unauthorized")

        const { data: caller } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (caller?.role !== 'super_admin') {
            throw new Error("Forbidden: Only Super Admins can view all tenants.")
        }

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { data: orgs, error } = await supabaseAdmin
            .from('organizations')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw new Error("Failed to fetch organizations: " + error.message)

        // Fetch user counts manually to avoid schema cache issues if FK is missing
        const { data: userCounts } = await supabaseAdmin
            .from('users')
            .select('tenant_id');
        
        const countsMap: Record<string, number> = {};
        if (userCounts) {
            userCounts.forEach(u => {
                if (u.tenant_id) {
                    countsMap[u.tenant_id] = (countsMap[u.tenant_id] || 0) + 1;
                }
            });
        }

        // Fetch leads counts manually
        const { data: leadCounts } = await supabaseAdmin
            .from('leads')
            .select('tenant_id');
            
        const leadsMap: Record<string, number> = {};
        if (leadCounts) {
            leadCounts.forEach(l => {
                if (l.tenant_id) {
                    leadsMap[l.tenant_id] = (leadsMap[l.tenant_id] || 0) + 1;
                }
            });
        }

        const orgsWithCounts = orgs.map(org => ({
            ...org,
            users: [{ count: countsMap[org.id] || 0 }],
            leadsCount: leadsMap[org.id] || 0
        }));

        return { success: true, data: orgsWithCounts }
    } catch (error: any) {
        console.error("Fetch Error:", error)
        return { success: false, error: error.message || "Failed to fetch organizations" }
    }
}

export async function fetchGlobalStatuses() {
    try {
        const supabase = await createClient()
        // No strict auth required for reading, but we can use standard client
        // since we enabled RLS for all authenticated users
        const { data: statuses, error } = await supabase
            .from('global_lead_statuses')
            .select('*')
            .order('created_at', { ascending: true })

        if (error) throw new Error("Failed to fetch global statuses: " + error.message)

        return { success: true, data: statuses }
    } catch (error: any) {
        console.error("Fetch Global Statuses Error:", error)
        return { success: false, error: error.message || "Failed to fetch global statuses" }
    }
}

export async function addGlobalStatus(statusData: { value: string; label: string; color: string; btnColor: string; iconName: string }) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Unauthorized")

        const { data: caller } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (caller?.role !== 'super_admin') {
            throw new Error("Forbidden: Only Super Admins can add global statuses.")
        }

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { error } = await supabaseAdmin
            .from('global_lead_statuses')
            .insert({
                value: statusData.value,
                label: statusData.label,
                color: statusData.color,
                btn_color: statusData.btnColor,
                icon_name: statusData.iconName
            })

        if (error) throw new Error("Failed to insert global status: " + error.message)

        return { success: true, message: "Custom status added successfully!" }
    } catch (error: any) {
        console.error("Add Global Status Error:", error)
        return { success: false, error: error.message || "Failed to add global status" }
    }
}

export async function toggleTenantSuspension(orgId: string, currentStatus: boolean) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Unauthorized")

        const { data: caller } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (caller?.role !== 'super_admin') {
            throw new Error("Forbidden: Only Super Admins can suspend tenants.")
        }

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // Assume we have an `is_suspended` column in `organizations`. 
        // If not, this might throw until the DB is updated.
        const { error } = await supabaseAdmin
            .from('organizations')
            .update({ is_suspended: !currentStatus })
            .eq('id', orgId)

        if (error) throw new Error("Failed to update tenant suspension: " + error.message)

        await logSystemActivity(user.id, 'SUSPEND_TENANT', `Tenant ${orgId} was ${!currentStatus ? 'suspended' : 'activated'}.`);

        return { success: true, message: `Tenant has been successfully ${!currentStatus ? 'suspended' : 'activated'}.` }
    } catch (error: any) {
        console.error("Toggle Suspension Error:", error)
        return { success: false, error: error.message || "Failed to toggle suspension" }
    }
}

export async function impersonateTenant(orgId: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Unauthorized")

        const { data: caller } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (caller?.role !== 'super_admin') {
            throw new Error("Forbidden: Only Super Admins can impersonate tenants.")
        }

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // Find the primary admin for this tenant
        const { data: tenantAdmin, error: findError } = await supabaseAdmin
            .from('users')
            .select('id, email')
            .eq('tenant_id', orgId)
            .eq('role', 'admin')
            .limit(1)
            .single()

        if (findError || !tenantAdmin) {
            throw new Error("Could not find an admin user for this tenant to impersonate.")
        }

        // Generate a magic link for this user
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: tenantAdmin.email,
        })

        if (linkError || !linkData.properties?.action_link) {
            throw new Error("Failed to generate impersonation link: " + linkError?.message)
        }

        return { success: true, link: linkData.properties.action_link }
    } catch (error: any) {
        console.error("Impersonation Error:", error)
        return { success: false, error: error.message || "Failed to impersonate tenant" }
    }
}

export async function createAnnouncement(data: { title: string, message: string, type: string }) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Unauthorized")

        const { data: caller } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (caller?.role !== 'super_admin') {
            throw new Error("Forbidden: Only Super Admins can create announcements.")
        }

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { error } = await supabaseAdmin
            .from('system_announcements')
            .insert({
                title: data.title,
                message: data.message,
                type: data.type,
                is_active: true
            })

        if (error) throw new Error("Failed to create announcement: " + error.message)
        return { success: true, message: "Announcement broadcasted successfully!" }
    } catch (error: any) {
        console.error("Announcement Error:", error)
        return { success: false, error: error.message || "Failed to create announcement" }
    }
}

export async function fetchAllAnnouncements() {
    try {
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { data: announcements, error } = await supabaseAdmin
            .from('system_announcements')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw new Error("Failed to fetch announcements: " + error.message)
        return { success: true, data: announcements }
    } catch (error: any) {
        console.error("Fetch Announcements Error:", error)
        return { success: false, error: error.message || "Failed to fetch announcements" }
    }
}

export async function toggleAnnouncement(id: string, currentStatus: boolean) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Unauthorized")

        const { data: caller } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (caller?.role !== 'super_admin') {
            throw new Error("Forbidden: Only Super Admins can toggle announcements.")
        }

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { error } = await supabaseAdmin
            .from('system_announcements')
            .update({ is_active: !currentStatus })
            .eq('id', id)

        if (error) throw new Error("Failed to toggle announcement: " + error.message)
        return { success: true, message: `Announcement ${!currentStatus ? 'activated' : 'deactivated'}.` }
    } catch (error: any) {
        console.error("Toggle Announcement Error:", error)
        return { success: false, error: error.message || "Failed to toggle announcement" }
    }
}

export async function logSystemActivity(userId: string, actionType: string, description: string) {
    try {
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        await supabaseAdmin.from('system_activity_logs').insert({
            user_id: userId,
            action_type: actionType,
            description: description
        })
    } catch (e) {
        console.error("Failed to log system activity:", e)
    }
}

export async function fetchRecentSystemActivity() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Unauthorized")

        const { data: caller } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (caller?.role !== 'super_admin') {
            throw new Error("Forbidden")
        }

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // Using users(full_name) might require a relationship, but let's just fetch logs
        // and manually fetch user names if needed, or rely on foreign key.
        const { data: logs, error } = await supabaseAdmin
            .from('system_activity_logs')
            .select('*, users(full_name)')
            .order('created_at', { ascending: false })
            .limit(10)

        if (error) throw new Error(error.message)
        return { success: true, data: logs }
    } catch (error: any) {
        console.error("Fetch Activity Error:", error)
        return { success: false, error: error.message || "Failed to fetch activity" }
    }
}

