import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server"; 

export const dynamic = 'force-dynamic';
// 🔴 Allow Vercel to run this script for up to 5 minutes (requires Vercel Pro. Leave at 60 if on Hobby)
export const maxDuration = 300; 

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key"
);

// 🔴 HELPER FUNCTION: Process a single webhook event
async function processSingleEvent(event: any) {
    const body = event.payload;
            
    const safeBody: any = {};
    for (const key in body) {
        if (body.hasOwnProperty(key)) safeBody[key.toLowerCase()] = body[key];
    }

    let fonadaLeadId = safeBody.leadid || null;
    if (!fonadaLeadId && safeBody.accountcode) {
        fonadaLeadId = String(safeBody.accountcode.split('^')[0]).trim(); 
    }

    let tenantId = null;
    let batchId = null;
    const mobileNumber = safeBody.mobilenumber || safeBody.customernumber || safeBody.dst || null;

    if (fonadaLeadId) {
        const { data: batch } = await supabaseAdmin.from('ivr_campaign_history').select('id, tenant_id').eq('fonada_lead_id', String(fonadaLeadId)).maybeSingle();
        if (batch) {
            tenantId = batch.tenant_id;
            batchId = batch.id;
            // Fire and forget the heartbeat update so it doesn't slow down the processor
            supabaseAdmin.from('ivr_campaign_history').update({ last_webhook_received_at: new Date().toISOString() }).eq('id', batchId).then();
        }
    }

    if (!tenantId && mobileNumber) {
        let dbCustomerPhone = mobileNumber.replace(/^\+?91/, '').slice(-10);
        // Removed leading % from ilike to allow Postgres to use B-Tree indexes and avoid Full Table Scans
        const { data: lead } = await supabaseAdmin.from('leads').select('tenant_id').or(`phone.eq.${dbCustomerPhone},phone.eq.+91${dbCustomerPhone},phone.eq.91${dbCustomerPhone}`).limit(1).maybeSingle();
        if (lead && lead.tenant_id) tenantId = lead.tenant_id;
    }

    const billsec = parseInt(safeBody.customerbillsec || safeBody.totalbillsec || safeBody.billsec || "0");
    const duration = parseInt(safeBody.duration || "0");
    const disposition = (safeBody.customerdisposition || safeBody.disposition || "UNKNOWN").toUpperCase();
    
    // Exact match for digitsPressed
    const rawDigits = body.digitsPressed || safeBody.digitspressed;
    const digitsPressed = (rawDigits !== undefined && rawDigits !== null && String(rawDigits).trim() !== "") 
        ? String(rawDigits).trim() 
        : null;

    if (!tenantId || !mobileNumber) {
        throw new Error(`Unmapped Call. LeadID: ${fonadaLeadId} | Mobile: ${mobileNumber}`);
    }

    // Deduplication check: prevent duplicate CDR and wallet deductions
    if (batchId && mobileNumber) {
        const { data: existingLog } = await supabaseAdmin.from("ivr_call_logs")
            .select("id")
            .eq("batch_id", batchId)
            .eq("mobile_number", mobileNumber)
            .eq("call_duration", duration)
            .limit(1)
            .maybeSingle();

        if (existingLog) {
            console.log(`⚠️ [CRON] Duplicate CDR ignored for ${mobileNumber} in Batch ${batchId}`);
            await supabaseAdmin.from('webhook_buffer').update({ status: 'completed', processed_at: new Date().toISOString() }).eq('id', event.id);
            return true;
        }
    }

    let creditsToDeduct = 0;
    if (billsec > 0 && disposition === "ANSWERED") {
        const { data: settings } = await supabaseAdmin.from('tenant_settings').select('billing_pulse_seconds, credits_per_pulse').eq('tenant_id', tenantId).single();
        const pulses = Math.ceil(billsec / (settings?.billing_pulse_seconds || 15)); 
        creditsToDeduct = pulses * (settings?.credits_per_pulse || 1);

        await supabaseAdmin.from("wallet_ledger").insert({
            tenant_id: tenantId, credits: -Math.abs(creditsToDeduct), transaction_type: 'IVR_CAMPAIGN',
            description: `IVR Call to ${mobileNumber} (${billsec}s = ${pulses} pulses)`, reference_id: batchId || null 
        });
    }

    const startDate = safeBody.starttime || safeBody.start_time || safeBody.start || safeBody.startdate || safeBody.start_date || null;
    const answerDate = safeBody.answertime || safeBody.answer_time || safeBody.answer || safeBody.answerdate || safeBody.answer_date || null;
    const endDate = safeBody.endtime || safeBody.end_time || safeBody.end || safeBody.enddate || safeBody.end_date || null;

    const { error: insertError } = await supabaseAdmin.from("ivr_call_logs").insert({
        tenant_id: tenantId, batch_id: batchId, mobile_number: mobileNumber,
        attempt_num: parseInt(safeBody.attemptnum || "1"), start_date: startDate,
        answer_date: answerDate, end_date: endDate, call_duration: duration,
        bill_seconds: billsec, disposition: disposition, hangup_cause: safeBody.hangupcause || null,
        hangup_code: safeBody.hangupcode || null, clid: safeBody.clid || null, digits_pressed: digitsPressed, credits_used: creditsToDeduct
    });

    // 🟢 Treat Postgres duplicate key violation (23505) as already processed success so buffer drains cleanly
    if (insertError) {
        if (insertError.code === '23505' || String(insertError.message || '').includes('duplicate key')) {
            console.log(`⚠️ [BATCH PROCESSOR] Duplicate CDR blocked by unique index (23505). Marking buffer row completed.`);
        } else {
            throw insertError;
        }
    }

    // Mark successful
    await supabaseAdmin.from('webhook_buffer').update({ status: 'completed', processed_at: new Date().toISOString() }).eq('id', event.id);
    return true;
}

