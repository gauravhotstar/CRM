"use client"

import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { 
  Phone, Mail, MapPin, Calendar, MessageSquare, ArrowLeft, Clock, Save, History, 
  Building, User, AlertTriangle, Printer, Trash2, CheckCircle2, Circle, Copy, ExternalLink, ArrowRightCircle, ShieldCheck
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useEffect, useMemo } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import { TimelineView } from "@/components/timeline-view"
import { LeadNotes } from "@/components/lead-notes"
import { LeadCallHistory } from "@/components/lead-call-history"
import { FollowUpsList } from "@/components/follow-ups-list"
import { KycRequestDialog } from "@/components/kyc-request-dialog"
import { LeadStatusUpdater } from "@/components/lead-status-updater"
import { SmartMatches } from "@/components/smart-matches"
import { LeadSiteVisits } from "@/components/lead-site-visits"
import { formatDistanceToNow, differenceInDays } from "date-fns"
import { toast } from "sonner" // Ensure you have installed sonner
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useTenant, useMasterStatuses } from "@/context/tenant-provider"
import { MASTER_STATUSES, DEFAULT_WORKFLOW_TRIGGERS } from "@/lib/lead-statuses"
import { LeadAuditHistory } from "@/components/lead-audit-history"

// --- TYPES ---
interface EditLeadPageProps {
  params: {
    id: string
  }
}

interface Lead {
  id: string
  name: string
  email: string | null
  phone: string
  company: string | null
  designation: string | null
  source: string | null
  status: string
  priority: string
  created_at: string
  updated_at: string // Used for stagnation calculation
  last_contacted: string | null
  next_follow_up: string | null
  assigned_to: string | null
  kyc_member_id: string | null
  assigned_user: { id: string; full_name: string } | null
  assigner: { id: string; full_name: string } | null
  notes: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  zip_code: string | null
}

interface Telecaller {
  id: string
  full_name: string
}

// Pipeline steps are now calculated dynamically based on enabled statuses

