// scripts/tenant-lead-whatsapp-listener.js
// Dedicated 24/7 background worker to auto-send application_status_update WhatsApp template
// whenever a new lead is inserted into tenant 576a6280-a9a2-425c-b1dd-eabfff3a00c6

const fs = require('fs');
const path = require('path');

// Try loading env vars
const envPath = fs.existsSync('/var/www/crm/.env.local') 
  ? '/var/www/crm/.env.local' 
  : path.resolve(__dirname, '../.env.local');

require('dotenv').config({ path: envPath });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cbmhlitlseurjpgnsnve.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_TENANT_ID = '576a6280-a9a2-425c-b1dd-eabfff3a00c6';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

console.log(`📡 [Realtime WA Worker] Listening for all new leads on tenant: ${TARGET_TENANT_ID}`);

// Send WhatsApp template via Fonada API
async function triggerWhatsAppTemplate(leadId, phone, tenantId) {
  try {
    if (!phone) {
      console.warn(`[Auto WA] Lead ${leadId} has no phone number, skipping.`);
      return;
    }

    let safePhone = String(phone).replace(/\D/g, '');
    if (safePhone.length === 10) safePhone = `91${safePhone}`;

    // 1. Deduplication check: Don't send if a template was already sent to this lead in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentMsgs } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('lead_id', leadId)
      .eq('message_type', 'template')
      .gte('created_at', fiveMinutesAgo)
      .limit(1);

    if (recentMsgs && recentMsgs.length > 0) {
      console.log(`[Auto WA] ⏩ Template already sent recently to lead ${leadId} (${safePhone}). Skipping duplicate.`);
      return;
    }

    // 2. Fetch tenant credentials from tenant_settings
    const { data: settings } = await supabase
      .from('tenant_settings')
      .select('fonada_userid, fonada_password, fonada_waba_number')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const fonadaUser = settings?.fonada_userid || process.env.FONADA_USERID || 'bankscart';
    const fonadaPass = settings?.fonada_password || process.env.FONADA_PASSWORD;
    const fonadaWaba = settings?.fonada_waba_number || process.env.FONADA_WABANUMBER || '919278057904';

    const apiUrl = 'https://waba.fonada.com/api/SendMsg/template';
    const templateName = 'application_status_update';
    const buttonsPayload = JSON.stringify({ 'button1': 'Submit Details' });

    const formData = new URLSearchParams();
    formData.append('mobile', safePhone);
    formData.append('wabaNumber', fonadaWaba);
    formData.append('campaignName', 'StatusUpdateAlert');
    formData.append('templateName', templateName);
    formData.append('buttonsPayload', buttonsPayload);

    const authHeader = 'Basic ' + Buffer.from(`${fonadaUser}:${fonadaPass}`).toString('base64');

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const data = await res.json();
    console.log(`[Auto WA] Fonada Response for ${safePhone}:`, JSON.stringify(data));

    const isSuccess = Boolean(data.msgId || data.status === 'success');
    const textMessage = `*Application Status*\n\n*Hello!* Thank you for speaking with our *verification team.*\n\nYour initial *phone verification is successfully completed*. To keep your loan application moving forward, *please submit the remaining pending details* in your secure portal.\n\nLet us know if you need any assistance with the upload!\n\n_ICICI Bank Loan Desk_\n\n[Submit Details] [Call phone number]`;

    await supabase.from('chat_messages').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      phone_number: safePhone,
      direction: 'outbound',
      message_type: 'template',
      content: textMessage,
      fonada_message_id: data.msgId || null,
      status: isSuccess ? 'sent' : 'failed'
    });

    if (isSuccess) {
      await supabase.from('leads').update({
        last_message_at: new Date().toISOString(),
        last_message_content: 'Sent Application Status Update Template',
        last_message_type: 'outbound'
      }).eq('id', leadId);

      console.log(`✅ [Auto WA] Successfully sent application_status_update to ${safePhone} (Lead ID: ${leadId}, MsgId: ${data.msgId})`);
    } else {
      console.error(`❌ [Auto WA] Fonada rejected template for ${safePhone} (Lead ID: ${leadId}): ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error(`❌ [Auto WA] Error sending template for lead ${leadId}:`, err);
  }
}

// 3. Subscribe to Realtime Postgres Changes
function startListener() {
  const channel = supabase
    .channel('tenant_auto_wa_listener')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'leads',
        filter: `tenant_id=eq.${TARGET_TENANT_ID}`
      },
      async (payload) => {
        const newLead = payload.new;
        if (!newLead || !newLead.id) return;
        console.log(`🔔 [Realtime Event] New lead inserted for tenant ${TARGET_TENANT_ID}: Phone: ${newLead.phone} | ID: ${newLead.id}`);
        await triggerWhatsAppTemplate(newLead.id, newLead.phone, newLead.tenant_id);
      }
    )
    .subscribe((status, err) => {
      console.log(`📡 [Realtime Subscription] Channel status: ${status}`);
      if (err) console.error('Realtime subscription error:', err);
    });
}

startListener();
