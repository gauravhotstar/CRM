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

    let bodyData: any = {};
    if (req.method === 'POST') {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          bodyData = await req.json();
        } catch (e) {
          // ignore
        }
      } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        try {
          const formData = await req.formData();
          formData.forEach((value, key) => {
            bodyData[key] = value.toString();
          });
        } catch (e) {
          // ignore
        }
      }
    }

    const getParam = (key: string) => searchParams.get(key) || bodyData[key] || '';
    
    // 0. API Key Verification
    const expectedApiKey = process.env.CLOUDCONNECT_WEBHOOK_SECRET || 'HANVA_OZT_7X9Q2P4L';
    const providedApiKey = getParam('api_key') || req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');

    if (providedApiKey !== expectedApiKey) {
        return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
    }

    // Ping / Verification check (e.g. if testing from Postman or webhook setup without call details)
    const hasCallData = getParam('uuid') || getParam('CallUUID') || getParam('call_uuid') || getParam('caller_number') || getParam('CustomerNumber') || getParam('cid');
    if (!hasCallData) {
        return NextResponse.json({ 
            success: true, 
            message: 'API key verified successfully. Webhook endpoint is active and ready to receive call events.' 
        });
    }
    
    // Parse Payload (Supports query params, JSON body, or form data)
    const uuid = getParam('uuid') || getParam('CallUUID') || getParam('call_uuid') || '';
    const extensionNumber = getParam('extension_number') || getParam('agent_id') || getParam('AgentID') || getParam('AgentPhoneNumber') || '';
    const callerNumber = getParam('caller_number') || getParam('CustomerNumber') || getParam('caller_id') || getParam('cid') || getParam('PhoneNumber') || '';
    const callStatus = getParam('call_status') || getParam('Status') || getParam('status') || getParam('DialStatus') || ''; // 'Ring', 'Answered', 'Hangup'
    const callDirection = getParam('call_direction') || getParam('Direction') || getParam('direction') || 'inbound';
    const callDuration = getParam('call_duration') || getParam('Duration') || getParam('duration') || '0';
    const dtmfInput = getParam('dtmf_input') || getParam('digit') || getParam('AudioInput') || getParam('Input') || '';
    const recordingUrl = getParam('recording_url') || getParam('AudioFile') || getParam('RecordingUrl') || '';

    if (!uuid || !callerNumber) {
        return NextResponse.json({ error: 'Missing required parameters (uuid, caller_number)' }, { status: 400 });
    }

    // 1. Find the Lead
    // Format the number to get the last 10 digits for better matching
    const cleanNumber = callerNumber.replace(/^\+?\d{1,3}/, '').slice(-10); 
    
    const supabaseAdmin = getSupabaseAdmin();
    
    const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id, name, company, phone, status')
        .ilike('phone', `%${cleanNumber}%`)
        .limit(1);

    const lead = leads?.[0];

    // 2. Handle RINGING (Screen Pop)
    if (callStatus === 'Ring') {
        const payload = {
            call_uuid: uuid,
            extension: extensionNumber,
            caller_number: callerNumber,
            direction: callDirection,
            lead: lead || null, 
        };

        // Broadcast to Supabase Realtime channel
        const channel = supabaseAdmin.channel('cloudconnect_events');
        await channel.send({
            type: 'broadcast',
            event: 'SCREEN_POP',
            payload: payload
        });
        
        return NextResponse.json({ success: true, message: 'Ringing event broadcasted' });
    }

    // 3. Handle HANGUP or ANSWERED (Log Call)
    if (callStatus === 'Hangup' || callStatus === 'Answered') {
        const { data: existingLog } = await supabaseAdmin
            .from('call_logs')
            .select('id')
            .eq('cloudconnect_uuid', uuid)
            .single();

        const logData: any = {
            cloudconnect_uuid: uuid,
            call_type: callDirection.toLowerCase() || 'unknown',
            call_status: callStatus.toLowerCase(),
            duration_seconds: parseInt(callDuration, 10) || 0,
            notes: `CloudConnect Call (${callStatus}). Ext: ${extensionNumber}`
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
            
            // If they pressed 1 or 2, they are interested or need more info
            if (dtmfInput === '1' || dtmfInput === '2') {
                await supabaseAdmin.from('leads').update({ status: 'Interested' }).eq('id', lead.id);
            } else if (dtmfInput === '3') {
                await supabaseAdmin.from('leads').update({ status: 'Not Interested' }).eq('id', lead.id);
            }
        }

        if (existingLog) {
            await supabaseAdmin.from('call_logs').update(logData).eq('id', existingLog.id);
        } else {
            await supabaseAdmin.from('call_logs').insert([logData]);
        }

        return NextResponse.json({ success: true, message: 'Call log saved' });
    }

    return NextResponse.json({ success: true, message: 'Event ignored' });

  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
