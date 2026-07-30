"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { 
  Users, PhoneCall, Coffee, Power, Clock, CheckCircle2, Loader2, AlertCircle, CalendarClock, Edit, PauseCircle, PlayCircle, Activity, Target 
} from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

import { LoadingSkeleton } from "@/components/loading-skeleton"
import { forceUpdateAgentStatus } from "@/app/actions/admin-actions"
import { setAutoDialerStatus } from "@/app/actions/auto-dialer-actions"

// --- TYPES ---
interface Agent {
  id: string
  full_name: string
  phone: string
  current_status: string
  status_reason: string | null
  status_updated_at: string | null
  auto_dialer_status: string 
}

type FilterState = 'all' | 'online' | 'ready' | 'on_call' | 'break' | 'offline';

const formatDuration = (seconds: number) => {
  if (isNaN(seconds) || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

function AgentStatsModal({ agent, open, onClose }: { agent: Agent | null, open: boolean, onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [stats, setStats] = useState({ ready: 0, on_call: 0, wrap_up: 0, break: 0, offline: 0 });
  const supabase = createClient();

  useEffect(() => {
    if (!open || !agent) return;
    const fetchStats = async () => {
      setLoading(true);
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

      const { data } = await supabase.from('agent_state_logs')
        .select('status, started_at, ended_at, duration_seconds')
        .eq('user_id', agent.id).gte('started_at', startOfDay.toISOString());

      const totals = { ready: 0, on_call: 0, wrap_up: 0, break: 0, offline: 0 };

      if (data) {
        data.forEach((log: any) => {
          let duration = log.duration_seconds || 0;
          if (!log.ended_at) duration = Math.floor((Date.now() - new Date(log.started_at).getTime()) / 1000);
          const status = (log.status || '').toLowerCase();
          if (status === 'ready' || status === 'active') totals.ready += duration;
          else if (status === 'on_call' || status === 'on call') totals.on_call += duration;
          else if (status === 'wrap_up' || status === 'wrap up') totals.wrap_up += duration;
          else if (status === 'break') totals.break += duration;
          else if (status === 'offline') totals.offline += duration;
        });
      }
      setStats(totals);
      setLoading(false);
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [agent, open, supabase]);

  const handleForceStatusChange = async (newStatus: string) => {
    if (!agent) return;
    setIsUpdating(true);
    const reason = newStatus === 'break' ? 'Admin Forced Break' : 'Admin Override';
    const res = await forceUpdateAgentStatus(agent.id, newStatus, reason);
    setIsUpdating(false);
    if (!res.success) toast.error(res.error || "Failed to override status");
    else { toast.success(`Agent forced to ${newStatus.replace('_', ' ')}`); onClose(); }
  }

  const handleToggleDialer = async (checked: boolean) => {
      if (!agent) return;
      const status = checked ? 'active' : 'paused';
      const res = await setAutoDialerStatus(agent.id, status);
      if (res.success) toast.success(`Auto-dialer ${status} for ${agent.full_name}`);
      else toast.error("Failed to toggle auto-dialer");
  }

  if (!agent) return null;
  const totalLoginTime = stats.ready + stats.on_call + stats.wrap_up + stats.break;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="text-xl font-bold text-slate-800">{agent.full_name}</span>
            <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">Today's Report</Badge>
          </DialogTitle>
          <p className="text-sm text-slate-500 font-mono">{agent.phone}</p>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
        ) : (
          <div className="space-y-4 pt-4">
            
            {/* 🔴 NEW: INDIVIDUAL AUTO-DIALER TOGGLE */}
            <div className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${agent.auto_dialer_status === 'paused' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className="flex items-center gap-2">
                    {agent.auto_dialer_status === 'paused' ? <PauseCircle className="h-5 w-5 text-amber-600"/> : <PlayCircle className="h-5 w-5 text-emerald-600"/>}
                    <div>
                        <h4 className={`text-sm font-bold ${agent.auto_dialer_status === 'paused' ? 'text-amber-800' : 'text-emerald-800'}`}>Auto-Dialer Control</h4>
                        <p className={`text-xs ${agent.auto_dialer_status === 'paused' ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {agent.auto_dialer_status === 'paused' ? 'Dialer is paused.' : 'Dialer is active.'}
                        </p>
                    </div>
                </div>
                <Switch checked={agent.auto_dialer_status !== 'paused'} onCheckedChange={handleToggleDialer} />
            </div>

            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-700">
                <CalendarClock className="h-5 w-5" />
                <span className="font-semibold text-sm uppercase tracking-wide">Total Login Time</span>
              </div>
              <span className="text-xl font-black text-indigo-900">{formatDuration(totalLoginTime)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex flex-col justify-center">
                <span className="text-xs text-emerald-600 font-bold uppercase mb-1 flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> Ready</span>
                <span className="text-lg font-bold text-emerald-800">{formatDuration(stats.ready)}</span>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex flex-col justify-center">
                <span className="text-xs text-blue-600 font-bold uppercase mb-1 flex items-center gap-1"><PhoneCall className="h-3 w-3"/> On Call</span>
                <span className="text-lg font-bold text-blue-800">{formatDuration(stats.on_call)}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Edit className="h-3 w-3" /> Admin Status Override
              </label>
              <div className="flex gap-2 items-center">
                <Select disabled={isUpdating} onValueChange={handleForceStatusChange} defaultValue={agent.current_status?.toLowerCase() || 'offline'}>
                  <SelectTrigger className="w-full bg-slate-50"><SelectValue placeholder="Force status change..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ready">Force Ready</SelectItem>
                    <SelectItem value="on_call">Force On Call</SelectItem>
                    <SelectItem value="wrap_up">Force Wrap-Up</SelectItem>
                    <SelectItem value="break">Force Break</SelectItem>
                    <SelectItem value="offline">Force Offline</SelectItem>
                  </SelectContent>
                </Select>
                {isUpdating && <Loader2 className="h-5 w-5 animate-spin text-indigo-600 shrink-0" />}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AgentCard({ agent, onClick }: { agent: Agent, onClick: () => void }) {
  const [timer, setTimer] = useState(0)

  useEffect(() => {
    const startTime = agent.status_updated_at ? new Date(agent.status_updated_at).getTime() : Date.now()
    setTimer(Math.floor((Date.now() - startTime) / 1000))
    const interval = setInterval(() => {
      setTimer(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [agent.status_updated_at, agent.current_status])

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  let bgColor = "bg-slate-100 border-slate-200"
  let icon = <Power className="h-5 w-5 text-slate-500" />
  let statusText = "Offline"
  let textColor = "text-slate-700"
  let isWarning = false

  const normalizedStatus = (agent.current_status || 'offline').toLowerCase()

  switch(normalizedStatus) {
    case 'ready': 
    case 'active':
      bgColor = "bg-emerald-50 border-emerald-200"
      icon = <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      statusText = "Ready for Calls"
      textColor = "text-emerald-700"
      break;
    case 'on_call': 
    case 'on call':
      bgColor = "bg-blue-50 border-blue-200 shadow-md ring-1 ring-blue-400"
      icon = <PhoneCall className="h-5 w-5 text-blue-600 animate-pulse" />
      statusText = "On Call"
      textColor = "text-blue-700"
      break;
    case 'wrap_up': 
    case 'wrap up':
      bgColor = "bg-amber-50 border-amber-200"
      icon = <Clock className="h-5 w-5 text-amber-600" />
      statusText = "Wrap-Up (Notes)"
      textColor = "text-amber-700"
      if (timer > 300) isWarning = true; 
      break;
    case 'break': 
      bgColor = "bg-orange-50 border-orange-200"
      icon = <Coffee className="h-5 w-5 text-orange-600" />
      statusText = agent.status_reason || "On Break"
      textColor = "text-orange-700"
      if (timer > 1800) isWarning = true; 
      break;
  }

  return (
    <Card onClick={onClick} className={`transition-all relative duration-300 cursor-pointer hover:shadow-md hover:scale-[1.02] ${bgColor}`}>
      {/* 🔴 NEW: PAUSE INDICATOR */}
      {agent.auto_dialer_status === 'paused' && (
          <div className="absolute -top-2 -right-2 bg-amber-500 text-white rounded-full p-1 shadow-md" title="Auto-Dialer Paused">
              <PauseCircle className="h-4 w-4" />
          </div>
      )}
      
      <CardContent className="p-5 flex flex-col justify-between h-full">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-bold text-lg text-slate-800">{agent.full_name || "Unknown Agent"}</h3>
            <p className="text-xs text-slate-500 font-mono">{agent.phone || "No Phone"}</p>
          </div>
          <div className={`p-2 rounded-full bg-white shadow-sm`}>{icon}</div>
        </div>
        
        <div className="flex items-center justify-between mt-auto pt-4 border-t border-black/5">
          <Badge variant="outline" className={`border-none px-0 ${textColor} font-semibold text-sm`}>{statusText}</Badge>
          <div className={`text-sm font-bold flex items-center gap-1 ${isWarning ? 'text-red-600 animate-pulse' : 'text-slate-600'}`}>
            {isWarning && <AlertCircle className="h-4 w-4" />}
            {formatTime(timer)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminWallboardPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterState>('all')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const supabase = createClient()

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || null

  useEffect(() => {
    const fetchAgents = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, full_name, phone, current_status, status_reason, status_updated_at, auto_dialer_status')
        .in('role', ['telecaller', 'agent'])
        .order('full_name', { ascending: true })
      if (data) setAgents(data as Agent[])
      setLoading(false)
    }

    fetchAgents()

    const channel = supabase.channel('wallboard_updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload: any) => {
        const updatedUser = payload.new as Agent
        setAgents(prev => prev.map(agent => agent.id === updatedUser.id ? { ...agent, ...updatedUser } : agent))
      }).subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  const [sentimentStats, setSentimentStats] = useState({ positive: 0, neutral: 0, negative: 0, total: 0 })

  useEffect(() => {
    const fetchSentimentStats = async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: todayLeads } = await supabase
        .from('leads')
        .select('status, tags, updated_at')
        .gte('updated_at', startOfDay.toISOString());

      if (todayLeads) {
        let pos = 0, neu = 0, neg = 0;
        todayLeads.forEach((lead: any) => {
          const tags = Array.isArray(lead.tags) ? lead.tags : [];
          const status = lead.status;
          
          const isPos = tags.some((t: string) => t.includes("Hot Prospect")) || ["Interested", "Documents_Sent", "Login", "Disbursed"].includes(status);
          const isNeg = tags.some((t: string) => t.includes("Do Not Call")) || ["Not_Interested", "not_eligible"].includes(status);
          
          if (isPos) pos++;
          else if (isNeg) neg++;
          else neu++;
        });
        setSentimentStats({ positive: pos, neutral: neu, negative: neg, total: todayLeads.length });
      }
    }

    fetchSentimentStats();
    const interval = setInterval(fetchSentimentStats, 60000); // 🔴 OPTIMIZED: Poll every 60s instead of 15s to reduce DB load
    return () => clearInterval(interval);
  }, [supabase]);


  const handleGlobalDialer = async (status: 'active' | 'paused') => {
      const res = await setAutoDialerStatus('ALL', status);
      if (res.success) toast.success(`All auto-dialers have been ${status}.`);
      else toast.error("Failed to update global dialer status.");
  }

  if (loading) return <LoadingSkeleton variant="dashboard" />;

  const onlineAgents = agents.filter(a => a.current_status !== 'offline' && a.current_status !== '');
  const readyCount = agents.filter(a => a.current_status === 'ready' || a.current_status === 'active').length;
  const onCallCount = agents.filter(a => a.current_status === 'on_call' || a.current_status === 'on call').length;
  const breakCount = agents.filter(a => a.current_status === 'break').length;
  const offlineCount = agents.filter(a => a.current_status === 'offline' || a.current_status === '').length;

  const filteredAgents = agents.filter(a => {
    const s = (a.current_status || 'offline').toLowerCase();
    if (activeFilter === 'all') return true;
    if (activeFilter === 'online') return s !== 'offline' && s !== '';
    if (activeFilter === 'ready') return s === 'ready' || s === 'active';
    if (activeFilter === 'on_call') return s === 'on_call' || s === 'on call';
    if (activeFilter === 'break') return s === 'break';
    if (activeFilter === 'offline') return s === 'offline' || s === '';
    return true;
  })

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <Users className="h-8 w-8 text-indigo-600" />
            Live Floor Wallboard
          </h1>
          <p className="text-slate-500 mt-1">Real-time monitoring of all telecaller activities.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
            {/* 🔴 NEW: NAVIGATION BUTTONS */}
            <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                <Link href="/admin/dialer-assignment">
                    <Button variant="ghost" className="text-slate-700 hover:bg-slate-50 hover:text-indigo-700">
                        Dialer Assignment
                    </Button>
                </Link>
                <div className="w-px bg-slate-200 mx-1"></div>
                <Link href="/admin/operations">
                    <Button variant="ghost" className="text-slate-700 hover:bg-slate-50 hover:text-indigo-700">
                        Operations
                    </Button>
                </Link>
            </div>

            {/* GLOBAL AUTO DIALER CONTROLS */}
            <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                <Button variant="ghost" onClick={() => handleGlobalDialer('active')} className="text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800">
                    <PlayCircle className="h-4 w-4 mr-2" /> Resume All Dialers
                </Button>
                <div className="w-px bg-slate-200 mx-1"></div>
                <Button variant="ghost" onClick={() => handleGlobalDialer('paused')} className="text-amber-700 hover:bg-amber-50 hover:text-amber-800">
                    <PauseCircle className="h-4 w-4 mr-2" /> Pause All Dialers
                </Button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card onClick={() => setActiveFilter(prev => prev === 'online' ? 'all' : 'online')} className={`bg-white shadow-sm border-slate-200 cursor-pointer hover:shadow-md transition-all ${activeFilter === 'online' ? 'ring-2 ring-indigo-500 scale-[1.02]' : 'hover:scale-[1.02]'}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-slate-500 font-medium">Total Online</p><h2 className="text-3xl font-bold text-slate-800">{onlineAgents.length}</h2></div>
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${activeFilter === 'online' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600'}`}><Users /></div>
          </CardContent>
        </Card>
        
        <Card onClick={() => setActiveFilter(prev => prev === 'ready' ? 'all' : 'ready')} className={`bg-emerald-50 border-emerald-200 shadow-sm cursor-pointer hover:shadow-md transition-all ${activeFilter === 'ready' ? 'ring-2 ring-emerald-500 scale-[1.02]' : 'hover:scale-[1.02]'}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-emerald-600 font-medium">Ready (Waiting)</p><h2 className="text-3xl font-bold text-emerald-700">{readyCount}</h2></div>
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${activeFilter === 'ready' ? 'bg-emerald-600 text-white' : 'bg-emerald-200 text-emerald-700'}`}><CheckCircle2 /></div>
          </CardContent>
        </Card>

        <Card onClick={() => setActiveFilter(prev => prev === 'on_call' ? 'all' : 'on_call')} className={`bg-blue-50 border-blue-200 shadow-sm cursor-pointer hover:shadow-md transition-all ${activeFilter === 'on_call' ? 'ring-2 ring-blue-500 scale-[1.02]' : 'hover:scale-[1.02]'}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-blue-600 font-medium">On Active Call</p><h2 className="text-3xl font-bold text-blue-700">{onCallCount}</h2></div>
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${activeFilter === 'on_call' ? 'bg-blue-600 text-white' : 'bg-blue-200 text-blue-700'}`}><PhoneCall /></div>
          </CardContent>
        </Card>

        <Card onClick={() => setActiveFilter(prev => prev === 'break' ? 'all' : 'break')} className={`bg-orange-50 border-orange-200 shadow-sm cursor-pointer hover:shadow-md transition-all ${activeFilter === 'break' ? 'ring-2 ring-orange-500 scale-[1.02]' : 'hover:scale-[1.02]'}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-orange-600 font-medium">On Break</p><h2 className="text-3xl font-bold text-orange-700">{breakCount}</h2></div>
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${activeFilter === 'break' ? 'bg-orange-600 text-white' : 'bg-orange-200 text-orange-700'}`}><Coffee /></div>
          </CardContent>
        </Card>

        <Card onClick={() => setActiveFilter(prev => prev === 'offline' ? 'all' : 'offline')} className={`bg-slate-50 border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-all ${activeFilter === 'offline' ? 'ring-2 ring-slate-500 scale-[1.02]' : 'hover:scale-[1.02]'}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-slate-500 font-medium">Offline</p><h2 className="text-3xl font-bold text-slate-700">{offlineCount}</h2></div>
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${activeFilter === 'offline' ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-600'}`}><Power /></div>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Sentiment Analytics Floor Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <Card className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white shadow-xl border-slate-800 overflow-hidden relative group">
          {/* Glassmorphic overlay & gradients */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
          <CardContent className="p-6 relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="flex justify-between items-center">
                <div>
                  <Badge className="bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border-0 mb-2">Live Analytics</Badge>
                  <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-indigo-400 animate-pulse" />
                    Daily Call Sentiment & Floor Receptiveness
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">Total Updates Today</span>
                  <p className="text-2xl font-black text-slate-100">{sentimentStats.total}</p>
                </div>
              </div>

              {/* Progress bars & metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                {/* Positive Sentiment */}
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-sm relative overflow-hidden transition-all hover:bg-white/10">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-emerald-400">Positive 🔥</span>
                    <span className="text-lg font-bold">{sentimentStats.total ? Math.round((sentimentStats.positive / sentimentStats.total) * 100) : 0}%</span>
                  </div>
                  <p className="text-xs text-slate-400">{sentimentStats.positive} Leads</p>
                  <div className="h-1.5 bg-white/10 rounded-full mt-3 overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                      style={{ width: `${sentimentStats.total ? (sentimentStats.positive / sentimentStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Neutral Sentiment */}
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-sm relative overflow-hidden transition-all hover:bg-white/10">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-blue-400">Neutral ❄️</span>
                    <span className="text-lg font-bold">{sentimentStats.total ? Math.round((sentimentStats.neutral / sentimentStats.total) * 100) : 0}%</span>
                  </div>
                  <p className="text-xs text-slate-400">{sentimentStats.neutral} Leads</p>
                  <div className="h-1.5 bg-white/10 rounded-full mt-3 overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-500" 
                      style={{ width: `${sentimentStats.total ? (sentimentStats.neutral / sentimentStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Negative Sentiment */}
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-sm relative overflow-hidden transition-all hover:bg-white/10">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-red-400">Negative 🚫</span>
                    <span className="text-lg font-bold">{sentimentStats.total ? Math.round((sentimentStats.negative / sentimentStats.total) * 100) : 0}%</span>
                  </div>
                  <p className="text-xs text-slate-400">{sentimentStats.negative} Leads</p>
                  <div className="h-1.5 bg-white/10 rounded-full mt-3 overflow-hidden">
                    <div 
                      className="h-full bg-red-500 rounded-full transition-all duration-500" 
                      style={{ width: `${sentimentStats.total ? (sentimentStats.negative / sentimentStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* List Quality Rating Indicator */}
            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📊</span>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Floor Receptiveness Index</h4>
                  <p className="text-xs text-slate-400">Reflects current daily interest rates across calling lists</p>
                </div>
              </div>
              <div className="text-right">
                <Badge className={cn(
                  "px-3 py-1 text-xs border-0 font-bold tracking-wider uppercase",
                  (sentimentStats.total ? (sentimentStats.positive / sentimentStats.total) * 100 : 0) > 40 
                    ? "bg-emerald-500/20 text-emerald-400" 
                    : (sentimentStats.total ? (sentimentStats.positive / sentimentStats.total) * 100 : 0) > 20 
                    ? "bg-blue-500/20 text-blue-400" 
                    : "bg-red-500/20 text-red-400"
                )}>
                  {
                    (sentimentStats.total ? (sentimentStats.positive / sentimentStats.total) * 100 : 0) > 40 
                      ? "High Performance ✨" 
                      : (sentimentStats.total ? (sentimentStats.positive / sentimentStats.total) * 100 : 0) > 20 
                      ? "Stable Floor 📈" 
                      : "Critical Alert 🚨"
                  }
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dynamic Caller Success Ring card */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between overflow-hidden">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div>
              <Badge variant="outline" className="bg-slate-50 text-slate-600 dark:bg-slate-950 border-slate-200 mb-2">Efficiency KPI</Badge>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Target className="h-5 w-5 text-indigo-500" />
                Floor Conversion Quality
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Ratio of Hot Prospects to total answered calls today.</p>
              
              <div className="flex flex-col items-center justify-center py-6">
                <div className="relative flex items-center justify-center">
                  <svg className="w-28 h-28 transform -rotate-90">
                    <defs>
                      <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#ec4899" />
                      </linearGradient>
                    </defs>
                    <circle cx="56" cy="56" r="46" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="8" fill="transparent" />
                    <circle 
                      cx="56" 
                      cy="56" 
                      r="46" 
                      stroke="url(#ringGradient)" 
                      strokeWidth="8" 
                      fill="transparent" 
                      strokeDasharray={2 * Math.PI * 46} 
                      strokeDashoffset={2 * Math.PI * 46 * (1 - (sentimentStats.total ? (sentimentStats.positive / (sentimentStats.positive + sentimentStats.negative || 1)) : 0))} 
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute text-center">
                    <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                      {sentimentStats.positive + sentimentStats.negative ? Math.round((sentimentStats.positive / (sentimentStats.positive + sentimentStats.negative)) * 100) : 0}%
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Interest Ratio</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
              <span>Answered Calls: {sentimentStats.positive + sentimentStats.negative}</span>
              <span>Conversion: {sentimentStats.positive} Hot Leads</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Caller Grid Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAgents.map(agent => <AgentCard key={agent.id} agent={agent} onClick={() => setSelectedAgentId(agent.id)} />)}
        </div>
      </div>

      <AgentStatsModal agent={selectedAgent} open={!!selectedAgentId} onClose={() => setSelectedAgentId(null)} />
    </div>
  )
}
