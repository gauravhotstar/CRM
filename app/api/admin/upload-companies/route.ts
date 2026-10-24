import { NextResponse } from 'next/server';
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient } from '@/lib/meilisearch';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  try {
    // 🔒 AUTH CHECK
    const supabase = await createServerClient();
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userCheck } = await supabase
      .from("users")
      .select("role, tenant_id")
      .eq("id", currentUser.id)
      .single();

    const allowedRoles = ["super_admin", "tenant_admin", "team_leader"];
    if (!userCheck?.role || !allowedRoles.includes(userCheck.role)) {
      return NextResponse.json({ error: "Forbidden: You do not have permission to execute this admin action." }, { status: 403 });
    }

    const tenantId = userCheck?.tenant_id;
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant ID not found" }, { status: 400 });
    }

    const body = await request.json();
    const { chunk, uploadType, fileName } = body;

    if (!chunk || !Array.isArray(chunk)) {
      return NextResponse.json({ error: 'Invalid batch data' }, { status: 400 });
    }

    // Process and clean the data chunk
    const formattedData = chunk.map((row: any) => {
      row.id = randomUUID();
      row.file_name = fileName;
      row.data_type = uploadType;
      row.tenant_id = tenantId; // 🔒 Tenant Isolation key!

      if (uploadType === 'company' && row.company_name) {
        // Ensure Pvt and ltd are strictly capital letters
        row.company_name = row.company_name
          .replace(/\bpvt\.?\b/gi, 'PVT')
          .replace(/\bltd\.?\b/gi, 'LTD');
      }
      
      return row;
    });

    const client = adminClient();
    const index = client.index('companies');

    // Ingest the chunk documents directly (settings are managed centrally)
    const task = await index.addDocuments(formattedData);

    return NextResponse.json({ success: true, taskUid: task.taskUid });

  } catch (error) {
    console.error('Batch Upload Error:', error);
    return NextResponse.json({ error: 'Failed to upload batch' }, { status: 500 });
  }
}
