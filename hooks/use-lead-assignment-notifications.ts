"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { leadAssignmentNotificationManager } from "@/lib/lead-assignment-notifications"
import { notificationService } from "@/lib/notification-service"

export function useLeadAssignmentNotifications(userId?: string) {
  const supabase = createClient()

  useEffect(() => {
    console.log("useLeadAssignmentNotifications hook called with userId:", userId)
    
    if (!userId) {
      console.log("No userId provided, skipping notification setup")
      return
    }

    // Setup real-time subscription for lead assignments
    console.log("Setting up real-time subscription for lead assignments")
    leadAssignmentNotificationManager.setupRealtimeSubscription(userId)

    // Request notification permission if not already granted
    if (typeof window !== "undefined" && "Notification" in window) {
      console.log("Checking notification permission status:", Notification.permission)
      if (Notification.permission === "default") {
        console.log("Requesting notification permission")
        notificationService.requestPermission().then((permission) => {
          if (permission === "granted") {
            console.log("Notification permission granted")
          } else {
            console.log("Notification permission denied or dismissed")
          }
        })
      } else if (Notification.permission === "granted") {
        console.log("Notification permission already granted")
      } else {
        console.log("Notification permission previously denied")
      }
    }

    return () => {
      console.log("Cleaning up subscription channels")
      // Cleanup subscriptions when component unmounts
      leadAssignmentNotificationManager.teardownRealtimeSubscription()
    }
  }, [userId, supabase])
}