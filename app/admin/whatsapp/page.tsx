"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Search, Send, User, Check, CheckCheck, 
  Loader2, MessageSquare, Bot, ExternalLink, ShieldAlert, Filter,
  Download, FileText, File, Image as ImageIcon, Paperclip, X,
  Phone, PhoneCall, Copy, Sparkles, Clock, Volume2, VolumeX,
  Bell, RotateCw, FileDown, ChevronDown, CheckCircle2,
  AlertCircle, Eye, Users, ArrowUpDown
} from "lucide-react"
import { 
  sendWhatsAppText,
  sendMissedCallMessage,
  sendKYCRequestTemplate,
  sendStatusUpdateMessage,
  sendNotInterestedAudit,
  sendCallbackReminderTemplate,
  uploadAndSendWhatsAppFile,
  updateLeadStatusFromChat,
  reassignLeadFromChat
} from "@/app/actions/whatsapp"
import { showLocalNotification } from "@/lib/notifications/show-local-notification"
import Link from "next/link"
import { ModuleGuard } from "@/components/module-guard"
import { MASTER_STATUSES } from "@/lib/lead-statuses"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"

// --- TYPES ---
interface ChatLead {
  id: string
  name: string
  phone: string
  status: string
  last_message_at: string
  unread_count: number
  assigned_to: string | null
  telecaller_name?: string
  created_at: string
  last_message_content?: string
  last_message_type?: string
  tenant_id?: string
}

interface ChatMessage {
  id: string
  direction: 'inbound' | 'outbound'
  message_type: string
  content: string | null
  status: string 
  created_at: string
  fonada_message_id?: string
  lead_id: string 
  media_url?: string | null     
  media_type?: string | null    
  file_name?: string | null     
}

interface TeamUser {
  id: string
  full_name: string
  email?: string
  role?: string
}

// Canned Quick Reply Categories
const CANNED_CATEGORIES = [
  { id: 'all', label: 'All Quick Replies' },
  { id: 'kyc', label: '📄 KYC & Docs' },
  { id: 'callbacks', label: '📞 Callbacks' },
  { id: 'status', label: '⏳ Status' },
  { id: 'closers', label: '🎉 Approval' },
]

const CANNED_RESPONSES: Record<string, string[]> = {
  kyc: [
    "📄 Kindly share clear photos or PDF of your PAN Card and Aadhaar Card.",
    "🏦 Please share your last 6 months Bank Statement in PDF format (with password if protected).",
    "💼 Kindly share your latest 3 months Salary Slips or Form 16.",
    "📍 Could you share your current residential Address proof (Electricity Bill / Rent Agreement)?"
  ],
  callbacks: [
    "👋 Hi, I tried calling you regarding your loan application. Please let me know when you are free.",
    "⏰ When would be a convenient time for our loan advisor to connect with you?",
    "📞 We were unable to reach you on phone. Please reply here if you'd like us to call you back."
  ],
  status: [
    "✅ Great news! Your initial eligibility check is positive. Let's proceed with document verification.",
    "⏳ Your application is currently under underwriting review. We will notify you once approved.",
    "🔍 Our verification team needs a quick confirmation on your current employment details."
  ],
  closers: [
    "🎉 Congratulations! Your loan application has been approved. Our team will assist with disbursement.",
    "🤝 Thank you for submitting all details! Your processing is prioritized for today."
  ]
}

