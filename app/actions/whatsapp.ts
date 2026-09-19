// app/actions/whatsapp.ts
"use server"

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Helper to fetch tenant settings securely
async function getTenantWaCredentials(tenantId: string | null) {
  let fonadaUser = process.env.FONADA_USERID || "";
  let fonadaPass = process.env.FONADA_PASSWORD || "";
  let fonadaWaba = process.env.FONADA_WABA_NUMBER || "";
  let whatsappApiKey = process.env.FONADA_WHATSAPP_BEARER_TOKEN || "";

  let targetTenantId = tenantId;
  if (!targetTenantId) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle();
        if (profile?.tenant_id) targetTenantId = profile.tenant_id;
      }
    } catch (e) {
      // Ignore auth errors if calling from background context without session
    }
  }

  if (targetTenantId) {
    const supabaseAdmin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: settings } = await supabaseAdmin
      .from('tenant_settings')
      .select('fonada_userid, fonada_password, fonada_waba_number, whatsapp_api_key, wa_userid, wa_password, wa_waba_number')
      .eq('tenant_id', targetTenantId)
      .maybeSingle();
    
    const actualUser = settings?.wa_userid || settings?.fonada_userid;
    const actualPass = settings?.wa_password || settings?.fonada_password;
    const actualWaba = settings?.wa_waba_number || settings?.fonada_waba_number;

    if (actualUser) fonadaUser = actualUser;
    if (actualPass) fonadaPass = actualPass;
    if (actualWaba) fonadaWaba = actualWaba;
    if (settings?.whatsapp_api_key) whatsappApiKey = settings.whatsapp_api_key;
  }
  return { fonadaUser, fonadaPass, fonadaWaba, whatsappApiKey };
}

// Unified helper to send WhatsApp messages using Fonada SendMsgOld endpoint
async function sendViaFonadaOldApi(creds: any, phone: string, text: string) {
  const apiUrl = "https://waba.fonada.com/api/SendMsgOld";
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const formData = new FormData();
  formData.append("userid", creds.fonadaUser);
  formData.append("password", creds.fonadaPass);
  formData.append("wabaNumber", creds.fonadaWaba);

  let safePhone = phone.replace(/^\+/, '');
  if (safePhone.length === 10) safePhone = `91${safePhone}`;
  formData.append("mobile", safePhone); 
  
  formData.append("msg", text);
  formData.append("msgType", "text");
  formData.append("sendMethod", "quick");
  formData.append("output", "json");

  const res = await fetch(apiUrl, { method: "POST", body: formData });
  const data = await res.json();

  if (data.status === "error" || data.error) {
    throw new Error(data.message || data.error || "Fonada API Error");
  }
  return { safePhone, msgId: data.msgId || null };
}

