import { ClientKycUpload } from "./client-page"
import { notFound } from "next/navigation"

export default function KycUploadPage({ params, searchParams }: { params: { token: string }, searchParams: { req?: string } }) {
  try {
    const decoded = Buffer.from(params.token, 'base64').toString('utf-8');
    const { leadId, tenantId } = JSON.parse(decoded);
    
    if (!leadId || !tenantId) return notFound();
    
    const requestedDocs = searchParams.req ? searchParams.req.split(',') : [];

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
          <div className="text-center">
            <h2 className="mt-6 text-3xl font-extrabold text-slate-900">Secure KYC Upload</h2>
            <p className="mt-2 text-sm text-slate-600">Please upload the requested documents below to securely complete your profile.</p>
          </div>
          <ClientKycUpload leadId={leadId} tenantId={tenantId} requestedDocs={requestedDocs} />
        </div>
      </div>
    );
  } catch (err) {
    return notFound();
  }
}
