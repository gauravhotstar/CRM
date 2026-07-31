"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
// 1. Added 'X' to the imports
import { PhoneForwarded, Loader2, Timer, CheckCircle2, User, PauseCircle, X } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { initiateC2CCall } from "@/app/actions/c2c-dialer"
import { cn } from "@/lib/utils"


export function GlobalAutoDialer() {
    const [dialState, setDialState] = useState<'idle' | 'dialing' | 'on_call' | 'wrap_up' | 'empty' | 'offline' | 'paused'>('offline')
    const [countdown, setCountdown] = useState(10) 
    const [isVisible, setIsVisible] = useState(false)
    const [currentCustomer, setCurrentCustomer] = useState<string | null>(null)
    
    // Complete Opt-Out for the company
    const [tenantEnabled, setTenantEnabled] = useState(true)

    const supabase = createClient()
    const router = useRouter()
    const { toast } = useToast()

    const stateLock = useRef<'idle' | 'dialing' | 'on_call' | 'wrap_up' | 'empty' | 'offline' | 'paused'>('offline')
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const userIdRef = useRef<string | null>(null)

    const changeState = (newState: typeof stateLock.current) => {
        stateLock.current = newState;
        setDialState(newState);
    }

    useEffect(() => {
        const initDialer = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            userIdRef.current = user.id

            // 1. Check Tenant Level Opt-Out and User Status
            const { data: userData } = await supabase.from('users').select('current_status, auto_dialer_status, tenant_id').eq('id', user.id).single()
            
            if (userData?.tenant_id) {
                const { data: settings } = await supabase.from('tenant_settings').select('auto_dialer_enabled').eq('tenant_id', userData.tenant_id).single()
                if (settings && settings.auto_dialer_enabled === false) {
                    setTenantEnabled(false);
                    setIsVisible(false);
                    return; // Abort entirely!
                }
            }

            if (userData) handleDatabaseStatusChange(userData.current_status, userData.auto_dialer_status)

            // 2. Listen for both status AND dialer_status changes
            const channelName = `auto_dialer_sync-${user.id}-${Math.random()}`;
            const channel = supabase.channel(channelName)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` }, 
                (payload: any) => handleDatabaseStatusChange(payload.new.current_status, payload.new.auto_dialer_status))
                .subscribe()

            return () => { supabase.removeChannel(channel) }
        }
        initDialer()
    }, [supabase])


    useEffect(() => {
        const triggerNextCall = async () => {
            if (dialState === 'wrap_up' && countdown === 0) {
                if (userIdRef.current) {
                    await supabase.from('users').update({ current_status: 'ready', status_reason: 'Auto-Dialer Ready' }).eq('id', userIdRef.current);
                }
                changeState('idle');
                executeAutoDial();
            }
        };
        triggerNextCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [countdown, dialState]);

    const handleDatabaseStatusChange = (dbStatus: string, autoDialerStatus: string) => {
        if (!tenantEnabled) return;

        // CRITICAL NEW LOGIC: Intercept if Admin paused the dialer!
        if (autoDialerStatus === 'paused' && dbStatus !== 'on_call') {
            changeState('paused');
            setIsVisible(true); // Keep it visible so the agent knows it was paused by admin
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        const normalizedStatus = (dbStatus === 'ready' || dbStatus === 'active') ? 'active' : dbStatus;

        if (normalizedStatus === 'active') {
            if (['offline', 'wrap_up', 'empty', 'idle', 'on_call', 'paused'].includes(stateLock.current)) {
                changeState('idle');
                setIsVisible(true);
                executeAutoDial(); 
            }
        } else if (normalizedStatus === 'on_call') {
            changeState('on_call');
            setIsVisible(true);
            if (timerRef.current) clearInterval(timerRef.current);
        } else if (normalizedStatus === 'wrap_up') {
            if (stateLock.current !== 'wrap_up') {
                changeState('wrap_up');
                setIsVisible(true);
                startWrapUpCountdown();
            }
        } else {
            changeState('offline');
            setIsVisible(false);
            setCurrentCustomer(null);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    }

    const startWrapUpCountdown = () => {
        if (timerRef.current) clearInterval(timerRef.current)
        setCountdown(10) 
        timerRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
                return prev - 1
            })
        }, 1000)
    }

    const executeAutoDial = async () => {
        const uid = userIdRef.current
        if (!uid || stateLock.current === 'dialing' || stateLock.current === 'on_call' || stateLock.current === 'paused') return;
        
        changeState('dialing');

        try {
            let nextLead = null;
            
            // Optimized: Bundle all 7 queries into a single database RPC call
            const { data: rpcLead, error: rpcError } = await supabase.rpc('get_next_auto_dial_lead', { p_user_id: uid });
            
            if (rpcError) {
                console.error("AutoDialer RPC Error:", rpcError);
            }
            
            if (rpcLead && !rpcError) {
                nextLead = rpcLead;
            }

            if (!nextLead) {
                changeState('empty');
                setCurrentCustomer(null);
                setTimeout(() => {
                    if (stateLock.current === 'empty') executeAutoDial();
                }, 30000)
                return
            }

            setCurrentCustomer(nextLead.name);
            const res = await initiateC2CCall(nextLead.id, nextLead.phone);

            if (res.success) {
                changeState('on_call'); 
                router.push(`/telecaller/leads/${nextLead.id}`);
            } else {
                toast({ title: "Call Failed", description: res.error, variant: "destructive" })
                changeState('offline');
                await supabase.from('users').update({ current_status: 'offline', status_reason: 'API Error' }).eq('id', uid)
            }
        } catch (err) {
            console.error("AutoDial Error", err)
            changeState('offline');
        }
    }

    if (!isVisible || !tenantEnabled) return null;

    return (
        <div className={cn(
            "fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-80 z-50 rounded-2xl shadow-2xl p-4 transition-all duration-300 border backdrop-blur-md animate-in slide-in-from-bottom-5",
            dialState === 'paused' 
                ? 'bg-amber-50/95 dark:bg-amber-950/40 border-amber-400/30 shadow-amber-500/5' 
                : dialState === 'empty'
                ? 'bg-slate-50/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800 shadow-slate-500/5'
                : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800 shadow-indigo-500/5'
        )}>
            
            {/* 2. Added the Close/Dismiss Button */}
            <button
                onClick={() => setIsVisible(false)}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Hide Dialer"
            >
                <X className="h-3.5 w-3.5" />
            </button>

            {/* Glowing active indicator light */}
            <div className={cn(
                "absolute top-0 left-4 right-4 h-[3px] rounded-b-full",
                dialState === 'paused' ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
                dialState === 'empty' ? 'bg-slate-300 dark:bg-slate-600' :
                'bg-gradient-to-r from-emerald-500 to-teal-500'
            )} />

            <div className="flex items-start gap-3 mt-1">
                <div className={cn(
                    "mt-0.5 p-2 rounded-xl border flex items-center justify-center shadow-sm",
                    dialState === 'paused' ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border-amber-200' :
                    dialState === 'empty' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200' :
                    'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-emerald-100'
                )}>
                    {dialState === 'dialing' && <Loader2 className="h-5 w-5 animate-spin" />}
                    {dialState === 'on_call' && <PhoneForwarded className="h-5 w-5 animate-pulse" />}
                    {dialState === 'wrap_up' && <Timer className="h-5 w-5 animate-pulse" />}
                    {dialState === 'empty' && <CheckCircle2 className="h-5 w-5" />}
                    {dialState === 'paused' && <PauseCircle className="h-5 w-5" />}
                </div>

                <div className="flex-1 pr-6 space-y-1">
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm uppercase tracking-wider">
                        {dialState === 'dialing' && "Dialing Customer..."}
                        {dialState === 'on_call' && "Call in Progress"}
                        {dialState === 'wrap_up' && "Wrap-Up Mode"}
                        {dialState === 'empty' && "Queue Empty"}
                        {dialState === 'paused' && "Dialer Paused"}
                    </h4>
                    
                    {currentCustomer && (dialState === 'dialing' || dialState === 'on_call') && (
                        <div className="flex items-center gap-1.5 mt-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 rounded-lg px-2.5 py-1 w-fit max-w-full">
                            <User className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">{currentCustomer}</span>
                        </div>
                    )}

                    <p className={cn(
                        "text-[11px] font-medium leading-relaxed mt-1",
                        dialState === 'paused' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
                    )}>
                        {dialState === 'wrap_up' && `Next call starts in ${countdown}s...`}
                        {dialState === 'on_call' && "Waiting for hangup..."}
                        {dialState === 'dialing' && "Please answer your phone."}
                        {dialState === 'empty' && "Auto-polling for leads."}
                        {dialState === 'paused' && "Admin has paused your dialer."}
                    </p>
                </div>
            </div>
        </div>
    )
}
