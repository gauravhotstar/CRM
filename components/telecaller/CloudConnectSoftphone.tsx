"use client"

import { useState, useEffect } from "react"
import { createAgentSession } from "@/app/actions/cloudconnect"
import { Phone, X, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CloudConnectSoftphone({ agentId }: { agentId: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!agentId) return;
    
    async function initSession() {
      const res = await createAgentSession(agentId)
      if (res.success && res.sessionId) {
        setSessionId(res.sessionId)
        localStorage.setItem("cc_session_id", res.sessionId)
      } else {
        setError(res.error || "Failed to initialize softphone")
      }
    }
    initSession()
  }, [agentId])

  if (error) {
     console.error("Softphone Error:", error);
     return null;
  }

  if (!isOpen) {
    return (
      <Button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl bg-indigo-600 hover:bg-indigo-700 z-50 flex items-center justify-center animate-bounce"
        title="Open Dialer"
      >
        <Phone className="h-6 w-6 text-white" />
      </Button>
    )
  }

  // Use the URL from the API documentation
  const sessionUrl = `https://crm5.cloud-connect.in/Agent_plugin/login.php?session=${sessionId}`

  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-50 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all duration-300 flex flex-col",
      isMinimized ? "h-14 w-72" : "h-[550px] w-[350px]"
    )}>
      {/* Header */}
      <div className="bg-indigo-600 text-white px-4 py-3 flex justify-between items-center cursor-pointer shrink-0" onClick={() => setIsMinimized(!isMinimized)}>
        <div className="flex items-center gap-2 font-medium text-sm">
          <Phone className="h-4 w-4" /> CloudConnect Dialer
        </div>
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized) }} className="hover:bg-indigo-500 p-1.5 rounded transition-colors">
            <Minus className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setIsOpen(false) }} className="hover:bg-rose-500 bg-rose-600 p-1.5 rounded transition-colors ml-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Iframe Body */}
      {!isMinimized && (
        <div className="flex-1 w-full bg-slate-50 dark:bg-slate-950 relative">
          {sessionId ? (
             <iframe
               id="CloudConnectPluginIFrame"
               src={sessionUrl}
               allow="geolocation; microphone; camera"
               allowFullScreen
               className="w-full h-full border-0 absolute inset-0"
             />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-500 animate-pulse">
              Connecting to CloudConnect...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
