"use client"

import { useState } from "react"
import { ShieldCheck, Link as LinkIcon, Send, Copy, Check } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export function KycRequestDialog({ 
  isOpen, 
  onClose, 
  leadName = "the client",
  leadId,
  tenantId,
  leadPhone
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  leadName?: string,
  leadId?: string,
  tenantId?: string,
  leadPhone?: string
}) {
  const [copied, setCopied] = useState(false)
  const [magicLink, setMagicLink] = useState("")
  
  const [docs, setDocs] = useState({
    aadhar: true,
    pan: true,
    cheque: false,
    bankStatement: false,
    passportPhoto: false
  })

  const handleGenerateLink = () => {
    const payload = btoa(JSON.stringify({ leadId, tenantId }));
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://crm.hanva.in';
    const link = `${baseUrl}/kyc-upload/${payload}?req=${Object.entries(docs).filter(([k, v]) => v).map(([k]) => k).join(',')}`
    setMagicLink(link)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(magicLink)
    setCopied(true)
    toast.success("Magic link copied to clipboard!")
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSendWhatsApp = () => {
    toast.success(`WhatsApp message with KYC link queued for ${leadName}!`)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if(!open) {
            setMagicLink("")
            onClose()
        }
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-500" /> Request KYC Documents
          </DialogTitle>
          <DialogDescription>
            Select the required documents and generate a secure upload link for {leadName}.
          </DialogDescription>
        </DialogHeader>

        {!magicLink ? (
          <div className="py-4 space-y-4">
            <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Required Documents</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="aadhar" checked={docs.aadhar} onCheckedChange={(c) => setDocs(prev => ({...prev, aadhar: !!c}))} />
                <Label htmlFor="aadhar">Aadhar Card</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="pan" checked={docs.pan} onCheckedChange={(c) => setDocs(prev => ({...prev, pan: !!c}))} />
                <Label htmlFor="pan">PAN Card</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="cheque" checked={docs.cheque} onCheckedChange={(c) => setDocs(prev => ({...prev, cheque: !!c}))} />
                <Label htmlFor="cheque">Booking Cheque</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="bank" checked={docs.bankStatement} onCheckedChange={(c) => setDocs(prev => ({...prev, bankStatement: !!c}))} />
                <Label htmlFor="bank">Bank Statement (6M)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="photo" checked={docs.passportPhoto} onCheckedChange={(c) => setDocs(prev => ({...prev, passportPhoto: !!c}))} />
                <Label htmlFor="photo">Passport Photo</Label>
              </div>
            </div>

            <Button onClick={handleGenerateLink} className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white">
              Generate Secure Link
            </Button>
          </div>
        ) : (
          <div className="py-4 space-y-6">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-400 mb-2">Magic Link Generated!</h4>
                <div className="flex gap-2">
                    <Input value={magicLink} readOnly className="bg-white dark:bg-slate-900 font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={handleCopy}>
                        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleCopy}>
                    <Copy className="h-4 w-4 mr-2" /> Copy Link
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={handleSendWhatsApp}>
                    <Send className="h-4 w-4 mr-2" /> Send via WhatsApp
                </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
