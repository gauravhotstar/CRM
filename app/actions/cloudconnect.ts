"use server"

import { createClient } from "@/lib/supabase/server"

// Placeholder settings for CloudConnect (these should ideally come from DB or env vars)
const CC_API_TOKEN = process.env.CLOUDCONNECT_API_TOKEN || "CtAXjkDDjjDOODNXD";
const CC_TENANT_ID = process.env.CLOUDCONNECT_TENANT_ID || "1001";
const CC_BASE_URL = "https://crm5.cloud-connect.in/CCC_api/v1.4";

export async function createAgentSession(agentId: string) {
  try {
    const res = await fetch(`${CC_BASE_URL}/createSession`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: agentId,
        token: CC_API_TOKEN,
        tenant_id: CC_TENANT_ID,
      }),
    });

    const data = await res.json();
    if (data.code === 200 && data.status === "OK") {
      return { success: true, sessionId: data.session_id };
    } else {
      return { success: false, error: data.status_message || "Failed to create session" };
    }
  } catch (error: any) {
    console.error("CloudConnect Create Session Error:", error);
    return { success: false, error: error.message };
  }
}

export async function initiateCloudConnectCall(customerPhone: string, agentId: string, sessionId: string) {
  try {
    const res = await fetch(`${CC_BASE_URL}/clickToCallManual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "Call",
        agent_id: agentId,
        agent_session_id: sessionId,
        customer_phone: customerPhone,
        camp_id: "1", // Hardcoded default campaign ID for now
        tenant_id: CC_TENANT_ID,
        token: CC_API_TOKEN,
      }),
    });

    const data = await res.json();
    if (data.code === 200 && data.status === "OK") {
      return { success: true, message: data.status_message || "Call Initiated Successfully" };
    } else {
      return { success: false, error: data.status_message || "Failed to initiate call" };
    }
  } catch (error: any) {
    console.error("CloudConnect Call Error:", error);
    return { success: false, error: error.message };
  }
}
