"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export function useTelecallerStatus(telecallerIds: string[]) {
  const [telecallerStatus, setTelecallerStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // We use a ref to track IDs to prevent unnecessary effect re-running if the array reference changes but content doesn't
  const idsRef = useRef(telecallerIds);
  // Update ref if the actual IDs stringified changes
  if (JSON.stringify(idsRef.current) !== JSON.stringify(telecallerIds)) {
    idsRef.current = telecallerIds;
  }

  const fetchStatus = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setTelecallerStatus({});
      setLoading(false);
      return;
    }

    // Note: We don't set loading(true) here because this runs on real-time updates. 
    // If we set loading true, the UI might flicker "loading..." every time someone checks out.
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: attendanceRecords, error } = await supabase
        .from("attendance")
        .select("user_id, check_in, check_out") // ⬅️ CRITICAL: Fetch check_out
        .eq("date", today)
        .in("user_id", ids);

      if (error) {
        console.error("Error fetching attendance records:", error);
        return;
      }

      const statusMap: Record<string, boolean> = {};
      
      // Initialize all as offline
      ids.forEach(id => {
        statusMap[id] = false; 
      });

      // Update status based on Logic: Online = Checked In AND Not Checked Out
      attendanceRecords?.forEach((record: any) => {
        if (record.check_in && !record.check_out) {
          statusMap[record.user_id] = true;
        } else {
            // If check_out exists, they are Offline
            statusMap[record.user_id] = false;
        }
      });

      setTelecallerStatus(statusMap);
    } catch (error) {
      console.error("Error checking telecaller status:", error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    const currentIds = idsRef.current;
    
    // 1. Initial Fetch
    setLoading(true); // Only show loading on mount/ID change
    fetchStatus(currentIds);

    // 2. Real-Time Subscription
    const channelName = `public:attendance-${Math.random()}`;
    const attendanceChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT (check-in) and UPDATE (check-out)
          schema: 'public',
          table: 'attendance',
        },
        (payload: any) => {
          // Directly update the local state without hitting the database to prevent Thundering Herd
          const record = payload.new || payload.old;
          if (!record || !record.user_id) return;
          
          const currentIds = idsRef.current;
          
          if (currentIds.includes(record.user_id)) {
             setTelecallerStatus(prev => {
                const isOnline = Boolean(record.check_in && !record.check_out);
                if (prev[record.user_id] === isOnline) return prev;
                return { ...prev, [record.user_id]: isOnline };
             });
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(attendanceChannel);
    };
    
  }, [fetchStatus, supabase, idsRef.current]); // Dependency is the Ref content

  return { telecallerStatus, loading };
}
