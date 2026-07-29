"use client";

import { useState, useEffect } from "react";
import { 
  Bell, 
  X, 
  Clock, 
  LogOut, 
  AlertCircle, 
  CheckCircle,
  UserCheck
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { attendanceNotificationService } from "@/lib/attendance-notifications";
import { format, parseISO } from "date-fns";

export function AttendanceNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let channel: any;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      loadNotifications(user.id);
      
      // Set up real-time subscription for new notifications
      const channelName = `notifications-${user.id}-${Math.random()}`;
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload: any) => {
            // Add new notification to the list
            setNotifications(prev => [payload.new, ...prev]);
            setUnreadCount(prev => prev + 1);
          }
        )
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const loadNotifications = async (userId: string) => {
    try {
      const userNotifications = await attendanceNotificationService.getUnreadNotifications(userId);
      setNotifications(userNotifications);
      setUnreadCount(userNotifications.length);
    } catch (error) {
      console.error("Error loading notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await attendanceNotificationService.markAsRead(notificationId);
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId ? { ...n, read: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await attendanceNotificationService.markAllAsRead(user.id);
      setNotifications(prev => 
        prev.map(n => ({ ...n, read: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'late_checkin':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'early_checkout':
        return <LogOut className="h-4 w-4 text-blue-500" />;
      case 'missed_punch':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'absenteeism':
        return <UserCheck className="h-4 w-4 text-red-500" />;
      case 'reminder':
        return <Bell className="h-4 w-4 text-green-500" />;
      case 'adjustment':
        return <CheckCircle className="h-4 w-4 text-purple-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'late_checkin':
        return 'bg-yellow-50 border-yellow-200';
      case 'early_checkout':
        return 'bg-blue-50 border-blue-200';
      case 'missed_punch':
        return 'bg-red-50 border-red-200';
      case 'absenteeism':
        return 'bg-red-50 border-red-200';
      case 'reminder':
        return 'bg-green-50 border-green-200';
      case 'adjustment':
        return 'bg-purple-50 border-purple-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  if (loading) {
    return (
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="p-2 border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Notifications</h3>
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={markAllAsRead}
                className="text-xs"
              >
                Mark all as read
              </Button>
            )}
          </div>
        </div>
        
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No notifications</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <DropdownMenuItem 
                key={notification.id} 
                className={`flex flex-col items-start p-3 ${getNotificationColor(notification.type)} ${!notification.read ? 'border-l-4 border-blue-500' : ''}`}
                onClick={() => markAsRead(notification.id)}
              >
                <div className="flex w-full items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getNotificationIcon(notification.type)}
                    <span className="font-medium text-sm">{notification.title}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5"
                    onClick={(e) => {
                      e.stopPropagation();
                      markAsRead(notification.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {format(parseISO(notification.created_at), "MMM dd, hh:mm a")}
                </p>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}