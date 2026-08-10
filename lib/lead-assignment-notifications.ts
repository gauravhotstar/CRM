"use client"

import { createClient } from "@/lib/supabase/client"
import { notificationService } from "@/lib/notification-service"
import { toast } from "sonner"

export interface LeadAssignmentNotification {
  leadId: string
  leadName: string
  leadPhone: string
  leadEmail?: string
  assignedTo: string
  assignedBy: string
  assignedAt: string
  priority?: string
  loanAmount?: number
  loanType?: string
}

export class LeadAssignmentNotificationManager {
  private supabase = createClient()
  private assignmentQueue: any[] = []
  private batchTimeoutId: ReturnType<typeof setTimeout> | null = null

  // Send notification when lead is assigned
  async notifyLeadAssignment(notification: LeadAssignmentNotification): Promise<void> {
    try {
      console.log("Sending lead assignment notification:", notification)
      
      // Get assigned user details
      const { data: assignedUser, error: userError } = await this.supabase
        .from("users")
        .select("full_name, email, notification_preferences, tenant_id")
        .eq("id", notification.assignedTo)
        .single()

      if (userError || !assignedUser) {
        console.error("Error fetching assigned user:", userError)
        return
      }

      // Check if user has assignment notifications enabled
      const preferences = assignedUser.notification_preferences || {}
      if (preferences.assignment_notifications === false) {
        console.log("User has disabled assignment notifications")
        return
      }

      // Create notification content
      const title = "🎯 New Lead Assigned"
      const message = `${notification.leadName} has been assigned to you`
      const details = this.formatLeadDetails(notification)

      // 1. Insert notification into notifications table
      await this.storeNotification(notification, title, message, assignedUser.tenant_id);

      // 2. Show browser notification
      await notificationService.showBrowserNotification({
        title,
        body: `${message}${details}`,
        tag: `lead-assignment-${notification.leadId}`,
        requireInteraction: true,
      })

      // 3. Show toast notification
      toast.success(title, {
        description: `${message}${details}`,
        action: {
          label: "View Lead",
          onClick: () => {
            window.open(`/telecaller/leads/${notification.leadId}`, "_blank")
          },
        },
        duration: 8000,
      })

      // 4. Send push notification if desired
      await this.sendPushNotification(notification, title, message, details);
    } catch (error) {
      console.error("Error sending lead assignment notification:", error)
    }
  }

  // Store notification in notifications table
  private async storeNotification(
    notification: LeadAssignmentNotification,
    title: string,
    message: string,
    tenantId?: string
  ): Promise<void> {
    try {
      const payload: any = {
        user_id: notification.assignedTo,
        type: "lead_assignment",
        title,
        message: `${message}.`,
        follow_up_id: null,
        lead_id: notification.leadId,
        read: false,
      };
      if (tenantId) payload.tenant_id = tenantId;

      const { error } = await this.supabase.from("notifications").insert(payload);

      if (error) {
        console.error("Error storing notification:", error);
      }
    } catch (error) {
      console.error("Error storing notification:", error);
    }
  }