export default function AdminWhatsAppPanel() {
  const supabase = createClient()
  
  // User & Tenant State
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([])

  // Leads & Filters
  const [leads, setLeads] = useState<ChatLead[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTab, setSelectedTab] = useState<'all' | 'unread' | 'my' | 'interested' | 'kyc'>('all')
  const [selectedTelecallerFilter, setSelectedTelecallerFilter] = useState<string>("all")
  const [selectedLead, setSelectedLead] = useState<ChatLead | null>(null)
  
  // Chat & Messages
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [inThreadSearchQuery, setInThreadSearchQuery] = useState("")
  const [showInThreadSearch, setShowInThreadSearch] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')

  // Attachment State
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Loading States
  const [loadingLeads, setLoadingLeads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Audio & Notification
  const [isMuted, setIsMuted] = useState(false)
  const isMutedRef = useRef(false)
  const teamUsersRef = useRef<TeamUser[]>([])
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')

  // Modals
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [sendingTemplate, setSendingTemplate] = useState<string | null>(null)
  const [callbackTimeString, setCallbackTimeString] = useState("Today at 4:00 PM")
  const [previewImageModalUrl, setPreviewImageModalUrl] = useState<string | null>(null)

  // Popover States
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false)
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // --- 1. INITIALIZE USER, TENANT & NOTIFICATION PREFERENCES ---
  useEffect(() => {
    // Check Notification API
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission)
      if (Notification.permission === "default") {
        Notification.requestPermission().then((p) => setNotificationPermission(p))
      }
    }

    // Load Mute preference
    const savedMute = localStorage.getItem('crm_wa_sound_muted') === 'true'
    setIsMuted(savedMute)
    isMutedRef.current = savedMute

    // Load Profile
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('users').select('id, full_name, role, tenant_id').eq('id', user.id).single()
        setCurrentUser(profile)
        setTenantId(profile?.tenant_id || null)
      }
    }
    initUser()
  }, [])

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  useEffect(() => {
    teamUsersRef.current = teamUsers
  }, [teamUsers])

  const toggleMute = () => {
    const next = !isMuted
    setIsMuted(next)
    isMutedRef.current = next
    localStorage.setItem('crm_wa_sound_muted', String(next))
    toast(next ? "Notification audio muted" : "Notification audio enabled")
  }

  const playNotificationSound = () => {
    if (isMutedRef.current) return
    const audio = new Audio('/notification.wav')
    audio.play().catch(e => console.log("Audio play blocked:", e))
  }

  // --- 2. FETCH ALL LEADS & TEAM USERS (TENANT SCOPED) ---
  const fetchLeadsAndUsers = async (showLoader = false) => {
    if (showLoader) setLoadingLeads(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let userProfile = currentUser
      if (!userProfile && user) {
        const { data: profile } = await supabase.from('users').select('id, full_name, role, tenant_id').eq('id', user.id).single()
        userProfile = profile
        setCurrentUser(profile)
        setTenantId(profile?.tenant_id || null)
      }

      const activeTenantId = userProfile?.tenant_id

      // Fetch users in this tenant
      let uQuery = supabase.from('users').select('id, full_name, email, role').eq('is_active', true).order('full_name')
      if (activeTenantId && userProfile?.role !== 'super_admin') {
        uQuery = uQuery.eq('tenant_id', activeTenantId)
      }
      const { data: usersData } = await uQuery
      if (usersData) {
        setTeamUsers(usersData as TeamUser[])
        teamUsersRef.current = usersData as TeamUser[]
      }

      // Fetch leads
      let lQuery = supabase
        .from('leads')
        .select('id, name, phone, status, last_message_at, unread_count, assigned_to, created_at, last_message_content, last_message_type, tenant_id')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(200)

      if (activeTenantId && userProfile?.role !== 'super_admin') {
        lQuery = lQuery.eq('tenant_id', activeTenantId)
      }

      const { data: leadsData } = await lQuery

      if (leadsData) {
        const mappedLeads = leadsData.map((lead: any) => {
          const owner = usersData?.find((u: any) => u.id === lead.assigned_to)
          return { ...lead, telecaller_name: owner?.full_name || "Unassigned" }
        })
        setLeads(mappedLeads as ChatLead[])
      }
    } catch (err) {
      console.error("Error fetching leads/users:", err)
    } finally {
      setLoadingLeads(false)
    }
  }

  // --- 3. REALTIME SUBSCRIPTIONS ---
  useEffect(() => {
    fetchLeadsAndUsers(true)

    const leadChannel = supabase.channel('admin_leads_update')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload: any) => {
        const updatedLead = payload.new
        setLeads(prev => {
          const exists = prev.find(l => l.id === updatedLead.id)
          if (exists) {
            const telecaller = teamUsersRef.current.find(u => u.id === updatedLead.assigned_to)?.full_name || exists.telecaller_name
            const merged = { ...exists, ...updatedLead, telecaller_name: telecaller }
            return prev.map(l => l.id === updatedLead.id ? merged : l)
                       .sort((a, b) => new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime())
          }
          return prev
        })

        setSelectedLead(cur => (cur && cur.id === updatedLead.id ? { ...cur, ...updatedLead } : cur))
      })
      .subscribe()

    const globalNotificationChannel = supabase.channel('global_notifications')
      .on('postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_messages', 
        filter: "direction=eq.inbound" 
      }, 
      (payload: any) => {
        const newMsg = payload.new as ChatMessage
        const isLookingAtDifferentTab = typeof document !== 'undefined' && document.hidden

        setLeads((currentLeads) => {
          const matchedLead = currentLeads.find(l => l.id === newMsg.lead_id)
          
          if (matchedLead) {
            setSelectedLead((curSelected) => {
              const isLookingAtDifferentChat = curSelected?.id !== newMsg.lead_id
              
              if (isLookingAtDifferentTab || isLookingAtDifferentChat) {
                playNotificationSound()
    
                showLocalNotification(`WhatsApp from ${matchedLead.name}`, {
                  body: newMsg.content ? newMsg.content.substring(0, 60) + "..." : "New message received.",
                  icon: "/favicon.ico"
                })
              }
              return curSelected
            })
          }
          return currentLeads
        })
      })
      .subscribe()

    return () => { 
      supabase.removeChannel(leadChannel)
      supabase.removeChannel(globalNotificationChannel) 
    }
  }, [])

  // --- 4. FILTER & TAB LOGIC ---
  const filteredLeads = useMemo(() => {
    let result = leads

    // 1. Tab filter
    if (selectedTab === 'unread') {
      result = result.filter(l => l.unread_count > 0)
    } else if (selectedTab === 'my') {
      result = result.filter(l => l.assigned_to === currentUser?.id)
    } else if (selectedTab === 'interested') {
      result = result.filter(l => ['Interested', 'Documents_Sent', 'Login Done', 'Approved', 'Disbursed'].includes(l.status))
    } else if (selectedTab === 'kyc') {
      result = result.filter(l => ['Documents_Sent', 'Transferred to KYC', 'Underwriting'].includes(l.status))
    }

    // 2. Telecaller filter
    if (selectedTelecallerFilter !== 'all') {
      if (selectedTelecallerFilter === 'unassigned') {
        result = result.filter(l => !l.assigned_to)
      } else {
        result = result.filter(l => l.assigned_to === selectedTelecallerFilter)
      }
    }

    // 3. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(l => 
        l.name.toLowerCase().includes(q) || 
        l.phone.includes(q) ||
        (l.telecaller_name && l.telecaller_name.toLowerCase().includes(q)) ||
        (l.last_message_content && l.last_message_content.toLowerCase().includes(q))
      )
    }

    return result
  }, [leads, selectedTab, selectedTelecallerFilter, searchQuery, currentUser])

  // Total unread count
  const totalUnreadCount = useMemo(() => {
    return leads.reduce((acc, l) => acc + (l.unread_count || 0), 0)
  }, [leads])

  // --- 5. FETCH MESSAGES FOR SELECTED LEAD & REALTIME UPDATES ---
  useEffect(() => {
    if (!selectedLead) return

    const fetchMessages = async () => {
      setLoadingMessages(true)
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('lead_id', selectedLead.id)
        .order('created_at', { ascending: true })
      
      if (data) setMessages(data)
      setLoadingMessages(false)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)

      if (selectedLead.unread_count > 0) {
        await supabase.from('leads').update({ unread_count: 0 }).eq('id', selectedLead.id)
        setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, unread_count: 0 } : l))
      }
    }

    fetchMessages()

    const msgChannel = supabase.channel(`admin_chat_${selectedLead.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `lead_id=eq.${selectedLead.id}` }, 
      (payload: any) => {
        setMessages(prev => [...prev, payload.new as ChatMessage])
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `lead_id=eq.${selectedLead.id}` },
      (payload: any) => {
        setMessages(prev => prev.map(msg => msg.id === payload.new.id ? payload.new as ChatMessage : msg))
      })
      .subscribe()

    return () => { supabase.removeChannel(msgChannel) }
  }, [selectedLead?.id])

  // --- 6. SEND NORMAL TEXT MESSAGE ---
  const handleSend = async () => {
    if (!inputText.trim() && !attachmentFile) return
    if (sending || !selectedLead) return

    // If there is an attachment file, route to uploadAndSendWhatsAppFile
    if (attachmentFile) {
      await handleSendAttachment()
      return
    }

    setSending(true)
    const textToSend = inputText.trim()
    setInputText("")
    
    const res = await sendWhatsAppText(selectedLead.id, selectedLead.phone, textToSend)
    if (!res.success) {
      toast.error("Send failed: " + res.error)
      setInputText(textToSend)
    } else {
      toast.success("Message sent")
    }
    setSending(false)
  }

  // --- 7. ATTACHMENT HANDLERS ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Limit to 15MB
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File size exceeds 15MB limit.")
      return
    }

    setAttachmentFile(file)
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setAttachmentPreviewUrl(url)
    } else {
      setAttachmentPreviewUrl(null)
    }
  }

  const clearAttachment = () => {
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl)
    setAttachmentFile(null)
    setAttachmentPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSendAttachment = async () => {
    if (!attachmentFile || !selectedLead) return

    setIsUploading(true)
    const formData = new FormData()
    formData.append("file", attachmentFile)
    formData.append("leadId", selectedLead.id)
    formData.append("customerPhone", selectedLead.phone)
    formData.append("caption", inputText.trim())

    const captionBackup = inputText
    setInputText("")

    try {
      const res = await uploadAndSendWhatsAppFile(formData)
      if (res.success) {
        toast.success(`Attachment sent: ${res.fileName}`)
        clearAttachment()
      } else {
        toast.error("Failed to send attachment: " + res.error)
        setInputText(captionBackup)
      }
    } catch (err: any) {
      toast.error("Upload error: " + err.message)
      setInputText(captionBackup)
    } finally {
      setIsUploading(false)
    }
  }

  // --- 8. STATUS & ASSIGNEE UPDATERS ---
  const handleStatusChange = async (newStatus: string) => {
    if (!selectedLead) return
    setStatusPopoverOpen(false)
    
    const prevStatus = selectedLead.status
    setSelectedLead(prev => prev ? { ...prev, status: newStatus } : null)
    setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, status: newStatus } : l))

    const res = await updateLeadStatusFromChat(selectedLead.id, newStatus)
    if (res.success) {
      toast.success(`Status updated to ${newStatus}`)
    } else {
      toast.error("Failed to update status: " + res.error)
      setSelectedLead(prev => prev ? { ...prev, status: prevStatus } : null)
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, status: prevStatus } : l))
    }
  }

  const handleAssigneeChange = async (newUserId: string | null) => {
    if (!selectedLead) return
    setAssigneePopoverOpen(false)

    const prevAssigned = selectedLead.assigned_to
    const prevName = selectedLead.telecaller_name
    const targetUser = teamUsers.find(u => u.id === newUserId)
    const newName = targetUser?.full_name || "Unassigned"

    setSelectedLead(prev => prev ? { ...prev, assigned_to: newUserId, telecaller_name: newName } : null)
    setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, assigned_to: newUserId, telecaller_name: newName } : l))

    const res = await reassignLeadFromChat(selectedLead.id, newUserId)
    if (res.success) {
      toast.success(`Reassigned to ${newName}`)
    } else {
      toast.error("Failed to reassign: " + res.error)
      setSelectedLead(prev => prev ? { ...prev, assigned_to: prevAssigned, telecaller_name: prevName } : null)
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, assigned_to: prevAssigned, telecaller_name: prevName } : l))
    }
  }

  // --- 9. SEND OFFICIAL META TEMPLATES ---
  const handleTriggerTemplate = async (templateKey: string) => {
    if (!selectedLead) return
    setSendingTemplate(templateKey)

    try {
      let res: { success: boolean, error?: string } = { success: false }

      if (templateKey === 'missed_call') {
        res = await sendMissedCallMessage(selectedLead.id, selectedLead.phone)
      } else if (templateKey === 'kyc_initial') {
        res = await sendKYCRequestTemplate(selectedLead.id, selectedLead.phone, false)
      } else if (templateKey === 'kyc_reminder') {
        res = await sendKYCRequestTemplate(selectedLead.id, selectedLead.phone, true)
      } else if (templateKey === 'app_status') {
        res = await sendStatusUpdateMessage(selectedLead.id, selectedLead.phone, tenantId)
      } else if (templateKey === 'not_interested_audit') {
        res = await sendNotInterestedAudit(selectedLead.id, selectedLead.phone, selectedLead.name)
      } else if (templateKey === 'precall_reminder') {
        const agentName = currentUser?.full_name || "Loan Advisor"
        res = await sendCallbackReminderTemplate(selectedLead.id, selectedLead.phone, selectedLead.name, agentName, callbackTimeString)
      }

      if (res.success) {
        toast.success("Meta WhatsApp template delivered!")
        setTemplateModalOpen(false)
      } else {
        toast.error("Template delivery failed: " + (res.error || "Unknown error"))
      }
    } catch (err: any) {
      toast.error("Error: " + err.message)
    } finally {
      setSendingTemplate(null)
    }
  }

  // --- 10. EXPORT CHAT HISTORY (.TXT) ---
  const exportChatHistory = () => {
    if (!selectedLead || messages.length === 0) {
      toast.error("No messages to export.")
      return
    }

    const lines: string[] = []
    lines.push(`================================================================`)
    lines.push(`HANVA CRM - WHATSAPP CHAT TRANSCRIPT`)
    lines.push(`Customer: ${selectedLead.name} (${selectedLead.phone})`)
    lines.push(`Assignee: ${selectedLead.telecaller_name || 'Unassigned'}`)
    lines.push(`Status: ${selectedLead.status}`)
    lines.push(`Exported On: ${new Date().toLocaleString()}`)
    lines.push(`Total Messages: ${messages.length}`)
    lines.push(`================================================================\n`)

    messages.forEach((msg, idx) => {
      const time = new Date(msg.created_at).toLocaleString()
      const sender = msg.direction === 'outbound' ? 'CRM Agent' : selectedLead.name
      const tag = msg.message_type === 'template' ? ' [TEMPLATE]' : ''
      lines.push(`[${idx + 1}] ${time} - ${sender}${tag}:`)
      if (msg.content) lines.push(msg.content)
      if (msg.media_url) lines.push(`Attachment: ${msg.media_url}`)
      lines.push(``)
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedLead.name.replace(/[^a-zA-Z0-9]/g, '_')}_chat_${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success("Chat transcript downloaded")
  }

  // --- 11. IN-THREAD SEARCH HIGHLIGHTING & FILTER ---
  const displayedMessages = useMemo(() => {
    return messages
  }, [messages])

  // --- 12. RENDER MESSAGE BUBBLE ---
  const renderMessageBubble = (msg: ChatMessage) => {
    const isOutbound = msg.direction === 'outbound'
    const isTemplate = msg.message_type === 'template'
    
    let textToDisplay = msg.content || ""
    let extractedUrl: string | null = null
    let isImage = false
    let isPDF = false
    let fileName = "Document"

    const urlRegex = /(https?:\/\/[^\s]+)/g
    const urls = textToDisplay.match(urlRegex)

    if (!msg.media_url && urls && urls.length > 0) {
      extractedUrl = urls[0]
      textToDisplay = textToDisplay.replace(extractedUrl, '').trim()
      isImage = !!extractedUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)
      isPDF = !!extractedUrl.match(/\.(pdf)(\?.*)?$/i)
      fileName = extractedUrl.split('/').pop()?.split('?')[0] || "Document"
    }

    const finalMediaUrl = msg.media_url || extractedUrl
    const finalIsImage = msg.media_url ? msg.media_type?.startsWith('image/') : isImage
    const finalIsPDF = msg.media_url ? msg.media_type === 'application/pdf' : isPDF
    const finalFileName = msg.file_name || fileName

    // Match search query
    const isMatch = inThreadSearchQuery.trim() && textToDisplay.toLowerCase().includes(inThreadSearchQuery.toLowerCase())

    return (
      <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} group transition-all`}>
        <div className={`max-w-[72%] min-w-[130px] rounded-2xl p-3 shadow-xs relative flex flex-col gap-2 transition-all
          ${isMatch ? 'ring-2 ring-yellow-400 dark:ring-yellow-500' : ''}
          ${isOutbound 
            ? 'bg-[#d9fdd3] dark:bg-emerald-950/70 text-slate-900 dark:text-emerald-50 rounded-tr-none border border-emerald-200/40 dark:border-emerald-800/40' 
            : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-tl-none border border-slate-200/80 dark:border-slate-800'}`}
        >
          {isTemplate && (
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-blue-700 dark:text-blue-300 pb-1 border-b border-slate-200/60 dark:border-slate-800 uppercase tracking-wider">
              <Sparkles className="h-3 w-3 text-blue-600 dark:text-blue-400" /> Meta Approved Template
            </div>
          )}
          
          {/* Text Content with Markdown */}
          {textToDisplay && (
            <div className="whitespace-pre-wrap text-[14px] leading-relaxed break-words font-medium">
              {textToDisplay.split(/(\*[^*]+\*|_[^_]+_|`[^`]+`)/g).map((part, index) => {
                if (part.startsWith('*') && part.endsWith('*')) {
                  return <strong key={index} className="font-bold text-black dark:text-white">{part.slice(1, -1)}</strong>
                } else if (part.startsWith('_') && part.endsWith('_')) {
                  return <em key={index} className="italic">{part.slice(1, -1)}</em>
                } else if (part.startsWith('`') && part.endsWith('`')) {
                  return <code key={index} className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-xs font-mono">{part.slice(1, -1)}</code>
                }
                return part
              })}
            </div>
          )}

          {/* Media Preview Card */}
          {finalMediaUrl && (
            finalIsImage ? (
              <div className="relative group/media rounded-xl overflow-hidden border border-black/10 bg-black/5 self-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={finalMediaUrl} 
                  alt="Attached Media" 
                  className="max-w-full max-h-64 object-contain rounded-xl block cursor-pointer hover:opacity-95 transition-opacity"
                  onClick={() => setPreviewImageModalUrl(finalMediaUrl)}
                />
                <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover/media:opacity-100 transition-opacity">
                  <button 
                    onClick={() => setPreviewImageModalUrl(finalMediaUrl)}
                    className="bg-black/60 hover:bg-black/80 p-1.5 rounded-full text-white backdrop-blur-xs transition-colors"
                    title="View Fullscreen"
                  >
                    <Eye size={14} />
                  </button>
                  <a 
                    href={finalMediaUrl} download target="_blank" rel="noopener noreferrer" 
                    className="bg-black/60 hover:bg-black/80 p-1.5 rounded-full text-white backdrop-blur-xs transition-colors"
                    title="Download"
                  >
                    <Download size={14} />
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 p-2.5 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/10 transition-colors w-full">
                <div className={`p-2.5 rounded-xl ${finalIsPDF ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                   {finalIsPDF ? <FileText size={22} /> : <File size={22} />}
                </div>
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-[13px] font-bold truncate text-slate-900 dark:text-slate-100" title={finalFileName}>{finalFileName}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">{finalIsPDF ? 'PDF Document' : 'File Attachment'}</p>
                </div>
                <a 
                  href={finalMediaUrl} target="_blank" rel="noopener noreferrer" download
                  className="p-2 bg-white dark:bg-slate-800 rounded-xl shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 shrink-0"
                  title="Download File"
                >
                  <Download size={15} className="text-slate-700 dark:text-slate-300" />
                </a>
              </div>
            )
          )}
          
          <div className="flex items-center justify-end gap-1.5 pt-0.5">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {isOutbound && (
              <span className="flex items-center">
                {msg.status === 'read' ? <CheckCheck size={16} className="text-blue-500" /> : 
                 msg.status === 'delivered' ? <CheckCheck size={16} className="text-slate-400" /> : 
                 <Check size={16} className="text-slate-400" />}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Lead status styling helper
  const getStatusBadgeStyle = (statusVal: string) => {
    const found = MASTER_STATUSES.find(s => s.value.toLowerCase() === statusVal?.toLowerCase())
    if (found) return found.color
    return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
  }

  return (
    <ModuleGuard requiredModule="whatsapp">
      <div className="flex h-[calc(100vh-6.5rem)] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-200">
      
      {/* ====================================================================== */}
      {/* --- LEFT SIDEBAR: CONVERSATION LIST & OMNICHANNEL FILTERS --- */}
      {/* ====================================================================== */}
      <div className="w-[380px] lg:w-[410px] shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex flex-col">
        {/* Header Bar */}
        <div className="p-3.5 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-600/20 flex items-center justify-center text-blue-400 border border-blue-500/30">
              <MessageSquare className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="font-extrabold text-sm tracking-tight text-white flex items-center gap-2">
                WhatsApp Hub
              </h2>
              <span className="text-[10px] font-semibold text-slate-400">
                {filteredLeads.length} conversation{filteredLeads.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Audio Notification Mute Button */}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleMute}
              className={`h-7 w-7 p-0 rounded-lg transition-colors ${isMuted ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/30' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
              title={isMuted ? "Sound is Muted (Click to Unmute)" : "Sound is Active (Click to Mute)"}
            >
              {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </Button>

            {/* Desktop Notification Check */}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                if ("Notification" in window) {
                  Notification.requestPermission().then((p) => {
                    setNotificationPermission(p)
                    toast(p === 'granted' ? "Desktop notifications enabled!" : "Notifications: " + p)
                  })
                }
              }}
              className={`h-7 w-7 p-0 rounded-lg transition-colors ${notificationPermission === 'granted' ? 'text-emerald-400 hover:bg-emerald-950/30' : 'text-amber-400 hover:bg-amber-950/30'}`}
              title={`Desktop Notifications: ${notificationPermission}`}
            >
              <Bell className="h-3.5 w-3.5" />
            </Button>

            {/* Refresh Leads List */}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => fetchLeadsAndUsers(true)}
              className="h-7 w-7 p-0 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
              title="Refresh conversations"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>

            {totalUnreadCount > 0 && (
              <Badge className="bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-[10px] rounded-full px-2 py-0.5 animate-pulse">
                {totalUnreadCount} new
              </Badge>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input 
              placeholder="Search by name, phone, assignee or text..." 
              className="pl-9 bg-slate-50 dark:bg-slate-950 border-slate-200/80 dark:border-slate-800 rounded-xl font-medium text-xs focus-visible:ring-blue-500/20 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills (Tabs) */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {[
              { id: 'all', label: 'All' },
              { id: 'unread', label: 'Unread', badge: totalUnreadCount },
              { id: 'my', label: 'Assigned to Me' },
              { id: 'interested', label: 'Interested' },
              { id: 'kyc', label: 'KYC Flow' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id as any)}
                className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  selectedTab === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200/70'
                }`}
              >
                {tab.label}
                {tab.badge && tab.badge > 0 ? (
                  <span className={`text-[9px] px-1 rounded-full ${selectedTab === tab.id ? 'bg-white text-blue-600' : 'bg-rose-500 text-white'}`}>
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Telecaller Filter Dropdown */}
          <div className="flex items-center justify-between pt-0.5 text-[11px] text-slate-500">
            <span className="font-semibold flex items-center gap-1">
              <Users className="h-3 w-3 text-slate-400" /> Filter Agent:
            </span>
            <select
              value={selectedTelecallerFilter}
              onChange={(e) => setSelectedTelecallerFilter(e.target.value)}
              className="bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-md px-1.5 py-0.5 focus:outline-none"
            >
              <option value="all">All Telecallers ({leads.length})</option>
              <option value="unassigned">Unassigned Only</option>
              {teamUsers.map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Lead List Scroll Area */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {loadingLeads ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-2">
              <Loader2 className="animate-spin text-blue-600 h-6 w-6" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Synchronizing conversations...</span>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-2">
              <MessageSquare className="h-9 w-9 text-slate-300 dark:text-slate-700 mx-auto opacity-50" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No matching conversations</p>
              <p className="text-[11px] text-slate-400 leading-normal">Try adjusting your filters or search keywords.</p>
            </div>
          ) : (
            filteredLeads.map(lead => {
              const isSelected = selectedLead?.id === lead.id
              return (
                <div 
                  key={lead.id} 
                  onClick={() => setSelectedLead(lead)}
                  className={`p-3 cursor-pointer transition-all flex flex-col gap-1.5 ${
                    isSelected 
                      ? 'bg-blue-500/10 dark:bg-blue-500/10 border-l-4 border-l-blue-600' 
                      : 'border-l-4 border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-850/40'
                  }`}
                >
                  <div className="flex justify-between items-start gap-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 font-extrabold text-xs flex items-center justify-center shrink-0">
                        {lead.name.charAt(0).toUpperCase()}
                      </div>
                      <h3 className={`text-xs font-extrabold truncate tracking-tight ${lead.unread_count > 0 ? 'text-slate-900 dark:text-slate-50' : 'text-slate-800 dark:text-slate-200'}`}>
                        {lead.name}
                      </h3>
                    </div>
                    <span className={`text-[10px] font-bold whitespace-nowrap ${lead.unread_count > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                      {lead.last_message_at 
                        ? new Date(lead.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })
                        : "New"
                      }
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 pl-9">
                    {lead.last_message_type === 'outbound' ? (
                       <CheckCheck className="h-3 w-3 text-blue-500 shrink-0" />
                    ) : (
                       <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                    )}
                    <p className={`text-[11px] truncate font-medium leading-relaxed ${lead.unread_count > 0 ? 'text-slate-900 dark:text-slate-100 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                      {lead.last_message_content?.replace(/(https?:\/\/[^\s]+)/g, '📎 Attachment') || "Tap to chat"}
                    </p>
                  </div>

                  <div className="flex justify-between items-center pl-9 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${getStatusBadgeStyle(lead.status)}`}>
                        {lead.status?.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate max-w-[120px]">
                        • {lead.telecaller_name?.split(' ')[0]}
                      </span>
                    </div>
                    {lead.unread_count > 0 && (
                      <div className="bg-blue-600 text-white text-[10px] font-extrabold h-4.5 min-w-[18px] px-1 flex items-center justify-center rounded-full shadow-xs animate-pulse">
                        {lead.unread_count}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ====================================================================== */}
      {/* --- RIGHT PANEL: CHAT THREAD & ACTION HUB --- */}
      {/* ====================================================================== */}
      <div className="flex-1 flex flex-col bg-slate-50/30 dark:bg-slate-950/10 min-w-0">
        {selectedLead ? (
          <>
            {/* --- CHAT HEADER --- */}
            <div className="bg-white dark:bg-slate-900 px-5 py-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-2xs z-10 flex-wrap gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-extrabold text-base ring-2 ring-blue-500/20 shrink-0">
                  {selectedLead.name.charAt(0).toUpperCase()}
                </div>
                
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-extrabold text-slate-900 dark:text-slate-50 text-sm tracking-tight truncate max-w-[180px] sm:max-w-[260px]">
                      {selectedLead.name}
                    </h2>
                    
                    {/* Status Popover Selector */}
                    <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
                      <PopoverTrigger asChild>
                        <button className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg flex items-center gap-1 border border-black/10 transition-colors ${getStatusBadgeStyle(selectedLead.status)}`}>
                          {selectedLead.status?.replace(/_/g, ' ')}
                          <ChevronDown className="h-2.5 w-2.5 opacity-70" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg rounded-xl z-50">
                        <p className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">Change Lead Status</p>
                        <div className="max-h-56 overflow-y-auto space-y-0.5">
                          {MASTER_STATUSES.map(s => (
                            <button
                              key={s.value}
                              onClick={() => handleStatusChange(s.value)}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                                selectedLead.status === s.value 
                                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' 
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span>{s.label}</span>
                              {selectedLead.status === s.value && <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <span className="font-semibold">{selectedLead.phone}</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(selectedLead.phone)
                        toast.success("Phone number copied!")
                      }} 
                      title="Copy phone"
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <span className="h-3 w-[1px] bg-slate-200 dark:bg-slate-800" />
                    
                    {/* Assignee Popover Selector */}
                    <Popover open={assigneePopoverOpen} onOpenChange={setAssigneePopoverOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                          <span>Agent: <strong className="font-bold text-slate-700 dark:text-slate-300">{selectedLead.telecaller_name}</strong></span>
                          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg rounded-xl z-50">
                        <p className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">Reassign Lead</p>
                        <div className="max-h-56 overflow-y-auto space-y-0.5">
                          <button
                            onClick={() => handleAssigneeChange(null)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          >
                            Unassign
                          </button>
                          {teamUsers.map(u => (
                            <button
                              key={u.id}
                              onClick={() => handleAssigneeChange(u.id)}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                                selectedLead.assigned_to === u.id 
                                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' 
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span>{u.full_name}</span>
                              {selectedLead.assigned_to === u.id && <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Action Buttons in Header */}
              <div className="flex items-center gap-1.5">
                {/* Click to Call */}
                <a href={`tel:${selectedLead.phone}`}>
                  <Button variant="outline" size="sm" className="h-8 px-2.5 rounded-xl border-slate-200 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600" title="Dial Phone">
                    <PhoneCall className="h-3.5 w-3.5" />
                  </Button>
                </a>

                {/* In-Thread Search Toggle */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowInThreadSearch(!showInThreadSearch)}
                  className={`h-8 px-2.5 rounded-xl border-slate-200 dark:border-slate-800 ${showInThreadSearch ? 'bg-blue-50 text-blue-600' : ''}`}
                  title="Search inside conversation"
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>

                {/* Official Meta Templates Modal Trigger */}
                <Button 
                  size="sm" 
                  onClick={() => setTemplateModalOpen(true)}
                  className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-xs gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Templates
                </Button>

                {/* Export Chat */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={exportChatHistory}
                  className="h-8 px-2.5 rounded-xl border-slate-200 dark:border-slate-800" 
                  title="Export Chat History (.txt)"
                >
                  <FileDown className="h-3.5 w-3.5" />
                </Button>

                {/* CRM Lead Profile Link */}
                <Link href={`/admin/leads/${selectedLead.id}`}>
                  <Button variant="outline" size="sm" className="h-8 px-3 rounded-xl border-slate-200 dark:border-slate-800 font-bold text-xs gap-1">
                    <ExternalLink className="h-3 w-3" /> CRM
                  </Button>
                </Link>
              </div>
            </div>

            {/* In-Thread Search Bar (Collapsible) */}
            {showInThreadSearch && (
              <div className="bg-slate-100 dark:bg-slate-850 px-4 py-2 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 animate-in slide-in-from-top-1 duration-150">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input 
                    placeholder="Search keywords in this chat..." 
                    className="pl-8 h-8 text-xs bg-white dark:bg-slate-900 rounded-lg border-slate-200 dark:border-slate-800"
                    value={inThreadSearchQuery}
                    onChange={(e) => setInThreadSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {inThreadSearchQuery && (
                    <button 
                      onClick={() => setInThreadSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setShowInThreadSearch(false)
                    setInThreadSearchQuery("")
                  }}
                  className="h-8 px-2 text-xs text-slate-500"
                >
                  Close
                </Button>
              </div>
            )}

            {/* --- MESSAGES SCROLL AREA --- */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
              {loadingMessages ? (
                 <div className="flex flex-col justify-center items-center h-full space-y-2">
                   <Loader2 className="animate-spin text-blue-600 h-6 w-6" />
                   <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Synchronizing messages...</span>
                 </div>
              ) : displayedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-2 text-slate-400">
                  <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No message history yet</p>
                  <p className="text-[11px] max-w-xs">Send a direct message or official Meta template below to initiate communication.</p>
                </div>
              ) : (
                displayedMessages.map((msg) => <div key={msg.id}>{renderMessageBubble(msg)}</div>)
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* --- COMPOSER & CANNED RESPONSES AREA --- */}
            <div className="flex flex-col bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800">
                {/* Categorized Quick Reply Chips */}
                <div className="px-4 py-2 bg-slate-50/70 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-850 flex items-center gap-2 overflow-x-auto scrollbar-none">
                  {/* Category Pills */}
                  {CANNED_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap transition-all ${
                        activeCategory === cat.id 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Canned Response Chips */}
                <div className="px-4 py-2 bg-white dark:bg-slate-900 flex gap-2 overflow-x-auto border-b border-slate-100 dark:border-slate-850 scrollbar-none">
                  {(activeCategory === 'all' 
                    ? Object.values(CANNED_RESPONSES).flat().slice(0, 8) 
                    : (CANNED_RESPONSES[activeCategory] || [])
                  ).map((text, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInputText(text)}
                      className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-full px-3 py-1 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap transition-all shadow-3xs"
                      title="Click to insert"
                    >
                      {text}
                    </button>
                  ))}
                </div>

                {/* Attachment Preview Bar (If File Selected) */}
                {attachmentFile && (
                  <div className="px-4 py-2.5 bg-blue-50/70 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/40 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-150">
                    <div className="flex items-center gap-3 min-w-0">
                      {attachmentPreviewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={attachmentPreviewUrl} alt="Preview" className="h-10 w-10 object-cover rounded-lg border border-blue-200" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{attachmentFile.name}</p>
                        <p className="text-[10px] text-slate-500">{(attachmentFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to send with optional caption</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={clearAttachment} 
                      className="h-7 w-7 p-0 rounded-full text-slate-500 hover:text-rose-600"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Input Controls */}
                <div className="p-3.5 flex items-center gap-2.5">
                  {/* Hidden File Input */}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    accept="image/*,application/pdf,.doc,.docx"
                    className="hidden" 
                  />

                  {/* Attachment Button */}
                  <Button 
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || sending}
                    className="h-10 w-10 p-0 rounded-xl border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    title="Attach file or photo (PDF, JPEG, PNG)"
                  >
                    <Paperclip className="h-4.5 w-4.5" />
                  </Button>

                  {/* Message Input Box */}
                  <Input 
                    className="flex-1 bg-slate-50/70 dark:bg-slate-950 border-slate-200/80 dark:border-slate-800 rounded-xl h-10 text-xs sm:text-sm font-medium focus-visible:ring-blue-500/20"
                    placeholder={attachmentFile ? "Add a caption for your attachment (optional)..." : "Type a message (Enter to send)..."}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    disabled={sending || isUploading}
                  />

                  {/* Send Button */}
                  <Button 
                    onClick={handleSend} 
                    disabled={(!inputText.trim() && !attachmentFile) || sending || isUploading} 
                    className="bg-blue-600 hover:bg-blue-700 h-10 px-4 rounded-xl flex items-center justify-center shadow-xs shrink-0 font-bold text-xs gap-1.5"
                  >
                    {sending || isUploading ? (
                      <Loader2 className="animate-spin h-4 w-4" />
                    ) : (
                      <>
                        <span>Send</span>
                        <Send className="h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                </div>
            </div>
          </>
        ) : (
          /* Empty State when no conversation selected */
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/30 dark:bg-slate-950/10 p-6 text-center animate-in fade-in duration-200">
            <div className="h-20 w-20 bg-blue-600/10 border border-blue-500/20 rounded-3xl flex items-center justify-center mb-4 shadow-xs">
               <MessageSquare className="h-9 w-9 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mb-1 tracking-tight">WhatsApp Command Center</h2>
            <p className="text-xs font-semibold text-slate-500 max-w-sm leading-relaxed mb-4">
              Select any customer conversation from the sidebar to inspect real-time message history, dispatch official Meta templates, attach KYC documents, and reassign leads.
            </p>
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-3 py-1.5 rounded-full">
              <ShieldAlert className="h-3.5 w-3.5 text-blue-500" /> Powered by Fonada WhatsApp Business API
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================== */}
      {/* --- OFFICIAL META TEMPLATES MODAL --- */}
      {/* ====================================================================== */}
      <Dialog open={templateModalOpen} onOpenChange={setTemplateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-blue-600" /> Official WhatsApp Meta Templates
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Templates bypass WhatsApp&apos;s 24-hour service window and deliver guaranteed interactive alerts with rich action buttons.
            </DialogDescription>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-3.5 pt-2">
              {/* Template 1: Missed Call / Callback Request */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">1. Missed Call / Agent Callback Request</span>
                    <Badge variant="outline" className="text-[9px] font-bold text-blue-600 border-blue-200">Interactive Buttons</Badge>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => handleTriggerTemplate('missed_call')}
                    disabled={sendingTemplate !== null}
                    className="h-7 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    {sendingTemplate === 'missed_call' ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : "Send Template"}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Notifies customer of missed attempt, requests PAN, Aadhaar, Payslip, and presents buttons: &quot;I Have Uploaded&quot;, &quot;Call Me Back&quot;, &quot;Need Help&quot;.
                </p>
              </div>

              {/* Template 2: Initial KYC Documents Request */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">2. Initial KYC Document Collection</span>
                    <Badge variant="outline" className="text-[9px] font-bold text-purple-600 border-purple-200">Onboarding</Badge>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => handleTriggerTemplate('kyc_initial')}
                    disabled={sendingTemplate !== null}
                    className="h-7 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    {sendingTemplate === 'kyc_initial' ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : "Send Template"}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Formal request for Aadhaar Card, PAN Card, and latest Bank Statement with clear photo or PDF guidance.
                </p>
              </div>

              {/* Template 3: 24-Hour KYC Reminder */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">3. 24-Hour KYC Pending Reminder</span>
                    <Badge variant="outline" className="text-[9px] font-bold text-amber-600 border-amber-200">Follow-up</Badge>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => handleTriggerTemplate('kyc_reminder')}
                    disabled={sendingTemplate !== null}
                    className="h-7 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    {sendingTemplate === 'kyc_reminder' ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : "Send Reminder"}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Urgent reminder to submit pending KYC documents to prevent loan application expiration or delays.
                </p>
              </div>

              {/* Template 4: Application Status Update */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">4. Application Status Update</span>
                    <Badge variant="outline" className="text-[9px] font-bold text-emerald-600 border-emerald-200">Loan Desk</Badge>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => handleTriggerTemplate('app_status')}
                    disabled={sendingTemplate !== null}
                    className="h-7 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    {sendingTemplate === 'app_status' ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : "Send Update"}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Confirms initial phone verification is complete and provides an interactive button to &quot;Submit Details&quot; in the secure portal.
                </p>
              </div>

              {/* Template 5: Not Interested QA Audit */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">5. Service QA / &quot;Not Interested&quot; Audit</span>
                    <Badge variant="outline" className="text-[9px] font-bold text-rose-600 border-rose-200">Retention</Badge>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => handleTriggerTemplate('not_interested_audit')}
                    disabled={sendingTemplate !== null}
                    className="h-7 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    {sendingTemplate === 'not_interested_audit' ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : "Send Audit"}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Sends customer an automated QA check to uncover why they dropped out (High rate, got another loan, or still interested) and triggers recovery workflow.
                </p>
              </div>

              {/* Template 6: Scheduled Pre-Call Reminder */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">6. Scheduled Callback Reminder</span>
                    <Badge variant="outline" className="text-[9px] font-bold text-cyan-600 border-cyan-200">Appointment</Badge>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => handleTriggerTemplate('precall_reminder')}
                    disabled={sendingTemplate !== null}
                    className="h-7 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    {sendingTemplate === 'precall_reminder' ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : "Send Reminder"}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-semibold whitespace-nowrap">Call Time:</span>
                  <Input 
                    value={callbackTimeString} 
                    onChange={(e) => setCallbackTimeString(e.target.value)} 
                    className="h-7 text-xs bg-white dark:bg-slate-900 rounded-lg max-w-[200px]"
                    placeholder="e.g. Today at 4:30 PM"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setTemplateModalOpen(false)} className="rounded-xl">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====================================================================== */}
      {/* --- IMAGE LIGHTBOX FULLSCREEN PREVIEW MODAL --- */}
      {/* ====================================================================== */}
      {previewImageModalUrl && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewImageModalUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={previewImageModalUrl} 
              alt="Enlarged Media Preview" 
              className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl" 
            />
            <div className="flex items-center gap-3 mt-3">
              <a 
                href={previewImageModalUrl} 
                download 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md"
              >
                <Download size={14} /> Download Original
              </a>
              <button 
                onClick={() => setPreviewImageModalUrl(null)}
                className="bg-white/20 hover:bg-white/30 text-white px-4 py-1.5 rounded-full text-xs font-bold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </ModuleGuard>
  )
}