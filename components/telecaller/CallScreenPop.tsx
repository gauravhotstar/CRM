"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { PhoneIncoming } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function CallScreenPop({ agentId }: { agentId: string }) {
  const router = useRouter()

  useEffect(() => {
    if (!agentId) return;
    
    const supabase = createClient()
    
    // Listen for CloudConnect broadcasts
    const channel = supabase.channel('cloudconnect_events')
      .on(
        'broadcast',
        { event: 'SCREEN_POP' },
        (payload) => {
          const data = payload.payload;
          
          // NOTE: In production, check if data.extension matches the current agent's extension
          // For now, we will pop it for testing.
          
          // Show the screen pop toast
          toast.custom((t) => (
            <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 shadow-2xl rounded-xl p-4 w-[350px] flex flex-col gap-3 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-green-500 animate-pulse"></div>
              <div className="flex items-center gap-3">
                <div className="bg-green-100 dark:bg-green-900/40 p-2.5 rounded-full relative">
                  <div className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-20"></div>
                  <PhoneIncoming className="h-5 w-5 text-green-600 dark:text-green-400 relative z-10" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">Incoming Call Ringing...</h4>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                    {data.lead ? data.lead.name : "Unknown Caller"} 
                  </p>
                  <p className="text-xs text-slate-500">
                    {data.caller_number}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2 justify-end mt-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => toast.dismiss(t)}
                  className="h-8 text-xs"
                >
                  Dismiss
                </Button>
                {data.lead && (
                  <Button 
                    size="sm" 
                    className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs"
                    onClick={() => {
                      toast.dismiss(t);
                      router.push(`/telecaller/leads/${data.lead.id}`);
                    }}
                  >
                    View Profile
                  </Button>
                )}
                {!data.lead && (
                  <Button 
                    size="sm" 
                    className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs"
                    onClick={() => {
                      toast.dismiss(t);
                      router.push(`/telecaller/leads/new?phone=${data.caller_number}`);
                    }}
                  >
                    Create Lead
                  </Button>
                )}
              </div>
            </div>
          ), { duration: 20000, position: "top-right", id: `call-${data.call_uuid}` });
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router, agentId])

  return null // Purely a logic component that triggers toasts
}
