"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Search, Send, User, Check, CheckCheck, 
  Loader2, MessageSquare, Bot, ExternalLink, ShieldAlert, Filter,
  Download, FileText, File, Image as ImageIcon
} from "lucide-react"
import { sendWhatsAppText } from "@/app/actions/whatsapp"
import Link from "next/link"
import { ModuleGuard } from "@/components/module-guard"

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

export default function AdminWhatsAppPanel() {
  const supabase = createClient()
  
  // State
  const [leads, setLeads] = useState<ChatLead[]>([])
  const [filteredLeads, setFilteredLeads] = useState<ChatLead[]>([]) 
  const [searchQuery, setSearchQuery] = useState("")
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [selectedLead, setSelectedLead] = useState<ChatLead | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  
  // Loading States
  const [loadingLeads, setLoadingLeads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // --- NOTIFICATION SETUP ---
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const playNotificationSound = () => {
    const audio = new Audio('/notification.wav');
    audio.play().catch(e => console.log("Audio play blocked by browser:", e));
  };

  // 1. FETCH ALL LEADS
  const fetchLeadsAndUsers = async () => {
    const { data: leadsData } = await supabase
      .from('leads')
      .select('id, name, phone, status, last_message_at, unread_count, assigned_to, created_at, last_message_content, last_message_type')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(150)

    const { data: usersData } = await supabase.from('users').select('id, full_name')

    if (leadsData && usersData) {
      const mappedLeads = leadsData.map((lead: any) => {
        const owner = usersData.find((u: any) => u.id === lead.assigned_to)
        return { ...lead, telecaller_name: owner?.full_name || "Unassigned" }
      })
      setLeads(mappedLeads as ChatLead[])
    }
    setLoadingLeads(false)
  }

  // 1B. GLOBAL REALTIME LISTENER
  useEffect(() => {
    fetchLeadsAndUsers()
    
    const leadChannel = supabase.channel('admin_leads_update')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload: any) => {
        const updatedLead = payload.new;
        setLeads(prev => {
          const exists = prev.find(l => l.id === updatedLead.id);
          if (exists) {
            return prev.map(l => l.id === updatedLead.id ? { ...l, ...updatedLead } : l)
                       .sort((a, b) => new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime());
          }
          return prev;
        });
      }).subscribe()

    const globalNotificationChannel = supabase.channel('global_notifications')
      .on('postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_messages', 
        filter: "direction=eq.inbound" 
      }, 
      (payload: any) => {
        const newMsg = payload.new as ChatMessage;
        const isLookingAtDifferentTab = document.hidden;

        setSelectedLead((currentSelectedLead) => {
             const isLookingAtDifferentChat = currentSelectedLead?.id !== newMsg.lead_id;
             
             if (isLookingAtDifferentTab || isLookingAtDifferentChat) {
                playNotificationSound();
    
                if ("Notification" in window && Notification.permission === "granted") {
                   new Notification("New WhatsApp Message", {
                      body: newMsg.content ? newMsg.content.substring(0, 50) + "..." : "You received a new message.",
                      icon: "/favicon.ico"
                   });
                }
             }
             return currentSelectedLead; 
        });

      }).subscribe()

    return () => { 
        supabase.removeChannel(leadChannel);
        supabase.removeChannel(globalNotificationChannel); 
    }
  }, []) 

  // 2. FILTER LOGIC
  useEffect(() => {
    let result = leads;
    if (searchQuery) {
        const lowerQ = searchQuery.toLowerCase();
        result = result.filter(l => 
            l.name.toLowerCase().includes(lowerQ) || 
            l.phone.includes(lowerQ) ||
            (l.telecaller_name && l.telecaller_name.toLowerCase().includes(lowerQ))
        );
    }
    if (showUnreadOnly) {
        result = result.filter(l => l.unread_count > 0);
    }
    setFilteredLeads(result);
  }, [leads, searchQuery, showUnreadOnly]);

  // 3. FETCH MESSAGES & HANDLE REALTIME DLRs
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
  }, [selectedLead])

  // 4. SEND MESSAGE
  const handleSend = async () => {
    if (!inputText.trim() || sending || !selectedLead) return
    setSending(true)
    const textToSend = inputText
    setInputText("")
    
    const res = await sendWhatsAppText(selectedLead.id, selectedLead.phone, textToSend)
    if (!res.success) {
        alert("Failed: " + res.error)
        setInputText(textToSend)
    }
    setSending(false)
  }

  // --- RENDER HELPER FOR MESSAGES & MEDIA ---
  const renderMessageBubble = (msg: ChatMessage) => {
    const isOutbound = msg.direction === 'outbound'
    const isTemplate = msg.message_type === 'template'
    
    let textToDisplay = msg.content || "";
    let extractedUrl: string | null = null;
    let isImage = false;
    let isPDF = false;
    let fileName = "Document";

    // 1. URL Extraction Logic (Finds URLs hidden inside normal text)
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = textToDisplay.match(urlRegex);

    if (!msg.media_url && urls && urls.length > 0) {
      extractedUrl = urls[0];
      // Remove the URL from the text so we don't display the ugly string
      textToDisplay = textToDisplay.replace(extractedUrl, '').trim();
      
      // Determine file type from extension
      isImage = !!extractedUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i);
      isPDF = !!extractedUrl.match(/\.(pdf)(\?.*)?$/i);
      // Try to get a clean filename
      fileName = extractedUrl.split('/').pop()?.split('?')[0] || "Document";
    }

    // 2. Final Data Resolution (Uses explicit columns if they exist, otherwise uses extracted data)
    const finalMediaUrl = msg.media_url || extractedUrl;
    const finalIsImage = msg.media_url ? msg.media_type?.startsWith('image/') : isImage;
    const finalIsPDF = msg.media_url ? msg.media_type === 'application/pdf' : isPDF;
    const finalFileName = msg.file_name || fileName;

    return (
      <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[70%] min-w-[120px] rounded-lg p-3 shadow-sm relative group flex flex-col gap-2
          ${isOutbound ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-none' : 'bg-white text-slate-900 rounded-tl-none'}`}
        >
          {isTemplate && (
             <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 mb-1 border-b pb-1 border-slate-200/50 uppercase tracking-wider">
               <Bot className="h-3 w-3" /> Automated Template
             </div>
          )}
          
          {/* Text Content (Minus the URL) */}
          {textToDisplay && (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
              {textToDisplay.split(/(\*[^*]+\*)/g).map((part, index) =>
                part.startsWith('*') && part.endsWith('*') ? (
                  <strong key={index} className="font-bold text-black">{part.slice(1, -1)}</strong>
                ) : ( part )
              )}
            </p>
          )}

          {/* Media Preview Block */}
          {finalMediaUrl && (
            finalIsImage ? (
              <div className="relative group rounded-md overflow-hidden border border-black/10 bg-black/5 self-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={finalMediaUrl} alt="Attached Media" className="max-w-full max-h-64 object-contain rounded-md block" />
                <a 
                  href={finalMediaUrl} download target="_blank" rel="noopener noreferrer" 
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 p-2 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Download Image"
                >
                  <Download size={16} />
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-black/5 p-2.5 rounded-md border border-black/10 hover:bg-black/10 transition-colors w-full">
                <div className={`p-2 rounded-md ${finalIsPDF ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                   {finalIsPDF ? <FileText size={20} /> : <File size={20} />}
                </div>
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-[13px] font-medium truncate text-slate-800" title={finalFileName}>{finalFileName}</p>
                  <p className="text-[10px] text-slate-500 uppercase">{finalIsPDF ? 'PDF Document' : 'File Attachment'}</p>
                </div>
                <a 
                  href={finalMediaUrl} target="_blank" rel="noopener noreferrer" download
                  className="p-1.5 bg-white rounded-full shadow-sm hover:bg-slate-50 transition-colors border border-slate-200 shrink-0"
                  title="Download File"
                >
                  <Download size={14} className="text-slate-700" />
                </a>
              </div>
            )
          )}
          
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-slate-500 font-medium">
              {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </span>
            {isOutbound && (
              <span className="flex items-center">
                {msg.status === 'read' ? <CheckCheck size={16} className="text-blue-500" /> : 
                 msg.status === 'delivered' ? <CheckCheck size={16} className="text-gray-400" /> : 
                 <Check size={16} className="text-gray-400" />}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <ModuleGuard requiredModule="whatsapp">
      <div className="flex h-[calc(100vh-7.5rem)] bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-300">
      
      {/* --- LEFT SIDEBAR: GOD MODE --- */}
      <div className="w-1/3 border-r border-slate-200/60 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex flex-col">
        {/* Header */}
        <div className="p-4 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between border-b border-slate-850">
          <h2 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
            <MessageSquare className="h-4.5 w-4.5 text-blue-400" /> WhatsApp Inbox
          </h2>
          <Badge className="bg-blue-600 hover:bg-blue-700 text-white border-0 font-bold text-[10px] shadow-2xs rounded-lg px-2 py-0.5">
            {leads.length} Active
          </Badge>
        </div>

        {/* Search & Filter */}
        <div className="p-3.5 border-b border-slate-200/60 dark:border-slate-850 bg-white dark:bg-slate-900 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <Input 
              placeholder="Search chats, phone or owners..." 
              className="pl-9 bg-slate-50 dark:bg-slate-950 border-slate-200/60 dark:border-slate-800 rounded-xl font-medium text-xs focus-visible:ring-blue-500/25 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={`text-[11px] px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 font-bold shadow-3xs ${
              showUnreadOnly 
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400' 
                : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/60 dark:border-slate-800 text-slate-650 dark:text-slate-400 hover:bg-slate-100'
            }`}
          >
            <Filter className="h-3 w-3" /> {showUnreadOnly ? "Filter: Unread Only" : "Show All Conversations"}
          </button>
        </div>

        {/* Lead List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {loadingLeads ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-2">
              <Loader2 className="animate-spin text-blue-600 dark:text-blue-400 h-6 w-6" />
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Synchronizing chats...</span>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-2">
              <MessageSquare className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto mb-2 opacity-50" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-350">No chats matches</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-normal">Try adjusting your filters or search keywords.</p>
            </div>
          ) : (
            filteredLeads.map(lead => (
              <div 
                key={lead.id} 
                onClick={() => setSelectedLead(lead)}
                className={`p-3.5 cursor-pointer transition-all flex flex-col gap-1.5 ${
                  selectedLead?.id === lead.id 
                    ? 'bg-blue-500/5 dark:bg-blue-500/5 border-l-4 border-l-blue-600' 
                    : 'border-l-4 border-l-transparent hover:bg-slate-50/60 dark:hover:bg-slate-800/20'
                }`}
              >
                <div className="flex justify-between items-start">
                  <h3 className={`text-xs font-extrabold truncate pr-2 tracking-tight ${lead.unread_count > 0 ? 'text-slate-900 dark:text-slate-50 font-extrabold' : 'text-slate-800 dark:text-slate-200'}`}>
                    {lead.name}
                  </h3>
                  <span className={`text-[10px] font-bold whitespace-nowrap ${lead.unread_count > 0 ? 'text-blue-600 dark:text-blue-400 font-extrabold' : 'text-slate-400 dark:text-slate-500'}`}>
                    {lead.last_message_at 
                      ? new Date(lead.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })
                      : "New"
                    }
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                    {lead.last_message_type === 'outbound' ? (
                       <CheckCheck className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
                    ) : (
                       <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 animate-pulse"></div>
                    )}
                    <p className={`text-[11px] truncate max-w-[200px] font-medium leading-relaxed ${lead.unread_count > 0 ? 'text-slate-850 dark:text-slate-100 font-semibold' : 'text-slate-555 dark:text-slate-400'}`}>
                      {lead.last_message_content?.replace(/(https?:\/\/[^\s]+)/g, '📎 Attachment') || "Attachment"}
                    </p>
                </div>

                <div className="flex justify-between items-center pt-0.5">
                  <Badge className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-400 text-[9px] font-extrabold shadow-none border-0 rounded-md py-0 px-2 h-4.5">
                    {lead.telecaller_name?.split(' ')[0]} 
                  </Badge>
                  {lead.unread_count > 0 && (
                    <div className="bg-blue-600 text-white text-[10px] font-extrabold h-4.5 min-w-[18px] px-1 flex items-center justify-center rounded-full shadow-sm animate-pulse">
                      {lead.unread_count}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- RIGHT SIDEBAR: CHAT WINDOW --- */}
      <div className="w-2/3 flex flex-col bg-slate-50/40 dark:bg-slate-950/10">
        {selectedLead ? (
          <>
            {/* Rich Header */}
            <div className="bg-white dark:bg-slate-900 px-6 py-3.5 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between shadow-xs z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-extrabold text-base ring-2 ring-blue-500/20">
                  {selectedLead.name.charAt(0).toUpperCase()}
                </div>
                <div className="space-y-0.5">
                  <h2 className="font-extrabold text-slate-900 dark:text-slate-50 text-base flex items-center gap-2 tracking-tight">
                    {selectedLead.name}
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg uppercase tracking-wider ${
                        selectedLead.status === 'New' 
                          ? 'bg-blue-500/10 text-blue-700 dark:text-blue-450 border border-blue-500/20' 
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-450 border border-amber-500/20'
                    }`}>{selectedLead.status}</span>
                  </h2>
                  <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span className="font-semibold">{selectedLead.phone}</span>
                    <span className="h-3 w-[1px] bg-slate-200 dark:bg-slate-800"></span>
                    <span>Assignee: <strong className="font-semibold text-slate-700 dark:text-slate-300">{selectedLead.telecaller_name}</strong></span>
                  </div>
                </div>
              </div>
              <Link href={`/admin/leads/${selectedLead.id}`}>
                <Button variant="outline" size="sm" className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl font-bold text-xs tracking-tight shadow-2xs gap-1.5 py-4.5 px-4 bg-white dark:bg-slate-900">
                  <ExternalLink className="h-3.5 w-3.5 text-slate-500" /> CRM Profile
                </Button>
              </Link>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingMessages ? (
                 <div className="flex flex-col justify-center items-center h-full space-y-2">
                   <Loader2 className="animate-spin text-blue-600 dark:text-blue-400 h-6 w-6" />
                   <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Syncing logs...</span>
                 </div>
              ) : (
                messages.map((msg) => <div key={msg.id}>{renderMessageBubble(msg)}</div>)
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input & Quick Reply Chips */}
            <div className="flex flex-col bg-white dark:bg-slate-900 border-t border-slate-200/60 dark:border-slate-800">
                <div className="px-4 py-2.5 bg-slate-50/50 dark:bg-slate-950/20 flex gap-2 overflow-x-auto border-b border-slate-100 dark:border-slate-850 scrollbar-none">
                  {[
                     "👋 Hi, I tried calling you.",
                     "📄 Kindly share your Aadhar & PAN.",
                     "📍 Can you send your current Address?",
                     "✅ Application Approved!"
                  ].map((text) => (
                     <button
                       key={text}
                       onClick={() => setInputText(text)}
                       className="text-xs bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-full px-3 py-1.5 hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap transition-all shadow-3xs"
                     >
                       {text}
                     </button>
                  ))}
                </div>

                <div className="p-4 flex items-center gap-3">
                  <div className="bg-slate-100 dark:bg-slate-850 p-2.5 rounded-xl text-slate-500 border border-slate-200/50 dark:border-slate-800/80 shadow-3xs" title="Secured System Tunnel">
                    <ShieldAlert className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <Input 
                    className="flex-1 bg-slate-50/50 dark:bg-slate-950 border-slate-200/60 dark:border-slate-850 rounded-xl shadow-3xs h-12 text-sm font-semibold focus-visible:ring-blue-500/20"
                    placeholder="Type a message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    disabled={sending}
                  />
                  <Button onClick={handleSend} disabled={!inputText.trim() || sending} className="bg-blue-600 hover:bg-blue-700 h-11 w-11 rounded-full p-0 flex items-center justify-center shadow-sm">
                    {sending ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4 ml-0.5" />}
                  </Button>
                </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/30 dark:bg-slate-950/10 p-6 text-center animate-in fade-in duration-300">
            <div className="h-20 w-20 bg-blue-600/10 border border-blue-500/10 rounded-3xl flex items-center justify-center mb-5 shadow-sm">
               <MessageSquare className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-850 dark:text-slate-100 mb-1.5 tracking-tight">WhatsApp Administrator</h2>
            <p className="text-xs font-semibold text-slate-450 dark:text-slate-500 max-w-[280px] leading-relaxed">Select a conversation thread from the sidebar to inspect activity logs and respond to client inquiries.</p>
          </div>
        )}
      </div>
    </div>
    </ModuleGuard>
  )
}