// ============================================================================
// 1. SEND NORMAL TEXT MESSAGE (Used in your new Chat UI)
// ============================================================================
export async function sendWhatsAppText(leadId: string, customerPhone: string, text: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
    const creds = await getTenantWaCredentials(profile?.tenant_id || null);

    const { safePhone, msgId } = await sendViaFonadaOldApi(creds, customerPhone, text);

    const { error: insertError } = await supabase.from("chat_messages").insert({
        lead_id: leadId, phone_number: safePhone, direction: 'outbound',
        message_type: 'text', content: text, fonada_message_id: msgId, status: 'sent'
    });

    if (insertError) throw new Error(`Database Insert Failed: ${insertError.message}`);

    await supabase.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", leadId);
    return { success: true };
  } catch (error: any) {
    console.error("WA Text Send Error:", error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// 2. SEND MISSED CALL TEMPLATE (With Interactive Buttons)
// ============================================================================
export async function sendMissedCallMessage(leadId: string, customerPhone: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: agent, error } = await supabase.from('users').select('full_name, phone, tenant_id').eq('id', user.id).single();
    if (error || !agent) throw new Error("Could not fetch agent details");

    const creds = await getTenantWaCredentials(agent.tenant_id);

    const textMessage = `⚠️ We tried calling you but *couldn't connect*.\n\nYour loan application is pending due to missing documents. To avoid processing delays, *please share* the following *immediately*:\n\n*• PAN Card*\n*• Aadhaar Card*\n*• Latest Payslip*`;

    const { safePhone, msgId } = await sendViaFonadaOldApi(creds, customerPhone, textMessage);

    const { error: insertError } = await supabase.from("chat_messages").insert({
        lead_id: leadId, phone_number: safePhone, direction: 'outbound',
        message_type: 'template', content: textMessage, fonada_message_id: msgId, status: 'sent'
    });

    if (insertError) throw new Error(`Database Insert Failed: ${insertError.message}`);

    await supabase.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", leadId);
    return { success: true };
  } catch (error: any) {
    console.error("Missed Call WA Error:", error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// 3. SEND AUTOMATED KYC DOCUMENT REQUEST (Handles Initial & 24h Reminder)
// ============================================================================
export async function sendKYCRequestTemplate(leadId: string, customerPhone: string, isReminder: boolean = false) {
  try {
    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    // Fetch lead to know which tenant is sending this
    const { data: lead } = await supabase.from('leads').select('tenant_id').eq('id', leadId).single();
    const creds = await getTenantWaCredentials(lead?.tenant_id || null);

    const textMessage = `Hello,\n\nThis is an update regarding your loan application. Your application is currently pending.\n\nPlease share clear photos or PDFs of your Aadhar Card, PAN Card, and latest Bank Statement by replying directly to this chat.\n\nThank you.`;

    const { safePhone, msgId } = await sendViaFonadaOldApi(creds, customerPhone, textMessage);

    const { error: insertError } = await supabase.from("chat_messages").insert({
        lead_id: leadId, phone_number: safePhone, direction: 'outbound',
        message_type: 'template', content: textMessage, fonada_message_id: msgId, status: 'sent'
    });

    if (insertError) throw new Error(`Database Insert Failed: ${insertError.message}`);

    const updatePayload: any = { last_message_at: new Date().toISOString(), last_message_content: isReminder ? "Sent 24h KYC Reminder" : "Sent Initial KYC Request", last_message_type: 'outbound' };
    if (isReminder) updatePayload.kyc_reminder_sent = true; 
    else { updatePayload.kyc_requested_at = new Date().toISOString(); updatePayload.kyc_reminder_sent = false; }

    await supabase.from("leads").update(updatePayload).eq("id", leadId);
    return { success: true };
  } catch (error: any) {
    console.error("KYC Request WA Error:", error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// 4. SEND "NOT INTERESTED" AUDIT (The Lie-Detector)
// ============================================================================
export async function sendNotInterestedAudit(leadId: string, customerPhone: string, customerName: string) {
  console.log(`🚀 [SERVER ACTION] Triggering QA Audit for Lead: ${leadId} | Phone: ${customerPhone}`);
  
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error("❌ [QA AUDIT ERROR] No active user session.");
        throw new Error("Unauthorized");
    }

    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
    const creds = await getTenantWaCredentials(profile?.tenant_id || null);

    const textMessage = `Hi ${customerName}, our agent noted that you are no longer interested in a loan at this time.\n\nTo help us improve our service, could you let us know why by replying with one of the following?\n\n1. Rate is too high\n2. Got another loan\n3. I am still interested`;

    console.log(`📡 [QA AUDIT] Sending payload via Fonada SendMsgOld API...`);
    const { safePhone, msgId } = await sendViaFonadaOldApi(creds, customerPhone, textMessage);

    await supabase.from("chat_messages").insert({
        lead_id: leadId, phone_number: safePhone, direction: 'outbound',
        message_type: 'template', content: textMessage, fonada_message_id: msgId, status: 'sent'
    });

    await supabase.from("leads").update({ 
        last_message_at: new Date().toISOString(),
        last_message_content: "Sent QA Audit Template",
        last_message_type: 'outbound'
    }).eq("id", leadId);

    console.log(`✅ [QA AUDIT SUCCESS] Template sent!`);
    return { success: true };

  } catch (error: any) {
    console.error("❌ [QA AUDIT FAILURE]:", error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// 5. SEND CALLBACK REMINDER (Automated Pre-Call Alert)
// ============================================================================
export async function sendCallbackReminderTemplate(leadId: string, customerPhone: string, customerName: string, agentName: string, timeString: string) {
  try {
    const supabase = await createClient();
    
    // Fetch lead to know which tenant is sending this
    const { data: lead } = await supabase.from('leads').select('tenant_id').eq('id', leadId).single();
    const creds = await getTenantWaCredentials(lead?.tenant_id || null);

    const textMessage = `Hello ${customerName}, this is a reminder for your scheduled call with our loan advisor ${agentName} at ${timeString}. We will call you shortly. Thank you!`;

    const { safePhone, msgId } = await sendViaFonadaOldApi(creds, customerPhone, textMessage);

    const { error: insertError } = await supabase.from("chat_messages").insert({
        lead_id: leadId, phone_number: safePhone, direction: 'outbound',
        message_type: 'template', content: textMessage, fonada_message_id: msgId, status: 'sent'
    });

    if (insertError) throw new Error(`Database Insert Failed: ${insertError.message}`);

    await supabase.from("leads").update({ 
        last_message_at: new Date().toISOString(),
        last_message_content: `Sent Callback Reminder for ${timeString}`,
        last_message_type: 'outbound'
    }).eq("id", leadId);

    return { success: true, method: "template" };
  } catch (error: any) {
    console.error("Callback Reminder WA Error:", error);
    return { success: false, error: error.message };
  }
}
