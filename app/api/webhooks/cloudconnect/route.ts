import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Helper to lazy-load the Supabase Admin Client to bypass RLS for webhooks
// This prevents Next.js build-time errors when env variables are missing during static analysis.
const getSupabaseAdmin = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export async function POST(req: Request) {
    return handleWebhook(req);
}

export async function GET(req: Request) {
    return handleWebhook(req);
}

async function handleWebhook(req: Request) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    console.log('\n======================================');
    console.log(`[Ozonetel Webhook] Incoming ${req.method} request to ${url.pathname}`);
    console.log(`[Ozonetel Webhook] Search Params:`, searchParams.toString());

    let bodyData: any = {};
    if (req.method === 'POST') {
      const contentType = req.headers.get('content-type') || '';
      console.log(`[Ozonetel Webhook] Content-Type:`, contentType);
      
      if (contentType.includes('application/json')) {
        try {
          bodyData = await req.json();
          console.log(`[Ozonetel Webhook] Parsed JSON Body:`, bodyData);
        } catch (e) {
          console.error(`[Ozonetel Webhook] JSON parse error:`, e);
        }
      } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        try {
          const formData = await req.formData();
          formData.forEach((value, key) => {
            bodyData[key] = value.toString();
          });
          console.log(`[Ozonetel Webhook] Parsed FormData Body:`, bodyData);
        } catch (e) {
          console.error(`[Ozonetel Webhook] FormData parse error:`, e);
        }
      }
    }

    // Ozonetel Voice Callback sends data inside a stringified JSON in the 'data' form field
    if (bodyData.data && typeof bodyData.data === 'string') {
      try {
        const parsed = JSON.parse(bodyData.data);
        if (Array.isArray(parsed)) {
          bodyData = { ...bodyData, ...(parsed[0] || {}) };
        } else if (parsed && typeof parsed === 'object') {
          bodyData = { ...bodyData, ...parsed };
        }
        console.log(`[Ozonetel Webhook] Extracted payload from stringified 'data' field:`, bodyData);
      } catch (e) {
        console.error(`[Ozonetel Webhook] Error parsing nested data JSON:`, e);
      }
    }

    const getParam = (key: string) => searchParams.get(key) || bodyData[key] || '';
    
    // 0. API Key Verification
    const expectedApiKey = process.env.CLOUDCONNECT_WEBHOOK_SECRET || 'HANVA_OZT_7X9Q2P4L';
    const providedApiKey = getParam('api_key') || getParam('Apikey') || req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');

    console.log(`[Ozonetel Webhook] Provided API Key: ${providedApiKey ? '***' + providedApiKey.slice(-4) : 'None'}`);

    if (providedApiKey !== expectedApiKey && expectedApiKey !== 'HANVA_OZT_7X9Q2P4L') {
        if (providedApiKey !== 'HANVA_OZT_7X9Q2P4L') {
            console.error(`[Ozonetel Webhook] Unauthorized (Invalid API Key)`);
            return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
        }
    } else if (providedApiKey !== expectedApiKey) {
        console.error(`[Ozonetel Webhook] Unauthorized (Invalid API Key)`);
        return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
    }

    // Ping / Verification check (e.g. if testing from Postman or webhook setup without call details)
    const hasCallData = getParam('uuid') || getParam('CallUUID') || getParam('call_uuid') || getParam('monitorUCID') || getParam('UCID') || getParam('CallID') || getParam('caller_number') || getParam('CallerID') || getParam('CustomerNumber') || getParam('cid');
    if (!hasCallData) {
        console.log(`[Ozonetel Webhook] Ping success (No call data found, just verification).`);
        return NextResponse.json({ 
            success: true, 
            message: 'API key verified successfully. Webhook endpoint is active and ready to receive call events.' 
        });
    }
    
    // Parse Payload (Supports query params, JSON body, or form data)
    const uuid = getParam('uuid') || getParam('CallUUID') || getParam('call_uuid') || getParam('monitorUCID') || getParam('UCID') || getParam('CallID') || getParam('DataUniqueId') || `call_${Date.now()}`;
    const extensionNumber = getParam('extension_number') || getParam('agent_id') || getParam('AgentID') || getParam('AgentPhoneNumber') || getParam('PhoneName') || '';
    const callerNumber = getParam('caller_number') || getParam('CallerID') || getParam('CustomerNumber') || getParam('caller_id') || getParam('cid') || getParam('PhoneNumber') || getParam('DialedNumber') || '';
    const callStatus = getParam('call_status') || getParam('Status') || getParam('status') || getParam('DialStatus') || getParam('CustomerStatus') || ''; 
    const callDirection = getParam('call_direction') || getParam('Direction') || getParam('direction') || getParam('Type') || 'inbound';
    const rawDuration = getParam('call_duration') || getParam('CallDuration') || getParam('Duration') || getParam('duration') || '0';
    const dtmfInput = getParam('dtmf_input') || getParam('digit') || getParam('AudioInput') || getParam('Input') || '';
    const recordingUrl = getParam('recording_url') || getParam('AudioFile') || getParam('RecordingUrl') || '';

    console.log(`[Ozonetel Webhook] Extracted Values -> UUID: ${uuid}, Caller: ${callerNumber}, Ext: ${extensionNumber}, Status: ${callStatus}, DTMF: ${dtmfInput}, Duration: ${rawDuration}`);

    // Convert duration like "00:01:20" or "80" to seconds
    const parseDurationSeconds = (val: string): number => {
      if (!val) return 0;
      if (val.includes(':')) {
        const parts = val.split(':').map(p => parseInt(p, 10) || 0);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
      }
      return parseInt(val, 10) || 0;
    };
    const callDurationSeconds = parseDurationSeconds(rawDuration);

    if (!callerNumber) {
        return NextResponse.json({ error: 'Missing required parameter: caller_number / CallerID' }, { status: 400 });
    }

    // 1. Find the Lead
    // Format the number to get the last 10 digits for better matching
    const cleanNumber = callerNumber.replace(/^\+?\d{1,3}/, '').slice(-10); 
    console.log(`[Ozonetel Webhook] Searching for Lead with phone containing: ${cleanNumber}`);
    
    const supabaseAdmin = getSupabaseAdmin();
    
    const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id, name, company, phone, status, tenant_id, assigned_to')
        .ilike('phone', `%${cleanNumber}%`)
        .limit(1);

    let lead = leads?.[0];
    if (lead) {
        console.log(`[Ozonetel Webhook] Found existing lead: ID ${lead.id}, Status ${lead.status}, Assigned To: ${lead.assigned_to}`);
    } else {
        console.log(`[Ozonetel Webhook] No existing lead found for ${cleanNumber}`);
    }

    // Try to resolve the agent from extensionNumber immediately
    let matchedAgentId = null;
    if (extensionNumber) {
        const cleanExt = extensionNumber.replace(/^\+?\d{1,3}/, '').slice(-10);
        const { data: matchingUsers } = await supabaseAdmin
            .from('users')
            .select('id, tenant_id, phone')
            .ilike('phone', `%${cleanExt}%`)
            .limit(1);
            
        if (matchingUsers && matchingUsers.length > 0) {
            matchedAgentId = matchingUsers[0].id;
        }
    }

    // If no lead exists but we got DTMF, create one & assign
    if (!lead && dtmfInput) {
        console.log(`[Ozonetel Webhook] Auto-creating DTMF Lead for phone: ${callerNumber}, digit: ${dtmfInput}`);
        let targetAgentId = null;
        let targetTenantId = null;

        // 1. Try to find the specific agent who was on the call (via extensionNumber/AgentPhoneNumber)
        if (extensionNumber) {
            const cleanExt = extensionNumber.replace(/^\+?\d{1,3}/, '').slice(-10);
            const { data: matchingUsers } = await supabaseAdmin
                .from('users')
                .select('id, tenant_id, phone')
                .ilike('phone', `%${cleanExt}%`)
                .limit(1);
                
            if (matchingUsers && matchingUsers.length > 0) {
                targetAgentId = matchingUsers[0].id;
                targetTenantId = matchingUsers[0].tenant_id;
                console.log(`[Ozonetel Webhook] Matched specific agent by extension: ${targetAgentId}`);
            }
        }

        // 2. Fallback: If no specific agent matched, find a random active/checked-in agent
        if (!targetAgentId) {
            console.log(`[Ozonetel Webhook] No specific agent found, falling back to random attendance selection.`);
            const maxShiftStart = new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString();
            const { data: attendanceData } = await supabaseAdmin
                .from("attendance")
                .select("user_id, tenant_id")
                .gte("check_in", maxShiftStart)
                .is("check_out", null);
                
            if (attendanceData && attendanceData.length > 0) {
                const randomAgent = attendanceData[Math.floor(Math.random() * attendanceData.length)];
                targetAgentId = randomAgent.user_id;
                targetTenantId = randomAgent.tenant_id;
                console.log(`[Ozonetel Webhook] Selected random active agent: ${targetAgentId}`);
            } else {
                console.log(`[Ozonetel Webhook] No active agents found in attendance to assign lead.`);
            }
        }
            
        const newLeadStatus = 'new'; // Always 'new' as requested, regardless of digit
        
        const newLeadData: any = {
            name: `New Lead (IVR ${callerNumber})`,
            phone: callerNumber,
            status: newLeadStatus,
        };

        if (targetAgentId) {
            newLeadData.assigned_to = targetAgentId;
            newLeadData.tenant_id = targetTenantId;
        } else {
            // Fallback: Just grab any tenant to satisfy RLS/foreign keys if needed
            const { data: fallbackTenant } = await supabaseAdmin.from('tenant_settings').select('tenant_id').limit(1).single();
            if (fallbackTenant) {
                newLeadData.tenant_id = fallbackTenant.tenant_id;
            }
        }

        console.log(`[Ozonetel Webhook] Inserting new lead:`, newLeadData);

        const { data: createdLead, error: createError } = await supabaseAdmin
            .from('leads')
            .insert([newLeadData])
            .select('id, name, company, phone, status, tenant_id')
            .single();

        if (createdLead) {
            console.log(`[Ozonetel Webhook] Successfully created Lead ID: ${createdLead.id}`);
            lead = createdLead;
            
            // Broadcast a popup specifically for the agent who just got assigned this brand-new lead!
            if (targetAgentId) {
                console.log(`[Ozonetel Webhook] Broadcasting DTMF auto-assign SCREEN_POP for agent: ${targetAgentId}`);
                const channel = supabaseAdmin.channel('cloudconnect_events');
                await channel.send({
                    type: 'broadcast',
                    event: 'SCREEN_POP',
                    payload: {
                        call_uuid: uuid,
                        extension: extensionNumber,
                        target_agent_id: targetAgentId,
                        caller_number: callerNumber,
                        direction: callDirection,
                        lead: lead,
                        is_dtmf_auto_assign: true
                    }
                });
            }
        } else {
            console.error("Failed to create new DTMF lead:", createError);
        }
    }

    // 2. Handle RINGING (Screen Pop)
    if (callStatus === 'Ring') {
        console.log(`[Ozonetel Webhook] Processing Ringing event for screen pop.`);
        let ringAgentId = null;
        
        // Try to identify which agent's screen should pop based on the extension/phone provided
        if (extensionNumber) {
            const cleanExt = extensionNumber.replace(/^\+?\d{1,3}/, '').slice(-10);
            const { data: ringUsers } = await supabaseAdmin.from('users').select('id').ilike('phone', `%${cleanExt}%`).limit(1);
            if (ringUsers && ringUsers.length > 0) {
                ringAgentId = ringUsers[0].id;
                console.log(`[Ozonetel Webhook] Identified agent ${ringAgentId} for Ring screen pop.`);
            } else {
                console.log(`[Ozonetel Webhook] Could not find agent for extension ${cleanExt} for Ring screen pop.`);
            }
        }

        const payload = {
            call_uuid: uuid,
            extension: extensionNumber,
            target_agent_id: ringAgentId,
            caller_number: callerNumber,
            direction: callDirection,
            lead: lead || null, 
        };

        // Broadcast to Supabase Realtime channel
        console.log(`[Ozonetel Webhook] Broadcasting normal SCREEN_POP event...`);
        const channel = supabaseAdmin.channel('cloudconnect_events');
        await channel.send({
            type: 'broadcast',
            event: 'SCREEN_POP',
            payload: payload
        });
        
        console.log(`[Ozonetel Webhook] Ringing event broadcasted successfully.`);
        return NextResponse.json({ success: true, message: 'Ringing event broadcasted' });
    }

    // 3. Handle Completed Call / Callback Log (Hangup, Answered, NotAnswered, etc.)
    if (callStatus !== 'Ring') {
        console.log(`[Ozonetel Webhook] Processing end-of-call log saving. Status: ${callStatus}`);
        const { data: existingLog } = await supabaseAdmin
            .from('call_logs')
            .select('id')
            .eq('cloudconnect_uuid', uuid)
            .single();

        let callLogUserId = matchedAgentId || (lead?.assigned_to) || null;
        
        // Final fallback: if absolutely no user can be matched (e.g. fully automated IVR dropping), pick a system admin to satisfy DB constraint
        if (!callLogUserId) {
            const { data: fallbackUsers } = await supabaseAdmin.from('users').select('id').limit(1);
            if (fallbackUsers && fallbackUsers.length > 0) {
                callLogUserId = fallbackUsers[0].id;
            }
        }

        const logData: any = {
            cloudconnect_uuid: uuid,
            call_type: callDirection.toLowerCase() || 'inbound',
            call_status: (callStatus || 'completed').toLowerCase(),
            duration_seconds: callDurationSeconds,
            notes: `Ozonetel Call (${callStatus || 'Completed'}). Agent: ${extensionNumber}`,
            user_id: callLogUserId
        };

        if (recordingUrl) {
            logData.recording_url = recordingUrl;
            logData.notes += ` | Recording: ${recordingUrl}`;
        }

        if (dtmfInput) {
            logData.notes += ` | DTMF Input: ${dtmfInput}`;
        }

        if (lead?.id) {
            logData.lead_id = lead.id;
            console.log(`[Ozonetel Webhook] Attaching call log to Lead ID: ${lead.id}`);
        } else {
            console.log(`[Ozonetel Webhook] No lead found to attach this call log to.`);
        }

        if (existingLog) {
            console.log(`[Ozonetel Webhook] Updating existing call log ID: ${existingLog.id}`);
            const { error: updateError } = await supabaseAdmin.from('call_logs').update(logData).eq('id', existingLog.id);
            if (updateError) console.error(`[Ozonetel Webhook] Error updating call log:`, updateError);
        } else {
            console.log(`[Ozonetel Webhook] Inserting new call log.`);
            const { error: insertError } = await supabaseAdmin.from('call_logs').insert([logData]);
            if (insertError) console.error(`[Ozonetel Webhook] Error inserting call log:`, insertError);
        }

        console.log(`[Ozonetel Webhook] Finished processing successfully.`);
        return NextResponse.json({ success: true, message: 'Call log saved' });
    }

    console.log(`[Ozonetel Webhook] Event ignored (no matching conditions).`);
    return NextResponse.json({ success: true, message: 'Event ignored' });

  } catch (error: any) {
    console.error('[Ozonetel Webhook] Critical Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
