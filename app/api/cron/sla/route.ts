// app/api/cron/sla/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseIvrMeta } from "@/lib/ivr-tracker";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key" // Admin client required to see all tenants
);

const BATCH_SIZE = 50;

// Paginated batch generator - avoids loading all rows into memory
async function* fetchLeadsBatched(
  filters: (q: ReturnType<typeof supabaseAdmin.from>) => any,
  columns: string
) {
  let from = 0;
  while (true) {
    let query = supabaseAdmin.from("leads").select(columns);
    query = filters(query);
    const { data, error } = await query.range(from, from + BATCH_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    yield data;
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }
}

// --- IST TIMEZONE CALCULATOR (Used for Lead Distribution count) ---
function getStartOfTodayIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; 
  const nowIST = new Date(now.getTime() + istOffset);
  nowIST.setUTCHours(0, 0, 0, 0); 
  const midnightUTC = new Date(nowIST.getTime() - istOffset);
  return midnightUTC.toISOString();
}
// --------------------------------

export async function GET(request: Request) {
  // 1. CRON SECURITY
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV !== 'development' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log("⏱️ [CRON] Running Multi-Tenant SLA & NR Auto-Reassignment check...");

  try {
    const SLA_MINUTES = 60;
    const NR_HOURS = 3;
    
    const slaTimeLimit = new Date(Date.now() - SLA_MINUTES * 60 * 1000).toISOString();
    const nrTimeLimit = new Date(Date.now() - NR_HOURS * 60 * 60 * 1000).toISOString();
    
    // Exact UTC timestamp for: 18th Feb 2026, 8:00 AM IST
    const NR_START_DATE_LIMIT = "2026-02-18T02:30:00.000Z";
    const startOfTodayISO = getStartOfTodayIST();
    const maxShiftStart = new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString();

    // 🔴 2. FETCH TENANTS WITH SLA CRON ENABLED
    const { data: activeSettings, error: settingsError } = await supabaseAdmin
        .from('tenant_settings')
        .select('tenant_id')
        .eq('cron_sla', true);

    if (settingsError) throw settingsError;
    if (!activeSettings || activeSettings.length === 0) {
        console.log("⏭️ [CRON] No tenants have SLA auto-reassignment enabled. Skipping.");
        return NextResponse.json({ status: "success", message: "No tenants opted in." });
    }

    const enabledTenantIds = activeSettings.map(s => s.tenant_id);

    // Fetch organizations so we can log their names
    const { data: tenants, error: tenantError } = await supabaseAdmin
        .from('organizations')
        .select('id, name')
        .in('id', enabledTenantIds);

    if (tenantError) throw tenantError;
    if (!tenants || tenants.length === 0) return NextResponse.json({ status: "success", message: "No valid organizations found." });

    let totalSlaReassigned = 0;
    let totalNrRecycled = 0;
    let totalMovedToDead = 0;

    // 🔴 3. PROCESS EACH TENANT IN ISOLATION
    for (const tenant of tenants) {
        console.log(`\n🏢 Processing Tenant: ${tenant.name} (${tenant.id})`);

        // Fetch active telecallers strictly for this tenant
        const { data: attendanceData } = await supabaseAdmin
            .from("attendance")
            .select("user_id")
            .eq("tenant_id", tenant.id) // ISOLATION
            .gte("check_in", maxShiftStart) 
            .is("check_out", null);            

        const checkedInUserIds = attendanceData?.map(a => a.user_id) || [];
        
        const { data: allUsers } = await supabaseAdmin
            .from("users")
            .select("id, full_name, role")
            .eq("tenant_id", tenant.id); // ISOLATION

        const validRoles = ["telecaller", "agent", "user"];
        
        const activeTelecallers = allUsers?.filter(user => {
            if (!checkedInUserIds.includes(user.id)) return false;
            const userRole = (user.role || "").toLowerCase();
            return validRoles.includes(userRole);
        }) || [];

        if (activeTelecallers.length === 0) {
            console.log(`   ⏭️ No active agents found in ${tenant.name} to take reassignments. Skipping.`);
            continue; // Skip this tenant, nobody is online to take the leads
        }

        // Calculate fair distribution using per-agent COUNT queries (no bulk row fetch)
        const leadCounts: Record<string, number> = {};
        for (const agent of activeTelecallers) {
            const { count } = await supabaseAdmin
                .from("leads")
                .select("id", { count: "exact", head: true })
                .eq("tenant_id", tenant.id)
                .eq("assigned_to", agent.id)
                .gte("created_at", startOfTodayISO);
            leadCounts[agent.id] = count || 0;
        }

        // --- PROCESS SLA BREACHES in batches ---
        for await (const batch of fetchLeadsBatched(
            (q) => q.eq("tenant_id", tenant.id).eq("status", "new").not("assigned_to", "is", null).lt("updated_at", slaTimeLimit),
            "id, assigned_to, notes"
        )) {
            const updatePromises = [];
            for (const lead of batch) {
                const eligibleAgents = activeTelecallers.filter(t => t.id !== lead.assigned_to);
                if (eligibleAgents.length === 0) continue;

                const minLeads = Math.min(...eligibleAgents.map(a => leadCounts[a.id]));
                const tiedAgents = eligibleAgents.filter(a => leadCounts[a.id] === minLeads);
                const winner = tiedAgents[Math.floor(Math.random() * tiedAgents.length)];

                const breachNote = `🚨 [SYSTEM: SLA BREACH]\nLead was not contacted within ${SLA_MINUTES} mins. Automatically reassigned to ${winner.full_name}.`;
                const updatedNotes = lead.notes ? `${lead.notes}\n\n${breachNote}` : breachNote;

                updatePromises.push(
                    supabaseAdmin.from("leads").update({
                        assigned_to: winner.id,
                        notes: updatedNotes,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", lead.id)
                    .eq("tenant_id", tenant.id)
                );

                leadCounts[winner.id]++;
                totalSlaReassigned++;
            }
            if (updatePromises.length > 0) await Promise.all(updatePromises);
        }

        // --- PROCESS NR RECYCLING in batches ---
        for await (const batch of fetchLeadsBatched(
            (q) => q.eq("tenant_id", tenant.id).eq("status", "nr").not("assigned_to", "is", null).gte("created_at", NR_START_DATE_LIMIT).lt("last_contacted", nrTimeLimit),
            "id, assigned_to, notes, tags"
        )) {
            const updatePromises = [];
            for (const lead of batch) {
                let tags: string[] = [];
                try { tags = Array.isArray(lead.tags) ? lead.tags : JSON.parse(lead.tags || '[]'); } catch(e) {}

                const nrStrikes = tags.filter((t: string) => t.startsWith('NR_STRIKE_')).length;

                if (nrStrikes >= 3) {
                    const deadNote = `💀 [SYSTEM: DEAD BUCKET]\nLead reached maximum 4 'No Response' cycles. Moved to Dead Bucket.`;
                    const updatedNotes = lead.notes ? `${lead.notes}\n\n${deadNote}` : deadNote;

                    updatePromises.push(
                        supabaseAdmin.from("leads").update({
                            status: "dead_bucket",
                            assigned_to: null,
                            notes: updatedNotes,
                            updated_at: new Date().toISOString()
                        })
                        .eq("id", lead.id)
                        .eq("tenant_id", tenant.id)
                    );

                    totalMovedToDead++;
                    continue;
                }

                const eligibleAgents = activeTelecallers.filter(t => t.id !== lead.assigned_to);
                if (eligibleAgents.length === 0) continue;

                const minLeads = Math.min(...eligibleAgents.map(a => leadCounts[a.id]));
                const tiedAgents = eligibleAgents.filter(a => leadCounts[a.id] === minLeads);
                const winner = tiedAgents[Math.floor(Math.random() * tiedAgents.length)];

                const currentStrike = nrStrikes + 1;
                tags.push(`NR_STRIKE_${currentStrike}`);

                const reassignmentNote = `🔄 [SYSTEM: NR RECYCLE]\nLead was 'NR' for ${NR_HOURS} hours. Reassigned to ${winner.full_name} (Strike ${currentStrike}/4).`;
                const updatedNotes = lead.notes ? `${lead.notes}\n\n${reassignmentNote}` : reassignmentNote;

                updatePromises.push(
                    supabaseAdmin.from("leads").update({
                        assigned_to: winner.id,
                        status: "new",
                        tags: tags,
                        notes: updatedNotes,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", lead.id)
                    .eq("tenant_id", tenant.id)
                );

                leadCounts[winner.id]++;
                totalNrRecycled++;
            }
            if (updatePromises.length > 0) await Promise.all(updatePromises);
        }

        console.log(`   ✅ Done with ${tenant.name}`);
    } // End of Tenant Loop

    // Clean up idle 'running' IVR upload requests (no leads received in last 5 minutes)
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: runningRequests } = await supabaseAdmin
        .from('ivr_upload_requests')
        .select('id, notes')
        .eq('status', 'running');

      if (runningRequests && runningRequests.length > 0) {
        for (const req of runningRequests) {
          const meta = parseIvrMeta(req.notes);
          if (meta.last_lead_at && meta.last_lead_at < fiveMinAgo) {
            await supabaseAdmin.from('ivr_upload_requests').update({ status: 'completed' }).eq('id', req.id);
            console.log(`✅ [CRON SLA] IVR upload request ${req.id} marked completed (idle > 5 mins)`);
          }
        }
      }
    } catch (ivrErr) {
      console.error("IVR auto-complete check error:", ivrErr);
    }

    console.log(`\n🏁 [GLOBAL CRON FINISHED] SLA Reassigned: ${totalSlaReassigned} | NR Recycled: ${totalNrRecycled} | Sent to Dead: ${totalMovedToDead}`);
    
    return NextResponse.json({ 
        status: "success", 
        sla_reassigned: totalSlaReassigned, 
        nr_recycled: totalNrRecycled, 
        moved_to_dead: totalMovedToDead 
    });

  } catch (error: any) {
    console.error("🔥 [CRON ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
