"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge"; 
import { Input } from "@/components/ui/input"; 
import { 
  Plus, Loader2, Check, ChevronsUpDown, 
  Phone, Users, Mail, MessageSquare, AlertTriangle, AlertCircle, Command as CommandIcon
} from "lucide-react";
import { format, addDays, nextMonday, setHours, setMinutes, isPast, isToday, isTomorrow, addMinutes, nextFriday, addHours } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sendCallbackReminderTemplate } from "@/app/actions/whatsapp";

interface Lead {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  status: string; 
}

interface ScheduleFollowUpModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultLeadId?: string;
  onScheduleSuccess?: () => void;
}

const TIME_SLOTS = [
  { label: "Morning", slots: ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"] },
  { label: "Afternoon", slots: ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"] },
  { label: "Evening", slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"] },
];

const ACTIVITY_TYPES = [
  { id: "call", label: "Call", icon: Phone, placeholder: "Call agenda or talking points...", actionLabel: "Schedule Call", defaultDuration: "15" },
  { id: "meeting", label: "Meeting", icon: Users, placeholder: "Meeting location and agenda...", actionLabel: "Schedule Meeting", defaultDuration: "60" },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, placeholder: "Draft your WhatsApp message here...", actionLabel: "Schedule WhatsApp", defaultDuration: "15" },
  { id: "email", label: "Email", icon: Mail, placeholder: "Email subject or key points...", actionLabel: "Schedule Email", defaultDuration: "15" },
];

const QUICK_NOTES = ["Discuss Rates", "Collect Docs", "Negotiation", "Final Closing", "Intro Call"];

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'interested': return 'bg-green-100 text-green-800 border-green-200';
    case 'new': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'nr': return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'disbursed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
};

export function ScheduleFollowUpModal({ 
  open: controlledOpen, 
  onOpenChange: controlledOnOpenChange,
  defaultLeadId,
  onScheduleSuccess
}: ScheduleFollowUpModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;

  // Form State
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("15"); 
  const [leadId, setLeadId] = useState("");
  const [notes, setNotes] = useState("");
  const [activityType, setActivityType] = useState("call");
  const [priority, setPriority] = useState("normal");
   
  // UI State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);
  const [existingFollowUp, setExistingFollowUp] = useState<string | null>(null);
   
  const supabase = createClient();
  const router = useRouter();

  // Reset logic
  useEffect(() => {
    if (isOpen) {
      fetchLeads();
      setLeadId(defaultLeadId || "");
      setPriority("normal");
      setConflictCount(0);
      setExistingFollowUp(null);
      if (!date) {
        const tomorrow = addDays(new Date(), 1);
        setDate(tomorrow);
      }
    } else {
      if (!defaultLeadId) setLeadId("");
      setNotes("");
      setActivityType("call");
      setConflictCount(0);
      setExistingFollowUp(null);
    }
  }, [isOpen, defaultLeadId]);

  // AUTOMATION: Smart Duration & Priority based on Activity
  useEffect(() => {
    const activity = ACTIVITY_TYPES.find(a => a.id === activityType);
    if (activity) {
        setDuration(activity.defaultDuration);
        // Auto-set priority to high for meetings, normal for others (unless manually changed later)
        if (activityType === 'meeting') setPriority('high');
        else setPriority('normal');
    }
  }, [activityType]);

  // Conflict & Duplicate Check Effect
  useEffect(() => {
    if (isOpen && date && time) checkConflicts();
  }, [date, time, isOpen]);

  useEffect(() => {
    if (isOpen && leadId) checkExistingFollowUp();
  }, [leadId, isOpen]);

  const fetchLeads = async () => {
    setFetching(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: leadsData, error } = await supabase
        .from("leads")
        .select("id, name, company, phone, status")
        .eq("assigned_to", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeads(leadsData || []);
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setFetching(false);
    }
  };

  const checkConflicts = async () => {
    if (!date) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [hours, minutes] = time.split(":").map(Number);
      const scheduledTime = setMinutes(setHours(date, hours), minutes);
      
      const startTime = addMinutes(scheduledTime, -29).toISOString();
      const endTime = addMinutes(scheduledTime, 29).toISOString();

      const { count, error } = await supabase
        .from("follow_ups")
        .select("id", { count: 'exact', head: true })
        .eq("user_id", user.id)
        .neq("status", "completed") 
        .gte("scheduled_at", startTime)
        .lte("scheduled_at", endTime);

      if (!error) setConflictCount(count || 0);
    } catch (error) { console.error(error); }
  };

  const checkExistingFollowUp = async () => {
    if (!leadId) return;
    try {
      const { data, error } = await supabase
        .from("follow_ups")
        .select("scheduled_at")
        .eq("lead_id", leadId)
        .eq("status", "pending")
        .gt("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .single();

      if (data) setExistingFollowUp(data.scheduled_at);
      else setExistingFollowUp(null);
    } catch (error) { setExistingFollowUp(null); }
  };

  const setQuickSchedule = (type: "later_today" | "tomorrow" | "same_time_tomorrow" | "3days" | "next_week") => {
    const now = new Date();
    let newDate = new Date();

    switch (type) {
      case "later_today": 
        newDate = now; 
        const nextHour = addHours(now, 2);
        // Round to nearest 30
        const minutes = nextHour.getMinutes() >= 30 ? "30" : "00";
        setTime(`${nextHour.getHours().toString().padStart(2, '0')}:${minutes}`);
        break;
      case "tomorrow": 
        newDate = addDays(now, 1); 
        setTime("10:00"); 
        break;
      case "same_time_tomorrow":
        newDate = addDays(now, 1);
        const currentH = now.getHours().toString().padStart(2, '0');
        const currentM = now.getMinutes() >= 30 ? "30" : "00";
        setTime(`${currentH}:${currentM}`);
        break;
      case "3days": 
        newDate = addDays(now, 3); 
        setTime("11:00"); 
        break;
      case "next_week": 
        newDate = nextMonday(now); 
        setTime("10:00"); 
        break;
    }
    setDate(newDate);
  };

  const handleQuickNote = (text: string) => {
    setNotes(prev => prev ? `${prev}, ${text}` : text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSchedule();
    }
  }

  const generateGCalLink = (title: string, dateObj: Date, durationMins: number, description: string) => {
    const start = dateObj.toISOString().replace(/-|:|\.\d\d\d/g, "");
    const end = addMinutes(dateObj, durationMins).toISOString().replace(/-|:|\.\d\d\d/g, "");
    
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}&details=${encodeURIComponent(description)}&sf=true&output=xml`;
  };

  const isTimeSlotDisabled = (slot: string) => {
    if (!date || !isToday(date)) return false;
    const [h, m] = slot.split(':').map(Number);
    const slotDate = new Date();
    slotDate.setHours(h, m, 0, 0);
    return isPast(slotDate);
  };

  const groupedLeads = useMemo(() => {
    const groups: Record<string, Lead[]> = {};
    leads.forEach(lead => {
        const status = lead.status || 'Unknown';
        if (!groups[status]) groups[status] = [];
        groups[status].push(lead);
    });
    const priority = ['Interested', 'new', 'follow_up'];
    return Object.keys(groups).sort((a,b) => {
        const idxA = priority.indexOf(a);
        const idxB = priority.indexOf(b);
        if (idxA > -1 && idxB > -1) return idxA - idxB;
        if (idxA > -1) return -1;
        if (idxB > -1) return 1;
        return a.localeCompare(b);
    }).map(status => ({ status, items: groups[status] }));
  }, [leads]);

  const handleSchedule = async () => {
    if (!date || !leadId) {
      toast.error("Missing Info", { description: "Select a lead and date." });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Session expired"); return; }
      
      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
      const tenantId = profile?.tenant_id;

      const selectedLead = leads.find(lead => lead.id === leadId);
      const activityLabel = ACTIVITY_TYPES.find(a => a.id === activityType)?.label || "Follow-up";
      
      const titlePrefix = priority === "high" ? "🔥 " : "";
      const title = `${titlePrefix}${activityLabel}: ${selectedLead?.name}`;

      const calendarDescription = `
LEAD DETAILS
------------
Name: ${selectedLead?.name}
Phone: ${selectedLead?.phone || "N/A"}
Company: ${selectedLead?.company || "N/A"}

NOTES
-----
${notes || "No additional notes."}
      `.trim();

      const [hours, minutes] = time.split(":").map(Number);
      const scheduledDateTime = setMinutes(setHours(date, hours), minutes);

      if (isPast(scheduledDateTime)) {
        toast.error("Invalid Time", { description: "Cannot schedule in the past." });
        setLoading(false);
        return;
      }

      const followUpPayload: any = {
        lead_id: leadId,
        user_id: user.id,
        title: title,
        scheduled_at: scheduledDateTime.toISOString(),
        notes: notes,
        status: "pending",
      };
      if (tenantId) followUpPayload.tenant_id = tenantId;

      const { error: followUpError } = await supabase.from("follow_ups").insert(followUpPayload);

      if (followUpError) throw followUpError;

      const { error: leadError } = await supabase
        .from("leads")
        .update({ 
            status: "follow_up", 
            last_contacted: new Date().toISOString() 
        })
        .eq("id", leadId);

      if (leadError) console.error("Lead status update failed:", leadError);

      // Fetch agent's full name to personalize callback WhatsApp
      const { data: userData } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", user.id)
        .single();
      const agentName = userData?.full_name || "Loan Advisor";

      // Send automated WhatsApp Callback booking reminder
      if (selectedLead && selectedLead.phone) {
        const timeString = format(scheduledDateTime, "MMMM d, h:mm a");
        toast.info("Sending callback booking confirmation via WhatsApp...");
        await sendCallbackReminderTemplate(
          leadId,
          selectedLead.phone,
          selectedLead.name,
          agentName,
          timeString
        );
      }

      const durationMins = parseInt(duration);
      const gLink = generateGCalLink(title, scheduledDateTime, durationMins, calendarDescription);
      
      window.open(gLink, '_blank');
      
      toast.success("Scheduled Successfully", {
        description: `Lead moved to 'Call Back'. Google Calendar opened.`,
      });

      if (onScheduleSuccess) onScheduleSuccess();
      setOpen(false);
      router.refresh();

    } catch (error: any) {
      toast.error("Failed to schedule", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; 
    if (val) {
        const [year, month, day] = val.split('-').map(Number);
        const newDate = new Date(year, month - 1, day);
        setDate(newDate);
    } else {
        setDate(undefined);
    }
  };

  // Get current active activity details for UI feedback
  const currentActivity = ACTIVITY_TYPES.find(a => a.id === activityType) || ACTIVITY_TYPES[0];

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {!controlledOpen && (
          <Button variant="secondary" size="sm">
            <Plus className="h-4 w-4 mr-2" /> Schedule
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Schedule Follow-up</DialogTitle>
          <DialogDescription>Set a reminder for your next interaction.</DialogDescription>
        </DialogHeader>
        
        {/* FORM VIEW */}
        <div className="grid gap-5 py-4">
          
          {/* Activity Buttons - ALL have type="button" */}
          <div className="grid grid-cols-4 gap-2 bg-slate-100 p-1 rounded-lg">
              {ACTIVITY_TYPES.map((type) => (
                <button 
                  key={type.id} 
                  type="button" 
                  onClick={() => setActivityType(type.id)}
                  className={cn(
                      "flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all shadow-sm",
                      activityType === type.id 
                        ? "bg-white text-blue-700 ring-1 ring-black/5" 
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                  )}
                >
                  <type.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{type.label}</span>
                </button>
              ))}
          </div>

          {/* Quick Actions - ALL have type="button" */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setQuickSchedule("later_today")} className="text-xs h-7 bg-slate-50 border-dashed hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200">+2 Hours</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setQuickSchedule("tomorrow")} className="text-xs h-7 bg-slate-50 border-dashed hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200">Tomorrow</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setQuickSchedule("same_time_tomorrow")} className="text-xs h-7 bg-slate-50 border-dashed hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200">Same Time Tmrw</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setQuickSchedule("next_week")} className="text-xs h-7 bg-slate-50 border-dashed hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200">Next Week</Button>
          </div>

          {/* Lead Selection */}
          <div className="grid gap-2">
            <Label className="text-xs font-semibold text-slate-500 uppercase">Select Lead</Label>
            <Popover open={leadOpen} onOpenChange={setLeadOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" aria-expanded={leadOpen} className="w-full justify-between h-10 border-slate-200" disabled={!!defaultLeadId || fetching}>
                  {leadId ? leads.find((lead) => lead.id === leadId)?.name : fetching ? "Loading..." : "Search lead..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[460px] p-0 z-[9999]" align="start">
                <Command>
                  <CommandInput placeholder="Search lead name..." />
                  <CommandList>
                    <CommandEmpty>No lead found.</CommandEmpty>
                    {groupedLeads.map((group) => (
                      <CommandGroup key={group.status} heading={group.status} className="text-muted-foreground">
                          {group.items.map(lead => (
                              <CommandItem key={lead.id} value={lead.name} onSelect={() => { setLeadId(lead.id); setLeadOpen(false); }}>
                                  <Check className={cn("mr-2 h-4 w-4", leadId === lead.id ? "opacity-100" : "opacity-0")} />
                                  <div className="flex flex-col flex-1">
                                  <div className="flex justify-between items-center w-full">
                                      <span className="font-medium text-sm">{lead.name}</span>
                                      <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 font-medium border-0", getStatusColor(lead.status))}>
                                          {lead.status}
                                      </Badge>
                                  </div>
                                  {lead.company && <span className="text-xs text-muted-foreground">{lead.company}</span>}
                                  </div>
                              </CommandItem>
                          ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {existingFollowUp && (
                <div className="flex items-center gap-2 p-2 bg-amber-50 text-amber-800 text-xs rounded border border-amber-200 mt-1 animate-in slide-in-from-top-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Warning: Pending follow-up on <strong>{format(new Date(existingFollowUp), "MMM d, h:mm a")}</strong></span>
                </div>
            )}
          </div>

          {/* Date & Time Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2 relative">
              <Label className="text-xs font-semibold text-slate-500 uppercase">Date</Label>
              <Input 
                type="date"
                className="h-10 block w-full"
                value={date ? format(date, "yyyy-MM-dd") : ""}
                min={format(new Date(), "yyyy-MM-dd")} 
                onChange={handleDateChange}
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs font-semibold text-slate-500 uppercase">Time</Label>
              <div className="flex gap-2">
                  <Select value={time} onValueChange={setTime}>
                      <SelectTrigger className={cn("h-10 flex-1 transition-colors", conflictCount > 0 ? "border-amber-400 bg-amber-50 ring-amber-100" : "")}><SelectValue placeholder="Time" /></SelectTrigger>
                      <SelectContent className="max-h-[250px] z-[9999]">
                          {TIME_SLOTS.map((group) => (
                          <SelectGroup key={group.label}>
                              <SelectLabel className="text-xs text-slate-400 font-normal mt-1 bg-slate-50 py-1 pl-2">{group.label}</SelectLabel>
                              {group.slots.map(slot => (
                              <SelectItem key={slot} value={slot} disabled={isTimeSlotDisabled(slot)}>{slot}</SelectItem>
                              ))}
                          </SelectGroup>
                          ))}
                      </SelectContent>
                  </Select>
                  <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger className="h-10 w-[80px]"><SelectValue placeholder="Dur" /></SelectTrigger>
                      <SelectContent className="z-[9999]">
                          <SelectItem value="15">15m</SelectItem>
                          <SelectItem value="30">30m</SelectItem>
                          <SelectItem value="45">45m</SelectItem>
                          <SelectItem value="60">1h</SelectItem>
                      </SelectContent>
                  </Select>
              </div>
            </div>
          </div>

          {/* Conflict Warning */}
          {conflictCount > 0 && (
              <div className="flex items-center gap-2 p-2 bg-amber-50 text-amber-800 text-xs rounded border border-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Warning: You have <strong>{conflictCount} other event{conflictCount > 1 ? 's' : ''}</strong> around this time.</span>
              </div>
          )}

          {/* Notes & Priority - DYNAMIC PLACEHOLDER */}
          <div className="grid gap-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-semibold text-slate-500 uppercase">Notes</Label>
              <div className="flex gap-2 items-center">
                  <div className={cn("flex items-center space-x-2 px-2 py-1 rounded-md border transition-colors cursor-pointer select-none", priority === 'high' ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-100")}>
                      <input 
                          type="checkbox" 
                          id="priority-toggle"
                          checked={priority === "high"} 
                          onChange={(e) => setPriority(e.target.checked ? "high" : "normal")} 
                          className="h-3.5 w-3.5 accent-red-500 cursor-pointer"
                      />
                      <label htmlFor="priority-toggle" className={cn("text-[10px] font-medium cursor-pointer", priority === 'high' ? "text-red-700" : "text-slate-500")}>High Priority</label>
                  </div>
              </div>
            </div>
            <div className="relative">
                <Textarea 
                placeholder={currentActivity.placeholder} // <-- Dynamic Placeholder
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                onKeyDown={handleKeyDown}
                className="resize-none focus-visible:ring-blue-500 pr-8" 
                rows={3} 
                />
                <div className="absolute bottom-2 right-2 text-slate-300">
                    <CommandIcon className="h-3 w-3" />
                </div>
            </div>
            {/* Quick Notes - ALL have type="button" */}
            <div className="flex gap-1 flex-wrap mt-1">
                {QUICK_NOTES.slice(0, 4).map(note => (
                  <button key={note} type="button" onClick={() => handleQuickNote(note)} className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-600 border border-slate-200">
                      {note}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
          
          {/* Dynamic Submit Button Label */}
          <Button onClick={handleSchedule} disabled={!date || !leadId || loading} className={cn("transition-colors", priority === "high" ? "bg-red-600 hover:bg-red-700" : "")}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {priority === "high" ? "Confirm Urgent Follow-up" : currentActivity.actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
