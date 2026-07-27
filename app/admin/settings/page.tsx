"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { 
  Building2, PhoneCall, MessageSquare, 
  Save, KeyRound, Loader2, ShieldCheck, Clock, Activity 
} from "lucide-react"

// Import our Server Actions
import { updateWorkspaceSettings, getWorkspaceSettings } from "@/app/actions/tenant-settings"

export default function WorkspaceSettingsPage() {
  const supabase = createClient()
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // Form State
  const [formData, setFormData] = useState({
    fonada_client_id: "",
    fonada_secret: "",
    whatsapp_api_key: "",
    whatsapp_ai_agent_enabled: false,
    unicorn_api_key: "",
    // Cron Job States
    cron_auto_checkout: true,
    cron_auto_refill: true,
    cron_daily_report: true,
    cron_kyc: true,
    cron_sla: true,
    cron_smart_notifications: true
  })

  // Fetch existing settings on load
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const result = await getWorkspaceSettings()

        if (!result.success) {
          throw new Error(result.error || "Failed to load settings")
        }

        const data = result.data

        if (data) {
          setFormData({
            fonada_client_id: data.fonada_client_id || "",
            fonada_secret: data.fonada_secret || "",
            whatsapp_api_key: data.whatsapp_api_key || "",
            whatsapp_ai_agent_enabled: data.whatsapp_ai_agent_enabled ?? false,
            unicorn_api_key: data.unicorn_api_key || "",
            cron_auto_checkout: data.cron_auto_checkout ?? true,
            cron_auto_refill: data.cron_auto_refill ?? true,
            cron_daily_report: data.cron_daily_report ?? true,
            cron_kyc: data.cron_kyc ?? true,
            cron_sla: data.cron_sla ?? true,
            cron_smart_notifications: data.cron_smart_notifications ?? true
          })
        }
      } catch (err: any) {
        console.error("Error fetching settings:", err)
        toast.error("Failed to load workspace settings")
      } finally {
        setIsLoading(false)
      }
    }

    fetchSettings()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    
    // Send the updated data to your server action
    const response = await updateWorkspaceSettings(formData)
    
    if (response.success) {
      toast.success("Settings saved successfully!")
    } else {
      toast.error(response.error || "Failed to save settings")
    }
    
    setIsSaving(false)
  }

  const handleCronToggle = (field: keyof typeof formData) => {
    setFormData(prev => ({ ...prev, [field]: !prev[field] as any }))
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 md:space-y-8 pb-20">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Building2 className="h-8 w-8 text-indigo-600" />
          Workspace Configuration
        </h1>
        <p className="text-slate-500 mt-1">
          Manage your API keys, integrations, and company-wide CRM settings.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        


        {/* UNICORN AI CARD */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b bg-slate-50/50 pb-4">
            <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
              <PhoneCall className="h-5 w-5 text-indigo-600" />
              Unicorn AI Calling Integration
            </CardTitle>
            <CardDescription>
              Connect your Unicorn AI Solution account to enable advanced AI voice calling.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-slate-700 font-semibold flex items-center gap-2">
                Unicorn API Key <KeyRound className="h-3 w-3 text-slate-400" />
              </Label>
              <Input 
                type="password"
                placeholder="Paste your Unicorn AI Client API Key..." 
                value={formData.unicorn_api_key}
                onChange={(e) => setFormData(prev => ({ ...prev, unicorn_api_key: e.target.value }))}
                className="font-mono text-sm bg-slate-50"
              />
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-md p-3 text-xs text-indigo-800">
              <strong>Webhook Setup:</strong> Please configure your call-outcome webhook in Unicorn AI portal to point to <code>https://yourdomain.com/api/webhooks/unicorn-call-outcomes</code>
            </div>
          </CardContent>
        </Card>

        {/* WHATSAPP CARD */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b bg-slate-50/50 pb-4">
            <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
              <MessageSquare className="h-5 w-5 text-emerald-600" />
              WhatsApp Automation
            </CardTitle>
            <CardDescription>
              Configure your Meta/Cloud API keys to send automated KYC lists and Missed Call alerts.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-slate-700 font-semibold flex items-center gap-2">
                WhatsApp API Bearer Token <KeyRound className="h-3 w-3 text-slate-400" />
              </Label>
              <Input 
                type="password"
                placeholder="EAAI..." 
                value={formData.whatsapp_api_key}
                onChange={(e) => setFormData(prev => ({ ...prev, whatsapp_api_key: e.target.value }))}
                className="font-mono text-sm bg-slate-50"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <div className="space-y-0.5">
                <Label className="text-base font-semibold text-slate-800">WhatsApp AI Chat Agent</Label>
                <p className="text-sm text-slate-500">Automatically chats with customers to collect KYC documents (Aadhar Card, PAN Card, Payslips) using AI.</p>
              </div>
              <Switch 
                checked={formData.whatsapp_ai_agent_enabled} 
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, whatsapp_ai_agent_enabled: checked }))} 
              />
            </div>
          </CardContent>
        </Card>

        {/* 🔴 AUTOMATED CRON JOBS CARD */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b bg-slate-50/50 pb-4">
            <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
              <Clock className="h-5 w-5 text-orange-500" />
              Automated Background Tasks (Cron)
            </CardTitle>
            <CardDescription>
              Enable or disable automated system tasks. If paused, the external cron job will safely skip execution for your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              
              {/* SLA Cron */}
              <div className="flex items-center justify-between p-4 sm:p-6 hover:bg-slate-50 transition-colors">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold text-slate-800">SLA & Lead Recycling</Label>
                  <p className="text-sm text-slate-500">Automatically reassigns neglected (SLA breach) and stuck No-Response (NR) leads.</p>
                </div>
                <Switch checked={formData.cron_sla} onCheckedChange={() => handleCronToggle('cron_sla')} />
              </div>

              {/* Auto Refill */}
              <div className="flex items-center justify-between p-4 sm:p-6 hover:bg-slate-50 transition-colors">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold text-slate-800">Auto Lead Refill</Label>
                  <p className="text-sm text-slate-500">Automatically pulls unassigned leads from the general pool and gives them to active agents.</p>
                </div>
                <Switch checked={formData.cron_auto_refill} onCheckedChange={() => handleCronToggle('cron_auto_refill')} />
              </div>

              {/* KYC */}
              <div className="flex items-center justify-between p-4 sm:p-6 hover:bg-slate-50 transition-colors">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold text-slate-800">KYC Reminders</Label>
                  <p className="text-sm text-slate-500">Scans the system and sends automated WhatsApp reminders for pending customer documents.</p>
                </div>
                <Switch checked={formData.cron_kyc} onCheckedChange={() => handleCronToggle('cron_kyc')} />
              </div>

              {/* Smart Notifications */}
              <div className="flex items-center justify-between p-4 sm:p-6 hover:bg-slate-50 transition-colors">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold text-slate-800">Smart Notifications</Label>
                  <p className="text-sm text-slate-500">Triggers follow-up alerts and CRM dashboard notifications for your telecallers.</p>
                </div>
                <Switch checked={formData.cron_smart_notifications} onCheckedChange={() => handleCronToggle('cron_smart_notifications')} />
              </div>

              {/* Daily Report */}
              <div className="flex items-center justify-between p-4 sm:p-6 hover:bg-slate-50 transition-colors">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold text-slate-800">Daily Admin Report</Label>
                  <p className="text-sm text-slate-500">Compiles and emails the end-of-day organizational performance report.</p>
                </div>
                <Switch checked={formData.cron_daily_report} onCheckedChange={() => handleCronToggle('cron_daily_report')} />
              </div>

              {/* Auto Checkout */}
              <div className="flex items-center justify-between p-4 sm:p-6 hover:bg-slate-50 transition-colors">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold text-slate-800">Auto Force Checkout</Label>
                  <p className="text-sm text-slate-500">Automatically ends the shift of any agent who forgets to check out at midnight.</p>
                </div>
                <Switch checked={formData.cron_auto_checkout} onCheckedChange={() => handleCronToggle('cron_auto_checkout')} />
              </div>

            </div>
          </CardContent>
        </Card>

      </div>

      {/* SAVE ACTIONS - Sticky Footer */}
      <div className="sticky bottom-6 z-10 flex justify-end bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-200 shadow-lg">
        <Button 
          onClick={handleSave} 
          disabled={isSaving} 
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md w-full sm:w-auto px-8"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Workspace Settings
        </Button>
      </div>

    </div>
  )
}