export async function GET(request: NextRequest) {
  
  const rawSecret = process.env.CRON_SECRET || "my_secure_cron_password_958";
  const expectedBearer = rawSecret.startsWith("Bearer ") ? rawSecret : `Bearer ${rawSecret}`;
  const authHeader = request.headers.get('authorization');
  
  if (authHeader !== expectedBearer && authHeader !== rawSecret && authHeader !== "Bearer my_secure_cron_password_958") {
      console.error("🚨 Unauthorized Cron Attempt Blocked! Header received:", authHeader);
      return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  console.log("👷 [BATCH PROCESSOR] Starting high-speed queue check...");

  try {
    // 🔴 1. INCREASED LIMIT: Grab 400 logs at a time
    const { data: pendingEvents, error: fetchError } = await supabaseAdmin
        .from('webhook_buffer')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(400);

    if (fetchError || !pendingEvents || pendingEvents.length === 0) {
        return NextResponse.json({ status: "idle", message: "No pending webhooks." });
    }

    console.log(`📦 Found ${pendingEvents.length} payloads. Processing concurrently...`);

    // Lock them so the next minute's cron job doesn't grab the same ones
    const eventIds = pendingEvents.map(e => e.id);
    await supabaseAdmin.from('webhook_buffer').update({ status: 'processing' }).in('id', eventIds);

    let successCount = 0;
    let failCount = 0;

    // 🔴 2. CHUNKED CONCURRENCY (Connection Pool Protected)
    // We process 15 logs at the exact same time. Once those 15 finish, we do the next 15.
    // This protects Supabase's connection pool while keeping processing fast.
    const chunkSize = 15; 
    
    for (let i = 0; i < pendingEvents.length; i += chunkSize) {
        const chunk = pendingEvents.slice(i, i + chunkSize);
        
        // Run all 50 events in this chunk simultaneously
        const promises = chunk.map(async (event) => {
            try {
                await processSingleEvent(event);
                successCount++;
            } catch (err: any) {
                console.error(`❌ Failed event ${event.id}:`, err);
                await supabaseAdmin.from('webhook_buffer').update({ 
                    status: 'failed', 
                    error_log: err.message || 'Unknown error', 
                    processed_at: new Date().toISOString() 
                }).eq('id', event.id);
                failCount++;
            }
        });

        // Wait for this chunk of 50 to finish before moving to the next chunk of 50
        await Promise.allSettled(promises);
    }

    console.log(`✅ Batch Complete. Success: ${successCount}, Failed: ${failCount}`);
    return NextResponse.json({ status: "success", processed: successCount, failed: failCount });

  } catch (error) {
    console.error("🔥 [BATCH PROCESSOR CRITICAL ERROR]:", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
