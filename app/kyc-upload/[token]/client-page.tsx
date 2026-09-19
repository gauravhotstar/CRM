"use client"

import { useState } from "react"
import { uploadKycDocument } from "@/app/actions/kyc-upload"
import { Upload, CheckCircle, Loader2, AlertCircle } from "lucide-react"

export function ClientKycUpload({ leadId, tenantId, requestedDocs }: { leadId: string, tenantId: string, requestedDocs: string[] }) {
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'uploading' | 'success' | 'error'>>(
    requestedDocs.reduce((acc, doc) => ({ ...acc, [doc]: 'idle' }), {})
  )
  const [errorMsg, setErrorMsg] = useState<Record<string, string>>({});

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        setErrorMsg(prev => ({...prev, [docType]: "File must be less than 5MB"}));
        return;
    }

    setUploadStatus(prev => ({ ...prev, [docType]: 'uploading' }));
    
    const formData = new FormData();
    formData.append("file", file);

    const res = await uploadKycDocument(formData, tenantId, leadId, docType);
    
    if (res.success) {
      setUploadStatus(prev => ({ ...prev, [docType]: 'success' }));
    } else {
      setUploadStatus(prev => ({ ...prev, [docType]: 'error' }));
      setErrorMsg(prev => ({ ...prev, [docType]: res.error || "Upload failed" }));
    }
  }

  const DOC_LABELS: Record<string, string> = {
    aadhar: "Aadhar Card",
    pan: "PAN Card",
    cheque: "Booking Cheque",
    bankStatement: "Bank Statement (6 Months)",
    passportPhoto: "Passport Photo"
  };

  if (requestedDocs.length === 0) {
    return <div className="text-center p-4 text-emerald-600 bg-emerald-50 rounded-lg font-medium">All documents have been collected!</div>
  }

  return (
    <div className="space-y-6 mt-8">
      {requestedDocs.map((doc) => (
        <div key={doc} className="p-4 border rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">{DOC_LABELS[doc] || doc}</h3>
            {uploadStatus[doc] === 'success' && <CheckCircle className="h-5 w-5 text-emerald-500" />}
            {uploadStatus[doc] === 'uploading' && <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />}
            {uploadStatus[doc] === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
          </div>
          
          {uploadStatus[doc] !== 'success' && (
            <div>
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="h-6 w-6 text-slate-400 mb-2" />
                  <p className="text-xs text-slate-500"><span className="font-semibold text-indigo-600">Click to upload</span> or drag and drop</p>
                </div>
                <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => handleFileChange(e, doc)} disabled={uploadStatus[doc] === 'uploading'} />
              </label>
              {errorMsg[doc] && uploadStatus[doc] === 'error' && <p className="text-xs text-red-500 mt-2">{errorMsg[doc]}</p>}
            </div>
          )}

          {uploadStatus[doc] === 'success' && (
             <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm p-3 rounded-lg flex items-center gap-2">
                Document uploaded successfully!
             </div>
          )}
        </div>
      ))}
      
      {Object.values(uploadStatus).every(s => s === 'success') && (
          <div className="mt-8 p-6 bg-emerald-500 text-white rounded-xl text-center shadow-lg animate-in fade-in zoom-in duration-500">
              <CheckCircle className="h-10 w-10 mx-auto mb-2 opacity-90" />
              <h3 className="text-lg font-bold">Thank You!</h3>
              <p className="text-emerald-50 text-sm">All required documents have been successfully uploaded and securely sent to your representative.</p>
          </div>
      )}
    </div>
  )
}
