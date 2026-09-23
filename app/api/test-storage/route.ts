import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "";
  const { data, error } = await supabaseAdmin.storage.from('kyc_documents').list(path, { limit: 100 });
  return NextResponse.json({ path, data, error });
}
