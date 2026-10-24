import { NextResponse } from 'next/server';
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient } from '@/lib/meilisearch';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

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
      return NextResponse.json({ error: "Forbidden: Admin privileges required." }, { status: 403 });
    }

    const tenantId = userCheck?.tenant_id;
    const body = await request.json();
    const { type, companyName, category, pincode, city, state, notes } = body;

    if (!type || !['company', 'pincode'].includes(type)) {
      return NextResponse.json({ error: "Invalid record type. Must be 'company' or 'pincode'." }, { status: 400 });
    }

    const client = adminClient();
    const index = client.index('companies');

    const docId = randomUUID();
    let newDocument: any = {
      id: docId,
      data_type: type,
      file_name: 'Manual Entry',
      tenant_id: tenantId || null,
      created_at: new Date().toISOString(),
    };

    if (type === 'company') {
      if (!companyName || !companyName.trim()) {
        return NextResponse.json({ error: "Company name is required." }, { status: 400 });
      }
      
      const cleanCompanyName = companyName.trim()
        .replace(/\bpvt\.?\b/gi, 'PVT')
        .replace(/\bltd\.?\b/gi, 'LTD');

      newDocument.company_name = cleanCompanyName;
      newDocument.category = category?.trim() || 'Uncategorized';
      if (notes) newDocument.notes = notes.trim();
    } else {
      if (!pincode || !String(pincode).trim()) {
        return NextResponse.json({ error: "6-digit pincode is required." }, { status: 400 });
      }

      const cleanPincode = String(pincode).trim();
      if (!/^\d{6}$/.test(cleanPincode)) {
        return NextResponse.json({ error: "Pincode must be exactly 6 numeric digits." }, { status: 400 });
      }

      newDocument.pincode = cleanPincode;
      newDocument.city = city?.trim() || 'Unspecified';
      if (state?.trim()) newDocument.state = state.trim();
      if (notes) newDocument.notes = notes.trim();
    }

    const task = await index.addDocuments([newDocument]);

    return NextResponse.json({
      success: true,
      taskUid: task.taskUid,
      document: newDocument,
    });

  } catch (error: any) {
    console.error("Master Data Entry Creation Error:", error);
    return NextResponse.json({ 
      error: "Failed to create entry", 
      details: error?.message || String(error) 
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    // 🔒 AUTH CHECK
    const supabase = await createServerClient();
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userCheck } = await supabase
      .from("users")
      .select("role")
      .eq("id", currentUser.id)
      .single();

    const allowedRoles = ["super_admin", "tenant_admin", "team_leader"];
    if (!userCheck?.role || !allowedRoles.includes(userCheck.role)) {
      return NextResponse.json({ error: "Forbidden: Admin privileges required." }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: "Document ID is required." }, { status: 400 });
    }

    const client = adminClient();
    const index = client.index('companies');

    // In Meilisearch, deleting by primary key id is instant and doesn't require filterable attributes
    const task = await index.deleteDocument(id);

    return NextResponse.json({
      success: true,
      taskUid: task.taskUid,
      deletedId: id,
    });

  } catch (error: any) {
    console.error("Master Data Delete Record Error:", error);
    return NextResponse.json({ 
      error: "Failed to delete record", 
      details: error?.message || String(error) 
    }, { status: 500 });
  }
}