  // Send push notification via API
  private async sendPushNotification(
    notification: LeadAssignmentNotification,
    title: string,
    message: string,
    details: string
  ): Promise<void> {
    try {
      const response = await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userIds: [notification.assignedTo],
          type: "lead_assignment",
          title,
          message: `${message}${details}`,
          lead_id: notification.leadId,
          follow_up_id: null
        }),
      });

      if (!response.ok) {
        console.error("Failed to send push notification:", await response.text());
      }
    } catch (error) {
      console.error("Error sending push notification:", error);
    }
  }

  // Format lead details for notification
  private formatLeadDetails(notification: LeadAssignmentNotification): string {
    const details = []

    if (notification.priority && notification.priority !== "medium") {
      details.push(`Priority: ${notification.priority.toUpperCase()}`)
    }

    if (notification.loanAmount) {
      details.push(`Amount: ₹${notification.loanAmount.toLocaleString()}`)
    }

    if (notification.loanType) {
      details.push(`Type: ${notification.loanType}`)
    }

    return details.length > 0 ? ` (${details.join(", ")})` : ""
  }

  // Bulk notification for multiple assignments
  async notifyBulkAssignment(assignments: LeadAssignmentNotification[], assignedTo: string): Promise<void> {
    try {
      // Get assigned user details
      const { data: assignedUser, error: userError } = await this.supabase
        .from("users")
        .select("full_name, email, notification_preferences, tenant_id")
        .eq("id", assignedTo)
        .single()

      if (userError || !assignedUser) {
        console.error("Error fetching assigned user:", userError)
        return
      }

      // Check if user has assignment notifications enabled
      const preferences = assignedUser.notification_preferences || {}
      if (preferences.assignment_notifications === false) {
        return
      }

      const count = assignments.length
      const title = `🎯 ${count} New Leads Assigned`
      const message = `${count} leads have been assigned to you`

      // 1. Insert for all notifications
      const notificationInserts = assignments.map(a => {
        const payload: any = {
          user_id: assignedTo,
          type: "lead_assignment",
          title: "🎯 New Lead Assigned",
          message: `${a.leadName} has been assigned to you.`,
          follow_up_id: null,
          lead_id: a.leadId,
          read: false,
        };
        if (assignedUser.tenant_id) payload.tenant_id = assignedUser.tenant_id;
        return payload;
      });
      await this.supabase.from("notifications").insert(notificationInserts);

      // 2. Browser notification
      await notificationService.showBrowserNotification({
        title,
        body: message,
        tag: `bulk-assignment-${Date.now()}`,
        requireInteraction: true,
      })

      // 3. Toast notification
      toast.success(title, {
        description: message,
        action: {
          label: "View Leads",
          onClick: () => {
            window.open("/telecaller/leads", "_blank")
          },
        },
        duration: 8000,
      })

      // 4. Push notification
      await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userIds: [assignedTo],
          type: "bulk_lead_assignment",
          title,
          message,
          lead_ids: assignments.map((a) => a.leadId)
        }),
      })
    } catch (error) {
      console.error("Error sending bulk assignment notification:", error)
    }
  }

  // Setup real-time subscription for lead assignments
  setupRealtimeSubscription(userId: string): void {
    console.log("Setting up real-time subscription for user:", userId)
    
    const channel = this.supabase
      .channel("lead-assignments")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `assigned_to=eq.${userId}`
        },
        (payload: any) => {
          console.log("Received lead assignment UPDATE event:", payload)
          if (payload.new.assigned_to === userId && 
              (payload.old.assigned_to === null || payload.old.assigned_to !== userId)) {
            console.log("New lead assignment detected for user:", userId)
            this.handleRealtimeAssignment(payload.new)
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
          filter: `assigned_to=eq.${userId}`
        },
        (payload: any) => {
          console.log("Received new lead INSERT event:", payload)
          if (payload.new.assigned_to === userId) {
            console.log("New lead assigned to user on insert:", userId)
            this.handleRealtimeAssignment(payload.new)
          }
        },
      )
      .subscribe((status: any) => {
        console.log("Subscription status changed:", status)
        if (status === "SUBSCRIBED") {
          console.log("Successfully subscribed to lead assignments for user:", userId)
        }
      })
  }

  // Handle real-time assignment notification with debouncing
  private handleRealtimeAssignment(lead: any): void {
    this.assignmentQueue.push(lead);

    if (this.batchTimeoutId) {
      clearTimeout(this.batchTimeoutId);
    }

    this.batchTimeoutId = setTimeout(() => {
      this.processAssignmentQueue();
    }, 1500); // Wait 1.5s to see if more leads are assigned
  }

  // Process the accumulated queue
  private async processAssignmentQueue(): Promise<void> {
    if (this.assignmentQueue.length === 0) return;

    const leadsToProcess = [...this.assignmentQueue];
    this.assignmentQueue = [];
    this.batchTimeoutId = null;

    try {
      if (leadsToProcess.length === 1) {
        // Single assignment
        const lead = leadsToProcess[0];
        let leadDetails = lead;
        if (!lead.name || !lead.phone) {
          const { data, error } = await this.supabase
            .from("leads")
            .select("name, phone, email, priority, loan_amount, loan_type, assigned_by, assigned_at")
            .eq("id", lead.id)
            .single();
          
          if (!error && data) {
            leadDetails = { ...lead, ...data };
          }
        }
        
        const notification: LeadAssignmentNotification = {
          leadId: leadDetails.id,
          leadName: leadDetails.name || "Unknown Lead",
          leadPhone: leadDetails.phone || "No Phone",
          leadEmail: leadDetails.email,
          assignedTo: leadDetails.assigned_to,
          assignedBy: leadDetails.assigned_by || "System",
          assignedAt: leadDetails.assigned_at || new Date().toISOString(),
          priority: leadDetails.priority,
          loanAmount: leadDetails.loan_amount,
          loanType: leadDetails.loan_type,
        };

        await this.notifyLeadAssignment(notification);
      } else {
        // Bulk assignment
        const notifications: LeadAssignmentNotification[] = leadsToProcess.map(lead => ({
          leadId: lead.id,
          leadName: lead.name || "Unknown Lead",
          leadPhone: lead.phone || "No Phone",
          leadEmail: lead.email,
          assignedTo: lead.assigned_to,
          assignedBy: lead.assigned_by || "System",
          assignedAt: lead.assigned_at || new Date().toISOString(),
          priority: lead.priority,
          loanAmount: lead.loan_amount,
          loanType: lead.loan_type,
        }));
        
        // All leads in the queue should have the same assignedTo (the current user)
        const assignedTo = notifications[0].assignedTo;
        await this.notifyBulkAssignment(notifications, assignedTo);
      }
    } catch (error) {
      console.error("Error processing assignment queue:", error);
    }
  }

  // Test function to manually trigger a notification
  async testNotification(userId: string): Promise<void> {
    console.log("Testing notification for user:", userId)
    
    const testNotification: LeadAssignmentNotification = {
      leadId: "test-lead-id",
      leadName: "Test Lead",
      leadPhone: "+1234567890",
      assignedTo: userId,
      assignedBy: "System",
      assignedAt: new Date().toISOString(),
      priority: "high",
    }

    await this.notifyLeadAssignment(testNotification)
  }
}

export const leadAssignmentNotificationManager = new LeadAssignmentNotificationManager()
