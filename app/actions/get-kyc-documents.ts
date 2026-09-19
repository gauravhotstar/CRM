"use server"

import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getKycDocuments(tenantId: string, leadId: string) {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from('kyc_documents')
      .list(`${tenantId}/${leadId}`);
      
    if (error) {
      console.error("Storage list error:", error);
      return { success: false, data: [] };
    }
    
    // Convert to simple array of objects
    const files = data
      .filter(f => f.name !== '.emptyFolderPlaceholder' && f.id)
      .map(file => {
          const publicUrl = supabaseAdmin.storage.from('kyc_documents').getPublicUrl(`${tenantId}/${leadId}/${file.name}`).data.publicUrl;
          return {
             id: file.id,
             name: file.name,
             created_at: file.created_at,
             size: file.metadata?.size || 0,
             mimetype: file.metadata?.mimetype || '',
             url: publicUrl
          }
      });
      
    return { success: true, data: files };
  } catch (error) {
    console.error("Error fetching docs:", error);
    return { success: false, data: [] };
  }
}
