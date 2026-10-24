import { NextResponse } from 'next/server';
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient } from '@/lib/meilisearch';

export const dynamic = 'force-dynamic';

export async function GET() {
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const client = adminClient();
    const index = client.index('companies');

    // 1. Fetch raw stats from Meilisearch
    let totalDocuments = 0;
    let totalCompanies = 0;
    let totalPincodes = 0;
    let isIndexing = false;
    let files: Array<{ fileName: string; count: number; type?: string }> = [];

    try {
      const stats = await index.getStats();
      totalDocuments = stats.numberOfDocuments || 0;
      isIndexing = !!stats.isIndexing;
      
      if (stats.fieldDistribution) {
        totalCompanies = stats.fieldDistribution.company_name || 0;
        totalPincodes = stats.fieldDistribution.pincode || 0;
      }
    } catch (statsErr) {
      console.warn("Could not get raw index stats:", statsErr);
    }

    // 2. Fetch facet distribution for uploaded files if filterable
    try {
      const facetResult = await index.search('', {
        facets: ['file_name'],
        limit: 0,
      });

      if (facetResult.facetDistribution?.file_name) {
        const fileDist = facetResult.facetDistribution.file_name;
        files = Object.entries(fileDist)
          .map(([fileName, count]) => {
            const lower = fileName.toLowerCase();
            const inferredType = lower.includes('pincode') || lower.includes('pin') ? 'pincode' : 'company';
            return {
              fileName,
              count: Number(count),
              type: inferredType,
            };
          })
          .sort((a, b) => b.count - a.count);
      }
    } catch (facetErr) {
      // Facets might be unavailable while indexing or if not filterable yet
      // This is expected and handled gracefully
    }

    return NextResponse.json({
      success: true,
      totalDocuments,
      totalCompanies,
      totalPincodes,
      isIndexing,
      files,
      fetchedAt: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error("Master Data Stats API Error:", error);
    return NextResponse.json({ 
      error: "Failed to retrieve master data metrics",
      details: error?.message || String(error)
    }, { status: 500 });
  }
}
