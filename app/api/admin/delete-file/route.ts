import { NextResponse } from 'next/server';
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient } from '@/lib/meilisearch';

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
      .select("role")
      .eq("id", currentUser.id)
      .single();

    const allowedRoles = ["super_admin", "tenant_admin", "team_leader"];
    if (!userCheck?.role || !allowedRoles.includes(userCheck.role)) {
      return NextResponse.json({ error: "Forbidden: You do not have permission to execute this admin action." }, { status: 403 });
    }
    const { fileName } = await request.json();

    if (!fileName) {
      return NextResponse.json({ error: 'File name is required' }, { status: 400 });
    }

    const client = adminClient();
    const index = client.index('companies');

    // Execute the deletion filter: delete every document where file_name equals the requested name
    const task = await index.deleteDocuments({
      filter: `file_name = "${fileName}"`
    });

    return NextResponse.json({ success: true, taskUid: task.taskUid });

  } catch (error) {
    console.error('Delete Error:', error);
    return NextResponse.json({ error: 'Failed to delete file data' }, { status: 500 });
  }
}
