import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Helper to get Admin Client lazily
function getAdminClient() {
  const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!adminUrl || !adminKey) {
    throw new Error("Missing Supabase Admin Keys");
  }

  return createClient(adminUrl, adminKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: Request) {
  try {
    // 1. AUTH CHECK: Who is trying to create a user?
    const supabase = await createServerClient();
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the creator's role from the DB
    const { data: adminCheck } = await supabase
      .from("users")
      .select("role, tenant_id")
      .eq("id", currentUser.id)
      .single();

    // Define who is allowed to CREATE users
    // We allow Super Admins, Tenant Admins, and Team Leaders to create users
    const creators = ["super_admin", "tenant_admin"];
    
    if (!adminCheck?.role || !creators.includes(adminCheck.role)) {
      return NextResponse.json({ error: "Forbidden: You do not have permission to create users." }, { status: 403 });
    }

    // 2. PARSE DATA
    const body = await request.json();
    console.log("👉 Incoming Data:", body); // Debug log

    const { email, password, full_name, phone, role, manager_id, allow_wfh, tenant_id } = body;
    const effectiveTenantId = adminCheck.role === 'super_admin' ? (tenant_id || adminCheck.tenant_id) : adminCheck.tenant_id;

    // 3. VALIDATE ROLE
    // We strictly check against your ALLOWED database roles
    const validRoles = [
      'super_admin', 
      'tenant_admin', 
      'team_leader', 
      'telecaller', 
      'kyc_team', 
      'marketing_manager'
    ];

    // If the requested role isn't valid, fallback to telecaller or throw error
    const roleToSave = validRoles.includes(role) ? role : "telecaller";

    console.log(`👉 Creating user '${full_name}' with role: '${roleToSave}'`);

    // 4. CREATE USER (Auth System)
    const supabaseAdmin = getAdminClient();
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: full_name, role: roleToSave },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    if (!newUser.user) {
      return NextResponse.json({ error: "User creation failed" }, { status: 500 });
    }

    // 5. UPDATE USER PROFILE (Database)
    // We deliberately UPSERT to ensure the role is set correctly
    const { error: profileError } = await supabaseAdmin
      .from("users")
      .upsert({
        id: newUser.user.id,
        email: email,
        full_name: full_name,
        phone: phone,
        role: roleToSave, // <--- This now matches your DB constraint perfectly
        manager_id: manager_id,
        allow_wfh: Boolean(allow_wfh),
        tenant_id: effectiveTenantId,
        created_at: new Date().toISOString(),
      });

    if (profileError) {
      console.error("Profile Error:", profileError);
      return NextResponse.json({ 
        message: "User created in Auth, but Profile update failed.", 
        details: profileError.message 
      }, { status: 201 });
    }

    return NextResponse.json({ success: true, user: newUser.user }, { status: 200 });

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
