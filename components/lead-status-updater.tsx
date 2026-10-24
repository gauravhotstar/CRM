"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"  
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog" // <-- ADDED DIALOG
import { 
  Phone, Clock, MessageSquare, IndianRupee, AlertCircle, Sparkles, 
  Copy, RotateCcw, ThumbsUp, ThumbsDown, 
  FileText, LogIn, CheckCircle2, XCircle, PhoneForwarded, 
  PhoneMissed, Briefcase, X, Activity, ArrowRight, Loader2, Command,
  Calculator // <-- ADDED CALCULATOR ICON
} from "lucide-react" 
import { useCallTracking } from "@/context/call-tracking-context"
import { toast } from "sonner"
import { ScheduleFollowUpModal } from "./schedule-follow-up-modal" 
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// --- IMPORT THE SERVER ACTIONS ---
import { sendMissedCallMessage, sendKYCRequestTemplate } from "@/app/actions/whatsapp" 
import { useTenant, useMasterStatuses } from "@/context/tenant-provider"
import { MASTER_STATUSES, DEFAULT_WORKFLOW_TRIGGERS, resolveIcon } from "@/lib/lead-statuses"

interface LeadStatusUpdaterProps {
  leadId: string
  currentStatus: string
  onStatusUpdate?: (newStatus: string, note?: string, callbackDate?: string) => void
  isCallInitiated?: boolean 
  onCallLogged?: (callLogId: string) => void 
  initialLoanAmount?: number | null 
  leadPhoneNumber: string | null | undefined
  telecallerName: string | null | undefined
  onNextLead?: () => void 
}

// Statuses are now fetched from MASTER_STATUSES

const QUICK_NOTES = ["No Answer", "Busy", "Switch Off", "Call Later", "Wrong Number", "Docs Pending", "Rate Issue"];
const QUICK_AMOUNTS = [
    { label: "5L", value: 500000 },
    { label: "10L", value: 1000000 },
    { label: "20L", value: 2000000 },
    { label: "50L", value: 5000000 },
];

export function classifySentiment(remarks: string, status: string): string | null {
  const text = (remarks || "").toLowerCase().trim();
  
  const hasCallback = status === "follow_up" || text.includes("callback") || text.includes("call back") || text.includes("later") || text.includes("schedule");
  const hasNegative = text.includes("not interested") || text.includes("angry") || text.includes("stop calling") || text.includes("abuse") || text.includes("remove") || text.includes("don't call") || text.includes("no call") || text.includes("refused") || text.includes("block");
  const hasPositive = text.includes("interested") || text.includes("docs pending") || text.includes("apply") || text.includes("want loan") || text.includes("loan required") || text.includes("highly interested") || text.includes("yes") || text.includes("ready") || text.includes("positive");
  const hasCold = text.includes("nr") || text.includes("no response") || text.includes("busy") || text.includes("disconnected") || text.includes("switch off") || text.includes("no answer") || text.includes("wrong number") || text.includes("unreachable") || text.includes("ringing");

  if (hasNegative) return "Do Not Call 🚫";
  if (hasPositive) return "Hot Prospect 🔥";
  if (hasCold) return "Cold Lead ❄️";
  if (hasCallback) return "Callback Scheduled ⏰";
  
  if (status === "Interested" || status === "Login Done" || status === "Disbursed") {
    return "Hot Prospect 🔥";
  }
  if (status === "Not_Interested" || status === "not_eligible") {
    return "Do Not Call 🚫";
  }
  if (status === "nr") {
    return "Cold Lead ❄️";
  }
  if (status === "follow_up") {
    return "Callback Scheduled ⏰";
  }

  return null;
}

