"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Search, Send, User, Check, CheckCheck, 
  Loader2, MessageSquare, Bot, ExternalLink, ShieldAlert, Filter,
  Download, FileText, File, Image as ImageIcon, ArrowLeft
} from "lucide-react"
import { sendWhatsAppText } from "@/app/actions/whatsapp"
import Link from "next/link"

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
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: leadsData } = await supabase
      .from('leads')
      .select('id, name, phone, status, last_message_at, unread_count, assigned_to, created_at, last_message_content, last_message_type')
      .eq('assigned_to', user.id) // ONLY fetch leads assigned to this telecaller
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

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = textToDisplay.match(urlRegex);

    if (!msg.media_url && urls && urls.length > 0) {
      extractedUrl = urls[0];
      textToDisplay = textToDisplay.replace(extractedUrl, '').trim();
      isImage = !!extractedUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i);
      isPDF = !!extractedUrl.match(/\.(pdf)(\?.*)?$/i);
      fileName = extractedUrl.split('/').pop()?.split('?')[0] || "Document";
    }

    const finalMediaUrl = msg.media_url || extractedUrl;
    const finalIsImage = msg.media_url ? msg.media_type?.startsWith('image/') : isImage;
    const finalIsPDF = msg.media_url ? msg.media_type === 'application/pdf' : isPDF;
    const finalFileName = msg.file_name || fileName;

    return (
      <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[85%] md:max-w-[70%] min-w-[120px] rounded-lg p-3 shadow-sm relative group flex flex-col gap-2
          ${isOutbound ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-none' : 'bg-white text-slate-900 rounded-tl-none'}`}
        >
          {isTemplate && (
             <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 mb-1 border-b pb-1 border-slate-200/50 uppercase tracking-wider">
               <Bot className="h-3 w-3" /> Automated Template
             </div>
          )}
          
          {textToDisplay && (
            <p className="whitespace-pre-wrap text-[14px] md:text-[15px] leading-relaxed break-words">
              {textToDisplay.split(/(\*[^*]+\*)/g).map((part, index) =>
                part.startsWith('*') && part.endsWith('*') ? (
                  <strong key={index} className="font-bold text-black">{part.slice(1, -1)}</strong>
                ) : ( part )
              )}
            </p>
          )}

          {finalMediaUrl && (
            finalIsImage ? (
              <div className="relative group rounded-md overflow-hidden border border-black/10 bg-black/5 self-start w-full sm:w-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={finalMediaUrl} alt="Attached Media" className="max-w-full max-h-48 md:max-h-64 object-contain rounded-md block" />
                <a 
                  href={finalMediaUrl} download target="_blank" rel="noopener noreferrer" 
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 p-2 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Download Image"
                >
                  <Download size={16} />
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 md:gap-3 bg-black/5 p-2 rounded-md border border-black/10 hover:bg-black/10 transition-colors w-full">
                <div className={`p-2 rounded-md ${finalIsPDF ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                   {/* FIXED: Replaced invalid md:size props with Tailwind classes */}
                   {finalIsPDF ? <FileText className="w-4 h-4 md:w-5 md:h-5" /> : <File className="w-4 h-4 md:w-5 md:h-5" />}
                </div>
                <div className="flex-1 min-w-0 pr-1 md:pr-2">
                  <p className="text-[12px] md:text-[13px] font-medium truncate text-slate-800" title={finalFileName}>{finalFileName}</p>
                  <p className="text-[9px] md:text-[10px] text-slate-500 uppercase">{finalIsPDF ? 'PDF Document' : 'File Attachment'}</p>
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
            <span className="text-[9px] md:text-[10px] text-slate-500 font-medium">
              {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </span>
            {isOutbound && (
              <span className="flex items-center">
                {msg.status === 'read' ? <CheckCheck size={14} className="text-blue-500" /> : 
                 msg.status === 'delivered' ? <CheckCheck size={14} className="text-gray-400" /> : 
                 <Check size={14} className="text-gray-400" />}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    // Changed to 100dvh for better mobile browser support, and removed standard margins for full mobile bleed if needed
    <div className="flex h-[calc(100dvh-5rem)] md:h-[calc(100vh-6rem)] bg-white md:border md:rounded-xl md:shadow-lg overflow-hidden">
      
      {/* --- LEFT SIDEBAR: LEAD LIST --- */}
      {/* Hides on mobile if a lead is selected */}
      <div className={`w-full md:w-1/3 border-r bg-slate-50 flex-col h-full ${selectedLead ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-3 md:p-4 bg-[#005c4b] text-white flex items-center justify-between shrink-0">
          <h2 className="font-bold flex items-center gap-2"><MessageSquare className="h-5 w-5" /> All Chats</h2>
          <Badge variant="outline" className="bg-white/20 text-white border-none">{leads.length}</Badge>
        </div>

        {/* Search & Filter */}
        <div className="p-3 border-b bg-white space-y-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search..." 
              className="pl-9 bg-slate-100 border-none h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all flex items-center gap-2 w-max ${
                showUnreadOnly ? 'bg-green-100 border-green-500 text-green-700 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <Filter className="h-3 w-3" /> {showUnreadOnly ? "Filter: Unread Only" : "Show All Chats"}
            </button>
        </div>

        {/* Lead List */}
        <div className="flex-1 overflow-y-auto">
          {loadingLeads ? (
            <div className="flex justify-center p-10"><Loader2 className="animate-spin text-[#005c4b]" /></div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center p-10 text-slate-500 text-sm">No chats found.</div>
          ) : (
            filteredLeads.map(lead => (
              <div 
                key={lead.id} 
                onClick={() => setSelectedLead(lead)}
                className={`p-3 md:p-4 border-b cursor-pointer transition-all hover:bg-slate-50 ${
                  selectedLead?.id === lead.id ? 'bg-blue-50 border-l-4 border-l-[#005c4b]' : 'border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className={`font-semibold truncate pr-2 text-[15px] ${lead.unread_count > 0 ? 'text-slate-900 font-bold' : 'text-slate-700'}`}>
                    {lead.name}
                  </h3>
                  <span className={`text-[10px] md:text-[11px] whitespace-nowrap pt-1 ${lead.unread_count > 0 ? 'text-green-600 font-bold' : 'text-slate-400'}`}>
                    {lead.last_message_at 
                      ? new Date(lead.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })
                      : "New"
                    }
                  </span>
                </div>

                <div className="flex items-center gap-1 mb-2">
                    {lead.last_message_type === 'outbound' ? (
                       <CheckCheck className="h-3 w-3 md:h-4 md:w-4 text-blue-500 shrink-0" />
                    ) : (
                       <div className="h-2 w-2 rounded-full bg-green-500 shrink-0 animate-pulse"></div>
                    )}
                    <p className={`text-xs md:text-[13px] truncate max-w-[200px] md:max-w-[180px] ${lead.unread_count > 0 ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                      {lead.last_message_content?.replace(/(https?:\/\/[^\s]+)/g, '📎 Attachment') || "Attachment"}
                    </p>
                </div>

                <div className="flex justify-between items-center mt-1">
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] md:text-[10px] h-4 md:h-5 px-1.5 bg-white text-slate-500 border-slate-200">
                        {lead.telecaller_name?.split(' ')[0]} 
                    </Badge>
                  </div>
                  {lead.unread_count > 0 && (
                    <div className="bg-[#25D366] text-white text-[10px] font-bold h-4 md:h-5 min-w-[16px] md:min-w-[20px] px-1 flex items-center justify-center rounded-full shadow-sm">{lead.unread_count}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- RIGHT SIDEBAR: CHAT WINDOW --- */}
      {/* Hides on mobile if no lead is selected */}
      <div className={`w-full md:w-2/3 flex-col bg-[#efeae2] h-full ${!selectedLead ? 'hidden md:flex' : 'flex'}`}>
        {selectedLead ? (
          <>
            {/* Rich Header */}
            <div className="bg-white px-3 md:px-6 py-2 md:py-3 border-b flex items-center justify-between shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-2 md:gap-4">
                {/* Mobile Back Button */}
                <button 
                  onClick={() => setSelectedLead(null)}
                  className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                <div className="h-9 w-9 md:h-10 md:w-10 bg-[#005c4b] text-white rounded-full flex items-center justify-center font-bold text-base md:text-lg shrink-0">
                  {selectedLead.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 text-sm md:text-lg flex items-center gap-2 truncate">
                    <span className="truncate">{selectedLead.name}</span>
                    <span className={`text-[9px] md:text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                        selectedLead.status === 'New' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                    }`}>{selectedLead.status}</span>
                  </h2>
                  <div className="flex items-center gap-2 text-[11px] md:text-xs text-slate-500 truncate">
                    <span>{selectedLead.phone}</span>
                    <span className="h-3 w-[1px] bg-slate-300"></span>
                    <span className="truncate">Owner: <strong>{selectedLead.telecaller_name}</strong></span>
                  </div>
                </div>
              </div>
              <Link href={`/admin/leads/${selectedLead.id}`}>
                <Button variant="outline" size="sm" className="border-green-600 text-green-700 hover:bg-green-50 gap-1 md:gap-2 h-8 px-2 md:px-3">
                  <ExternalLink className="h-3 w-3 md:h-4 md:w-4" /> 
                  <span className="hidden sm:inline">CRM Profile</span>
                </Button>
              </Link>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {loadingMessages ? (
                 <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-[#005c4b]" /></div>
              ) : (
                messages.map((msg) => <div key={msg.id}>{renderMessageBubble(msg)}</div>)
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input & Quick Reply Chips */}
            <div className="flex flex-col bg-[#f0f2f5] shrink-0">
                 <div className="px-3 md:px-4 py-2 bg-gray-50 flex gap-2 overflow-x-auto border-t hide-scrollbar">
                 {[
                    "👋 Hi, I tried calling you.",
                    "📄 Kindly share your Aadhar & PAN.",
                    "📍 Can you send your current Address?",
                    "✅ Application Approved!"
                 ].map((text) => (
                    <button
                      key={text}
                      onClick={() => setInputText(text)}
                      className="text-[11px] md:text-xs bg-white border border-gray-300 rounded-full px-3 py-1.5 hover:bg-green-50 hover:border-green-500 hover:text-green-700 whitespace-nowrap transition-colors shrink-0 shadow-sm"
                    >
                      {text}
                    </button>
                 ))}
                </div>

                <div className="p-2 md:p-4 flex items-center gap-2 md:gap-3 bg-white md:bg-transparent">
                  <div className="bg-slate-200 p-2 rounded text-slate-500 hidden sm:block" title="Admin Mode">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <Input 
                    className="flex-1 bg-white md:border-none shadow-sm h-10 md:h-12 text-[15px] md:text-base rounded-full md:rounded-md px-4"
                    placeholder="Message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    disabled={sending}
                  />
                  <Button 
                    onClick={handleSend} 
                    disabled={!inputText.trim() || sending} 
                    className="bg-[#005c4b] hover:bg-[#064e40] h-10 w-10 md:h-12 md:w-12 rounded-full p-0 shrink-0"
                  >
                    {sending ? <Loader2 className="animate-spin h-4 w-4 md:h-5 md:w-5" /> : <Send className="h-4 w-4 md:h-5 md:w-5 md:ml-1 ml-0.5" />}
                  </Button>
                </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-[#f8f9fa]">
            <div className="h-20 w-20 md:h-24 md:w-24 bg-slate-200 rounded-full flex items-center justify-center mb-6">
               <MessageSquare className="h-8 w-8 md:h-10 md:w-10 text-slate-400" />
            </div>
            <h2 className="text-xl md:text-2xl font-light text-slate-600 mb-2">WhatsApp Inbox</h2>
            <p className="text-sm md:text-base">Select a chat to view history and status.</p>
          </div>
        )}
      </div>
    </div>
  )
}
