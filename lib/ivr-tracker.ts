// lib/ivr-tracker.ts

export interface IvrRequestMeta {
  user_note: string;
  last_lead_at: string | null;
  leads_count: number;
}

/**
 * Parses the JSON metadata stored in `ivr_upload_requests.notes`.
 * Backward-compatible with plain text notes from previous versions.
 */
export function parseIvrMeta(notes: string | null | undefined): IvrRequestMeta {
  if (!notes) {
    return { user_note: '', last_lead_at: null, leads_count: 0 };
  }
  try {
    const trimmed = notes.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      return {
        user_note: parsed.user_note || '',
        last_lead_at: parsed.last_lead_at || null,
        leads_count: typeof parsed.leads_count === 'number' ? parsed.leads_count : 0,
      };
    }
  } catch (e) {}
  return { user_note: notes, last_lead_at: null, leads_count: 0 };
}

/**
 * Formats metadata into a clean JSON string for `ivr_upload_requests.notes`.
 */
export function formatIvrMeta(userNote: string, lastLeadAt: string | null, leadsCount: number): string {
  return JSON.stringify({
    user_note: userNote || '',
    last_lead_at: lastLeadAt,
    leads_count: leadsCount,
  });
}

/**
 * Event-driven tracker invoked whenever an IVR lead arrives via webhook.
 * - If request status was 'pending' -> transitions to 'running'.
 * - Refreshes 'last_lead_at' timestamp and increments 'leads_count'.
 * 
 * Optimized for zero leverage on Supabase:
 * Exactly 1 indexed lookup + 1 fast row update only when a lead arrives.
 */
export async function recordIvrLeadReceived(supabaseAdmin: any, tenantId: string, didNumber?: string | null) {
  try {
    if (!tenantId) return;

    const cleanDid = didNumber ? String(didNumber).replace(/\D/g, '').slice(-10) : null;

    let activeRequest = null;

    // 1. Try matching by specific DID first if provided
    if (cleanDid) {
      const { data } = await supabaseAdmin
        .from('ivr_upload_requests')
        .select('id, status, notes, did_number')
        .eq('tenant_id', tenantId)
        .eq('did_number', cleanDid)
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      activeRequest = data;
    }

    // 2. Fallback: match latest pending or running request for this tenant
    if (!activeRequest) {
      const { data } = await supabaseAdmin
        .from('ivr_upload_requests')
        .select('id, status, notes, did_number')
        .eq('tenant_id', tenantId)
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      activeRequest = data;
    }

    if (!activeRequest) return;

    const meta = parseIvrMeta(activeRequest.notes);
    meta.last_lead_at = new Date().toISOString();
    meta.leads_count = (meta.leads_count || 0) + 1;

    await supabaseAdmin
      .from('ivr_upload_requests')
      .update({
        status: 'running',
        notes: formatIvrMeta(meta.user_note, meta.last_lead_at, meta.leads_count)
      })
      .eq('id', activeRequest.id);

    console.log(`📡 [IVR Status] Request ${activeRequest.id} → RUNNING (Total leads: ${meta.leads_count})`);
  } catch (err) {
    console.error("⚠️ Failed to record IVR lead arrival:", err);
  }
}