export function LeadStatusUpdater({ 
  leadId, 
  currentStatus, 
  onStatusUpdate,
  isCallInitiated = false,
  onCallLogged,
  initialLoanAmount = null,
  leadPhoneNumber = "",
  telecallerName = "Telecaller",
  onNextLead
}: LeadStatusUpdaterProps) {
  const org = useTenant()
  const masterStatuses = useMasterStatuses()
  const currentMasterStatuses = masterStatuses.length > 0 ? masterStatuses : MASTER_STATUSES
  const enabledStatusValues = org?.enabled_statuses || currentMasterStatuses.map(s => s.value)
  const workflowTriggers = org?.workflow_triggers || DEFAULT_WORKFLOW_TRIGGERS

  const availableStatusOptions = useMemo(() => {
    return currentMasterStatuses.filter(s => enabledStatusValues.includes(s.value))
  }, [enabledStatusValues, currentMasterStatuses])

  const supabase = createClient()
  const { activeCall, endCall, updateCallDuration } = useCallTracking()

  // STATE
  const [status, setStatus] = useState("")
  const [isUpdating, setIsUpdating] = useState(false)
  const [note, setNote] = useState("") 
  const [remarks, setRemarks] = useState("") 
  const [loanAmount, setLoanAmount] = useState<number | null>(initialLoanAmount)
  const [isModalOpen, setIsModalOpen] = useState(false) 
  
  // PERSISTENCE STATE
  const [autoNext, setAutoNext] = useState(true)
  
  // DIALER STATE
  const [elapsedTime, setElapsedTime] = useState(0)
  const [callDurationOverride, setCallDurationOverride] = useState<number | null>(null) 
   
  const [notEligibleReason, setNotEligibleReason] = useState<string>("")
  const [isSendingMissedCall, setIsSendingMissedCall] = useState(false) 

  // --- EMI CALCULATOR STATE ---
  const [emiRate, setEmiRate] = useState<number>(10.5)
  const [emiTenure, setEmiTenure] = useState<number>(60) // in months

  // Calculate EMI dynamically
  const calculatedEMI = useMemo(() => {
    if (!loanAmount || !emiRate || !emiTenure) return 0;
    const p = loanAmount;
    const r = emiRate / 12 / 100; // monthly interest rate
    const n = emiTenure;
    return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }, [loanAmount, emiRate, emiTenure]);
  
  // DERIVED STATE
  const currentStatusOption = useMemo(() => currentMasterStatuses.find((o) => o.value === currentStatus), [currentStatus, currentMasterStatuses])
  const selectedStatusOption = useMemo(() => currentMasterStatuses.find((o) => o.value === status), [status, currentMasterStatuses])
   
  const whatsappLink = useMemo(() => {
      let cleaned = String(leadPhoneNumber || "").replace(/[^0-9]/g, '');
      if (!cleaned) return "#"; 
      
      if (cleaned.length === 10) {
          cleaned = `91${cleaned}`;
      }
      
      const message = `Hi, this is ${telecallerName} from ICICI Bank. Regarding your loan application...`;
      return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
  }, [leadPhoneNumber, telecallerName]);

  const isWhatsappEnabled = whatsappLink !== "#";
  const hasUnsavedChanges = status !== "" || remarks !== "" || (loanAmount !== initialLoanAmount);
  const isRevenueStatus = status === workflowTriggers.on_login_done || status === workflowTriggers.on_revenue_marked;
  const isLoanAmountMissing = isRevenueStatus && (!loanAmount || loanAmount <= 0);

  // --- EFFECTS ---

  useEffect(() => {
    const saved = localStorage.getItem("crm_auto_next");
    if (saved !== null) setAutoNext(saved === "true");
  }, []);

  const toggleAutoNext = (checked: boolean) => {
    setAutoNext(checked);
    localStorage.setItem("crm_auto_next", String(checked));
  }
  
  useEffect(() => { 
    setLoanAmount(initialLoanAmount);
    handleReset();
  }, [leadId, initialLoanAmount]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCallInitiated && !callDurationOverride) {
        const startTime = new Date(activeCall?.startTime || Date.now()).getTime();
        interval = setInterval(() => {
            const seconds = Math.floor((Date.now() - startTime) / 1000);
            setElapsedTime(seconds);
        }, 1000);
    } else if (!isCallInitiated && elapsedTime > 0 && elapsedTime < 10 && !status) {
        setStatus("nr");
        toast.info("Short call detected", { description: "Auto-selected 'No Response'" });
    }
    return () => clearInterval(interval);
  }, [isCallInitiated, activeCall, callDurationOverride]);

  useEffect(() => {
    if (status !== 'not_eligible') {
      setNotEligibleReason("")
      if (status && !isUpdating) setNote("")
    }
  }, [status, isUpdating]);

  // --- HANDLERS ---

  const handleMissedCallWA = async () => {
    if (!leadPhoneNumber) return;
    setIsSendingMissedCall(true);
    try {
      const result = await sendMissedCallMessage(leadId, leadPhoneNumber); 
      if (result.success) {
        toast.success("Missed call WhatsApp sent!");
        if(!status) setStatus('nr'); 
      } else {
        toast.error("Failed to send: " + result.error);
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSendingMissedCall(false);
    }
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return { m, s };
  }

  const formatCurrency = (value: number | null) => {
    if (value === null || isNaN(value)) return "";
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  }

  const handleManualTimeChange = (type: 'min' | 'sec', val: string) => {
    const num = val === "" ? 0 : parseInt(val);
    const current = formatTime(callDurationOverride ?? elapsedTime);
    let newM = parseInt(current.m);
    let newS = parseInt(current.s);

    if (type === 'min') newM = num;
    if (type === 'sec') newS = num > 59 ? 59 : num;

    setCallDurationOverride((newM * 60) + newS);
  }

  const handleNotEligibleReasonChange = (reason: string) => {
    setNotEligibleReason(reason)
    setNote(reason === "Other" ? "" : reason) 
  }

  const handleQuickNote = (text: string) => {
      setRemarks(prev => {
          const trimmed = prev.trim();
          if (!trimmed) return text;
          if (trimmed.endsWith(',') || trimmed.endsWith('.')) return `${trimmed} ${text}`;
          return `${trimmed}, ${text}`;
      });
  }

  const handleQuickSchedule = (type: '1hr' | 'evening' | 'tomorrow') => {
    setIsModalOpen(true); 
  }

  const handleQuickAmount = (amount: number) => {
      setLoanAmount(amount);
  }

  const handleCopyNumber = () => {
    if (leadPhoneNumber) {
        navigator.clipboard.writeText(leadPhoneNumber);
        toast.success("Number copied to clipboard");
    }
  }

  const handleReset = () => {
      setStatus("");
      setRemarks("");
      setNote("");
      setLoanAmount(initialLoanAmount);
      setNotEligibleReason("");
      setCallDurationOverride(null);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleStatusUpdate();
    }
  }

  // --- CORE ACTIONS ---
  const handleStatusUpdate = async (statusOverride?: any) => {
    const activeStatus = typeof statusOverride === 'string' ? statusOverride : status
    if (!activeStatus) { toast.error("Status Required", { description: "Please select a status." }); return }
    if (activeStatus === "not_eligible" && !note.trim()) { toast.error("Reason Required", { description: "Specify why not eligible." }); return }
    if (activeStatus === "follow_up") { setIsModalOpen(true); return }
    
    const isRevenueStatus = activeStatus === workflowTriggers.on_login_done || activeStatus === workflowTriggers.on_revenue_marked;
    const isLoanAmountMissing = isRevenueStatus && (!loanAmount || loanAmount <= 0);
    if (isLoanAmountMissing) { toast.error("Loan Amount Required", { description: "Please enter a valid loan amount for this status." }); return; }
      
    const finalDuration = callDurationOverride ?? elapsedTime;
    if (isCallInitiated && activeStatus !== 'nr' && finalDuration <= 0) {
        toast.error("Invalid Duration", { description: "Call duration must be > 0 seconds." }); return
    }

    setIsUpdating(true)
    try {
      const updateData: any = { 
        status: activeStatus, 
        last_contacted: new Date().toISOString() 
      }
      
      if (loanAmount !== null && !isNaN(loanAmount)) updateData.loan_amount = loanAmount
      if (remarks.trim()) updateData.notes = remarks
      if (activeStatus === "not_eligible" && note.trim()) {
        updateData.notes = updateData.notes ? `${updateData.notes}\n\nNot Eligible: ${note}` : `Not Eligible: ${note}`
      }

      // Get new sentiment tag
      const newSentimentTag = classifySentiment(remarks, activeStatus);
      
      // Fetch current tags
      const { data: leadData } = await supabase
        .from("leads")
        .select("tags")
        .eq("id", leadId)
        .single();
      const currentTags: string[] = Array.isArray(leadData?.tags) ? leadData.tags : [];
      const cleanTags = currentTags.filter(t => !["Hot Prospect 🔥", "Do Not Call 🚫", "Cold Lead ❄️", "Callback Scheduled ⏰"].includes(t));
      if (newSentimentTag) {
        cleanTags.push(newSentimentTag);
      }
      updateData.tags = cleanTags;

      // 1. UPDATE SUPABASE DATABASE
      const { error } = await supabase.from("leads").update(updateData).eq("id", leadId)
      if (error) throw error;
      
      onStatusUpdate?.(activeStatus, note) 

      // Always log a call for every status update
      await logCall(activeStatus, finalDuration)

      // 2. WHATSAPP AUTOMATION
      if ((activeStatus === workflowTriggers.on_document_request || activeStatus === "Interested") && leadPhoneNumber) {
          toast.info("Sending KYC Document Request via WhatsApp...");
          const kycResult = await sendKYCRequestTemplate(leadId, leadPhoneNumber);
          
          if (kycResult.success) {
              toast.success("KYC WhatsApp Template sent securely!");
              
              if (activeStatus === "Interested") {
                  if(window.confirm("Automated KYC list sent. Open WhatsApp web to send a personal message too?")) {
                      let manualClean = leadPhoneNumber.replace(/\D/g, '');
                      if (manualClean.length === 10) manualClean = `91${manualClean}`;
                      const msg = `Hi ${telecallerName ? telecallerName : "there"}, glad you're interested in the loan! I just sent over the required documents list.`;
                      const wUrl = `https://wa.me/${manualClean}?text=${encodeURIComponent(msg)}`;
                      window.open(wUrl, '_blank');
                  }
              }

          } else {
              toast.error("Failed to send automated KYC template.");
          }
      } else if (activeStatus === "nr" && leadPhoneNumber) {
          toast.info("Sending Missed Call WhatsApp template...");
          const nrResult = await sendMissedCallMessage(leadId, leadPhoneNumber);
          if (nrResult.success) {
              toast.success("Missed Call WhatsApp template sent!");
          } else {
              toast.error("Failed to send automated Missed Call template: " + nrResult.error);
          }
      }
      
      // Reset UI state
      setNote(""); setRemarks(""); setCallDurationOverride(null); setElapsedTime(0); setNotEligibleReason(""); setStatus("");
      toast.success("Updated successfully!")

      if (autoNext && onNextLead) {
        onNextLead(); 
      }

    } catch (error: any) {
      console.error(error); toast.error(`Update failed: ${error.message}`)
    } finally {
      setIsUpdating(false)
    }
  }

  const updateLeadStatusToFollowUp = async () => {
    try {
      const updateData: any = { status: "follow_up", last_contacted: new Date().toISOString() }
      if (remarks.trim()) updateData.notes = remarks

      // Get new sentiment tag
      const newSentimentTag = classifySentiment(remarks || "Callback scheduled", "follow_up");
      
      // Fetch current tags
      const { data: leadData } = await supabase
        .from("leads")
        .select("tags")
        .eq("id", leadId)
        .single();
      const currentTags: string[] = Array.isArray(leadData?.tags) ? leadData.tags : [];
      const cleanTags = currentTags.filter(t => !["Hot Prospect 🔥", "Do Not Call 🚫", "Cold Lead ❄️", "Callback Scheduled ⏰"].includes(t));
      if (newSentimentTag) {
        cleanTags.push(newSentimentTag);
      }
      updateData.tags = cleanTags;

      await supabase.from("leads").update(updateData).eq("id", leadId)
      
      // Always log a call for every status update
      await logCall("follow_up", callDurationOverride ?? elapsedTime)

      setStatus("follow_up")
      onStatusUpdate?.("follow_up", note) 
      setRemarks(""); setNote(""); setCallDurationOverride(null); setElapsedTime(0);
      toast.success("Call Back Scheduled.");

      if (autoNext && onNextLead) {
        onNextLead();
      }

    } catch (error) { console.error(error); toast.error("Failed to update status.") }
  }

  const logCall = async (updatedStatus: string, duration: number) => {
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        
        let finalDuration = duration
        if (activeCall && activeCall.leadId === leadId) finalDuration = await updateCallDuration(leadId, "") || duration

        const normalizedStatus = (updatedStatus || "").toLowerCase().trim()
        const isNR = normalizedStatus === "nr"
        const callStatus = isNR ? "no_answer" : "connected"
        const disposition = isNR ? "NOANSWER" : "ANSWERED"
        
        const { data } = await supabase.from("call_logs").insert({
            lead_id: leadId, 
            user_id: user.id, 
            call_type: "outbound", 
            call_status: callStatus,
            disposition: disposition,
            duration_seconds: isNR ? 0 : (finalDuration || 0), 
            notes: remarks || (isNR ? "Status updated to NR (Customer call not received)" : `Status updated to ${updatedStatus}`),
        }).select().single()
        
        if (activeCall && activeCall.leadId === leadId) endCall(leadId)
        if (data && onCallLogged) onCallLogged(data.id)
    } catch (error) { console.error("Call Log Error:", error) }
  }

  const timerDisplay = formatTime(callDurationOverride ?? elapsedTime);
  const formattedLoanAmount = formatCurrency(loanAmount);
  const isButtonDisabled = isUpdating || !status || (status === "not_eligible" && !note.trim()) || isLoanAmountMissing;

  return (
    <Card className="border-l-4 border-l-blue-500 shadow-sm relative overflow-hidden transition-all hover:shadow-md flex flex-col max-h-full">
      {/* Celebration Effect */}
      {status === 'Disbursed' && <div className="absolute inset-0 pointer-events-none bg-emerald-500/10 animate-pulse z-0" />}

      <CardHeader className="flex-none flex flex-row items-center justify-between py-3 bg-slate-50/50">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          {/* Dialer Status Indicator Simplified */}
          <>
            {currentStatusOption ? (() => { const CurrentIcon = resolveIcon(currentStatusOption.icon_name); return <CurrentIcon className="w-5 h-5 text-slate-500" /> })() : <Activity className="w-5 h-5 text-slate-500" />}
            {isCallInitiated ? "Active Call Session" : "Update Status"}
          </>
        </CardTitle>
        <div className="flex gap-1">
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button onClick={handleCopyNumber} className="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors">
                            <Copy className="h-4 w-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent><p>Copy Number</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
            
            {/* Missed Call WA Button */}
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button 
                            onClick={handleMissedCallWA}
                            disabled={isSendingMissedCall || !isWhatsappEnabled}
                            className={cn(
                                "p-2 rounded-full transition-all shadow-sm flex items-center justify-center", 
                                isWhatsappEnabled 
                                    ? "bg-amber-100 hover:bg-amber-200 text-amber-600" 
                                    : "bg-slate-200 text-slate-400 cursor-not-allowed",
                                isSendingMissedCall ? "opacity-60 cursor-not-allowed" : ""
                            )}
                        >
                            {isSendingMissedCall ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <PhoneMissed className="h-4 w-4" />
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent><p>Send Missed Call WA</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <a 
                          href={whatsappLink} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className={cn("p-2 rounded-full transition-all shadow-sm", isWhatsappEnabled ? "bg-green-500 hover:bg-green-600 text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed")}
                          onClick={(e) => !isWhatsappEnabled && e.preventDefault()}
                        >
                            <MessageSquare className="h-4 w-4" /> 
                        </a>
                    </TooltipTrigger>
                    <TooltipContent><p>{isWhatsappEnabled ? "Chat on WhatsApp" : "No Phone Number"}</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-5 pt-4 relative z-10 max-h-[60vh] overflow-y-auto pr-2">
        {/* Current Status & Reset */}
        <div className="flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100">
          <div className="flex items-center gap-2">
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CURRENT</span>
             <Badge className={cn("px-2 py-0.5 text-xs shadow-sm", currentStatusOption?.color)}>{currentStatusOption?.label || currentStatus}</Badge>
          </div>
          {hasUnsavedChanges && (
             <Button variant="ghost" size="sm" onClick={handleReset} className="h-6 px-2 text-[10px] text-slate-500 hover:text-red-500">
                <RotateCcw className="h-3 w-3 mr-1" /> Reset
             </Button>
          )}
        </div>

        {/* Status Selector */}
        <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 uppercase">New Outcome</label>
            {status === "follow_up" && (
                <div className="flex gap-2 mb-2 animate-in slide-in-from-left-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleQuickSchedule('1hr')}>+1 Hr</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleQuickSchedule('evening')}>Evening</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleQuickSchedule('tomorrow')}>Tomorrow</Button>
                </div>
            )}
            <Select value={status} onValueChange={(val) => {
                if (val === "follow_up") setIsModalOpen(true)
                else {
                    setStatus(val)
                    if (val === "nr" || val === "self_employed") {
                        handleStatusUpdate(val)
                    }
                }
            }}>
              <SelectTrigger className={cn("h-10 bg-white transition-colors", status ? "border-blue-300 ring-1 ring-blue-100" : "")}>
                <SelectValue placeholder="Select outcome..." />
              </SelectTrigger>
              <SelectContent>
                {availableStatusOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                        <div className="flex items-center gap-2">
                            {(() => { const OptIcon = resolveIcon(o.icon_name); return <OptIcon className={cn("h-4 w-4", o.color.split(' ')[1])} /> })()}
                            {o.label}
                        </div>
                    </SelectItem>
                ))}
              </SelectContent>
            </Select>
        </div>

        {/* Loan Amount Input & Shortcuts */}
        <div className="space-y-2">
            <div className="flex justify-between items-end">
                <label className="text-xs font-semibold text-slate-700 uppercase flex items-center gap-1">
                    <IndianRupee className="h-3 w-3"/> Loan Amount
                    {isLoanAmountMissing && <span className="text-red-500 text-[10px] ml-1">(Required for {status})</span>}
                    
                    {/* EMI CALCULATOR BUTTON ADDED HERE */}
                    <Dialog>
                       <DialogTrigger asChild>
                          <button className="ml-2 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-800 p-1 rounded transition-colors flex items-center gap-1 px-1.5" title="EMI Calculator">
                             <Calculator className="h-3.5 w-3.5" />
                             <span className="text-[10px] font-bold">EMI</span>
                          </button>
                       </DialogTrigger>
                       <DialogContent className="sm:max-w-[400px]">
                          <DialogHeader>
                             <DialogTitle className="flex items-center gap-2">
                                <Calculator className="h-5 w-5 text-blue-600" />
                                EMI Calculator
                             </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                             <div className="space-y-2">
                                <label className="text-sm font-medium">Loan Amount (₹)</label>
                                <Input 
                                  type="number" 
                                  value={loanAmount || ""} 
                                  onChange={(e) => setLoanAmount(Number(e.target.value))}
                                  className="font-mono"
                                />
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                   <label className="text-sm font-medium">Interest Rate (%)</label>
                                   <Input 
                                     type="number" 
                                     step="0.1"
                                     value={emiRate} 
                                     onChange={(e) => setEmiRate(Number(e.target.value))}
                                     className="font-mono"
                                   />
                                </div>
                                <div className="space-y-2">
                                   <label className="text-sm font-medium">Tenure (Months)</label>
                                   <Input 
                                     type="number" 
                                     value={emiTenure} 
                                     onChange={(e) => setEmiTenure(Number(e.target.value))}
                                     className="font-mono"
                                   />
                                </div>
                             </div>
                             
                             <div className="mt-6 p-4 bg-slate-50 border rounded-lg text-center space-y-1">
                                <p className="text-sm text-slate-500 uppercase font-semibold">Monthly EMI</p>
                                <p className="text-3xl font-bold text-blue-600">{formatCurrency(calculatedEMI)}</p>
                                <p className="text-xs text-slate-400 mt-2">
                                  Total Payment: {formatCurrency(calculatedEMI * emiTenure)}
                                </p>
                             </div>
                          </div>
                       </DialogContent>
                    </Dialog>
                    {/* END EMI CALCULATOR BUTTON */}

                </label>
                {loanAmount && loanAmount > 0 && <span className="text-[10px] text-green-600 font-bold bg-green-50 px-1 rounded">{formattedLoanAmount}</span>}
            </div>
            <Input 
                type="number" 
                placeholder="0.00" 
                value={loanAmount ?? ""} 
                onChange={e => setLoanAmount(e.target.value ? Number(e.target.value) : null)} 
                min="0" 
                className={cn("font-mono", isLoanAmountMissing ? "border-red-500 ring-1 ring-red-100" : "")}
            />
            {/* Quick Amount Chips */}
            <div className="flex gap-1.5 flex-wrap">
                {QUICK_AMOUNTS.map((amt) => (
                    <button 
                        key={amt.label} 
                        onClick={() => handleQuickAmount(amt.value)} 
                        className="text-[10px] px-2 py-0.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-full transition-colors font-medium"
                    >
                        +{amt.label}
                    </button>
                ))}
            </div>
        </div>

        {/* Call Timer */}
        {isCallInitiated && (
            <div className={cn("space-y-2 p-3 border rounded-md transition-all duration-300", status === 'nr' ? "bg-gray-50 border-gray-200 opacity-60" : "bg-blue-50 border-blue-200 shadow-sm")}>
              <div className="flex justify-between items-center">
                 <label className="text-xs font-bold text-blue-800 uppercase flex items-center gap-1"><Clock className="h-3 w-3"/> Duration</label>
                 {!callDurationOverride && status !== 'nr' && <span className="text-[10px] text-blue-600 animate-pulse font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-600 block"/> Live Recording</span>}
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex-1 relative">
                  <Input type="number" placeholder="00" value={timerDisplay.m} onChange={e => handleManualTimeChange('min', e.target.value)} disabled={status === 'nr'} className="pr-8 bg-white font-mono text-center" />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">m</span>
                </div>
                <span className="text-xl font-light text-slate-400">:</span>
                <div className="flex-1 relative">
                  <Input type="number" placeholder="00" value={timerDisplay.s} onChange={e => handleManualTimeChange('sec', e.target.value)} disabled={status === 'nr'} className="pr-8 bg-white font-mono text-center" />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">s</span>
                </div>
              </div>
              {status === 'nr' && <p className="text-[10px] text-gray-500 italic text-center mt-1">Duration auto-set to 0 for NR.</p>}
            </div>
        )}

        {/* Not Eligible Reason */}
        {status === "not_eligible" && (
            <div className="space-y-2 p-3 bg-red-50 border border-red-100 rounded-md animate-in fade-in zoom-in-95 duration-200">
              <label className="text-xs font-bold text-red-800 uppercase flex items-center gap-1"><AlertCircle className="h-3 w-3"/> Ineligibility Reason <span className="text-red-600">*</span></label>
              <div className="grid grid-cols-1 gap-1">
                {["Salary in CASH", "Low CIBIL Score", "Other"].map((r) => (
                    <label key={r} className="flex items-center space-x-2 cursor-pointer p-1.5 hover:bg-white/50 rounded transition-colors">
                        <input type="radio" name="reason" value={r} checked={notEligibleReason === r} onChange={() => handleNotEligibleReasonChange(r)} className="accent-red-600" />
                        <span className="text-sm text-slate-700">{r}</span>
                    </label>
                ))}
              </div>
              {notEligibleReason === "Other" && (
                <Textarea placeholder="Specific reason..." value={note} onChange={e => setNote(e.target.value)} className="bg-white mt-2 resize-none" />
              )}
            </div>
        )}

        {/* Remarks */}
        <div className="space-y-2">
            <div className="flex justify-between items-center flex-wrap gap-2">
                <label className="text-xs font-semibold text-slate-700 uppercase">Remarks <span className="text-[10px] text-slate-400 font-normal lowercase">({remarks.length} chars)</span></label>
                <div className="flex gap-1 flex-wrap justify-end">
                    {QUICK_NOTES.slice(0, 4).map(q => (
                        <button key={q} onClick={() => handleQuickNote(q)} className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full border border-slate-200 transition-colors">{q}</button>
                    ))}
                </div>
            </div>
            <div className="relative">
                <Textarea 
                    placeholder="Add notes..." 
                    value={remarks} 
                    onChange={e => setRemarks(e.target.value)} 
                    onKeyDown={handleKeyDown}
                    rows={3} 
                    className="resize-none focus-visible:ring-blue-500 pr-8" 
                />
                <div className="absolute bottom-2 right-2 flex gap-1 items-center">
                    {remarks.length > 0 && (
                        <button onClick={() => setRemarks("")} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500"><X className="h-3 w-3"/></button>
                    )}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger>
                                <Command className="h-3 w-3 text-slate-300" />
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">Press Ctrl+Enter to save</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>
        </div>

        {/* Submit Section */}
        <div className="space-y-2">
            {/* Auto-Next Toggle */}
            <div className="flex items-center justify-end space-x-2">
                <Checkbox 
                  id="auto-next" 
                  checked={autoNext} 
                  onCheckedChange={(checked) => toggleAutoNext(checked as boolean)}
                  className="w-4 h-4 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
                <label
                    htmlFor="auto-next"
                    className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-600 select-none cursor-pointer"
                >
                    Auto-load next lead
                </label>
            </div>

            <Button 
                onClick={handleStatusUpdate} 
                disabled={isButtonDisabled} 
                className={cn(
                    "w-full h-10 text-sm font-semibold shadow-sm transition-all duration-300", 
                    selectedStatusOption?.btnColor || "bg-primary hover:bg-primary/90"
                )}
            >
                {selectedStatusOption ? (() => {
                  const SelectedIcon = resolveIcon(selectedStatusOption.icon_name);
                  return <SelectedIcon className="w-4 h-4 mr-2" />;
                })() : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {isUpdating ? "Saving..." : status === 'Disbursed' ? <><Sparkles className="w-4 h-4 mr-2 animate-spin-slow"/> Confirm Disbursal</> : isCallInitiated ? "End Call & Update" : "Update Status"}
                {autoNext && !isUpdating && <ArrowRight className="w-4 h-4 ml-2 opacity-60" />}
            </Button>
        </div>
      </CardContent>

      <ScheduleFollowUpModal 
        open={isModalOpen} 
        onOpenChange={(open) => { setIsModalOpen(open); if(!open) setStatus("") }} 
        onScheduleSuccess={updateLeadStatusToFollowUp} 
        defaultLeadId={leadId} 
      />
    </Card>
  )
}
