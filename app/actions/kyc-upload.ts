"use server"

import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function uploadKycDocument(formData: FormData, tenantId: string, leadId: string, docType: string) {
  try {
    const file = formData.get("file") as File;
    if (!file) throw new Error("No file uploaded");

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const fileName = `${tenantId}/${leadId}/kyc_${docType}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
        .from('kyc_documents')
        .upload(fileName, buffer, { contentType: file.type, upsert: true });

    if (uploadError) throw uploadError;

    const publicUrlData = supabaseAdmin.storage.from('kyc_documents').getPublicUrl(fileName);
    const fileUrl = publicUrlData.data.publicUrl;

    const { error: chatError } = await supabaseAdmin.from('chat_messages').insert({
        tenant_id: tenantId,
        lead_id: leadId,
        direction: 'inbound',
        message_type: 'document',
        content: `📁 *KYC Document Uploaded via Magic Link (${docType}):*\n${fileUrl}`,
        status: 'received'
    });
    
    // Also update lead status to show new message
    await supabaseAdmin.from("leads").update({ 
        last_message_at: new Date().toISOString(),
        last_message_content: `📁 KYC Document Uploaded (${docType})`,
        last_message_type: 'inbound' 
    }).eq("id", leadId);

    // Try to trigger unread counter
    await supabaseAdmin.rpc('increment_unread_count', { row_id: leadId });

    return { success: true, url: fileUrl };
  } catch (error: any) {
    console.error("KYC Upload Error:", error);
    return { success: false, error: error.message };
  }
}