export default function EditLeadPage({ params }: EditLeadPageProps) {
  const router = useRouter()
  const supabase = createClient()

  // State
  const [lead, setLead] = useState<Lead | null>(null)
  const [telecallers, setTelecallers] = useState<Telecaller[] | null>(null)
  const [telecallerStatus, setTelecallerStatus] = useState<Record<string, boolean>>({})
  const [isKycDialogOpen, setIsKycDialogOpen] = useState(false)
  const [kycMembers, setKycMembers] = useState<{id: string, full_name: string}[] | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [timelineData, setTimelineData] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)

  const org = useTenant()
  const masterStatuses = useMasterStatuses()
  const currentMasterStatuses = masterStatuses.length > 0 ? masterStatuses : MASTER_STATUSES
  const enabledStatusValues = org?.enabled_statuses || currentMasterStatuses.map(s => s.value)
  const workflowTriggers = org?.workflow_triggers || DEFAULT_WORKFLOW_TRIGGERS

  const availableStatusOptions = useMemo(() => {
    return currentMasterStatuses.filter(s => enabledStatusValues.includes(s.value))
  }, [enabledStatusValues, currentMasterStatuses])

  const PIPELINE_STEPS = useMemo(() => {
      // Create pipeline steps from enabled statuses, filtering out statuses like "nr", "not_eligible", "follow_up" which are outcomes, not steps.
      const excludedSteps = ["nr", "not_eligible", "self_employed", "follow_up", "Not_Interested"]
      return availableStatusOptions
          .filter(s => !excludedSteps.includes(s.value))
          .map(s => ({ id: s.value, label: s.label }))
  }, [availableStatusOptions])

  // --- DATA FETCHING ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
        if (userError || !currentUser) {
          router.push("/auth/login")
          return
        }
        setUser(currentUser)

        const { data: leadData, error: leadError } = await supabase
          .from("leads")
          .select("*, assigned_user:users!leads_assigned_to_fkey(id, full_name), assigner:users!leads_assigned_by_fkey(id, full_name)")
          .eq("id", params.id)
          .single()

        if (leadError || !leadData) {
          setError("Lead not found")
          setLoading(false)
          return
        }

        const leadWithUserData = {
            ...leadData,
            assigned_user: leadData.assigned_user || null,
            assigner: leadData.assigner || null
        }
        setLead(leadWithUserData as Lead)
        setSelectedStatus(leadData.status)

        const { data: userProfile } = await supabase.from("users").select("tenant_id").eq("id", currentUser.id).single()
        if (userProfile?.tenant_id) {
            const { data: kycData } = await supabase
              .from("users")
              .select("id, full_name")
              .eq("role", "kyc_team")
              .eq("tenant_id", userProfile.tenant_id)
              .eq("is_active", true)
            
            if (kycData) setKycMembers(kycData)
        }

        const { data: telecallersData } = await supabase
          .from("users")
          .select("id, full_name")
          .eq("role", "telecaller")
          .eq("is_active", true)
        
        if (telecallersData) setTelecallers(telecallersData as Telecaller[])

        const today = new Date().toISOString().split('T')[0]
        const { data: attendance } = await supabase.from("attendance").select("user_id").eq("date", today).not("check_in", "is", null)
        if(attendance) {
            const statusMap: any = {}
            attendance.forEach((a: any) => statusMap[a.user_id] = true)
            setTelecallerStatus(statusMap)
        }

        await fetchTimelineData(params.id)
        setLoading(false)
      } catch (err) {
        console.error("Error fetching data:", err)
        setError("Failed to load lead data")
        setLoading(false)
      }
    }

    fetchData()
  }, [params.id, router, supabase])

  const fetchTimelineData = async (leadId: string) => {
    try {
        const { data: notes } = await supabase.from("notes").select("*, users!notes_user_id_fkey(full_name)").eq("lead_id", leadId).order("created_at", { ascending: false })
        const { data: followUps } = await supabase.from("follow_ups").select("*").eq("lead_id", leadId).order("scheduled_date", { ascending: false })
        const { data: callHistory } = await supabase.from("call_logs").select("*, users!call_logs_user_id_fkey(full_name)").eq("lead_id", leadId).order("created_at", { ascending: false })

        const timeline = [
            ...(notes || []).map((n: any) => ({ type: 'note', id: n.id, title: n.note_type === 'status_change' ? 'Status Change' : 'Note Added', description: n.content, date: n.created_at, icon: <MessageSquare className="h-4 w-4"/>, user: n.users?.full_name || 'Unknown' })),
            ...(followUps || []).map((f: any) => ({ type: 'follow_up', id: f.id, title: 'Follow Up Scheduled', description: `For: ${new Date(f.scheduled_date).toLocaleString()} - ${f.status}`, date: f.created_at, icon: <Calendar className="h-4 w-4"/>, user: 'System' })),
            ...(callHistory || []).map((c: any) => ({ type: 'call', id: c.id, title: 'Call Logged', description: `Outcome: ${c.outcome} (${c.duration_seconds}s)`, date: c.created_at, icon: <Phone className="h-4 w-4"/>, user: c.users?.full_name || 'Unknown' }))
        ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        
        setTimelineData(timeline)
    } catch(e) { console.error("Timeline Error", e) }
  }

  // --- HANDLERS ---
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setUpdating(true)
    
    try {
      const formData = new FormData(event.currentTarget)
      const assignedToValue = formData.get("assigned_to") as string
      const kycMemberValue = formData.get("kyc_member_id") as string
      
      const updates = {
        name: formData.get("name") as string,
        email: (formData.get("email") as string) || null,
        phone: formData.get("phone") as string,
        company: (formData.get("company") as string) || null,
        designation: (formData.get("designation") as string) || null,
        address: (formData.get("address") as string) || null,
        city: (formData.get("city") as string) || null,
        state: (formData.get("state") as string) || null,
        zip_code: (formData.get("zip_code") as string) || null,
        country: (formData.get("country") as string) || null,
        status: formData.get("status") as string,
        priority: formData.get("priority") as string,
        assigned_to: assignedToValue === "unassigned" ? null : assignedToValue,
        kyc_member_id: kycMemberValue === "unassigned" || !kycMemberValue ? null : kycMemberValue,
        source: (formData.get("source") as string) || null,
        notes: (formData.get("notes") as string) || null,
        updated_at: new Date().toISOString() // Force update timestamp
      }
      
      const { error } = await supabase.from("leads").update(updates).eq("id", params.id)
      if (error) throw error

      if (lead?.status !== updates.status && user) {
          await supabase.from("notes").insert({
              lead_id: params.id,
              user_id: user.id,
              content: `Status manually updated from ${lead?.status} to ${updates.status}`,
              note_type: 'status_change'
          })
          await fetchTimelineData(params.id)
      }
      
      // Merge new data with existing complex objects (users)
      setLead(prev => prev ? { ...prev, ...updates } as Lead : null)
      toast.success("Lead updated successfully")

    } catch (err) {
      console.error("Error updating lead:", err)
      toast.error("Failed to update lead")
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
      setDeleting(true)
      try {
          const { error } = await supabase.from('leads').delete().eq('id', params.id)
          if(error) throw error
          toast.success("Lead deleted successfully")
          router.push('/admin/leads')
      } catch(e) {
          console.error(e)
          toast.error("Failed to delete lead")
          setDeleting(false)
      }
  }

  // --- UTILS ---
  const copyToClipboard = (text: string, label: string) => {
      if(!text) return
      navigator.clipboard.writeText(text)
      toast.success(`${label} copied to clipboard`)
  }

  const makeCall = (phone: string) => { if (phone) window.open(`tel:${phone}`, "_self") }
  const sendEmail = (email: string) => { if (email) window.open(`mailto:${email}`, "_blank") }
  const handlePrint = () => { window.print() }

  const getStatusColor = (status: string) => {
    const map: any = { new: "bg-blue-100 text-blue-800", contacted: "bg-yellow-100 text-yellow-800", Interested: "bg-green-100 text-green-800", Disbursed: "bg-emerald-100 text-emerald-800", Not_Interested: "bg-red-100 text-red-800" }
    return map[status] || "bg-gray-100 text-gray-800"
  }

  const getPriorityColor = (priority: string) => {
    const map: any = { high: "bg-red-100 text-red-800 border-red-200", medium: "bg-blue-100 text-blue-800 border-blue-200", low: "bg-slate-100 text-slate-800 border-slate-200" }
    return map[priority] || "bg-gray-100 text-gray-800"
  }

  const getSafeValue = (val: any, def: string) => val || def

  const isStale = (lastContacted: string | null) => {
      if(!lastContacted) return true
      const diff = differenceInDays(new Date(), new Date(lastContacted))
      return diff > 7
  }

  const daysInStatus = useMemo(() => {
      if (!lead?.updated_at) return 0
      return differenceInDays(new Date(), new Date(lead.updated_at))
  }, [lead])

  const engagementScore = useMemo(() => {
      if (!timelineData) return 0
      let score = 0
      timelineData.forEach(item => {
          if (item.type === 'call') score += 10
          if (item.type === 'note') score += 5
          if (item.title === 'Status Change') score += 20
      })
      return Math.min(score, 100)
  }, [timelineData])

  const getCurrentStepIndex = () => {
      if (!lead) return 0
      const idx = PIPELINE_STEPS.findIndex(s => s.id.toLowerCase() === lead.status.toLowerCase())
      return idx === -1 ? 0 : idx
  }

  if (loading) return <LoadingSkeleton variant="details" />;
  
  if (error || !lead) return <div className="p-10 text-center text-red-500 font-medium">{error}</div>

  return (
    <div className="p-4 md:p-6 space-y-6 bg-slate-50/30 dark:bg-slate-950/20 min-h-screen">
      
      {/* 1. Enhanced Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
            <Link href="/admin/leads">
                <Button variant="outline" size="sm" className="gap-2 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 rounded-full h-9 w-9 p-0">
                    <ArrowLeft className="h-4 w-4"/>
                </Button>
            </Link>
            <div>
                <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-white dark:border-slate-800 shadow-md">
                        <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-lg shadow-[0_4px_12px_rgba(37,99,235,0.25)]">
                            {lead.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            {getSafeValue(lead.name, "Unknown Lead")}
                        </h1>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-450 font-medium">
                            <span className="flex items-center gap-1"><Building className="h-3.5 w-3.5 text-slate-400" /> {getSafeValue(lead.company, "No Company")}</span>
                            <span className="text-slate-300 dark:text-slate-700">|</span>
                            {/* Assigner Visibility */}
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger className="cursor-default">
                                        <span className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                            <User className="h-3.5 w-3.5 text-slate-400"/> 
                                            {lead.assigned_user?.full_name || "Unassigned"}
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-slate-900 dark:bg-slate-950 text-white font-semibold">
                                        <p>Assigned by: {lead.assigner?.full_name || "System"}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        {/* Header Actions */}
        <div className="flex items-center gap-2">
            {isStale(lead.last_contacted) && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 rounded-full border border-amber-200 dark:border-amber-900/35 text-xs font-semibold mr-2 animate-pulse">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>No contact 7+ days</span>
                </div>
            )}
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-full text-xs font-semibold">
                <Printer className="h-3.5 w-3.5" /> Print
            </Button>
            <Badge variant="outline" className="px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800 rounded-full">ID: {lead.id.slice(0,8)}</Badge>
        </div>
      </div>

      {/* 2. Pipeline Visualizer */}
      <Card className="border border-slate-200/60 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
          <CardContent className="pt-6 pb-6">
              <div className="relative flex items-center justify-between w-full px-4 overflow-x-auto py-2">
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-slate-100 dark:bg-slate-800 -z-0 min-w-[500px]" />
                  {PIPELINE_STEPS.map((step, index) => {
                      const currentIdx = getCurrentStepIndex();
                      const isActive = index === currentIdx;
                      const isCompleted = index < currentIdx;
                      return (
                          <div key={step.id} className="relative z-10 flex flex-col items-center gap-2 bg-white dark:bg-slate-900 px-3 min-w-[90px]">
                              <div className={`
                                  w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300
                                  ${isActive ? 'border-blue-600 bg-blue-600 text-white scale-110 shadow-[0_0_12px_rgba(37,99,235,0.45)]' : ''}
                                  ${isCompleted ? 'border-emerald-500 bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)]' : ''}
                                  ${!isActive && !isCompleted ? 'border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-950 text-slate-400 dark:text-slate-500' : ''}
                              `}>
                                  {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : 
                                   isActive ? <Circle className="h-3 w-3 fill-current animate-pulse" /> :
                                   <Circle className="h-3.5 w-3.5" />}
                              </div>
                              <span className={`text-[11px] font-semibold tracking-tight whitespace-nowrap ${isActive ? 'text-blue-600 dark:text-blue-400' : isCompleted ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-400 dark:text-slate-500'}`}>
                                  {step.label}
                              </span>
                          </div>
                      )
                  })}
              </div>
          </CardContent>
      </Card>

      {/* 3. Main Tabs Layout */}
      <Tabs defaultValue="overview" className="w-full animate-in fade-in duration-300">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1 shadow-sm inline-flex mb-6 overflow-x-auto max-w-full">
          <TabsList className="h-auto bg-transparent p-0 gap-1">
            {['overview', 'timeline', 'notes', 'calls', 'followups', 'documents', ...(org?.industry === 'real_estate' ? ['smart_matches', 'site_visits'] : []), 'history'].map((tab) => (
                <TabsTrigger 
                    key={tab} 
                    value={tab} 
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 data-[state=active]:bg-blue-50/80 dark:data-[state=active]:bg-blue-950/40 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 rounded-xl capitalize transition-all cursor-pointer"
                >
                    {tab === 'history' ? <><History className="h-3.5 w-3.5 mr-1.5" /> Audit Logs</> : tab}
                </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Edit Form */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="shadow-sm border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">Lead Information</CardTitle>
                        <CardDescription className="text-xs text-slate-500 dark:text-slate-450">Manage core details and assignment.</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Badge className={cn("text-xs font-semibold rounded-full px-2.5 py-0.5", getStatusColor(lead.status))}>{lead.status.replace(/_/g, ' ')}</Badge>
                        <Badge variant="outline" className={cn("text-xs font-semibold rounded-full px-2.5 py-0.5 border", getPriorityColor(lead.priority))}>{lead.priority}</Badge>
                    </div>
                  </div>
                </CardHeader>
                
                <Separator className="bg-slate-100 dark:bg-slate-800/80" />
                
                <CardContent className="pt-6">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Contact Info */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <User className="h-4 w-4 text-slate-400" /> Contact Details
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Full Name</Label><Input name="name" defaultValue={lead.name} required className="mt-1.5 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs" /></div>
                            <div><Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Company</Label><Input name="company" defaultValue={lead.company || ""} className="mt-1.5 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs" /></div>
                            <div>
                                <Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Email</Label>
                                <div className="relative mt-1.5">
                                    <Input name="email" type="email" defaultValue={lead.email || ""} className="pr-8 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs" />
                                    <button type="button" onClick={() => copyToClipboard(lead.email || "", "Email")} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"><Copy className="h-3.5 w-3.5"/></button>
                                </div>
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Phone</Label>
                                <div className="relative mt-1.5">
                                    <Input name="phone" defaultValue={lead.phone} required className="pr-8 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs" />
                                    <button type="button" onClick={() => copyToClipboard(lead.phone, "Phone")} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"><Copy className="h-3.5 w-3.5"/></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator className="bg-slate-100 dark:bg-slate-800/80" />

                    {/* Location & Meta */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-slate-400" /> Location & Context
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div><Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Designation</Label><Input name="designation" defaultValue={lead.designation || ""} className="mt-1.5 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs" /></div>
                            <div><Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Source</Label><Input name="source" defaultValue={lead.source || ""} className="mt-1.5 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs" /></div>
                        </div>
                        <div className="mb-4"><Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Address</Label><Textarea name="address" defaultValue={lead.address || ""} rows={2} className="mt-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs resize-none p-3" /></div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div><Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">City</Label><Input name="city" defaultValue={lead.city || ""} className="mt-1.5 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs" /></div>
                            <div><Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">State</Label><Input name="state" defaultValue={lead.state || ""} className="mt-1.5 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs" /></div>
                            <div><Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Zip</Label><Input name="zip_code" defaultValue={lead.zip_code || ""} className="mt-1.5 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs" /></div>
                            <div><Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Country</Label><Input name="country" defaultValue={lead.country || ""} className="mt-1.5 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs" /></div>
                        </div>
                    </div>

                    <Separator className="bg-slate-100 dark:bg-slate-800/80" />

                    {/* Management */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Building className="h-4 w-4 text-slate-400" /> Management
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Status</Label>
                                <Select name="status" value={selectedStatus} onValueChange={setSelectedStatus}>
                                    <SelectTrigger className="mt-1.5 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        {availableStatusOptions.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value} className="rounded-lg text-xs">{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Priority</Label>
                                <Select name="priority" defaultValue={lead.priority || "medium"}>
                                    <SelectTrigger className="mt-1.5 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="low" className="rounded-lg text-xs">Low</SelectItem>
                                        <SelectItem value="medium" className="rounded-lg text-xs">Medium</SelectItem>
                                        <SelectItem value="high" className="rounded-lg text-xs">High</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-slate-650 dark:text-slate-350">Assign To</Label>
                                <Select name="assigned_to" defaultValue={lead.assigned_to || "unassigned"}>
                                    <SelectTrigger className="mt-1.5 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-xs"><SelectValue placeholder="Select Telecaller" /></SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="unassigned" className="rounded-lg text-xs">Unassigned</SelectItem>
                                        {telecallers?.map(t => (
                                            <SelectItem key={t.id} value={t.id} className="rounded-lg text-xs">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${telecallerStatus[t.id] ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-slate-350'}`} />
                                                    <span className={telecallerStatus[t.id] ? "font-medium text-slate-800 dark:text-slate-200" : "text-slate-500"}>{t.full_name}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        
                        {/* Conditionally show KYC Team Member Dropdown */}
                        {(selectedStatus === workflowTriggers.on_login_done || selectedStatus === workflowTriggers.on_kyc_transfer || selectedStatus === "Underwriting" || lead.kyc_member_id) && (
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3">
                                <div>
                                    <Label className="text-xs font-semibold text-indigo-650 dark:text-indigo-350 flex items-center gap-1.5 mb-1.5">
                                        <ShieldCheck className="h-3.5 w-3.5" />
                                        Assign to KYC Team
                                    </Label>
                                    <Select name="kyc_member_id" defaultValue={lead.kyc_member_id || "unassigned"}>
                                        <SelectTrigger className="h-9 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800 text-xs">
                                            <SelectValue placeholder="Select KYC Member" />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-xl">
                                            <SelectItem value="unassigned" className="rounded-lg text-xs">Unassigned</SelectItem>
                                            {kycMembers?.map(k => (
                                                <SelectItem key={k.id} value={k.id} className="rounded-lg text-xs">
                                                    {k.full_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-4">
                        <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl h-10 shadow-[0_4px_12px_rgba(37,99,235,0.25)] transition-all cursor-pointer" disabled={updating}>
                            {updating ? "Saving Changes..." : <><Save className="w-4 h-4 mr-2"/> Save Changes</>}
                        </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* DANGER ZONE */}
              <Card className="border border-rose-100 dark:border-rose-950 bg-rose-50/20 dark:bg-rose-950/5 rounded-2xl overflow-hidden shadow-none">
                  <CardHeader className="pb-3">
                      <CardTitle className="text-rose-700 dark:text-rose-400 text-sm font-bold flex items-center gap-2">
                          <Trash2 className="h-4 w-4" /> Danger Zone
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="flex justify-between items-center pb-6">
                      <p className="text-xs text-rose-600/80 dark:text-rose-450/70 font-medium">Permanently delete this lead and all associated history. This is irreversible.</p>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" className="rounded-xl px-4 text-xs font-semibold cursor-pointer shadow-none">Delete Lead</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-2xl border-slate-250 dark:border-slate-850">
                            <AlertDialogHeader>
                            <AlertDialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription className="text-xs text-slate-500 dark:text-slate-450 mt-2">
                                This action cannot be undone. This will permanently delete the lead
                                <strong className="text-slate-850 dark:text-slate-150"> {lead.name}</strong> and remove all data from our servers.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="mt-4">
                            <AlertDialogCancel className="rounded-xl text-xs font-semibold">Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className="bg-rose-650 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold">
                                {deleting ? "Deleting..." : "Confirm Delete"}
                            </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                  </CardContent>
              </Card>
            </div>

            {/* Right Column: Actions & Stats */}
            <div className="space-y-6">
                
                {/* Engagement Score */}
                <Card className="shadow-sm border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider">Engagement Score</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-6">
                        <div className="flex items-end justify-between mb-2">
                            <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">{engagementScore}</span>
                            <span className="text-xs text-slate-450 dark:text-slate-500 mb-1 font-medium">/ 100</span>
                        </div>
                        <Progress value={engagementScore} className="h-2 rounded-full bg-slate-100 dark:bg-slate-800" />
                        
                        {/* Stagnation Indicator */}
                        {daysInStatus > 3 && (
                            <div className="mt-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-900/35 font-semibold">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span>In current status for {daysInStatus} days</span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Status Updater */}
                <Card className="shadow-sm border-blue-100/50 dark:border-slate-850 bg-blue-50/10 dark:bg-slate-900/40 rounded-2xl overflow-hidden">
                    <CardHeader className="pb-3 bg-blue-50/20 dark:bg-slate-950/10 border-b border-blue-50/50 dark:border-slate-850">
                        <CardTitle className="text-xs font-bold text-blue-900 dark:text-blue-400 uppercase tracking-wider">Quick Status Update</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <LeadStatusUpdater 
                            leadId={lead.id} 
                            currentStatus={lead.status} 
                            leadPhoneNumber={lead.phone} 
                            telecallerName={user?.full_name || "Admin"}
                            onStatusUpdate={() => fetchTimelineData(lead.id)} 
                        />
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card className="shadow-sm border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider">Communication</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pb-6">
                        <Button onClick={() => makeCall(lead.phone)} className="w-full gap-2 justify-start border-slate-250 dark:border-slate-850 rounded-xl h-10 hover:bg-slate-50 dark:hover:bg-slate-850 font-semibold text-xs cursor-pointer shadow-none text-slate-800 dark:text-slate-200" variant="outline">
                            <Phone className="h-4 w-4 text-emerald-500"/> Call {lead.phone}
                        </Button>
                        <Button onClick={() => sendEmail(lead.email || "")} variant="outline" className="w-full gap-2 justify-start border-slate-250 dark:border-slate-850 rounded-xl h-10 hover:bg-slate-50 dark:hover:bg-slate-850 font-semibold text-xs cursor-pointer shadow-none text-slate-800 dark:text-slate-200" disabled={!lead.email}>
                            <Mail className="h-4 w-4 text-blue-500"/> Email Lead
                        </Button>
                        <Link href={`/admin/leads/${lead.id}/follow-up`} className="block">
                            <Button variant="outline" className="w-full gap-2 justify-start border-slate-250 dark:border-slate-850 rounded-xl h-10 hover:bg-slate-50 dark:hover:bg-slate-850 font-semibold text-xs cursor-pointer shadow-none text-slate-800 dark:text-slate-200"><Calendar className="h-4 w-4 text-indigo-500"/> Schedule Follow-up</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* Lead Stats */}
                <Card className="shadow-sm border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider">Insights</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pb-6">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-550 dark:text-slate-450 font-medium">Created</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{new Date(lead.created_at).toLocaleDateString()}</span>
                        </div>
                        <Separator className="bg-slate-100 dark:bg-slate-850" />
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-550 dark:text-slate-450 font-medium">Last Contact</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {lead.last_contacted 
                                    ? formatDistanceToNow(new Date(lead.last_contacted), { addSuffix: true }) 
                                    : "Never"}
                             </span>
                        </div>
                        <Separator className="bg-slate-100 dark:bg-slate-850" />
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-550 dark:text-slate-450 font-medium">Engagement</span>
                            <span className="font-bold bg-slate-100 dark:bg-slate-855 px-2.5 py-0.5 rounded-full text-[10px] text-slate-700 dark:text-slate-300">
                                {timelineData.length} Interactions
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>
          </div>
        </TabsContent>

        {/* OTHER TABS */}
        <TabsContent value="timeline">
            <Card className="rounded-2xl border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"><CardContent className="pt-6"><TimelineView data={timelineData} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="notes">
            <Card className="rounded-2xl border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"><CardContent className="pt-6"><LeadNotes leadId={lead.id} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="calls">
            <Card className="rounded-2xl border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"><CardContent className="pt-6"><LeadCallHistory leadId={lead.id} userId={user?.id} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="followups">
            <Card className="rounded-2xl border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"><CardContent className="pt-6"><FollowUpsList leadId={lead.id} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="documents">
            <Card className="rounded-2xl border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
               <CardHeader className="bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-850 flex flex-row items-center justify-between">
                   <div>
                       <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                           Documents & KYC
                       </CardTitle>
                       <CardDescription>Securely manage KYC files and booking documents.</CardDescription>
                   </div>
                   <Button onClick={() => setIsKycDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                       Request KYC
                   </Button>
               </CardHeader>
               <CardContent className="pt-6">
                   <div className="flex items-center justify-center p-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                       <div className="text-center">
                           <p className="text-slate-500 mb-2 font-medium">No documents uploaded yet.</p>
                           <p className="text-xs text-slate-400">Request documents from the client to get started.</p>
                       </div>
                   </div>
               </CardContent>
            </Card>
            <KycRequestDialog isOpen={isKycDialogOpen} onClose={() => setIsKycDialogOpen(false)} leadName={lead.name} leadId={lead.id} tenantId={lead.tenant_id} leadPhone={lead.phone} />
        </TabsContent>

        <TabsContent value="smart_matches">
            <Card className="rounded-2xl border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
               <CardHeader className="bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-850">
                   <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                       AI Property Matchmaker
                   </CardTitle>
                   <CardDescription>Automatically matching properties to this lead's requirements.</CardDescription>
               </CardHeader>
               <CardContent className="pt-6">
                   {/* We will build the SmartMatches component to render here */}
                   <SmartMatches leadId={lead.id} />
               </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="site_visits">
            <Card className="rounded-2xl border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
               <CardHeader className="bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-850">
                   <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                       Site Visits
                   </CardTitle>
                   <CardDescription>Schedule and manage physical property tours for this lead.</CardDescription>
               </CardHeader>
               <CardContent className="pt-6">
                   <LeadSiteVisits leadId={lead.id} telecallerId={user?.id} />
               </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="rounded-2xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-850">
              <div className="flex items-center justify-between">
                  <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2 text-base font-bold">
                        <History className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        Audit Log
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500 dark:text-slate-450">
                        Complete system record of every change made to this lead.
                      </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-white dark:bg-slate-900 text-xs rounded-full">Secure Record</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
                <LeadAuditHistory leadId={lead.id} />
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
