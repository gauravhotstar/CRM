"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useAttendance } from "@/hooks/use-attendance";
import { Button } from "@/components/ui/button"; 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Clock, Coffee, LogIn, LogOut, CheckCircle, MapPin, 
  AlertTriangle, Loader2, ThumbsUp, WifiOff, Building2, Server
} from "lucide-react";
import { format, setHours, setMinutes, isAfter, differenceInSeconds } from "date-fns";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

// --- CONFIGURATION ---
 
 

type Office = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // Stored in KM
};

interface AttendanceWidgetProps {
    targetHours?: number; // Allows dynamic shift lengths
}

export function AttendanceWidget({ targetHours = 9 }: AttendanceWidgetProps) {
  const [lateThresholdHour, setLateThresholdHour] = useState(9);
  const [lateThresholdMinute, setLateThresholdMinute] = useState(30);

  const {
    todayAttendance,
    loading,
    checkIn,
    checkOut,
    startLunchBreak,
    endLunchBreak,
  } = useAttendance();

  const supabase = createClient();

  // --- STATE ---
  const [notes, setNotes] = useState("");
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [showCheckOutDialog, setShowCheckOutDialog] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  
  // Locations & Network
  const [offices, setOffices] = useState<Office[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [distanceInfo, setDistanceInfo] = useState<{ meters: number; isFar: boolean; officeName: string } | null>(null);
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(false);

  // Timer & Breaks (Enhanced for multiple breaks theoretically)
  const [elapsedTime, setElapsedTime] = useState(0);
  const isOnBreak = useMemo(() => !!todayAttendance?.lunch_start && !todayAttendance?.lunch_end, [todayAttendance]);

  // --- 1. FETCH OFFICES, IP, & NETWORK LISTENER ---
  useEffect(() => {
    // Fetch dynamic office locations from database
    const fetchSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
      if (!profile?.tenant_id) return;

      const { data, error } = await supabase.from('attendance_settings').select('*').eq('tenant_id', profile.tenant_id).maybeSingle();
      if (!error && data) {
         if (data.office_location) {
             const parsedOffices = typeof data.office_location === 'string' ? JSON.parse(data.office_location) : data.office_location;
             setOffices(Array.isArray(parsedOffices) && parsedOffices.length > 0 ? parsedOffices : []);
         }
         if (data.work_hours_start) {
             const [h, m] = data.work_hours_start.split(':');
             setLateThresholdHour(parseInt(h));
             setLateThresholdMinute(parseInt(m));
         }
      }
    };
    fetchSettings();

    // Fetch IP Address
    const fetchIP = async () => {
        try {
            const res = await fetch('https://api.ipify.org?format=json');
            const data = await res.json();
            setIpAddress(data.ip);
        } catch (e) {
            console.error("Failed to fetch IP");
        }
    };
    fetchIP();

    // Network status & Offline Sync
    setIsOnline(navigator.onLine);
    
    const handleOnline = async () => {
        setIsOnline(true);
        // Process offline queue
        const offlineData = localStorage.getItem('offlineCheckout');
        if (offlineData) {
            setPendingSync(true);
            try {
                const data = JSON.parse(offlineData);
                await checkOut(data.notes); // Assumes your hook handles the specific time logic on the backend or we pass it
                localStorage.removeItem('offlineCheckout');
                toast.success("Offline data synced successfully!");
            } catch (error) {
                console.error("Sync failed", error);
                toast.error("Failed to sync offline checkout.");
            } finally {
                setPendingSync(false);
            }
        }
    };
    
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Check on mount just in case
    if (navigator.onLine && localStorage.getItem('offlineCheckout')) {
        handleOnline();
    }
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Preheat Speech Synthesis Voices Cache
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const handleVoices = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handleVoices);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", handleVoices);
    }
  }, []);

  // --- 2. LIVE TIMER (Accurate tracking) ---
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (todayAttendance?.check_in && !todayAttendance.check_out) {
      const start = new Date(todayAttendance.check_in);
      
      const updateTimer = () => {
        const now = new Date();
        let seconds = differenceInSeconds(now, start);
        
        // Handle breaks (This logic assumes total_break_seconds exists for multiple breaks, falling back to lunch_start/end)
        let totalBreakSeconds = 0;
        
        // If your backend implements multiple breaks and returns a total:
        if ((todayAttendance as any).total_break_seconds) {
             totalBreakSeconds = (todayAttendance as any).total_break_seconds;
             // If currently on a break, add the ongoing break time
             if (todayAttendance.lunch_start && !todayAttendance.lunch_end) {
                 totalBreakSeconds += differenceInSeconds(now, new Date(todayAttendance.lunch_start));
             }
        } else {
            // Fallback to original single break logic
            if (todayAttendance.lunch_start && todayAttendance.lunch_end) {
                totalBreakSeconds = differenceInSeconds(new Date(todayAttendance.lunch_end), new Date(todayAttendance.lunch_start));
            } else if (todayAttendance.lunch_start && !todayAttendance.lunch_end) {
                totalBreakSeconds = differenceInSeconds(now, new Date(todayAttendance.lunch_start));
            }
        }

        seconds -= totalBreakSeconds;
        setElapsedTime(seconds > 0 ? seconds : 0);
      };
      
      updateTimer(); // Initial call
      interval = setInterval(updateTimer, 1000);
    }
    return () => clearInterval(interval);
  }, [todayAttendance]);

  // --- 3. DYNAMIC GEOLOCATION & GEOFENCING ---
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
  };

  const getCurrentLocation = (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setLocationError("Geolocation not supported");
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          
          // Geofencing Check against all offices
          if (offices.length > 0) {
            let minDistance = Infinity;
            let closestOffice: any = null;

            offices.forEach(office => {
              const dist = calculateDistance(latitude, longitude, office.lat, office.lng);
              if (dist < minDistance) {
                minDistance = dist;
                closestOffice = office;
              }
            });

            if (closestOffice) {
              const allowedRadiusMeters = closestOffice.radius * 1000;
              setDistanceInfo({ 
                meters: Math.round(minDistance), 
                isFar: minDistance > allowedRadiusMeters,
                officeName: closestOffice.name
              });
            }
          }

          resolve(`${latitude},${longitude}`);
        },
        (error) => {
          console.error("Location Error:", error);
          setLocationError("Unable to retrieve location. Please enable GPS.");
          resolve(null); 
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  // --- HANDLERS ---
  const handleCheckInTrigger = async () => {
      setShowCheckInDialog(true);
      setIsLocating(true);
      setDistanceInfo(null);
      await getCurrentLocation(); 
      setIsLocating(false);
  }

  // --- AUDIO SYNTHESIZER ENGINE ---
  const playTelecallerSound = (type: "success" | "neutral" | "error" | "click") => {
    try {
      if (typeof window === "undefined") return;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      
      if (type === "success") {
        // Pleasant chord chimes (C5 -> E5 -> G5 -> C6)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.07);
          osc.stop(ctx.currentTime + idx * 0.07 + 0.25);
        });
      } else if (type === "error") {
        // Low double buzz
        const notes = [150, 130];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
          gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.12);
          osc.stop(ctx.currentTime + idx * 0.12 + 0.2);
        });
      } else if (type === "neutral") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === "click") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.02, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.05);
      }
    } catch (e) {
      console.warn("Audio Context failed", e);
    }
  };

  const speakMessage = (message: string) => {
    try {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => 
        (v.name.includes("Google") && v.name.includes("US English")) || 
        v.name.includes("Samantha") || 
        v.name.includes("Zira") ||
        (v.lang === "en-US" && v.name.includes("Natural"))
      );
      if (preferredVoice) utterance.voice = preferredVoice;
      
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech Synthesis failed", e);
    }
  };

  const handleCheckInConfirm = async () => {
    setIsLocating(true);
    playTelecallerSound("success");
    try {
      const locationString = await getCurrentLocation();
      
      let finalNotes = notes;
      const contextInfo = [];
      
      if (distanceInfo?.isFar) {
          contextInfo.push(`REMOTE CHECK-IN: ${distanceInfo.meters}m from ${distanceInfo.officeName}`);
      } else if (distanceInfo) {
          contextInfo.push(`ON-SITE: ${distanceInfo.officeName}`);
      }
      if (ipAddress) contextInfo.push(`IP: ${ipAddress}`);
      
      if (contextInfo.length > 0) {
          finalNotes = `[${contextInfo.join(' | ')}] ${notes}`;
      }

      await checkIn(finalNotes, locationString || undefined); 
      toast.success(distanceInfo?.isFar ? "Checked in remotely!" : "Checked in from Office!");
      
      setNotes("");
      setShowCheckInDialog(false);

      // Perform calculations & Speak dynamic required target
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('full_name, monthly_target')
          .eq('id', user.id)
          .single();
          
        const name = profile?.full_name || "Agent";
        const target = parseFloat(profile?.monthly_target || "3000000");

        // Calculate achieved revenue for current month
        const startOfMonthStr = format(new Date(), "yyyy-MM-01") + "T00:00:00.000Z";
        const endOfMonthStr = format(new Date(), "yyyy-MM-") + new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() + "T23:59:59.999Z";

        const { data: revenueLeads } = await supabase
          .from('leads')
          .select('disbursed_amount, loan_amount')
          .eq('assigned_to', user.id)
          .gte('updated_at', startOfMonthStr)
          .lte('updated_at', endOfMonthStr)
          .in('status', ['Disbursed', 'DISBURSED']);

        let achieved = 0;
        revenueLeads?.forEach((l: any) => {
          const rawAmount = l.disbursed_amount || l.loan_amount || 0;
          const cleanString = String(rawAmount).replace(/[^0-9.-]+/g, "");
          const num = parseFloat(cleanString);
          achieved += isNaN(num) ? 0 : num;
        });

        const totalDaysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        const daysRemaining = Math.max(1, totalDaysInMonth - new Date().getDate());
        const gap = Math.max(0, target - achieved);
        const dailyRequired = Math.round(gap / daysRemaining);

        const formattedDailyRequired = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(dailyRequired);

        const welcomeSentence = `Good morning ${name}, your workday has officially started! Let's make today highly productive and successful.`;
        const targetSentence = `${name}, your required daily disbursement target for today is ${formattedDailyRequired}. Let's hit this milestone today!`;
        
        speakMessage(`${welcomeSentence} ${targetSentence}`);
      }
    } catch (error: any) {
      toast.error(error.message);
      playTelecallerSound("error");
    } finally {
      setIsLocating(false);
    }
  };

  const handleCheckOut = async () => {
    if (!isOnline) {
        const checkoutData = { time: new Date().toISOString(), notes };
        localStorage.setItem('offlineCheckout', JSON.stringify(checkoutData));
        toast.info("Offline mode: Check-out saved locally. Will sync when online.");
        setShowCheckOutDialog(false);
        setNotes("");
        return;
    }

    playTelecallerSound("success");
    try {
      await checkOut(notes);
      toast.success("Shift ended. Good job!");
      setNotes("");
      setShowCheckOutDialog(false);

      // Calculate achievements & Speak dynamic achievement celebration
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', user.id)
          .single();
          
        const name = profile?.full_name || "Agent";

        // Calculate achieved revenue for current month
        const startOfMonthStr = format(new Date(), "yyyy-MM-01") + "T00:00:00.000Z";
        const endOfMonthStr = format(new Date(), "yyyy-MM-") + new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() + "T23:59:59.999Z";

        const { data: revenueLeads } = await supabase
          .from('leads')
          .select('disbursed_amount, loan_amount')
          .eq('assigned_to', user.id)
          .gte('updated_at', startOfMonthStr)
          .lte('updated_at', endOfMonthStr)
          .in('status', ['Disbursed', 'DISBURSED']);

        let achieved = 0;
        revenueLeads?.forEach((l: any) => {
          const rawAmount = l.disbursed_amount || l.loan_amount || 0;
          const cleanString = String(rawAmount).replace(/[^0-9.-]+/g, "");
          const num = parseFloat(cleanString);
          achieved += isNaN(num) ? 0 : num;
        });

        const formattedAchieved = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(achieved);

        const goodbyeSentence = `Great job, ${name}! You have successfully clocked out for today.`;
        const achievementSentence = `This month, you have achieved a phenomenal total of ${formattedAchieved} in disbursements. Thank you for your hard work and outstanding dedication! Have a restful evening!`;
        
        speakMessage(`${goodbyeSentence} ${achievementSentence}`);
      }
    } catch (error: any) { 
      toast.error(error.message); 
      playTelecallerSound("error");
    }
  };

  const handleBreak = async () => {
    try {
      if (isOnBreak) {
        await endLunchBreak();
        toast.success("Welcome back!");
      } else {
        await startLunchBreak();
        toast.success("Enjoy your break!");
      }
      setShowBreakDialog(false);
    } catch (error: any) { toast.error(error.message); }
  };

  // --- HELPERS ---
  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const isLateNow = () => isAfter(new Date(), setMinutes(setHours(new Date(), lateThresholdHour), lateThresholdMinute));
  const wasLate = useMemo(() => todayAttendance?.check_in && isAfter(new Date(todayAttendance.check_in), setMinutes(setHours(new Date(todayAttendance.check_in), lateThresholdHour), lateThresholdMinute)), [todayAttendance]);
  
  // Calculate progress against dynamic target hours
  const progressPercentage = Math.min((elapsedTime / (targetHours * 3600)) * 100, 100);

  if (loading || pendingSync) return (
      <Card className="flex items-center justify-center h-[200px] bg-slate-50 border-slate-200">
          <div className="flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="text-sm font-medium">{pendingSync ? "Syncing offline data..." : "Loading Status..."}</span>
          </div>
      </Card>
  );

  return (
    <div className="space-y-4">
      {/* Network Warning */}
      {!isOnline && (
          <div className="bg-red-50 text-red-600 px-3 py-2 rounded-md text-xs font-medium flex items-center justify-center gap-2 animate-pulse shadow-sm">
              <WifiOff className="h-3 w-3" /> You are offline. Check-outs will save locally.
          </div>
      )}

      <Card className="shadow-sm border-slate-200 overflow-hidden relative">
        {/* Weekly Streak Dots (Visual Gamification) */}
        <div className="absolute top-3 right-4 flex gap-1 z-10">
            {[1,1,1,0,1].map((status, i) => (
                <TooltipProvider key={i}>
                    <Tooltip>
                        <TooltipTrigger>
                            <div className={`w-2 h-2 rounded-full ${status ? 'bg-green-400' : 'bg-slate-200'}`} />
                        </TooltipTrigger>
                        <TooltipContent className="text-[10px]">{status ? "Present" : "Absent"}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ))}
        </div>

        <CardHeader className="pb-2 bg-white relative">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5 text-blue-600" />
            <span className="text-slate-900">Work Status</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5 pt-2">
          
          {/* 1. Main Status & Timer */}
          <div className="flex items-end justify-between">
             <div className="space-y-1">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">CURRENT STATUS</p>
                {todayAttendance?.check_in ? (
                    todayAttendance.check_out ? (
                        <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 px-2 py-1 text-sm"><CheckCircle className="h-3.5 w-3.5 mr-1"/> Shift Ended</Badge>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Badge className="bg-green-50 text-green-700 hover:bg-green-50 border-green-200 px-2 py-1 text-sm animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-green-500 mr-2"/> On Duty
                            </Badge>
                            {isOnBreak && (
                                <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200"><Coffee className="h-3 w-3 mr-1"/> On Break</Badge>
                            )}
                        </div>
                    )
                ) : (
                    <Badge variant="secondary" className="bg-slate-100 text-slate-500">Not Checked In</Badge>
                )}
             </div>

             {/* Live Big Timer */}
             {todayAttendance?.check_in && !todayAttendance.check_out && (
                 <div className="text-right">
                    <div className="text-2xl font-mono font-bold text-slate-800 tracking-tight">
                        {formatDuration(elapsedTime)}
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium">TOTAL HOURS</p>
                 </div>
             )}
          </div>

          {/* 2. Progress Bar */}
          {todayAttendance?.check_in && !todayAttendance.check_out && (
              <div className="space-y-1.5">
                  <Progress value={progressPercentage} className="h-1.5 bg-slate-100" />
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                      <span>{Math.round(progressPercentage)}% Shift Goal</span>
                      <span>Target: {targetHours}h</span>
                  </div>
              </div>
          )}

          {/* 3. Info Grid */}
          <div className="grid grid-cols-2 gap-3 pt-2">
             <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex justify-between mb-1">
                    <span className="text-xs text-slate-500 font-semibold">IN TIME</span>
                    {todayAttendance?.check_in && (wasLate ? <span className="text-[9px] text-red-600 bg-red-50 px-1 rounded font-bold">LATE</span> : <span className="text-[9px] text-green-600 bg-green-50 px-1 rounded font-bold">ON TIME</span>)}
                </div>
                <div className="text-sm font-bold text-slate-900">
                    {todayAttendance?.check_in ? format(new Date(todayAttendance.check_in), "hh:mm a") : "--:--"}
                </div>
             </div>
             <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-xs text-slate-500 font-semibold block mb-1">OUT TIME</span>
                <div className="text-sm font-bold text-slate-900">
                    {todayAttendance?.check_out ? format(new Date(todayAttendance.check_out), "hh:mm a") : "--:--"}
                </div>
             </div>
          </div>

          {/* 4. Primary Action Button */}
          <div className="pt-2">
            {!todayAttendance?.check_in ? (
              <Dialog open={showCheckInDialog} onOpenChange={setShowCheckInDialog}>
                <DialogTrigger asChild>
                  <Button onClick={handleCheckInTrigger} className="w-full h-12 text-base shadow-lg shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 transition-all" disabled={!isOnline}>
                    <LogIn className="h-5 w-5 mr-2" /> Check In
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Start Your Shift</DialogTitle>
                    <DialogDescription>Location and time will be recorded.</DialogDescription>
                  </DialogHeader>
                  
                  {/* Late Warning */}
                  {isLateNow() && (
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-md flex gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                        <div className="text-xs text-amber-800">
                            <p className="font-bold">You are checking in late.</p>
                            <p>Shift starts at {lateThresholdHour}:{lateThresholdMinute} AM.</p>
                        </div>
                    </div>
                  )}

                  {/* Geofencing & Network Status */}
                  <div className="bg-slate-50 border p-3 rounded-md space-y-3">
                      <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium flex items-center gap-1"><MapPin className="h-3 w-3"/> Location Status</span>
                          {isLocating && <Loader2 className="h-3 w-3 animate-spin text-blue-500"/>}
                      </div>
                      
                      {!isLocating && distanceInfo ? (
                          <div className={`flex items-center gap-2 text-sm font-medium ${distanceInfo.isFar ? "text-orange-600" : "text-green-600"}`}>
                              {distanceInfo.isFar ? <Building2 className="h-4 w-4"/> : <CheckCircle className="h-4 w-4"/>}
                              {distanceInfo.isFar ? `Remote (${distanceInfo.meters}m from ${distanceInfo.officeName})` : `You are at ${distanceInfo.officeName}`}
                          </div>
                      ) : !isLocating && offices.length === 0 ? (
                          <div className="text-sm text-slate-500 italic">No offices defined. Remote check-in enabled.</div>
                      ) : (
                          <div className="text-sm text-slate-400 italic">Acquiring satellite lock...</div>
                      )}

                      {/* Display IP for transparency */}
                      {ipAddress && (
                         <div className="pt-2 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-500">
                            <Server className="h-3 w-3" /> Network IP: {ipAddress}
                         </div>
                      )}
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                        <Label>Notes</Label>
                        <Textarea placeholder="Today's plan..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                    <Button onClick={handleCheckInConfirm} className="w-full" disabled={isLocating}>
                      {isLocating ? "Getting Location..." : "Confirm Check In"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : !todayAttendance.check_out ? (
              <div className="flex gap-3">
                <Dialog open={showBreakDialog} onOpenChange={setShowBreakDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className={`flex-1 border-slate-300 hover:bg-slate-50 h-11 transition-all ${isOnBreak ? 'bg-orange-50 border-orange-200 text-orange-600' : ''}`} disabled={!isOnline}>
                      <Coffee className={`h-4 w-4 mr-2 ${isOnBreak ? 'animate-pulse' : 'text-orange-500'}`} />
                      {isOnBreak ? "End Break" : "Take Break"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{isOnBreak ? "Resume Work" : "Break Time"}</DialogTitle></DialogHeader>
                    <p className="text-sm text-slate-600">
                        {isOnBreak ? "Ready to get back to work? Your timer will resume." : "Taking a short break? Your active timer will be paused."}
                    </p>
                    <div className="flex gap-2 justify-end mt-2">
                        <Button variant="ghost" onClick={() => setShowBreakDialog(false)}>Cancel</Button>
                        <Button onClick={handleBreak}>{isOnBreak ? "End Break" : "Start Break"}</Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={showCheckOutDialog} onOpenChange={setShowCheckOutDialog}>
                  <DialogTrigger asChild>
                    <Button className="flex-1 bg-slate-900 hover:bg-slate-800 text-white h-11">
                      <LogOut className="h-4 w-4 mr-2" /> Check Out
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                        <DialogTitle>End Shift</DialogTitle>
                        {!isOnline && <DialogDescription className="text-red-500">You are offline. Data will sync later.</DialogDescription>}
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="bg-blue-50 text-blue-700 p-3 rounded-md text-sm flex gap-2">
                            <ThumbsUp className="h-4 w-4 mt-0.5"/>
                            <div>
                                <p className="font-bold">Great work today!</p>
                                <p className="text-xs opacity-80">You worked for {formatDuration(elapsedTime)}.</p>
                            </div>
                        </div>
                        <Textarea placeholder="End of day report (optional)..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                        <Button onClick={handleCheckOut} className="w-full bg-red-600 hover:bg-red-700">Confirm Check Out</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-center">
                    <p className="text-sm text-slate-600 font-medium">Shift completed. See you tomorrow!</p>
                </div>
            )}
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
