"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Check, CheckCheck, Loader2, Download, FileText, File } from "lucide-react"
import { sendWhatsAppText } from "@/app/actions/whatsapp"

interface ChatMessage {
  id: string
  direction: 'inbound' | 'outbound'
  content: string | null
  status: string
  created_at: string
  media_url?: string | null     
  media_type?: string | null    
  file_name?: string | null     
}

export function WhatsAppChat({ leadId, phone }: { leadId: string, phone: string }) {
  // Temporarily turned off in telecaller panel
  return null;

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
      
      if (!error && data) setMessages(data)
      setLoading(false)
      scrollToBottom()
    }

    fetchMessages()

    const channel = supabase
      .channel('chat_updates')
      .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'chat_messages',
          filter: `lead_id=eq.${leadId}` 
      }, (payload: any) => {
          setMessages(prev => [...prev, payload.new as ChatMessage])
          scrollToBottom()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leadId, supabase])

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
  }

  const handleSend = async () => {
    if (!inputText.trim() || sending) return
    setSending(true)
    const textToSend = inputText
    setInputText("") 
    
    const res = await sendWhatsAppText(leadId, phone, textToSend)
    if (!res.success) {
        alert("Failed to send message: " + res.error)
        setInputText(textToSend) 
    }
    setSending(false)
  }

  // --- RENDER HELPER FOR MESSAGES & MEDIA ---
  const renderMessageBubble = (msg: ChatMessage) => {
    const isOutbound = msg.direction === 'outbound'
    
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
        <div className={`max-w-[85%] min-w-[100px] rounded-lg p-2 px-3 text-sm shadow-sm relative group flex flex-col gap-1.5
          ${isOutbound ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-none' : 'bg-white text-slate-900 rounded-tl-none'}`}
        >
          {textToDisplay && <p className="whitespace-pre-wrap leading-relaxed">{textToDisplay}</p>}

          {finalMediaUrl && (
            finalIsImage ? (
              <div className="relative group rounded-md overflow-hidden border border-black/10 bg-black/5 self-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={finalMediaUrl} alt="Attached Media" className="max-w-full max-h-48 object-contain rounded-md block" />
                <a 
                  href={finalMediaUrl} download target="_blank" rel="noopener noreferrer" 
                  className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Download Image"
                >
                  <Download size={14} />
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-black/5 p-2 rounded-md border border-black/10 hover:bg-black/10 transition-colors w-full">
                <div className={`p-1.5 rounded-md ${finalIsPDF ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                   {finalIsPDF ? <FileText size={18} /> : <File size={18} />}
                </div>
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-xs font-medium truncate text-slate-800" title={finalFileName}>{finalFileName}</p>
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
            <span className="text-[10px] text-slate-500">
              {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </span>
            {isOutbound && (
              <span className="text-[#53bdeb]">
                {msg.status === 'read' ? <CheckCheck size={12}/> : <Check size={12} className="text-slate-400"/>}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[500px] border rounded-lg bg-[#efeae2]">
      {/* Header */}
      <div className="bg-[#005c4b] text-white p-3 font-semibold flex items-center gap-3 rounded-t-lg">
         <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center text-slate-700">👤</div>
         <div>
            <p className="text-sm">WhatsApp Chat</p>
            <p className="text-xs text-green-100">{phone}</p>
         </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
           <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-green-700" /></div>
        ) : messages.length === 0 ? (
           <div className="text-center text-slate-500 text-sm mt-10 bg-white/50 p-2 rounded mx-auto w-fit">No messages yet. Start the conversation!</div>
        ) : (
          messages.map((msg) => <div key={msg.id}>{renderMessageBubble(msg)}</div>)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="bg-[#f0f2f5] p-3 rounded-b-lg flex items-center gap-2">
        <Input 
          className="flex-1 bg-white border-none shadow-sm focus-visible:ring-1 focus-visible:ring-green-500"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={sending}
        />
        <Button 
          size="icon" 
          onClick={handleSend} 
          disabled={!inputText.trim() || sending}
          className="bg-[#005c4b] hover:bg-[#064e40] rounded-full h-10 w-10 shrink-0"
        >
          {sending ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4 ml-1" />}
        </Button>
      </div>
    </div>
  )
}
