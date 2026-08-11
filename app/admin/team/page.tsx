"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Users, UserPlus, Shield, Loader2, Save, UserCog } from "lucide-react"

import { inviteTeamMember, updateTeamMember } from "@/app/actions/team-management"
import { LoadingSkeleton } from "@/components/loading-skeleton"

interface TeamMember {
  id: string
  full_name: string
  email: string
  role: string
  manager_id: string | null
  current_status: string
  cloudconnect_enabled: boolean
}

export default function TeamManagementPage() {
  const supabase = createClient()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  
  // Dialog States
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Edit State
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editData, setEditData] = useState<{role: string, manager_id: string | null}>({ role: '', manager_id: null })

  // Invite Form State
  const [inviteForm, setInviteForm] = useState({
    email: '', fullName: '', role: 'telecaller', password: '', managerId: 'none'
  })

  const fetchTeam = async () => {
    setLoading(true)
    // Thanks to RLS, this automatically only fetches users in YOUR company!
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, manager_id, current_status, cloudconnect_enabled')
      .order('created_at', { ascending: true })

    if (data) setMembers(data as TeamMember[])
    setLoading(false)
  }

  useEffect(() => {
    fetchTeam()
  }, [supabase])

  // Get only people who can be managers
  const potentialManagers = members.filter(m => ['manager', 'team_leader', 'admin'].includes(m.role))

  const handleInviteSubmit = async () => {
    if (!inviteForm.email || !inviteForm.fullName || !inviteForm.password) {
        return toast.error("Please fill all required fields")
    }

    setIsSubmitting(true)
    const res = await inviteTeamMember({
        email: inviteForm.email,
        fullName: inviteForm.fullName,
        role: inviteForm.role,
        password: inviteForm.password,
        managerId: inviteForm.managerId === 'none' ? null : inviteForm.managerId
    })

    if (res.success) {
        toast.success(res.message)
        setShowInviteModal(false)
        setInviteForm({ email: '', fullName: '', role: 'telecaller', password: '', managerId: 'none' })
        fetchTeam()
    } else {
        toast.error(res.error)
    }
    setIsSubmitting(false)
  }

  const saveEdit = async (userId: string) => {
      const res = await updateTeamMember(userId, {
          role: editData.role,
          manager_id: editData.manager_id === 'none' ? null : editData.manager_id
      })

      if (res.success) {
          toast.success("Updated successfully")
          setEditingUserId(null)
          fetchTeam()
      } else {
          toast.error(res.error)
      }
  }

  const startEdit = (user: TeamMember) => {
      setEditingUserId(user.id)
      setEditData({ role: user.role || 'telecaller', manager_id: user.manager_id || 'none' })
  }

  const toggleCloudConnect = async (userId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('users')
      .update({ cloudconnect_enabled: !currentStatus })
      .eq('id', userId)

    if (error) {
      toast.error("Failed to update dialer assignment")
    } else {
      toast.success("Dialer assignment updated successfully")
      setMembers(members.map(m => m.id === userId ? { ...m, cloudconnect_enabled: !currentStatus } : m))
    }
  }

  if (loading) return <LoadingSkeleton variant="table" cols={5} rows={6} />;

  const getInitials = (name: string) => {
    if (!name) return "U"
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const getRoleBadgeClasses = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-900/30'
      case 'manager':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/30'
      case 'team_leader':
        return 'bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-950/30 dark:text-teal-400 dark:border-teal-900/30'
      case 'kyc_team':
        return 'bg-pink-50 text-pink-700 border-pink-100 dark:bg-pink-950/30 dark:text-pink-400 dark:border-pink-900/30'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
    }
  }

  // Summary Metrics
  const totalStaff = members.length
  const admins = members.filter(m => m.role === 'admin').length
  const managers = members.filter(m => m.role === 'manager' || m.role === 'team_leader').length
  const callers = members.filter(m => m.role === 'telecaller').length

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/30 text-indigo-600 dark:text-indigo-405 rounded-2xl">
              <Users className="h-6 w-6" />
            </div>
            Team Directory & Hierarchy
          </h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1.5">Manage employee roles, permission hierarchy, and company reporting structures.</p>
        </div>
        <Button onClick={() => setShowInviteModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs h-9.5 px-4 rounded-xl transition-all flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Invite Member
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs rounded-2xl p-4.5 group hover:shadow-2xs transition-all duration-300">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Active Staff</p>
          <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{totalStaff}</p>
        </div>
        <div className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs rounded-2xl p-4.5 group hover:shadow-2xs transition-all duration-300">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Administrators</p>
          <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{admins}</p>
        </div>
        <div className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs rounded-2xl p-4.5 group hover:shadow-2xs transition-all duration-300">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Managers & TLs</p>
          <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{managers}</p>
        </div>
        <div className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs rounded-2xl p-4.5 group hover:shadow-2xs transition-all duration-300">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Telecallers</p>
          <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{callers}</p>
        </div>
      </div>

      {/* Directory Table */}
      <Card className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-850">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase py-3.5 pl-5 tracking-wider">Employee Details</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase py-3.5 tracking-wider">Role</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase py-3.5 tracking-wider">Reporting Manager</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase py-3.5 tracking-wider">CloudConnect</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase py-3.5 tracking-wider">Status</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase py-3.5 tracking-wider text-right pr-5">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map(user => {
                  const isEditing = editingUserId === user.id
                  const manager = members.find(m => m.id === user.manager_id)
                  const isOnline = user.current_status !== 'offline'

                  return (
                    <TableRow key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/15 border-b border-slate-100 dark:border-slate-850/60 transition-colors group">
                      <TableCell className="py-3.5 pl-5">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-500 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-2xs">
                              {getInitials(user.full_name)}
                            </div>
                            <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 shadow-3xs transition-all ${isOnline ? 'bg-emerald-500' : 'bg-slate-350'}`} />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-205 text-sm">{user.full_name}</div>
                            <div className="text-[11px] font-medium text-slate-450 dark:text-slate-500 mt-0.5">{user.email}</div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-3.5">
                        {isEditing ? (
                          <Select value={editData.role} onValueChange={v => setEditData({...editData, role: v})}>
                            <SelectTrigger className="h-8.5 w-[140px] text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl"><SelectValue /></SelectTrigger>
                            <SelectContent className="dark:bg-slate-950 dark:border-slate-800">
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="team_leader">Team Leader</SelectItem>
                                <SelectItem value="telecaller">Telecaller</SelectItem>
                                <SelectItem value="kyc_team">KYC Team</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className={`uppercase text-[9px] font-bold tracking-wider rounded-full shadow-none border ${getRoleBadgeClasses(user.role)}`}>
                            {user.role?.replace('_', ' ')}
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="py-3.5">
                        {isEditing ? (
                          <Select value={editData.manager_id || 'none'} onValueChange={v => setEditData({...editData, manager_id: v})}>
                            <SelectTrigger className="h-8.5 w-[160px] text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-xl"><SelectValue /></SelectTrigger>
                            <SelectContent className="dark:bg-slate-950 dark:border-slate-800">
                                <SelectItem value="none" className="text-slate-400 dark:text-slate-600 italic">No Manager (Top Level)</SelectItem>
                                {potentialManagers.filter(m => m.id !== user.id).map(pm => (
                                    <SelectItem key={pm.id} value={pm.id}>{pm.full_name} ({pm.role.replace('_',' ')})</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={`text-xs font-semibold ${manager ? 'text-slate-700 dark:text-slate-350' : 'text-slate-400 dark:text-slate-600 italic'}`}>
                            {manager ? manager.full_name : "Top-level Workspace"}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-2">
                          <Switch 
                            checked={user.cloudconnect_enabled || false}
                            onCheckedChange={() => toggleCloudConnect(user.id, user.cloudconnect_enabled)}
                          />
                          <span className="text-[10px] uppercase font-bold text-slate-500">
                            {user.cloudconnect_enabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="py-3.5">
                         <div className="flex items-center gap-2">
                             <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
                             <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-450">{user.current_status || 'offline'}</span>
                         </div>
                      </TableCell>

                      <TableCell className="py-3.5 text-right pr-5">
                        {isEditing ? (
                          <div className="flex justify-end gap-1.5">
                              <Button size="sm" variant="ghost" onClick={() => setEditingUserId(null)} className="h-8 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</Button>
                              <Button size="sm" onClick={() => saveEdit(user.id)} className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs font-bold rounded-lg shadow-3xs flex items-center gap-1">
                                  <Save className="h-3.5 w-3.5" /> Save
                              </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => startEdit(user)} className="h-8 text-xs font-semibold border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-lg shadow-3xs">
                            <UserCog className="h-3.5 w-3.5 mr-1.5 text-slate-505" /> Edit Hierarchy
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Invite Member Dialog Modal */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100"><UserPlus className="h-5 w-5 text-blue-600" /> Invite New Member</DialogTitle>
            <DialogDescription className="text-xs">Create a new login account for this workspace tenant directory.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-500 uppercase">Full Name</Label>
                    <Input placeholder="John Doe" value={inviteForm.fullName} onChange={e => setInviteForm({...inviteForm, fullName: e.target.value})} className="h-9.5 rounded-xl bg-white dark:bg-slate-950 text-xs border-slate-200 dark:border-slate-850 focus-visible:ring-blue-500" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-500 uppercase">Email Address</Label>
                    <Input type="email" placeholder="john@company.com" value={inviteForm.email} onChange={e => setInviteForm({...inviteForm, email: e.target.value})} className="h-9.5 rounded-xl bg-white dark:bg-slate-950 text-xs border-slate-200 dark:border-slate-855 focus-visible:ring-blue-500" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-500 uppercase">Directory Role</Label>
                    <Select value={inviteForm.role} onValueChange={v => setInviteForm({...inviteForm, role: v})}>
                        <SelectTrigger className="h-9.5 rounded-xl bg-white dark:bg-slate-950 text-xs border-slate-200 dark:border-slate-850"><SelectValue /></SelectTrigger>
                        <SelectContent className="dark:bg-slate-950 dark:border-slate-800">
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="team_leader">Team Leader</SelectItem>
                            <SelectItem value="telecaller">Telecaller</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-500 uppercase">Assign Manager</Label>
                    <Select value={inviteForm.managerId} onValueChange={v => setInviteForm({...inviteForm, managerId: v})}>
                        <SelectTrigger className="h-9.5 rounded-xl bg-white dark:bg-slate-950 text-xs border-slate-200 dark:border-slate-850"><SelectValue /></SelectTrigger>
                        <SelectContent className="dark:bg-slate-950 dark:border-slate-800">
                            <SelectItem value="none" className="italic text-slate-400">None (Direct Report)</SelectItem>
                            {potentialManagers.map(pm => (
                                <SelectItem key={pm.id} value={pm.id}>{pm.full_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase">Temporary Password</Label>
                <Input type="password" placeholder="Min. 6 characters for first login..." value={inviteForm.password} onChange={e => setInviteForm({...inviteForm, password: e.target.value})} className="h-9.5 rounded-xl bg-white dark:bg-slate-950 text-xs border-slate-200 dark:border-slate-850 focus-visible:ring-blue-500" />
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 dark:border-slate-850 pt-4 flex gap-1.5">
            <Button variant="ghost" onClick={() => setShowInviteModal(false)} className="h-9.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-350">Cancel</Button>
            <Button onClick={handleInviteSubmit} disabled={isSubmitting} className="h-9.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-2xs px-4">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Create Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
