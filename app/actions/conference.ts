"use server"

import { createClient } from "@/lib/supabase/server";

export async function initiateManagerConference(leadId: string, agentId: string, customerPhone: string) {
  try {
    const supabase = await createClient();

    // 1. Find an available Manager/Admin
    // We look for a user with the 'admin' or 'manager' role who is ideally 'ready' or online.
    const { data: managers, error: managerError } = await supabase
      .from('users')
      .select('id, phone, full_name, current_status')
      .in('role', ['admin', 'manager'])
      .order('current_status', { ascending: true }) // Prioritize 'ready' status if you track admin status
      .limit(1);

    if (managerError || !managers || managers.length === 0) {
      throw new Error("No managers are currently available to join the call.");
    }

    const manager = managers[0];

    if (!manager.phone) {
      throw new Error(`Manager ${manager.full_name} does not have a valid phone number.`);
    }

    // 2. Fetch the Agent's Phone Number
    const { data: agent } = await supabase
      .from('users')
      .select('phone, tenant_id')
      .eq('id', agentId)
      .single();

    if (!agent?.phone) throw new Error("Agent phone not found.");

    let fonadaUser = process.env.FONADA_USERID || "";
    let fonadaPass = process.env.FONADA_PASSWORD || "";
    if (agent.tenant_id) {
      const { data: settings } = await supabase
        .from('tenant_settings')
        .select('fonada_userid, fonada_password, wa_userid, wa_password')
        .eq('tenant_id', agent.tenant_id)
        .maybeSingle();
      if (settings?.wa_userid || settings?.fonada_userid) fonadaUser = (settings.wa_userid || settings.fonada_userid)!;
      if (settings?.wa_password || settings?.fonada_password) fonadaPass = (settings.wa_password || settings.fonada_password)!;
    }

    // 3. Prepare the Fonada Conference API Payload
    // ⚠️ NOTE: Replace 'apiUrl' with Fonada's exact Conference/Call Patching endpoint
    const apiUrl = "http://192.168.1.16:7992/fonada_conference_api.php"; 
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    const formData = new FormData();
    formData.append("userid", fonadaUser);
    formData.append("password", fonadaPass);
    
    // Normalize phones
    let safeCustomerPhone = customerPhone.replace(/^\+?91/, '');
    if (safeCustomerPhone.length > 10) safeCustomerPhone = safeCustomerPhone.slice(-10);
    
    let safeAgentPhone = agent.phone.replace(/^\+?91/, '');
    if (safeAgentPhone.length > 10) safeAgentPhone = safeAgentPhone.slice(-10);

    let safeManagerPhone = manager.phone.replace(/^\+?91/, '');
    if (safeManagerPhone.length > 10) safeManagerPhone = safeManagerPhone.slice(-10);

    // Tell Fonada to patch the Manager into the active session between Agent and Customer
    formData.append("agent_number", safeAgentPhone); 
    formData.append("customer_number", safeCustomerPhone);
    formData.append("manager_number", safeManagerPhone);
    formData.append("action", "conference_bridge"); 

    // 4. Trigger the Conference Patch
    const res = await fetch(apiUrl, { method: "POST", body: formData });
    const rawText = await res.text();
    console.log("📞 [CONFERENCE API Response]:", rawText);

    // 5. Log the escalation in the CRM notes
    const escalationNote = `🚨 [ESCALATION] Manager ${manager.full_name} was pulled into the live call.`;
    
    // Fetch existing notes first to append
    const { data: lead } = await supabase.from('leads').select('notes').eq('id', leadId).single();
    const existingNotes = lead?.notes ? `${lead.notes}\n\n${escalationNote}` : escalationNote;

    await supabase.from("leads").update({ 
        notes: existingNotes,
        updated_at: new Date().toISOString()
    }).eq("id", leadId);

    return { success: true, message: `Dialing Manager: ${manager.full_name}...` };

  } catch (error: any) {
    console.error("🔥 Conference Error:", error);
    return { success: false, error: error.message };
  }
}
