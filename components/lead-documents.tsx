"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { FileText, Download, ExternalLink, Image as ImageIcon, File, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function LeadDocuments({ leadId, tenantId }: { leadId: string, tenantId: string }) {
    const supabase = createClient()
    const [files, setFiles] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchDocs = async () => {
            const { data, error } = await supabase.storage.from('kyc_documents').list(`${tenantId}/${leadId}`)
            if (data) {
                // Filter out empty folder placeholders
                setFiles(data.filter(f => f.name !== '.emptyFolderPlaceholder' && f.id))
            }
            setLoading(false)
        }
        fetchDocs()
    }, [leadId, tenantId, supabase])

    if (loading) {
        return <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
    }

    if (files.length === 0) {
        return (
            <div className="flex items-center justify-center p-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="text-center">
                    <p className="text-slate-500 mb-2 font-medium">No documents uploaded yet.</p>
                    <p className="text-xs text-slate-400">Request documents from the client to get started.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-4">
            {files.map(file => {
                const isImage = file.metadata?.mimetype?.startsWith('image/') || file.name.endsWith('.jpg') || file.name.endsWith('.png');
                const fileUrl = supabase.storage.from('kyc_documents').getPublicUrl(`${tenantId}/${leadId}/${file.name}`).data.publicUrl;
                
                return (
                    <div key={file.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow bg-slate-50 dark:bg-slate-900/50">
                        <div className="h-16 w-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-sm mb-3">
                            {isImage ? <ImageIcon className="h-8 w-8 text-blue-500" /> : <FileText className="h-8 w-8 text-rose-500" />}
                        </div>
                        <p className="text-sm font-semibold truncate w-full text-slate-800 dark:text-slate-200 mb-1" title={file.name}>
                            {file.name.replace(/^kyc_/, '').split('_')[0]}
                        </p>
                        <p className="text-xs text-slate-500 mb-4">
                            {new Date(file.created_at).toLocaleDateString()} • {(file.metadata?.size / 1024).toFixed(1)} KB
                        </p>
                        <div className="flex gap-2 w-full mt-auto">
                            <Button variant="outline" size="sm" className="w-full flex-1" onClick={() => window.open(fileUrl, '_blank')}>
                                <ExternalLink className="h-3 w-3 mr-1" /> View
                            </Button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
