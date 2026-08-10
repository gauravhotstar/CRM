"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Building2, Users, Loader2, Plus, Server, ShieldAlert, Settings, CheckSquare, MessageSquare, BarChart3, Presentation, Workflow, CloudUpload, Activity, Lock, Unlock, UserCheck, MapPin } from "lucide-react"
import { toast } from "sonner"

import { provisionNewTenant, updateTenantSettings, fetchAllOrganizations, fetchGlobalStatuses, addGlobalStatus, toggleTenantSuspension, impersonateTenant, fetchAllAnnouncements, createAnnouncement, toggleAnnouncement, fetchRecentSystemActivity, deleteTenantLeadsByStatus } from "@/app/actions/super-admin"
import { MASTER_STATUSES, DEFAULT_WORKFLOW_TRIGGERS, resolveIcon } from "@/lib/lead-statuses"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import { useRouter } from "next/navigation"

export default function SuperAdminConsole() {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(true)
  const [organizations, setOrganizations] = useState<any[]>([])
  const [masterStatuses, setMasterStatuses] = useState<any[]>([])
  const currentMasterStatuses = masterStatuses.length > 0 ? masterStatuses : MASTER_STATUSES

  const [isProvisioning, setIsProvisioning] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showAddStatusModal, setShowAddStatusModal] = useState(false)
  const [isAddingStatus, setIsAddingStatus] = useState(false)

  const [isTogglingSuspension, setIsTogglingSuspension] = useState<string | null>(null)
  const [isImpersonating, setIsImpersonating] = useState<string | null>(null)
  
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [systemActivity, setSystemActivity] = useState<any[]>([])
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [isCreatingAnnouncement, setIsCreatingAnnouncement] = useState(false)
  const [announcementForm, setAnnouncementForm] = useState({ title: "", message: "", type: "info" })

  // Status Form State
  const [statusForm, setStatusForm] = useState({
    label: "",
    value: "",
    color: "bg-blue-100 text-blue-800",
    btnColor: "bg-blue-600 hover:bg-blue-700",
    iconName: "Circle"
  })

  // Form State
  const [formData, setFormData] = useState({
    orgName: "", plan: "pro", industry: "general", adminName: "", adminEmail: "", adminPassword: ""
  })

  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<any>(null)
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false)
  const [enabledStatuses, setEnabledStatuses] = useState<string[]>([])
  const [workflowTriggers, setWorkflowTriggers] = useState<any>(DEFAULT_WORKFLOW_TRIGGERS)
  const [enabledModules, setEnabledModules] = useState<string[]>([])

  // Delete Leads State
  const [showDeleteLeadsModal, setShowDeleteLeadsModal] = useState(false)
  const [deleteLeadsOrg, setDeleteLeadsOrg] = useState<any>(null)
  const [deleteLeadsStatus, setDeleteLeadsStatus] = useState("")
  const [isDeletingLeads, setIsDeletingLeads] = useState(false)

  const AVAILABLE_MODULES = [
    { id: "leads", name: "Lead Management", icon: Users },
    { id: "dialer", name: "Calling & Dialer", icon: Server },
    { id: "team", name: "User Management", icon: Users },
    { id: "attendance", name: "Attendance & Leaves", icon: CheckSquare },
    { id: "whatsapp", name: "WhatsApp Integration", icon: MessageSquare },
    { id: "analytics", name: "Reports & Charts", icon: BarChart3 },
    { id: "wallboard", name: "Live Wallboard", icon: Presentation },
    { id: "ivr", name: "IVR Campaigns", icon: Workflow },
    { id: "files", name: "Master Data", icon: CloudUpload },
    { id: "integrations", name: "Lead Sources & Webhooks", icon: Workflow },
    { id: "logs", name: "System Logs", icon: Activity },
    { id: "properties", name: "Property Management", icon: Building2 },
    { id: "site_visits", name: "Site Visits", icon: MapPin },
    { id: "real_estate", name: "Real Estate Tools", icon: Building2 },
  ]

  const openSettings = (org: any) => {
    setSelectedOrg(org)
    setEnabledStatuses(org.enabled_statuses || currentMasterStatuses.map(s => s.value))
    setWorkflowTriggers(org.workflow_triggers || DEFAULT_WORKFLOW_TRIGGERS)
    setEnabledModules(org.enabled_modules || ["leads", "dialer", "team", "analytics"])
    setShowSettingsModal(true)
  }

  const toggleStatus = (statusValue: string) => {
    if (enabledStatuses.includes(statusValue)) {
      setEnabledStatuses(enabledStatuses.filter(s => s !== statusValue))
    } else {
      setEnabledStatuses([...enabledStatuses, statusValue])
    }
  }

  const toggleModule = (moduleId: string) => {
    if (enabledModules.includes(moduleId)) {
      setEnabledModules(enabledModules.filter(m => m !== moduleId))
    } else {
      setEnabledModules([...enabledModules, moduleId])
    }
  }

  const handleUpdateSettings = async () => {
    if (!selectedOrg) return
    setIsUpdatingSettings(true)
    const res = await updateTenantSettings(selectedOrg.id, enabledStatuses, workflowTriggers, enabledModules)
    if (res.success) {
      toast.success(res.message)
      setShowSettingsModal(false)
      fetchOrganizations()
    } else {
      toast.error(res.error)
    }
    setIsUpdatingSettings(false)
  }

  const handleToggleSuspension = async (orgId: string, currentStatus: boolean) => {
    if (!confirm(`Are you sure you want to ${!currentStatus ? 'suspend' : 'activate'} this tenant?`)) return;
    setIsTogglingSuspension(orgId)
    const res = await toggleTenantSuspension(orgId, currentStatus)
    if (res.success) {
      toast.success(res.message)
      fetchOrganizations()
    } else {
      toast.error(res.error)
    }
    setIsTogglingSuspension(null)
  }

  const handleImpersonate = async (orgId: string) => {
    setIsImpersonating(orgId)
    const res = await impersonateTenant(orgId)
    if (res.success && res.link) {
      toast.success("Logging in as tenant admin...")
      window.open(res.link, '_blank')
    } else {
      toast.error(res.error)
    }
    setIsImpersonating(null)
  }

  const handleDeleteLeads = async () => {
    if (!deleteLeadsOrg || !deleteLeadsStatus) return toast.error("Please select a status.")
    
    if (!confirm(`Are you absolutely sure you want to delete ALL leads with status '${deleteLeadsStatus}' for ${deleteLeadsOrg.name}? This action CANNOT be undone.`)) return;

    setIsDeletingLeads(true)
    const res = await deleteTenantLeadsByStatus(deleteLeadsOrg.id, deleteLeadsStatus)
    if (res.success) {
      toast.success(res.message)
      setShowDeleteLeadsModal(false)
      fetchOrganizations() // Refresh counts
    } else {
      toast.error(res.error)
    }
    setIsDeletingLeads(false)
  }

  const handleCreateAnnouncement = async () => {
    if (!announcementForm.title || !announcementForm.message) {
      return toast.error("Title and message are required.")
    }
    setIsCreatingAnnouncement(true)
    const res = await createAnnouncement(announcementForm)
    if (res.success) {
      toast.success(res.message)
      setShowAnnouncementModal(false)
      setAnnouncementForm({ title: "", message: "", type: "info" })
      fetchOrganizations()
    } else {
      toast.error(res.error)
    }
    setIsCreatingAnnouncement(false)
  }

  const handleToggleAnnouncement = async (id: string, currentStatus: boolean) => {
    const res = await toggleAnnouncement(id, currentStatus)
    if (res.success) {
      toast.success(res.message)
      fetchOrganizations()
    } else {
      toast.error(res.error)
    }
  }

  const handleAddStatus = async () => {
    if (!statusForm.label || !statusForm.value || !statusForm.iconName) {
        return toast.error("Please fill in all fields.")
    }
    setIsAddingStatus(true)
    const res = await addGlobalStatus(statusForm)
    if (res.success) {
        toast.success(res.message)
        setShowAddStatusModal(false)
        setStatusForm({ label: "", value: "", color: "bg-blue-100 text-blue-800", btnColor: "bg-blue-600 hover:bg-blue-700", iconName: "Circle" })
        fetchOrganizations()
    } else {
        toast.error(res.error)
    }
    setIsAddingStatus(false)
  }

  const fetchOrganizations = async () => {
    setLoading(true)
    
    // Check if user is super admin first
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push('/auth/login')

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (userData?.role !== 'super_admin') {
        toast.error("Unauthorized access.")
        return router.push('/telecaller')
    }

    // Fetch Orgs bypassing RLS
    const res = await fetchAllOrganizations()
    
    if (res.success && res.data) {
        setOrganizations(res.data)
    } else if (!res.success) {
        toast.error(res.error)
    }
    // Fetch Global Statuses
    const statusRes = await fetchGlobalStatuses()
    if (statusRes.success && statusRes.data && statusRes.data.length > 0) {
        setMasterStatuses(statusRes.data)
    }

    // Fetch Announcements
    const annRes = await fetchAllAnnouncements()
    if (annRes.success && annRes.data) {
        setAnnouncements(annRes.data)
    }

    // Fetch Recent Activity
    const activityRes = await fetchRecentSystemActivity()
    if (activityRes.success && activityRes.data) {
        setSystemActivity(activityRes.data)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchOrganizations()
  }, [])

  const handleProvision = async () => {
    if (!formData.orgName || !formData.adminEmail || !formData.adminPassword) {
        return toast.error("Please fill in all required fields.")
    }

    setIsProvisioning(true)
    const res = await provisionNewTenant(formData)
    
    if (res.success) {
        toast.success(res.message)
        setShowModal(false)
        setFormData({ orgName: "", plan: "pro", adminName: "", adminEmail: "", adminPassword: "" })
        fetchOrganizations() // Refresh list
    } else {
        toast.error(res.error)
    }
    setIsProvisioning(false)
  }

  if (loading) return <LoadingSkeleton variant="dashboard" />;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 bg-slate-50 min-h-screen">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Server className="h-8 w-8 text-indigo-600" />
            Super Admin Console
          </h1>
          <p className="text-slate-500 mt-1">Manage global workspaces, billing plans, and instance provisioning.</p>
        </div>
        <div className="flex gap-2">
            <Button onClick={() => router.push('/super-admin/analytics')} variant="outline" className="shadow-sm bg-white hover:bg-slate-50 text-indigo-600 border-indigo-200">
                <Activity className="h-4 w-4 mr-2" /> View Analytics
            </Button>
            <Button onClick={() => setShowAddStatusModal(true)} variant="outline" className="shadow-sm">
                <Plus className="h-4 w-4 mr-2" /> Global Status
            </Button>
            <Button onClick={() => setShowModal(true)} className="bg-indigo-600 hover:bg-indigo-700 shadow-md">
                <Plus className="h-4 w-4 mr-2" /> Provision New Tenant
            </Button>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-amber-800">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        <div className="text-sm">
            <strong>System Security Active:</strong> You are viewing global data. Standard users are strictly isolated to their own tenant IDs via Row Level Security (RLS).
        </div>
      </div>

      {/* Top Dash: Announcements & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-sm flex flex-col">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-lg font-bold text-slate-800">Global Announcements</CardTitle>
                    <CardDescription>Push alerts to all active users across workspaces.</CardDescription>
                </div>
                <Button size="sm" onClick={() => setShowAnnouncementModal(true)} className="bg-slate-900 text-white hover:bg-slate-800">
                    <Plus className="h-4 w-4 mr-1" /> New Broadcast
                </Button>
            </CardHeader>
            <CardContent className="pt-4 flex-1 overflow-auto max-h-80">
                {announcements.length === 0 ? (
                    <div className="text-sm text-slate-500 text-center py-4">No active announcements.</div>
                ) : (
                    <div className="space-y-3">
                        {announcements.map((ann) => (
                            <div key={ann.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-800 text-sm">{ann.title}</span>
                                        <Badge variant="outline" className={
                                            ann.type === 'warning' ? "text-amber-600 bg-amber-50" :
                                            ann.type === 'error' ? "text-red-600 bg-red-50" :
                                            ann.type === 'success' ? "text-green-600 bg-green-50" :
                                            "text-blue-600 bg-blue-50"
                                        }>{ann.type}</Badge>
                                        {!ann.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">{ann.message}</p>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className={ann.is_active ? "text-red-600 hover:text-red-700 hover:bg-red-50" : "text-green-600 hover:text-green-700 hover:bg-green-50"}
                                    onClick={() => handleToggleAnnouncement(ann.id, ann.is_active)}
                                >
                                    {ann.is_active ? "Deactivate" : "Activate"}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm flex flex-col">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-lg font-bold text-slate-800">Recent System Activity</CardTitle>
                    <CardDescription>Latest changes made by super admins globally.</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="pt-4 flex-1 overflow-auto max-h-80">
                {systemActivity.length === 0 ? (
                    <div className="text-sm text-slate-500 text-center py-4">No recent activity.</div>
                ) : (
                    <div className="space-y-3">
                        {systemActivity.map((log) => (
                            <div key={log.id} className="flex flex-col border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-[10px] uppercase text-slate-600">{log.action_type}</Badge>
                                    <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
                                </div>
                                <p className="text-sm text-slate-700 mt-1">{log.description}</p>
                                <p className="text-xs text-slate-400">By: {log.users?.full_name || 'System'}</p>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
      </div>

      {/* Organization List */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-slate-500" />
            Active Workspaces
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {organizations.map((org) => (
            <Card key={org.id} className="hover:shadow-md transition-all border-slate-200">
                <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-lg font-bold text-slate-800">{org.name}</CardTitle>
                            {org.is_suspended && <Badge variant="destructive" className="text-[10px]">SUSPENDED</Badge>}
                        </div>
                        <Badge variant="outline" className={
                            org.plan === 'enterprise' ? "bg-purple-50 text-purple-700 border-purple-200 uppercase text-[10px]" : 
                            org.plan === 'pro' ? "bg-blue-50 text-blue-700 border-blue-200 uppercase text-[10px]" : 
                            "bg-slate-100 text-slate-600 uppercase text-[10px]"
                        }>
                            {org.plan}
                        </Badge>
                    </div>
                    <CardDescription className="text-xs font-mono text-slate-400 truncate pt-1">ID: {org.id}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between pt-4 border-t mt-2">
                        <div className="flex flex-col gap-2 text-sm text-slate-600 font-medium">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-slate-400" />
                                {org.users[0]?.count || 0} Total Users
                            </div>
                            <div className="flex items-center gap-2">
                                <Workflow className="h-4 w-4 text-slate-400" />
                                {org.leadsCount || 0} Total Leads
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Impersonate Admin"
                                disabled={isImpersonating === org.id || org.is_suspended}
                                onClick={() => handleImpersonate(org.id)}
                            >
                                {isImpersonating === org.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4 text-blue-600" />}
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                title={org.is_suspended ? "Activate Tenant" : "Suspend Tenant"}
                                disabled={isTogglingSuspension === org.id}
                                onClick={() => handleToggleSuspension(org.id, !!org.is_suspended)}
                            >
                                {isTogglingSuspension === org.id ? <Loader2 className="h-4 w-4 animate-spin" /> : org.is_suspended ? <Unlock className="h-4 w-4 text-green-600" /> : <Lock className="h-4 w-4 text-red-600" />}
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => {
                                    setDeleteLeadsOrg(org)
                                    setDeleteLeadsStatus("")
                                    setShowDeleteLeadsModal(true)
                                }} 
                                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Delete Leads"
                            >
                                Delete Leads
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openSettings(org)} className="text-xs">
                                <Settings className="h-3.5 w-3.5 mr-1" /> Settings
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        ))}
        </div>
      </div>

      {/* Provisioning Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-600" /> Create Workspace
            </DialogTitle>
            <DialogDescription>
              This provisions a new isolated database environment and creates the founding admin account.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label>Company / Workspace Name <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Acme Corp" value={formData.orgName} onChange={e => setFormData({...formData, orgName: e.target.value})} />
            </div>

            <div className="space-y-2">
                <Label>Billing Plan</Label>
                <Select value={formData.plan} onValueChange={v => setFormData({...formData, plan: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="free">Free Tier</SelectItem>
                        <SelectItem value="pro">Pro Tier</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Industry / Vertical</Label>
                <Select value={formData.industry} onValueChange={v => setFormData({...formData, industry: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="general">General CRM</SelectItem>
                        <SelectItem value="real_estate">Real Estate</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="pt-4 border-t space-y-4 mt-2">
                <h4 className="text-sm font-bold text-slate-700">Initial Admin Account</h4>
                
                <div className="space-y-2">
                    <Label>Admin Full Name</Label>
                    <Input placeholder="John Doe" value={formData.adminName} onChange={e => setFormData({...formData, adminName: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label>Admin Email <span className="text-red-500">*</span></Label>
                    <Input type="email" placeholder="admin@company.com" value={formData.adminEmail} onChange={e => setFormData({...formData, adminEmail: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label>Temporary Password <span className="text-red-500">*</span></Label>
                    <Input type="password" placeholder="At least 6 characters" value={formData.adminPassword} onChange={e => setFormData({...formData, adminPassword: e.target.value})} />
                </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={isProvisioning}>Cancel</Button>
            <Button onClick={handleProvision} disabled={isProvisioning} className="bg-indigo-600 hover:bg-indigo-700">
                {isProvisioning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Server className="h-4 w-4 mr-2" />}
                Provision Tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Announcement Modal */}
      <Dialog open={showAnnouncementModal} onOpenChange={setShowAnnouncementModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-indigo-600" /> Broadcast Announcement
            </DialogTitle>
            <DialogDescription>
              Push a system-wide alert to all users across all tenants.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label>Title <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Scheduled Maintenance" value={announcementForm.title} onChange={e => setAnnouncementForm({...announcementForm, title: e.target.value})} />
            </div>

            <div className="space-y-2">
                <Label>Message <span className="text-red-500">*</span></Label>
                <Input placeholder="System will be down for 10 mins..." value={announcementForm.message} onChange={e => setAnnouncementForm({...announcementForm, message: e.target.value})} />
            </div>

            <div className="space-y-2">
                <Label>Type</Label>
                <Select value={announcementForm.type} onValueChange={v => setAnnouncementForm({...announcementForm, type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="info">Info (Blue)</SelectItem>
                        <SelectItem value="warning">Warning (Yellow)</SelectItem>
                        <SelectItem value="error">Error (Red)</SelectItem>
                        <SelectItem value="success">Success (Green)</SelectItem>
                    </SelectContent>
                </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnnouncementModal(false)} disabled={isCreatingAnnouncement}>Cancel</Button>
            <Button onClick={handleCreateAnnouncement} disabled={isCreatingAnnouncement} className="bg-indigo-600 hover:bg-indigo-700">
                {isCreatingAnnouncement ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                Broadcast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Global Status Modal */}
      <Dialog open={showAddStatusModal} onOpenChange={setShowAddStatusModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-indigo-600" /> Add Global Status
            </DialogTitle>
            <DialogDescription>
              Create a new status that all tenants can enable in their settings.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label>Label (Display Name) <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Verification Pending" value={statusForm.label} onChange={e => {
                    const label = e.target.value;
                    const value = label.toLowerCase().replace(/\s+/g, '_');
                    setStatusForm({...statusForm, label, value});
                }} />
            </div>

            <div className="space-y-2">
                <Label>Internal Value <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. verification_pending" value={statusForm.value} disabled className="bg-slate-50" />
            </div>

            <div className="space-y-2">
                <Label>Color Theme</Label>
                <Select value={statusForm.color} onValueChange={v => {
                    const btnColorMap: any = {
                        "bg-blue-100 text-blue-800": "bg-blue-600 hover:bg-blue-700",
                        "bg-cyan-100 text-cyan-800": "bg-cyan-600 hover:bg-cyan-700",
                        "bg-green-100 text-green-800": "bg-green-600 hover:bg-green-700",
                        "bg-purple-100 text-purple-800": "bg-purple-600 hover:bg-purple-700",
                        "bg-orange-100 text-orange-800": "bg-orange-600 hover:bg-orange-700",
                        "bg-indigo-100 text-indigo-800": "bg-indigo-600 hover:bg-indigo-700",
                        "bg-yellow-100 text-yellow-800": "bg-yellow-600 hover:bg-yellow-700",
                        "bg-emerald-100 text-emerald-800": "bg-emerald-600 hover:bg-emerald-700",
                        "bg-red-100 text-red-800": "bg-red-600 hover:bg-red-700",
                        "bg-rose-100 text-rose-800": "bg-rose-600 hover:bg-rose-700",
                        "bg-amber-100 text-amber-800": "bg-amber-600 hover:bg-amber-700",
                        "bg-slate-100 text-slate-800": "bg-slate-600 hover:bg-slate-700",
                    };
                    setStatusForm({...statusForm, color: v, btnColor: btnColorMap[v] || "bg-slate-600 hover:bg-slate-700"});
                }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="bg-blue-100 text-blue-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Blue</div></SelectItem>
                        <SelectItem value="bg-cyan-100 text-cyan-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-cyan-500"></div> Cyan</div></SelectItem>
                        <SelectItem value="bg-green-100 text-green-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div> Green</div></SelectItem>
                        <SelectItem value="bg-purple-100 text-purple-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div> Purple</div></SelectItem>
                        <SelectItem value="bg-orange-100 text-orange-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500"></div> Orange</div></SelectItem>
                        <SelectItem value="bg-indigo-100 text-indigo-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-500"></div> Indigo</div></SelectItem>
                        <SelectItem value="bg-yellow-100 text-yellow-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> Yellow</div></SelectItem>
                        <SelectItem value="bg-emerald-100 text-emerald-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Emerald</div></SelectItem>
                        <SelectItem value="bg-red-100 text-red-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"></div> Red</div></SelectItem>
                        <SelectItem value="bg-rose-100 text-rose-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-rose-500"></div> Rose</div></SelectItem>
                        <SelectItem value="bg-amber-100 text-amber-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div> Amber</div></SelectItem>
                        <SelectItem value="bg-slate-100 text-slate-800"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-500"></div> Slate</div></SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Icon Name</Label>
                <Select value={statusForm.iconName} onValueChange={v => setStatusForm({...statusForm, iconName: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {["Circle", "Sparkles", "PhoneForwarded", "ThumbsUp", "FileText", "LogIn", "CheckCircle2", "ThumbsDown", "XCircle", "PhoneMissed", "Briefcase", "Recycle", "Activity", "ShieldCheck"].map(icon => (
                            <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStatusModal(false)} disabled={isAddingStatus}>Cancel</Button>
            <Button onClick={handleAddStatus} disabled={isAddingStatus} className="bg-indigo-600 hover:bg-indigo-700">
                {isAddingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Add Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Modal */}
      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-indigo-600" /> 
                Manage Tenant Settings: {selectedOrg?.name}
            </DialogTitle>
            <DialogDescription>
              Configure which lead statuses are enabled and map automated workflow triggers.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b pb-2">
                <CheckSquare className="h-4 w-4 text-indigo-500" />
                Enabled Lead Statuses
              </h4>
              <p className="text-xs text-slate-500 mb-2">Uncheck statuses that this tenant does not need in their pipeline.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {currentMasterStatuses.map(status => (
                  <div key={status.value} className="flex items-center space-x-2 bg-slate-50 p-2 rounded-md border border-slate-100">
                    <input 
                      type="checkbox" 
                      id={`status-${status.value}`}
                      checked={enabledStatuses.includes(status.value)}
                      onChange={() => toggleStatus(status.value)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor={`status-${status.value}`} className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2">
                      {(() => { const OptIcon = resolveIcon(status.icon_name); return <OptIcon className="w-3.5 h-3.5 text-slate-500"/> })()}
                      {status.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b pb-2">
                <Settings className="h-4 w-4 text-indigo-500" />
                Feature Modules
              </h4>
              <p className="text-xs text-slate-500 mb-2">Enable or disable specific system modules for this tenant.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {AVAILABLE_MODULES.map(mod => (
                  <div key={mod.id} className="flex items-center space-x-2 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 shadow-sm transition-all hover:shadow-md">
                    <input 
                      type="checkbox" 
                      id={`mod-${mod.id}`}
                      checked={enabledModules.includes(mod.id)}
                      onChange={() => toggleModule(mod.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <label htmlFor={`mod-${mod.id}`} className="text-sm font-semibold leading-none cursor-pointer flex items-center gap-2 flex-1 text-slate-700">
                      <mod.icon className="w-4 h-4 text-slate-400" />
                      {mod.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b pb-2">
                <Server className="h-4 w-4 text-indigo-500" />
                Workflow Triggers
              </h4>
              <p className="text-xs text-slate-500 mb-2">Map specific statuses to trigger system automations.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs">Document Request WhatsApp Trigger</Label>
                    <Select value={workflowTriggers.on_document_request} onValueChange={v => setWorkflowTriggers({...workflowTriggers, on_document_request: v})}>
                        <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                        <SelectContent>
                            {currentMasterStatuses.filter(s => enabledStatuses.includes(s.value)).map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                
                <div className="space-y-2">
                    <Label className="text-xs">Transfer to KYC Trigger</Label>
                    <Select value={workflowTriggers.on_kyc_transfer} onValueChange={v => setWorkflowTriggers({...workflowTriggers, on_kyc_transfer: v})}>
                        <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                        <SelectContent>
                            {currentMasterStatuses.filter(s => enabledStatuses.includes(s.value)).map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs">Mark as Revenue Trigger (e.g. Disbursed)</Label>
                    <Select value={workflowTriggers.on_revenue_marked} onValueChange={v => setWorkflowTriggers({...workflowTriggers, on_revenue_marked: v})}>
                        <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                        <SelectContent>
                            {currentMasterStatuses.filter(s => enabledStatuses.includes(s.value)).map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs">Login Done Trigger</Label>
                    <Select value={workflowTriggers.on_login_done} onValueChange={v => setWorkflowTriggers({...workflowTriggers, on_login_done: v})}>
                        <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                        <SelectContent>
                            {currentMasterStatuses.filter(s => enabledStatuses.includes(s.value)).map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsModal(false)} disabled={isUpdatingSettings}>Cancel</Button>
            <Button onClick={handleUpdateSettings} disabled={isUpdatingSettings} className="bg-indigo-600 hover:bg-indigo-700">
                {isUpdatingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Settings className="h-4 w-4 mr-2" />}
                Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Leads Modal */}
      <Dialog open={showDeleteLeadsModal} onOpenChange={setShowDeleteLeadsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
                <ShieldAlert className="h-5 w-5" /> Bulk Delete Leads
            </DialogTitle>
            <DialogDescription>
              Permanently delete leads for <strong>{deleteLeadsOrg?.name}</strong> by status. This action cannot be undone and skips the recycle bin.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label>Select Status to Delete</Label>
                <Select value={deleteLeadsStatus} onValueChange={setDeleteLeadsStatus}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select status..." />
                    </SelectTrigger>
                    <SelectContent>
                        {deleteLeadsOrg?.enabled_statuses?.map((sv: string) => {
                            const statusObj = currentMasterStatuses.find(s => s.value === sv)
                            return statusObj ? (
                                <SelectItem key={statusObj.value} value={statusObj.value}>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${statusObj.color.split(' ')[0]}`}></div>
                                        {statusObj.label}
                                    </div>
                                </SelectItem>
                            ) : null
                        })}
                    </SelectContent>
                </Select>
            </div>
            
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md text-sm">
                <strong>Warning:</strong> Ensure you have confirmed with the tenant before performing this destructive action.
            </div>
          </div>

          <DialogFooter className="sm:justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteLeadsModal(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteLeads} disabled={isDeletingLeads || !deleteLeadsStatus}>
              {isDeletingLeads ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isDeletingLeads ? "Deleting..." : "Permanently Delete Leads"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
