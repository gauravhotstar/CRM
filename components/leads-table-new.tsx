"use client";

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { 
  User, Building, Calendar, Clock, Eye, Phone, Mail, 
  Search, Filter, ChevronDown, ChevronUp, Download, 
  MoreHorizontal, Check, X, AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { LeadStatusDialog } from "@/components/lead-status-dialog"
import { QuickActions } from "@/components/quick-actions"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTelecallerStatus } from "@/hooks/use-telecaller-status"

interface Lead {
  id: string
  name: string
  email: string
  phone: string
  company: string
  status: string
  priority: string
  created_at: string
  last_contacted: string | null
  loan_amount: number | null
  loan_type: string | null
  source: string | null
  assigned_to: string | null
  assigned_user: {
    id: string
    full_name: string
  } | null
  city: string | null
  follow_up_date: string | null
}

interface LeadsTableProps {
  leads: Lead[]
  telecallers: Array<{ id: string; full_name: string }>
}

export function LeadsTable({ leads = [], telecallers = [] }: LeadsTableProps) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all")
  const [sortField, setSortField] = useState<string>("created_at")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    name: true,
    contact: true,
    company: true,
    status: true,
    priority: true,
    created: true,
    lastContacted: true,
    loanAmount: true,
    loanType: true,
    source: true,
    assignedTo: true,
    actions: true
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedLeads, setSelectedLeads] = useState<string[]>([])
  const [bulkAssignTo, setBulkAssignTo] = useState<string>("")
  const supabase = createClient()

  // Get telecaller status for all telecallers in the leads and telecallers list
  const allTelecallerIds = [
    ...leads.map(lead => lead.assigned_user?.id).filter(Boolean) as string[],
    ...telecallers.map(t => t.id)
  ].filter((id, index, self) => self.indexOf(id) === index) // Remove duplicates

  const { telecallerStatus, loading: statusLoading } = useTelecallerStatus(allTelecallerIds)

  // Add safe value getters
  const getSafeValue = (value: any, defaultValue: string = 'N/A') => {
    return value ?? defaultValue
  }

  // Filter and sort leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = searchTerm === "" || 
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone.includes(searchTerm) ||
      lead.company.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter
    const matchesPriority = priorityFilter === "all" || lead.priority === priorityFilter
    const matchesAssignedTo = assignedToFilter === "all" || 
      (assignedToFilter === "unassigned" && !lead.assigned_to) ||
      lead.assigned_to === assignedToFilter
    
    return matchesSearch && matchesStatus && matchesPriority && matchesAssignedTo
  }).sort((a, b) => {
    let aValue = a[sortField as keyof Lead]
    let bValue = b[sortField as keyof Lead]
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      aValue = aValue.toLowerCase()
      bValue = bValue.toLowerCase()
    }
    
    if (aValue === null) return sortDirection === 'asc' ? -1 : 1
    if (bValue === null) return sortDirection === 'asc' ? 1 : -1
    
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / pageSize)
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const handleCallInitiated = (lead: Lead) => {
    setSelectedLead(lead)
    setIsStatusDialogOpen(true)
  }

  const handleStatusUpdate = async (newStatus: string, note?: string, callbackDate?: string) => {
    try {
      if (!selectedLead?.id) return

      // 🔴 MULTI-TENANT FIX: Get Current User's Tenant ID
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Unauthorized")
      
      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      const tenantId = profile?.tenant_id
      
      const updateData: any = { 
        status: newStatus,
        last_contacted: new Date().toISOString()
      }

      // Add note if provided for Not Eligible status
      if (newStatus === "not_eligible" && note) {
        const { error: noteError } = await supabase
          .from("notes")
          .insert({
            tenant_id: tenantId, // 🔴 INJECTED
            lead_id: selectedLead.id,
            note: note,
            note_type: "status_change"
          })

        if (noteError) throw noteError
      }

      // Add callback date if provided for Call Back status
      if (newStatus === "follow_up" && callbackDate) {
        const { error: followUpError } = await supabase
          .from("follow_ups")
          .insert({
            tenant_id: tenantId, // 🔴 INJECTED
            lead_id: selectedLead.id,
            user_id: selectedLead.assigned_to || user.id,
            scheduled_at: callbackDate,
            title: `Follow up: ${selectedLead.name}`,
            status: "pending"
          })

        if (followUpError) throw followUpError
        
        // Also update the lead's follow_up_date
        updateData.follow_up_date = callbackDate
      }

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", selectedLead.id)

      if (error) throw error

      console.log(`Status updated for lead ${selectedLead.id} to ${newStatus}`)
      window.location.reload()
      
    } catch (error) {
      console.error("Error updating lead status:", error)
    }
  }

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("leads")
        .update({ 
          status: newStatus,
          last_contacted: new Date().toISOString()
        })
        .eq("id", leadId)

      if (error) throw error

      console.log(`Status changed for lead ${leadId} to ${newStatus}`)
      window.location.reload()
      
    } catch (error) {
      console.error("Error changing lead status:", error)
    }
  }

  const handleAssignLead = async (leadId: string, telecallerId: string) => {
    try {
      // 🔴 MULTI-TENANT FIX: Get Current User's Tenant ID
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Unauthorized")
      
      const assignedById = user.id
      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      const tenantId = profile?.tenant_id

      const { error } = await supabase
        .from("leads")
        .update({ 
          assigned_to: telecallerId === "unassigned" ? null : telecallerId,
          assigned_by: assignedById,
          assigned_at: new Date().toISOString()
        })
        .eq("id", leadId)

      if (error) throw error
      
      // --- INSERT NOTIFICATION WHEN ASSIGNED ---
      if (telecallerId !== "unassigned") {
        await supabase.from("notifications").insert({
          tenant_id: tenantId, // 🔴 INJECTED
          user_id: telecallerId,
          type: "lead_assignment",
          title: "New Lead Assigned",
          message: "A new lead has been assigned to you.",
          lead_id: leadId,
          read: false,
        });
      }

      console.log(`Lead ${leadId} assigned to ${telecallerId}`)
      window.location.reload()
      
    } catch (error) {
      console.error("Error assigning lead:", error)
    }
  }

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeads(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    )
  }

  const selectAllLeads = () => {
    if (selectedLeads.length === paginatedLeads.length) {
      setSelectedLeads([])
    } else {
      setSelectedLeads(paginatedLeads.map(lead => lead.id))
    }
  }

  const handleBulkAssign = async () => {
    if (!bulkAssignTo || selectedLeads.length === 0) return

    try {
      // 🔴 MULTI-TENANT FIX: Get Current User's Tenant ID
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Unauthorized")
          
      const assignedById = user.id
      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      const tenantId = profile?.tenant_id

      // Create all the update promises
      const updates = selectedLeads.map(leadId => 
        supabase
          .from("leads")
          .update({ 
            assigned_to: bulkAssignTo === "unassigned" ? null : bulkAssignTo,
            assigned_by: assignedById,
            assigned_at: new Date().toISOString()
          })
          .eq("id", leadId)
      )

      // Execute all updates concurrently
      const results = await Promise.all(updates)
      
      const errors = results.filter(result => result.error)
      if (errors.length > 0) {
        throw new Error(`Failed to assign ${errors.length} leads`)
      }

      // --- INSERT NOTIFICATIONS WHEN BULK ASSIGNED ---
      if (bulkAssignTo !== "unassigned") {
        const notifications = selectedLeads.map(leadId => ({
          tenant_id: tenantId, // 🔴 INJECTED
          user_id: bulkAssignTo,
          type: "lead_assignment",
          title: "New Lead Assigned",
          message: "A new lead has been assigned to you.",
          lead_id: leadId,
          read: false,
        }));
        await supabase.from("notifications").insert(notifications);
      }
      
      console.log(`Bulk assigned ${selectedLeads.length} leads to ${bulkAssignTo}`)
      setSelectedLeads([])
      setBulkAssignTo("")
      window.location.reload()
      
    } catch (error) {
      console.error("Error bulk assigning leads:", error)
    }
  }

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive"
      case "medium":
        return "default"
      case "low":
        return "secondary"
      default:
        return "secondary"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-100 text-blue-800"
      case "contacted":
        return "bg-yellow-100 text-yellow-800"
      case "Interested":
        return "bg-green-100 text-green-800"
      case "Documents_Sent":
        return "bg-purple-100 text-purple-800"
      case "Login":
        return "bg-orange-100 text-orange-800"
      case "Disbursed":
        return "bg-green-100 text-green-800"
      case "Not_Interested":
        return "bg-red-100 text-red-800"
      case "Call_Back":
        return "bg-indigo-100 text-indigo-800"
      case "not_eligible":
        return "bg-red-100 text-red-800"
      case "nr":
        return "bg-gray-100 text-gray-800"
      case "self_employed":
        return "bg-amber-100 text-amber-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  if (!leads) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No leads data available</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="Interested">Interested</SelectItem>
              <SelectItem value="Documents_Sent">Documents Sent</SelectItem>
              <SelectItem value="Login">Login</SelectItem>
              <SelectItem value="Disbursed">Disbursed</SelectItem>
              <SelectItem value="Not_Interested">Not Interested</SelectItem>
              <SelectItem value="Call_Back">Call Back</SelectItem>
              <SelectItem value="not_eligible">Not Eligible</SelectItem>
              <SelectItem value="nr">NR</SelectItem>
              <SelectItem value="self_employed">Self Employed</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Filter by priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Filter by assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {telecallers.map((telecaller) => (
                <SelectItem key={telecaller.id} value={telecaller.id}>
                  <div className="flex items-center gap-2">
                    {/* Status indicator for telecaller */}
                    {telecallerStatus[telecaller.id] !== undefined && (
                      <div className={`w-2 h-2 rounded-full ${telecallerStatus[telecaller.id] ? 'bg-green-500' : 'bg-red-500'}`} 
                           title={telecallerStatus[telecaller.id] ? 'Checked in' : 'Not checked in'} />
                    )}
                    {telecaller.full_name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                Columns <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {Object.entries(visibleColumns).map(([key, value]) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  className="capitalize"
                  checked={value}
                  onCheckedChange={(checked) =>
                    setVisibleColumns({ ...visibleColumns, [key]: checked })
                  }
                >
                  {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedLeads.length > 0 && (
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <span className="text-sm text-gray-600">
            {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''} selected
          </span>
          
          <div className="flex items-center gap-2">
            <Select value={bulkAssignTo} onValueChange={setBulkAssignTo}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Assign to..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassign</SelectItem>
                {telecallers.map((telecaller) => (
                  <SelectItem key={telecaller.id} value={telecaller.id}>
                    <div className="flex items-center gap-2">
                      {/* Status indicator for telecaller */}
                      {telecallerStatus[telecaller.id] !== undefined && (
                        <div className={`w-2 h-2 rounded-full ${telecallerStatus[telecaller.id] ? 'bg-green-500' : 'bg-red-500'}`} 
                             title={telecallerStatus[telecaller.id] ? 'Checked in' : 'Not checked in'} />
                      )}
                      {telecaller.full_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              onClick={handleBulkAssign}
              disabled={!bulkAssignTo}
              size="sm"
            >
              Assign
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => setSelectedLeads([])}
              size="sm"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input
                  type="checkbox"
                  checked={selectedLeads.length === paginatedLeads.length && paginatedLeads.length > 0}
                  onChange={selectAllLeads}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </TableHead>
              {visibleColumns.name && (
                <TableHead 
                  className="cursor-pointer" 
                  onClick={() => handleSort('name')}
                >
                  Name {sortField === 'name' && (sortDirection === 'asc' ? <ChevronUp className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />)}
                </TableHead>
              )}
              {visibleColumns.contact && <TableHead>Contact</TableHead>}
              {visibleColumns.company && (
                <TableHead 
                  className="cursor-pointer" 
                  onClick={() => handleSort('company')}
                >
                  Company {sortField === 'company' && (sortDirection === 'asc' ? <ChevronUp className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />)}
                </TableHead>
              )}
              {visibleColumns.status && <TableHead>Status</TableHead>}
              {visibleColumns.priority && <TableHead>Priority</TableHead>}
              {visibleColumns.loanAmount && (
                <TableHead 
                  className="cursor-pointer" 
                  onClick={() => handleSort('loan_amount')}
                >
                  Loan Amount {sortField === 'loan_amount' && (sortDirection === 'asc' ? <ChevronUp className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />)}
                </TableHead>
              )}
              {visibleColumns.loanType && <TableHead>Loan Type</TableHead>}
              {visibleColumns.source && <TableHead>Source</TableHead>}
              {visibleColumns.assignedTo && <TableHead>Assigned To</TableHead>}
              {visibleColumns.created && (
                <TableHead 
                  className="cursor-pointer" 
                  onClick={() => handleSort('created_at')}
                >
                  Created {sortField === 'created_at' && (sortDirection === 'asc' ? <ChevronUp className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />)}
                </TableHead>
              )}
              {visibleColumns.lastContacted && (
                <TableHead 
                  className="cursor-pointer" 
                  onClick={() => handleSort('last_contacted')}
                >
                  Last Contacted {sortField === 'last_contacted' && (sortDirection === 'asc' ? <ChevronUp className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />)}
                </TableHead>
              )}
              {visibleColumns.actions && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedLeads.map((lead) => (
              <TableRow key={lead.id} className="cursor-pointer hover:bg-gray-50">
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedLeads.includes(lead.id)}
                    onChange={() => toggleLeadSelection(lead.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableCell>
                {visibleColumns.name && (
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {getSafeValue(lead.name, 'Unknown')}
                    </div>
                  </TableCell>
                )}
                {visibleColumns.contact && (
                  <TableCell>
                    <QuickActions
                      phone={getSafeValue(lead.phone, '')}
                      email={getSafeValue(lead.email, '')}
                      leadId={lead.id}
                      onCallInitiated={(leadId) => {
                        const lead = leads.find(l => l.id === leadId);
                        if (lead) {
                          handleCallInitiated(lead);
                        }
                      }}
                    />
                  </TableCell>
                )}
                {visibleColumns.company && (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      {getSafeValue(lead.company, 'No company')}
                    </div>
                  </TableCell>
                )}
                {visibleColumns.status && (
                  <TableCell>
                    <Badge className={getStatusColor(lead.status)}>
                      {getSafeValue(lead.status, 'unknown').replace("_", " ").toUpperCase()}
                    </Badge>
                  </TableCell>
                )}
                {visibleColumns.priority && (
                  <TableCell>
                    <Badge variant={getPriorityVariant(getSafeValue(lead.priority, 'medium'))}>
                      {getSafeValue(lead.priority, 'medium').toUpperCase()}
                    </Badge>
                  </TableCell>
                )}
                {visibleColumns.loanAmount && (
                  <TableCell>
                    {formatCurrency(lead.loan_amount)}
                  </TableCell>
                )}
                {visibleColumns.loanType && (
                  <TableCell>
                    {getSafeValue(lead.loan_type, 'N/A')}
                  </TableCell>
                )}
                {visibleColumns.source && (
                  <TableCell>
                    {getSafeValue(lead.source, 'N/A')}
                  </TableCell>
                )}
                {visibleColumns.assignedTo && (
                  <TableCell>
                    {lead.assigned_user ? (
                      <div className="flex items-center gap-2">
                        {/* Status indicator for assigned telecaller */}
                        {telecallerStatus[lead.assigned_user.id] !== undefined && (
                          <div className={`w-2 h-2 rounded-full ${telecallerStatus[lead.assigned_user.id] ? 'bg-green-500' : 'bg-red-500'}`} 
                               title={telecallerStatus[lead.assigned_user.id] ? 'Checked in' : 'Not checked in'} />
                        )}
                        {lead.assigned_user.full_name}
                      </div>
                    ) : (
                      <span className="text-gray-500">Unassigned</span>
                    )}
                  </TableCell>
                )}
                {visibleColumns.created && (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : 'Unknown date'}
                    </div>
                  </TableCell>
                )}
                {visibleColumns.lastContacted && (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {lead.last_contacted
                        ? new Date(lead.last_contacted).toLocaleDateString()
                        : "Never"}
                    </div>
                  </TableCell>
                )}
                {visibleColumns.actions && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a href={`/admin/leads/${lead.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setSelectedLead(lead)
                          setIsStatusDialogOpen(true)
                        }}>
                          <Check className="mr-2 h-4 w-4" />
                          Update Status
                        </DropdownMenuItem>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <DropdownMenuItem>
                              <User className="mr-2 h-4 w-4" />
                              Assign To
                            </DropdownMenuItem>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleAssignLead(lead.id, "unassigned")}>
                              Unassign
                            </DropdownMenuItem>
                            {telecallers.map((telecaller) => (
                              <DropdownMenuItem 
                                key={telecaller.id} 
                                onClick={() => handleAssignLead(lead.id, telecaller.id)}
                              >
                                <div className="flex items-center gap-2">
                                  {/* Status indicator for telecaller */}
                                  {telecallerStatus[telecaller.id] !== undefined && (
                                    <div className={`w-2 h-2 rounded-full ${telecallerStatus[telecaller.id] ? 'bg-green-500' : 'bg-red-500'}`} 
                                         title={telecallerStatus[telecaller.id] ? 'Checked in' : 'Not checked in'} />
                                  )}
                                  {telecaller.full_name}
                                </div>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {Math.min((currentPage - 1) * pageSize + 1, filteredLeads.length)} to {Math.min(currentPage * pageSize, filteredLeads.length)} of {filteredLeads.length} leads
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {leads.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No leads found. Try adjusting your filters or upload some leads.
        </div>
      )}
    </div>
  )
}
