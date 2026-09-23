import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Helper to lazy-load the Supabase Admin Client to bypass RLS for webhooks
const getSupabaseAdmin = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export async function GET(req: Request) {
    return handleStickyRouting(req);
}

export async function POST(req: Request) {
    return handleStickyRouting(req);
}

async function handleStickyRouting(req: Request) {
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
        
        // API Key Verification
        const expectedApiKey = process.env.CLOUDCONNECT_WEBHOOK_SECRET || 'HANVA_OZT_7X9Q2P4L';
        const providedApiKey = getParam('api_key') || req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');

        if (providedApiKey !== expectedApiKey) {
            return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
        }

        // Verification ping (e.g. testing with only api_key in Postman)
        const callerNumber = getParam('caller_number') || getParam('cid') || getParam('CustomerNumber') || getParam('phone') || getParam('From') || '';
        if (!callerNumber) {
            return NextResponse.json({ 
                success: true, 
                message: 'API key verified successfully. Sticky Agent endpoint is active.' 
            });
        }

        const cleanNumber = callerNumber.replace(/^\+?\d{1,3}/, '').slice(-10);
        const supabaseAdmin = getSupabaseAdmin();

        // 1. Look up the lead to find the assigned agent (fetch all data for popup)
        const { data: leads } = await supabaseAdmin
            .from('leads')
            .select('*')
            .ilike('phone', `%${cleanNumber}%`)
            .limit(1);

        const lead = leads?.[0];
        
        if (!lead || !lead.assigned_to) {
            // No lead found or no assigned agent. Return empty so Ozonetel falls back to common skill
            return NextResponse.json({ phone_name: "" });
        }

        // 2. Look up the agent's mobile number
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('phone') 
            .eq('id', lead.assigned_to)
            .single();

        if (user && user.phone) {
            // 🔥 CRM WORKAROUND: Ozonetel doesn't reliably push Ring events to the Server Webhook.
            // Since they DO hit this Sticky URL right before calling the agent, we will instantly 
            // trigger the Screen Pop *here* so the agent sees it 1-2 seconds before their phone rings!
            try {
                console.warn(`[Ozonetel Sticky] Broadcasting pre-ring SCREEN_POP for agent: ${lead.assigned_to}`);
                const channel = supabaseAdmin.channel('cloudconnect_events');
                await channel.send({
                    type: 'broadcast',
                    event: 'SCREEN_POP',
                    payload: {
                        call_uuid: getParam('uuid') || getParam('monitorUCID') || `sticky-${Date.now()}`,
                        extension: user.phone,
                        target_agent_id: lead.assigned_to,
                        caller_number: callerNumber,
                        direction: 'Inbound',
                        lead: lead
                    }
                });
            } catch (err) {
                console.error("[Ozonetel Sticky] Failed to broadcast pre-ring popup:", err);
            }

            // Return the agent's phone number as 'phone_name' for Ozonetel's skill-based routing
            return NextResponse.json({ phone_name: user.phone });
        }

        // Fallback
        return NextResponse.json({ phone_name: "" });

    } catch (error: any) {
        console.error('Ozonetel Sticky API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
