"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link"; // 🔴 ADDED LINK IMPORT
import { format, startOfMonth, endOfMonth, subMonths, addMonths, parseISO, isSameDay, isAfter, eachDayOfInterval, subDays, getDay, getDate, isWeekend } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Calendar as CalendarIcon, Users, Clock, CheckCircle, XCircle, AlertCircle, 
  Coffee, UserCheck, Search, Settings, ChevronRight, BarChart3, List, MessageSquare, 
  Printer, Building2, Globe, Plus, Trash2, ChevronLeft, Activity,
  FileText, LineChart, Camera // 🔴 ADDED CAMERA ICON
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from "sonner";

// --- TYPES ---
type User = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string;
  is_active: boolean;
};

type AttendanceRecord = {
  id: string;
  user_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: number | null;
  overtime_hours: number | null;
  status?: string; 
  location_check_in?: any;
  location_check_out?: any;
  ip_check_in?: string;
  ip_check_out?: string;
  device_info_check_in?: string;
  device_info_check_out?: string;
  selfie_url_check_in?: string;
  selfie_url_check_out?: string;
  on_break?: boolean;
  updated_at?: string;
  admin_note?: string; 
  user?: User;
};

type ActivityItem = {
  id: string;
  type: 'check-in' | 'check-out' | 'break-start';
  user_name: string;
  time: string;
  timestamp: number;
  location?: any;
};

type Office = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
};

type Holiday = {
  id: string;
  date: string; 
  name: string;
  type: 'public' | 'custom';
  is_working_day: boolean;
};

const ITEMS_PER_PAGE = 10;
const MAX_SHIFT_HOURS = 9;

// --- HELPER: HAVERSINE DISTANCE (KM) ---
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);  
  const dLon = deg2rad(lon2 - lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}

function deg2rad(deg: number) {
  return deg * (Math.PI/180);
}

// --- MAIN COMPONENT ---
export function AdminAttendanceDashboard() {
  const supabase = createClient();

  // --- STATE ---
  // 🔴 EXPLICIT TENANT FILTER STATE
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: new Date(),
    end: new Date()
  });
  const [view, setView] = useState<'daily' | 'monthly'>('daily');
  const [users, setUsers] = useState<User[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  
  const [loading, setLoading] = useState(true);
  
  // Filters & Config
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lateThresholdHour, setLateThresholdHour] = useState(9);
  const [lateThresholdMinute, setLateThresholdMinute] = useState(30);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Offices
  const [offices, setOffices] = useState<Office[]>([]);
  const [newOfficeName, setNewOfficeName] = useState("");
  const [newOfficeLat, setNewOfficeLat] = useState("");
  const [newOfficeLng, setNewOfficeLng] = useState("");

  // Holidays
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [isFetchingHolidays, setIsFetchingHolidays] = useState(false);
  const [enableSecondSaturdayHoliday, setEnableSecondSaturdayHoliday] = useState(false);

  // Modals & User Data
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userMonthData, setUserMonthData] = useState<AttendanceRecord[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);

  const [activeEmployees, setActiveEmployees] = useState<number>(0);
  const [employeesOnBreak, setEmployeesOnBreak] = useState<number>(0);

  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");
  const [editNote, setEditNote] = useState("");
  
  const [missingCheckoutCount, setMissingCheckoutCount] = useState(0);
  const [missingRecords, setMissingRecords] = useState<AttendanceRecord[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Broadcaster settings state
  const [broadcasts, setBroadcasts] = useState<{ [userId: string]: { id?: string; message: string; is_active: boolean } }>({});
  const [broadcastSearch, setBroadcastSearch] = useState("");

  // --- 1. INITIALIZE TENANT ID ---
  useEffect(() => {
    const initAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
        if (data?.tenant_id) {
          setTenantId(data.tenant_id);
        }
      }
    };
    initAuth();

    const savedSecondSat = localStorage.getItem('enableSecondSaturdayHoliday');
    if (savedSecondSat) setEnableSecondSaturdayHoliday(JSON.parse(savedSecondSat));
  }, [supabase]);

  // --- 2. FETCH OFFICES & LOCAL SETTINGS ONCE TENANT IS KNOWN ---
  useEffect(() => {
    if (!tenantId) return;

    const fetchOffices = async () => {
      // 🔴 FILTER OFFICES BY TENANT
      const { data, error } = await supabase.from('office_locations').select('*').eq('tenant_id', tenantId);
      if (!error && data && data.length > 0) {
        setOffices(data);
      } else {
        setOffices([{ id: 'default-1', name: 'HQ (Default)', lat: 12.9716, lng: 77.5946, radius: 0.5 }]);
      }
    };
    fetchOffices();
  }, [tenantId, supabase]);

  // --- REAL-TIME SUBSCRIPTION ---
  useEffect(() => {
    if (!tenantId) return;

    loadData();
    let timeoutId: NodeJS.Timeout;

    const channel = supabase
      .channel('attendance-dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        // Debounce by 5 seconds to prevent Thundering Herd from multiple check-ins
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            loadData();
            if(selectedUser) openUserModal(selectedUser);
        }, 5000);
      })
      .subscribe();
      
    return () => { 
      clearTimeout(timeoutId);
      supabase.removeChannel(channel); 
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, view, tenantId]); 

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, departmentFilter, statusFilter, view, dateRange]);

  // --- DATA LOADING ---
  const loadData = async () => {
    if (!tenantId) return;
    setLoading(true);

    try {
      const startDateStr = format(dateRange.start, "yyyy-MM-dd");
      const endDateStr = format(dateRange.end, "yyyy-MM-dd");
      const feedDateStr = format(new Date(), "yyyy-MM-dd"); 
      const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");

      // 🔴 ALL QUERIES EXPLICITLY FILTERED BY tenantId
      const [usersRes, attendanceRes, feedRes, missingRes, holidaysRes, broadcastsRes] = await Promise.all([
        supabase.from("users").select("*").eq("is_active", true).eq('tenant_id', tenantId).order("full_name"),
        supabase.from("attendance").select(`*, user:users!attendance_user_id_fkey(full_name, email, department)`)
          .eq('tenant_id', tenantId)
          .gte("date", startDateStr)
          .lte("date", endDateStr)
          .order("date", { ascending: false }),
        supabase.from("attendance").select(`*, user:users!attendance_user_id_fkey(full_name)`)
          .eq('tenant_id', tenantId)
          .eq("date", feedDateStr),
        supabase.from("attendance").select(`*, user:users!attendance_user_id_fkey(full_name)`)
          .eq('tenant_id', tenantId)
          .eq("date", yesterdayStr)
          .not("check_in", "is", null)
          .is("check_out", null),
        supabase.from("holidays").select("*")
          .eq('tenant_id', tenantId)
          .gte("date", format(startOfMonth(dateRange.start), "yyyy-MM-dd"))
          .lte("date", format(endOfMonth(dateRange.end), "yyyy-MM-dd")),
        supabase.from("employee_broadcasts").select("*").eq('tenant_id', tenantId)
      ]);

      if (usersRes.error) throw usersRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      setUsers(usersRes.data || []);
      setAttendanceData(attendanceRes.data || []);
      if (holidaysRes.data) setHolidays(holidaysRes.data);

      if (broadcastsRes.data) {
        const map: { [userId: string]: { id: string; message: string; is_active: boolean } } = {};
        broadcastsRes.data.forEach((b: any) => {
          map[b.user_id] = { id: b.id, message: b.message, is_active: b.is_active };
        });
        setBroadcasts(map);
      }
      
      setMissingCheckoutCount(missingRes.data?.length || 0);
      setMissingRecords(missingRes.data || []);

      if (feedRes.data) {
        let feed: ActivityItem[] = [];
        let activeCount = 0;
        let breakCount = 0;

        feedRes.data.forEach((record: any) => {
          if (record.check_in && !record.check_out) activeCount++;
          if (record.on_break) breakCount++;

          if (record.check_in) {
            feed.push({ id: `${record.id}-in`, type: 'check-in', user_name: record.user?.full_name || 'Unknown', time: record.check_in, timestamp: new Date(record.check_in).getTime(), location: record.location_check_in });
          }
          if (record.check_out) {
            feed.push({ id: `${record.id}-out`, type: 'check-out', user_name: record.user?.full_name || 'Unknown', time: record.check_out, timestamp: new Date(record.check_out).getTime() });
          }
        });

        feed.sort((a, b) => b.timestamp - a.timestamp);
        setActivityFeed(feed);
        setActiveEmployees(activeCount);
        setEmployeesOnBreak(breakCount);
      }
    } catch (error) {
      console.error("Dashboard Load Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBroadcast = async (userId: string, message: string, isActive: boolean) => {
    try {
      const existing = broadcasts[userId];
      
      if (existing?.id) {
        const { error } = await supabase
          .from("employee_broadcasts")
          .update({
            message: message,
            is_active: isActive,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id);
          
        if (error) throw error;
        toast.success("Personalized announcement updated successfully!");
      } else {
        const { data, error } = await supabase
          .from("employee_broadcasts")
          .insert({
            user_id: userId,
            message: message,
            is_active: isActive,
            tenant_id: tenantId
          })
          .select()
          .single();
          
        if (error) throw error;
        setBroadcasts(prev => ({
          ...prev,
          [userId]: { id: data.id, message: data.message, is_active: data.is_active }
        }));
        toast.success("Personalized announcement registered successfully!");
      }
      
      // Reload broadcasts to sync state
      const { data: updatedData } = await supabase
        .from("employee_broadcasts")
        .select("*")
        .eq("tenant_id", tenantId);
      if (updatedData) {
        const map: { [userId: string]: { id: string; message: string; is_active: boolean } } = {};
        updatedData.forEach((b: any) => {
          map[b.user_id] = { id: b.id, message: b.message, is_active: b.is_active };
        });
        setBroadcasts(map);
      }
    } catch (err: any) {
      console.error("Failed to update broadcast:", err);
      toast.error(err.message || "Failed to update broadcast notice.");
    }
  };

  const openUserModal = async (user: User) => {
    setSelectedUser(user);
    setLoadingModal(true);
    const monthStart = format(startOfMonth(dateRange.start), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(dateRange.start), "yyyy-MM-dd");

    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", monthStart)
      .lte("date", monthEnd);

    if (data) {
        const processed = data.map((r: any) => ({ ...r, status: determineStatus(r) }));
        setUserMonthData(processed);
    } else {
        setUserMonthData([]);
    }
    setLoadingModal(false);
  };

  // --- LOGIC HELPERS ---
  const determineStatus = (record: any) => {
    if (!record.check_in) return "absent";
    const checkInTime = parseISO(record.check_in);
    const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
    const thresholdMinutes = lateThresholdHour * 60 + lateThresholdMinute;
    if (checkInMinutes > thresholdMinutes) return "late";
    return "present";
  };

  const calculateLateMinutes = (checkInTime: string) => {
    const time = parseISO(checkInTime);
    const checkInMinutes = time.getHours() * 60 + time.getMinutes();
    const thresholdMinutes = lateThresholdHour * 60 + lateThresholdMinute;
    return Math.max(0, checkInMinutes - thresholdMinutes);
  };

  const checkIfHoliday = (dateObj: Date, dateStr: string) => {
    const dbHoliday = holidays.find(h => h.date === dateStr);
    if (dbHoliday) {
      if (!dbHoliday.is_working_day) return { isHoliday: true, name: dbHoliday.name };
      if (dbHoliday.is_working_day) return { isHoliday: false, name: "" }; 
    }
    if (getDay(dateObj) === 0) return { isHoliday: true, name: "Sunday" };
    if (enableSecondSaturdayHoliday && getDay(dateObj) === 6) {
      const dateNum = getDate(dateObj);
      if (dateNum >= 8 && dateNum <= 14) return { isHoliday: true, name: "Second Saturday" };
    }
    return { isHoliday: false, name: "" };
  };

  const getLocationType = (data: any) => {
    if (!data) return { type: 'unknown', name: 'Unknown', distance: 0 };
    try {
      const loc = typeof data === 'string' ? JSON.parse(data) : data;
      const lat = loc.latitude || (loc.coordinates ? parseFloat(loc.coordinates.split(',')[0]) : 0);
      const lng = loc.longitude || (loc.coordinates ? parseFloat(loc.coordinates.split(',')[1]) : 0);
      
      if (!lat || !lng) return { type: 'unknown', name: 'Unknown', distance: 0 };

      let closestOffice = null;
      let minDistance = Infinity;

      offices.forEach(office => {
        const dist = getDistanceFromLatLonInKm(lat, lng, office.lat, office.lng);
        if (dist < minDistance) {
          minDistance = dist;
          closestOffice = office;
        }
      });

      if (closestOffice && minDistance <= (closestOffice as Office).radius) {
        return { type: 'office', name: (closestOffice as Office).name, distance: minDistance.toFixed(2) };
      } else {
        return { type: 'remote', name: 'Remote', distance: minDistance.toFixed(1) };
      }
    } catch (e) { return { type: 'unknown', name: 'Unknown', distance: 0 }; }
  };

  const getLocationUrl = (data: any) => {
    if (!data) return null;
    try {
      const loc = typeof data === 'string' ? JSON.parse(data) : data;
      if (loc.latitude && loc.longitude) return `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`;
      if (loc.coordinates) return `https://www.google.com/maps/search/?api=1&query=${loc.coordinates}`;
    } catch (e) { return null; }
    return null;
  };

  const formatLocationText = (data: any) => {
    const info = getLocationType(data);
    if (info.type === 'office') return `On-Site (${info.name})`;
    if (info.type === 'remote') return `Remote (${info.distance}km)`;
    return "Unknown Location";
  };

  const getReliabilityScore = (userRecords: AttendanceRecord[]) => {
    if (userRecords.length === 0) return 0;
    const present = userRecords.filter(r => r.status !== 'absent').length;
    const lates = userRecords.filter(r => r.status === 'late').length;
    const rawScore = ((present * 3) - (lates * 1)); 
    const basis = Math.max(userRecords.length, 5) * 3; 
    let score = (rawScore / basis) * 100;
    return Math.min(100, Math.max(0, Math.round(score)));
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-emerald-600 bg-emerald-50 border-emerald-200";
    if (score >= 75) return "text-blue-600 bg-blue-50 border-blue-200";
    if (score >= 50) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  // --- ACTIONS ---
  
  const handleSecondSatToggle = (checked: boolean) => {
    setEnableSecondSaturdayHoliday(checked);
    localStorage.setItem('enableSecondSaturdayHoliday', JSON.stringify(checked));
    toast.success(checked ? "Second Saturday Holiday Enabled" : "Second Saturday Holiday Disabled");
  };

  const addCustomHoliday = async () => {
    if (!newHolidayName || !newHolidayDate) return toast.error("Fill all fields");
    
    // 🔴 Inject Tenant ID to keep it isolated
    const { data, error } = await supabase.from('holidays').insert([{
      tenant_id: tenantId, date: newHolidayDate, name: newHolidayName, type: 'custom', is_working_day: false
    }]).select().single();
    
    if (error) return toast.error("Failed to add holiday");
    setHolidays([...holidays, data]);
    setNewHolidayName(""); setNewHolidayDate("");
    toast.success("Holiday added!");
  };
  
  const toggleWorkingDay = async (holiday: Holiday) => {
    const { error } = await supabase.from('holidays').update({ is_working_day: !holiday.is_working_day }).eq('id', holiday.id);
    if (!error) {
      setHolidays(holidays.map(h => h.id === holiday.id ? { ...h, is_working_day: !h.is_working_day } : h));
      toast.success("Holiday updated");
    }
  };

  const deleteHoliday = async (id: string) => {
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (!error) {
      setHolidays(holidays.filter(h => h.id !== id));
      toast.success("Holiday removed");
    } else {
      toast.error("Failed to delete holiday");
    }
  };
  
  const fetchPublicHolidays = async (year: number) => {
    setIsFetchingHolidays(true);
    try {
      const API_KEY = "z2BG2S5Bso9KhBX3uWHy3WXAkPWdaSev";
      const res = await fetch(`https://calendarific.com/api/v2/holidays?api_key=${API_KEY}&country=IN&year=${year}`);
      const data = await res.json();
  
      if (data.meta.code !== 200) throw new Error(data.meta.error_detail || "API fetch failed");
  
      const holidaysList = data.response.holidays;
      const majorHolidays = holidaysList.filter((h: any) => 
        h.type.includes("National holiday") || h.type.includes("Gazetted Holiday") || h.type.includes("Restricted Holiday")
      );
  
      // 🔴 Inject Tenant ID into API fetched holidays
      const formattedHolidays = majorHolidays.map((h: any) => ({
        tenant_id: tenantId, date: h.date.iso.split('T')[0], name: h.name, type: 'public', is_working_day: false
      }));
  
      const { error } = await supabase.from('holidays').upsert(formattedHolidays, { onConflict: 'date' });
      if (error) throw error;
      
      toast.success(`Imported ${formattedHolidays.length} public holidays for ${year}`);
      loadData(); 
    } catch (e) {
      console.error(e);
      toast.error("Failed to sync public holidays");
    } finally {
      setIsFetchingHolidays(false);
    }
  };

  const addOffice = async () => {
    if (!newOfficeName || !newOfficeLat || !newOfficeLng) return toast.error("Please fill in all fields");

    // 🔴 Inject Tenant ID to isolate Office Location
    const newOffice = { tenant_id: tenantId, name: newOfficeName, lat: parseFloat(newOfficeLat), lng: parseFloat(newOfficeLng), radius: 0.5 };
    const { data, error } = await supabase.from('office_locations').insert([newOffice]).select().single();
    if (error) { toast.error("Failed to save office"); return; }

    setOffices([...offices, data]);
    setNewOfficeName(""); setNewOfficeLat(""); setNewOfficeLng("");
    toast.success("Office location added");
  };

  const removeOffice = async (id: string) => {
    const prevOffices = [...offices];
    setOffices(offices.filter(o => o.id !== id));
    const { error } = await supabase.from('office_locations').delete().eq('id', id);
    if (error) { setOffices(prevOffices); toast.error("Failed to delete office"); } 
    else toast.success("Office removed");
  };

  const handleEdit = (record: AttendanceRecord) => {
    setEditingRecord(record);
    setEditCheckIn(record.check_in ? format(parseISO(record.check_in), "HH:mm") : "");
    setEditCheckOut(record.check_out ? format(parseISO(record.check_out), "HH:mm") : "");
    setEditNote(record.admin_note || "");
  };

  const saveEdit = async () => {
    if (!editingRecord) return;
    try {
        const datePart = editingRecord.date; 
        const updates: any = { admin_note: editNote };
        if (editCheckIn) updates.check_in = `${datePart}T${editCheckIn}:00`;
        if (editCheckOut) updates.check_out = `${datePart}T${editCheckOut}:00`;
        
        if (updates.check_in && updates.check_out) {
            const start = new Date(updates.check_in);
            const end = new Date(updates.check_out);
            const diffMs = end.getTime() - start.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            updates.total_hours = parseFloat(diffHours.toFixed(2));
            updates.overtime_hours = Math.max(0, parseFloat((diffHours - 9).toFixed(2))); 
        }

        const { error } = await supabase.from('attendance').update(updates).eq('id', editingRecord.id);
        if (error) throw error;
        
        loadData(); 
        if(selectedUser) openUserModal(selectedUser);
        setEditingRecord(null);
        toast.success("Record updated successfully");
    } catch (e) { console.error(e); toast.error("Failed to update"); }
  };

  const bulkFixCheckout = async () => {
    try {
      const updates = missingRecords.map(record => {
        const checkOutTime = `${record.date}T18:00:00`;
        const start = new Date(record.check_in!);
        const end = new Date(checkOutTime);
        const diffMs = end.getTime() - start.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        
        return {
          id: record.id,
          check_out: checkOutTime,
          total_hours: parseFloat(diffHours.toFixed(2)),
          overtime_hours: 0,
          admin_note: "Auto-fixed missing checkout"
        };
      });

      for (const update of updates) {
        const { id, ...rest } = update;
        await supabase.from('attendance').update(rest).eq('id', id);
      }
      
      setShowReviewModal(false);
      loadData();
      toast.success(`${updates.length} records auto-corrected`);
    } catch (e) {
      console.error(e);
      toast.error("Bulk fix failed");
    }
  };

  // --- MEMOIZED DATA ---
  const processedData = useMemo(() => {
    return attendanceData.map(record => ({
      ...record,
      status: determineStatus(record)
    }));
  }, [attendanceData, lateThresholdHour, lateThresholdMinute]);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || user.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDept = departmentFilter === "all" || user.department === departmentFilter;
      if (statusFilter === "all") return matchesSearch && matchesDept;
      
      const userRecords = processedData.filter(a => a.user_id === user.id);
      if (view === 'daily') {
        const record = userRecords.find(r => isSameDay(parseISO(r.date), dateRange.start));
        const dayStr = format(dateRange.start, "yyyy-MM-dd");
        
        const holidayInfo = checkIfHoliday(dateRange.start, dayStr);
        const status = record ? record.status : (holidayInfo.isHoliday ? 'holiday' : 'absent');
        
        return matchesSearch && matchesDept && status === statusFilter;
      }
      return matchesSearch && matchesDept;
    });
  }, [users, searchTerm, departmentFilter, statusFilter, processedData, view, dateRange, holidays, enableSecondSaturdayHoliday]);

  // --- PAGINATION LOGIC ---
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  const departments = Array.from(new Set(users.map(u => u.department).filter(Boolean)));

  // --- CHART DATA ---
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    const trend = days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const records = processedData.filter(r => r.date === dayStr);
      const holidayInfo = checkIfHoliday(day, dayStr);

      return {
        date: format(day, "MMM dd"),
        present: records.filter(r => r.status === 'present').length,
        late: records.filter(r => r.status === 'late').length,
        absent: holidayInfo.isHoliday ? 0 : users.length - records.length
      };
    }).slice(-14);

    const lateCounts: Record<string, number> = {};
    processedData.filter(r => r.status === 'late').forEach(r => {
        const name = r.user?.full_name || 'Unknown';
        lateCounts[name] = (lateCounts[name] || 0) + 1;
    });
    const topViolators = Object.entries(lateCounts).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count).slice(0, 5);

    return { trend, topViolators };
  }, [processedData, users.length, dateRange, holidays, enableSecondSaturdayHoliday]);

  const stats = useMemo(() => {
    if (view === 'monthly') {
       return { present: processedData.filter(r => r.status === 'present').length, late: processedData.filter(r => r.status === 'late').length, absent: (users.length * 30) - processedData.length };
    }
    const dailyRecords = processedData.filter(r => isSameDay(parseISO(r.date), dateRange.start));
    const dayStr = format(dateRange.start, "yyyy-MM-dd");
    const holidayInfo = checkIfHoliday(dateRange.start, dayStr);
    
    return { 
      present: dailyRecords.filter(r => r.status === 'present').length, 
      late: dailyRecords.filter(r => r.status === 'late').length, 
      absent: holidayInfo.isHoliday ? 0 : users.length - dailyRecords.length,
      isHoliday: holidayInfo.isHoliday,
      holidayName: holidayInfo.name
    };
  }, [processedData, users.length, view, dateRange, holidays, enableSecondSaturdayHoliday]);

  const navigate = (dir: 'prev' | 'next') => {
    if (view === 'daily') {
      const d = new Date(dateRange.start);
      d.setDate(d.getDate() + (dir === 'next' ? 1 : -1));
      setDateRange({ start: d, end: d });
    } else {
      const d = dir === 'prev' ? subMonths(dateRange.start, 1) : addMonths(dateRange.start, 1);
      setDateRange({ start: startOfMonth(d), end: endOfMonth(d) });
    }
  };

  const toggleView = (newView: 'daily' | 'monthly') => {
    setView(newView);
    const today = new Date();
    if (newView === 'monthly') {
      setDateRange({ start: startOfMonth(today), end: endOfMonth(today) });
    } else {
      setDateRange({ start: today, end: today });
    }
  };

  const handlePrint = () => { window.print(); };

  const renderMonthlyHeatmap = (userRecords: AttendanceRecord[]) => {
    const start = startOfMonth(dateRange.start);
    const end = endOfMonth(dateRange.start);
    const days = eachDayOfInterval({ start, end });
    
    return (
      <div className="flex gap-1">
        {days.map((day, i) => {
           const dayStr = format(day, "yyyy-MM-dd");
           const record = userRecords.find(r => r.date === dayStr);
           const isWE = isWeekend(day);
           
           const holidayInfo = checkIfHoliday(day, dayStr);
           
           let color = "bg-slate-100"; 
           if(isWE) color = "bg-slate-50 border-dashed border-slate-200";
           if(holidayInfo.isHoliday) color = "bg-purple-200"; 
           
           if(record?.status === 'present') color = "bg-emerald-500";
           if(record?.status === 'late') color = "bg-yellow-400";
           if(!record && !isWE && !holidayInfo.isHoliday && isAfter(new Date(), day)) color = "bg-red-200"; 

           return (
             <TooltipProvider key={dayStr}>
               <Tooltip>
                 <TooltipTrigger>
                    <div className={`w-2.5 h-6 rounded-sm ${color} transition-colors`} />
                 </TooltipTrigger>
                 <TooltipContent className="text-xs">
                    <p className="font-bold">{format(day, "MMM dd")}</p>
                    <p>{record ? `${record.status} (${record.check_in ? format(parseISO(record.check_in), "HH:mm") : "?"})` : holidayInfo.isHoliday ? holidayInfo.name : isWE ? "Weekend" : "Absent"}</p>
                 </TooltipContent>
               </Tooltip>
             </TooltipProvider>
           )
        })}
        </div>
        );
      };

    if (!tenantId) {
    return <div className="flex h-screen items-center justify-center"><AlertCircle className="h-8 w-8 text-slate-300 animate-pulse" /></div>
  }

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-slate-50/30 dark:bg-slate-950/10 min-h-screen print:p-0 print:bg-white animate-in fade-in duration-300">
      
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Attendance Manager</h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Real-time workforce monitoring and operational analytics</p>
        </div>
        
        <div className="flex flex-wrap gap-2.5 items-center">
          <Button variant="outline" size="icon" onClick={() => setShowSettingsModal(true)} className="h-9 w-9 border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs transition-all rounded-xl">
             <Settings className="h-4.5 w-4.5"/>
          </Button>

          <div className="flex items-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
            <Button variant="ghost" size="icon" onClick={() => navigate('prev')} className="h-9 w-9 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-none text-slate-600 dark:text-slate-400">{"<"}</Button>
            <div className="px-4 font-semibold text-xs text-slate-700 dark:text-slate-350 select-none">
               {view === 'daily' ? format(dateRange.start, "MMM dd, yyyy") : format(dateRange.start, "MMMM yyyy")}
            </div>
            <Button variant="ghost" size="icon" onClick={() => navigate('next')} className="h-9 w-9 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-none text-slate-600 dark:text-slate-400">{">"}</Button>
          </div>

          <Link href="/admin/reports/attendance">
            <Button variant="outline" className="h-9 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-305 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs font-semibold text-xs px-3 rounded-xl transition-all">
              <FileText className="mr-2 h-4 w-4 text-slate-500" /> Report
            </Button>
          </Link>
          <Link href="/admin/attendance/analytics">
            <Button variant="outline" className="h-9 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-305 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs font-semibold text-xs px-3 rounded-xl transition-all">
              <LineChart className="mr-2 h-4 w-4 text-slate-500" /> Analytics
            </Button>
          </Link>

          <Link href="/admin/attendance/kiosk">
            <Button className="h-9 bg-indigo-600 hover:bg-indigo-755 text-white shadow-2xs font-semibold text-xs px-3 rounded-xl transition-all flex items-center gap-1.5 border border-indigo-650">
              <Camera className="h-3.5 w-3.5 text-white animate-pulse" /> Launch Kiosk
            </Button>
          </Link>

          <Button variant="outline" onClick={handlePrint} className="h-9 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-305 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs font-semibold text-xs px-3 rounded-xl transition-all">
            <Printer className="mr-2 h-4 w-4 text-slate-500" /> Print
          </Button>
        </div>
      </div>

      {/* Alarm Warning Alert */}
      {missingCheckoutCount > 0 && (
        <div className="bg-rose-50/80 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/30 rounded-2xl p-4 flex items-center justify-between shadow-2xs print:hidden animate-in slide-in-from-top duration-300">
           <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 dark:bg-rose-950/50 rounded-xl text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                 <p className="text-sm font-bold text-rose-950 dark:text-rose-200">{missingCheckoutCount} employees did not clock out yesterday.</p>
                 <p className="text-xs font-medium text-rose-650 dark:text-rose-405 mt-0.5">Please review the yesterday's logs to verify total shift hours.</p>
              </div>
           </div>
           <Button size="sm" variant="destructive" className="h-8.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition-all" onClick={() => setShowReviewModal(true)}>Review Logs</Button>
        </div>
      )}

      {/* Tabs Control */}
      <Tabs defaultValue="roster" className="w-full">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-6 print:hidden">
           <TabsList className="bg-slate-100 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 p-1 rounded-xl w-fit">
             <TabsTrigger value="roster" className="gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-2xs"><List className="h-3.5 w-3.5"/> Roster</TabsTrigger>
             <TabsTrigger value="analytics" className="gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-2xs"><BarChart3 className="h-3.5 w-3.5"/> Analytics</TabsTrigger>
             <TabsTrigger value="broadcasts" className="gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-2xs"><MessageSquare className="h-3.5 w-3.5 text-indigo-500"/> Announcements</TabsTrigger>
           </TabsList>
           
           <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200/60 dark:border-slate-800/80 rounded-xl w-fit">
              <Button variant={view === 'daily' ? 'default' : 'ghost'} size="sm" onClick={() => toggleView('daily')} className={`text-xs h-7 px-3 font-semibold rounded-lg ${view === 'daily' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs' : 'text-slate-650 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'}`}>Daily</Button>
              <Button variant={view === 'monthly' ? 'default' : 'ghost'} size="sm" onClick={() => toggleView('monthly')} className={`text-xs h-7 px-3 font-semibold rounded-lg ${view === 'monthly' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs' : 'text-slate-650 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'}`}>Monthly</Button>
           </div>
        </div>

        <TabsContent value="roster" className="space-y-6 focus-visible:outline-none">
          {view === 'daily' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
              <div className="relative overflow-hidden border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs rounded-2xl p-5 hover:shadow-xs transition-all duration-300 group">
                <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-blue-500 to-indigo-500" />
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Staff</p>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-2">{users.length}</h2>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl group-hover:scale-105 transition-transform duration-300">
                    <Users className="h-5.5 w-5.5" />
                  </div>
                </div>
              </div>

              <div className="relative overflow-hidden border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs rounded-2xl p-5 hover:shadow-xs transition-all duration-300 group">
                <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-emerald-500 to-teal-500" />
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Present</p>
                    <h2 className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-2">{stats.present}</h2>
                  </div>
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl group-hover:scale-105 transition-transform duration-300">
                    <CheckCircle className="h-5.5 w-5.5" />
                  </div>
                </div>
              </div>

              <div className="relative overflow-hidden border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs rounded-2xl p-5 hover:shadow-xs transition-all duration-300 group">
                <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-amber-500 to-orange-500" />
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Late Arrivals</p>
                    <h2 className="text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400 mt-2">{stats.late}</h2>
                  </div>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl group-hover:scale-105 transition-transform duration-300">
                    <Clock className="h-5.5 w-5.5" />
                  </div>
                </div>
              </div>

              <div className="relative overflow-hidden border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs rounded-2xl p-5 hover:shadow-xs transition-all duration-300 group">
                <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-rose-500 to-red-500" />
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{stats.isHoliday ? 'Holiday' : 'Absent'}</p>
                    <h2 className={`text-3xl font-bold tracking-tight mt-2 ${stats.isHoliday ? 'text-purple-600 dark:text-purple-400' : 'text-rose-600 dark:text-rose-400'}`}>{stats.isHoliday ? 'Yes' : stats.absent}</h2>
                  </div>
                  <div className={`p-3 rounded-2xl group-hover:scale-105 transition-transform duration-300 ${stats.isHoliday ? 'bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400'}`}>
                    <XCircle className="h-5.5 w-5.5" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 print:block">
            <div className="lg:col-span-3 space-y-4">
              <Card className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs rounded-2xl overflow-hidden print:shadow-none print:border-0">
                <CardHeader className="pb-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 print:hidden">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3.5">
                    <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Users className="h-4.5 w-4.5 text-blue-500" /> Roster Directory
                    </CardTitle>
                    
                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                      <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
                        <Input placeholder="Search employee..." className="pl-8.5 w-full md:w-48 h-9 text-xs bg-white dark:bg-slate-950 border-slate-200/85 dark:border-slate-850 rounded-xl focus-visible:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                      </div>
                      <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                        <SelectTrigger className="w-28 md:w-32 h-9 text-xs bg-white dark:bg-slate-950 border-slate-200/85 dark:border-slate-850 rounded-xl"><SelectValue placeholder="Department" /></SelectTrigger>
                        <SelectContent className="dark:bg-slate-950 dark:border-slate-800"><SelectItem value="all">All Depts</SelectItem>{departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                      {view === 'daily' && (
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="w-28 md:w-32 h-9 text-xs bg-white dark:bg-slate-950 border-slate-200/85 dark:border-slate-850 rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
                          <SelectContent className="dark:bg-slate-950 dark:border-slate-800"><SelectItem value="all">All Status</SelectItem><SelectItem value="present">Present</SelectItem><SelectItem value="late">Late</SelectItem><SelectItem value="absent">Absent</SelectItem><SelectItem value="holiday">Holiday</SelectItem></SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-100 dark:border-slate-850">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[200px] text-xs font-bold text-slate-500 dark:text-slate-400 py-3.5 pl-5 uppercase tracking-wider">Employee</TableHead>
                          {view === 'daily' ? (
                            <>
                              <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3.5 uppercase tracking-wider">Status</TableHead>
                              <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3.5 uppercase tracking-wider">Check-In</TableHead>
                              <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3.5 uppercase tracking-wider">Check-Out</TableHead>
                              <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3.5 uppercase tracking-wider">Work Hours</TableHead>
                              <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3.5 uppercase tracking-wider pr-5">Location</TableHead>
                            </>
                          ) : (
                            <>
                              <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3.5 uppercase tracking-wider">Reliability</TableHead>
                              <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3.5 uppercase tracking-wider">Pattern</TableHead>
                              <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3.5 uppercase tracking-wider">Avg Hours</TableHead>
                              <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3.5 uppercase tracking-wider text-right pr-5 print:hidden">Action</TableHead>
                            </>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          [...Array(5)].map((_, i) => (
                            <TableRow key={i} className="border-b border-slate-100 dark:border-slate-850/60">
                              <TableCell colSpan={6} className="py-4 pl-5 pr-5">
                                <div className="h-9 bg-slate-100/80 dark:bg-slate-800/60 rounded-xl animate-pulse" />
                              </TableCell>
                            </TableRow>
                          ))
                        ) : paginatedUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-12 text-slate-400 dark:text-slate-505 font-medium">
                              No attendance records matches this filter.
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedUsers.map(user => {
                            const userRecords = processedData.filter(a => a.user_id === user.id);

                            if (view === 'daily') {
                              const record = userRecords.find(r => isSameDay(parseISO(r.date), dateRange.start));
                              const dayStr = format(dateRange.start, "yyyy-MM-dd");
                              
                              const holidayInfo = checkIfHoliday(dateRange.start, dayStr);
                              const status = record ? record.status : (holidayInfo.isHoliday ? 'holiday' : 'absent');
                              
                              const progress = Math.min(100, (Number(record?.total_hours || 0) / 9) * 100);
                              const locationInfo = getLocationType(record?.location_check_in);
                              
                              return (
                                <TableRow key={user.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/25 border-b border-slate-100 dark:border-slate-855 transition-colors cursor-pointer print:cursor-default group" onClick={() => openUserModal(user)}>
                                  <TableCell className="py-3 pl-5">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8.5 h-8.5 bg-gradient-to-br from-blue-500 to-indigo-500 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-2xs group-hover:scale-103 transition-transform">
                                        {getInitials(user.full_name)}
                                      </div>
                                      <div>
                                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{user.full_name}</div>
                                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-505 uppercase mt-0.5">{user.department}</div>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-3">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Badge className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-none capitalize ${
                                              status === 'late' ? 'bg-amber-50/80 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-100 dark:border-amber-900/30' : 
                                              status === 'present' ? 'bg-emerald-50/80 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30' : 
                                              status === 'holiday' ? 'bg-purple-50/80 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 border-purple-100 dark:border-purple-900/30' :
                                              'bg-rose-50/80 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-100 dark:border-rose-900/30'
                                          }`}>
                                            {status === 'late' ? 'Late' : status === 'present' ? 'Present' : status === 'holiday' ? 'Holiday' : 'Absent'}
                                          </Badge>
                                        </TooltipTrigger>
                                        {status === 'late' && record?.check_in && (
                                          <TooltipContent className="dark:bg-slate-900 dark:border-slate-800"><p className="text-xs font-semibold">Late by {calculateLateMinutes(record.check_in)} mins</p></TooltipContent>
                                        )}
                                        {status === 'holiday' && holidayInfo.isHoliday && (
                                          <TooltipContent className="dark:bg-slate-900 dark:border-slate-800"><p className="text-xs font-semibold">{holidayInfo.name}</p></TooltipContent>
                                        )}
                                      </Tooltip>
                                    </TooltipProvider>
                                  </TableCell>
                                  <TableCell className="py-3 font-mono text-xs font-semibold text-slate-650 dark:text-slate-400">
                                    {record?.check_in ? format(new Date(record.check_in), "hh:mm a") : "-"}
                                  </TableCell>
                                  <TableCell className="py-3 font-mono text-xs font-semibold text-slate-655 dark:text-slate-400">
                                    {record?.check_out ? format(new Date(record.check_out), "hh:mm a") : "-"}
                                  </TableCell>
                                  <TableCell className="py-3">
                                     <div className="flex items-center gap-2">
                                        <div className="w-16 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden print:hidden border border-slate-200/20 shadow-3xs">
                                          <div className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : record?.total_hours && record.total_hours > MAX_SHIFT_HOURS ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`} style={{ width: `${progress}%` }} />
                                        </div>
                                        <span className={`text-xs font-bold font-mono text-slate-700 dark:text-slate-350 ${record?.total_hours && record.total_hours > MAX_SHIFT_HOURS ? 'text-orange-600 dark:text-orange-400 font-extrabold' : ''}`}>{record?.total_hours || 0}h</span>
                                     </div>
                                  </TableCell>
                                  <TableCell className="py-3 pr-5">
                                    {record?.location_check_in ? (
                                      <div className="flex items-center gap-1.5 text-xs">
                                         {locationInfo.type === 'office' ? <Building2 className="h-3.5 w-3.5 text-blue-500" /> : <Globe className="h-3.5 w-3.5 text-indigo-500" />}
                                         <a href={getLocationUrl(record.location_check_in) || '#'} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 dark:text-blue-450 hover:underline print:no-underline print:text-black" onClick={(e) => e.stopPropagation()}>
                                           {formatLocationText(record.location_check_in)}
                                         </a>
                                      </div>
                                    ) : <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold">N/A</span>}
                                  </TableCell>
                                </TableRow>
                              );
                            } else {
                              const present = userRecords.filter(r => r.status !== 'absent').length;
                              const totalHrs = userRecords.reduce((acc, r) => acc + (Number(r.total_hours) || 0), 0);
                              const avgHrs = present > 0 ? (totalHrs / present).toFixed(1) : "0";
                              const score = getReliabilityScore(userRecords);

                              return (
                                <TableRow key={user.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/25 border-b border-slate-100 dark:border-slate-855 transition-colors cursor-pointer print:cursor-default group" onClick={() => openUserModal(user)}>
                                  <TableCell className="py-3 pl-5">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8.5 h-8.5 bg-gradient-to-br from-blue-500 to-indigo-500 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-2xs group-hover:scale-103 transition-transform">
                                        {getInitials(user.full_name)}
                                      </div>
                                      <div>
                                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{user.full_name}</div>
                                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-505 uppercase mt-0.5">{user.department}</div>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-3">
                                     <Badge className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-none ${getScoreColor(score)}`}>{score}% Score</Badge>
                                  </TableCell>
                                  <TableCell className="py-3">
                                     {renderMonthlyHeatmap(userRecords)}
                                  </TableCell>
                                  <TableCell className="py-3"><span className="font-bold font-mono text-slate-700 dark:text-slate-350">{avgHrs}h / day</span></TableCell>
                                  <TableCell className="py-3 text-right pr-5 print:hidden">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-450 dark:text-slate-500 group-hover:translate-x-0.5 transition-transform"><ChevronRight className="h-4.5 w-4.5"/></Button>
                                  </TableCell>
                                </TableRow>
                              )
                            }
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {filteredUsers.length > ITEMS_PER_PAGE && (
                    <div className="p-4 border-t border-slate-100 dark:border-slate-855 flex items-center justify-between">
                       <span className="text-xs font-semibold text-slate-505 dark:text-slate-405">Page {currentPage} of {totalPages}</span>
                       <div className="flex gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1} className="h-8 w-8 p-0 border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-450 hover:bg-slate-50"><ChevronLeft className="h-4.5 w-4.5"/></Button>
                          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage === totalPages} className="h-8 w-8 p-0 border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-450 hover:bg-slate-50"><ChevronRight className="h-4.5 w-4.5"/></Button>
                       </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1 space-y-6 print:hidden">
              <Card className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs rounded-2xl overflow-hidden">
                <CardHeader className="py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                  <CardTitle className="text-sm font-bold text-slate-805 dark:text-slate-200">Live Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/30 p-3 rounded-xl border border-slate-100 dark:border-slate-855">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4.5 w-4.5 text-green-500" />
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Active Now</span>
                    </div>
                    <span className="font-bold text-lg text-slate-900 dark:text-slate-100">{activeEmployees}</span>
                  </div>
                  
                  <div className="flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/30 p-3 rounded-xl border border-slate-100 dark:border-slate-855">
                    <div className="flex items-center gap-2">
                      <Coffee className="h-4.5 w-4.5 text-orange-500" />
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">On Break</span>
                    </div>
                    <span className="font-bold text-lg text-slate-900 dark:text-slate-100">{employeesOnBreak}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs rounded-2xl overflow-hidden flex flex-col h-[500px]">
                <CardHeader className="py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                  <CardTitle className="text-sm font-bold text-slate-805 dark:text-slate-200 flex items-center gap-2">
                    <Activity className="h-4.5 w-4.5 text-indigo-500" /> Activity Feed
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-y-auto flex-1 h-[440px]">
                  {activityFeed.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 dark:text-slate-505 py-12 text-xs font-semibold">No active logs yet today.</div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-855">
                      {activityFeed.map((item) => (
                        <div key={item.id} className="p-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 flex gap-3 transition-colors group">
                          <div className="relative">
                            <div className="w-8.5 h-8.5 bg-gradient-to-br from-slate-400 to-slate-550 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-3xs">
                              {getInitials(item.user_name)}
                            </div>
                            <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 shadow-3xs ${item.type.includes('in') ? 'bg-green-500' : 'bg-slate-400'}`} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-850 dark:text-slate-200">{item.user_name}</p>
                            <p className="text-[10px] font-bold text-slate-405 dark:text-slate-500 mt-1 flex items-center gap-1.5 uppercase">
                              {item.type === 'check-in' ? 'Checked In' : item.type === 'check-out' ? 'Checked Out' : 'Break'} 
                              <span className="text-slate-300 dark:text-slate-700">•</span> 
                              {format(new Date(item.time), "hh:mm a")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6 focus-visible:outline-none print:hidden">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs rounded-2xl overflow-hidden">
                 <CardHeader className="py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                   <CardTitle className="text-sm font-bold text-slate-805 dark:text-slate-200">Attendance Trend</CardTitle>
                   <CardDescription className="text-xs mt-0.5">Present vs Late arrivals tracking</CardDescription>
                 </CardHeader>
                 <CardContent className="h-[300px] pt-5">
                    <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={chartData.trend}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                          <XAxis dataKey="date" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} tick={{fill: '#94a3b8'}} />
                          <YAxis fontSize={11} fontWeight={600} tickLine={false} axisLine={false} tick={{fill: '#94a3b8'}} />
                          <RechartsTooltip contentStyle={{ background: '#0F172A', borderColor: '#1E293B', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                          <Legend wrapperStyle={{fontSize: '11px', fontWeight: '600'}} />
                          <Bar dataKey="present" fill="#10b981" radius={[4,4,0,0]} stackId="a" name="Present" />
                          <Bar dataKey="late" fill="#f59e0b" radius={[4,4,0,0]} stackId="a" name="Late" />
                          <Bar dataKey="absent" fill="#ef4444" radius={[4,4,0,0]} stackId="a" name="Absent" />
                       </BarChart>
                    </ResponsiveContainer>
                 </CardContent>
              </Card>

              <Card className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs rounded-2xl overflow-hidden">
                 <CardHeader className="py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                   <CardTitle className="text-sm font-bold text-slate-805 dark:text-slate-200 flex items-center gap-2"><AlertCircle className="h-4.5 w-4.5 text-amber-500"/> Frequent Latecomers</CardTitle>
                   <CardDescription className="text-xs mt-0.5">Top employee records with late check-ins this month</CardDescription>
                 </CardHeader>
                 <CardContent className="p-5">
                    <div className="space-y-3.5">
                       {chartData.topViolators.map((user, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-slate-50/40 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-855 p-3 rounded-xl shadow-3xs">
                             <div className="flex items-center gap-3">
                                <div className="w-6.5 h-6.5 bg-red-100 dark:bg-red-950/30 rounded-full flex items-center justify-center text-xs font-bold text-red-700 dark:text-red-400 shadow-3xs">{idx+1}</div>
                                <span className="font-semibold text-sm text-slate-850 dark:text-slate-250">{user.name}</span>
                             </div>
                             <Badge variant="outline" className="bg-red-50 text-red-700 border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30 text-[10px] font-bold rounded-full">{user.count} Times</Badge>
                          </div>
                       ))}
                       {chartData.topViolators.length === 0 && <div className="text-center text-slate-450 dark:text-slate-505 py-12 font-medium">No late check-ins recorded this month.</div>}
                    </div>
                 </CardContent>
              </Card>
            </div>
         </TabsContent>

        <TabsContent value="broadcasts" className="space-y-6 focus-visible:outline-none print:hidden">
          <Card className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs rounded-2xl overflow-hidden">
            <CardHeader className="py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <MessageSquare className="h-4.5 w-4.5 text-indigo-500" /> Customized Reminders & Broadcasts
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Leave reminders or critical daily broadcast notices for specific employees. These will be read aloud by the speech synthesizer when they scan in at any gate kiosk.
                  </CardDescription>
                </div>
                <div className="relative w-72">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search employee or department..."
                    value={broadcastSearch}
                    onChange={(e) => setBroadcastSearch(e.target.value)}
                    className="pl-9 h-8 text-xs bg-slate-50 dark:bg-slate-950 border-slate-205 dark:border-slate-800 rounded-lg focus-visible:ring-indigo-500"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50 dark:bg-slate-950/30">
                  <TableRow className="border-b border-slate-100 dark:border-slate-800">
                    <TableHead className="text-[10px] font-bold text-slate-450 uppercase tracking-wider pl-5 py-3">Employee</TableHead>
                    <TableHead className="text-[10px] font-bold text-slate-450 uppercase tracking-wider py-3">Department</TableHead>
                    <TableHead className="text-[10px] font-bold text-slate-450 uppercase tracking-wider py-3">Audio Broadcast Message</TableHead>
                    <TableHead className="text-[10px] font-bold text-slate-450 uppercase tracking-wider py-3 text-center">Status</TableHead>
                    <TableHead className="text-[10px] font-bold text-slate-450 uppercase tracking-wider pr-5 py-3 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 dark:divide-slate-855">
                  {users
                    .filter((u) => 
                      u.full_name.toLowerCase().includes(broadcastSearch.toLowerCase()) || 
                      u.department.toLowerCase().includes(broadcastSearch.toLowerCase())
                    )
                    .map((emp) => {
                      const existing = broadcasts[emp.id] || { message: "", is_active: false };
                      return (
                        <TableRow key={emp.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                          <TableCell className="pl-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8.5 h-8.5 bg-gradient-to-br from-indigo-500 to-indigo-650 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-3xs uppercase">
                                {emp.full_name.slice(0, 2)}
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-850 dark:text-slate-200">{emp.full_name}</div>
                                <div className="text-[10px] font-semibold text-slate-405 dark:text-slate-500 truncate mt-0.5">{emp.email}</div>
                              </div>
                            </div>
                          </TableCell>
                          
                          <TableCell className="py-4 text-xs font-bold text-slate-650 dark:text-slate-400 uppercase tracking-wide">
                            {emp.department}
                          </TableCell>
                          
                          <TableCell className="py-4 max-w-sm">
                            <Textarea
                              placeholder="e.g. Please submit your weekly timesheet report to Gaurav Rajpoot today."
                              defaultValue={existing.message}
                              id={`msg-${emp.id}`}
                              className="w-full text-xs bg-slate-50/50 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800 rounded-lg p-2 resize-none h-14 focus-visible:ring-indigo-500"
                            />
                          </TableCell>
                          
                          <TableCell className="py-4 text-center">
                            <div className="flex items-center justify-center">
                              <input
                                type="checkbox"
                                defaultChecked={existing.is_active}
                                id={`active-${emp.id}`}
                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                              />
                            </div>
                          </TableCell>
                          
                          <TableCell className="py-4 pr-5 text-right">
                            <Button
                              size="sm"
                              onClick={() => {
                                const msgEl = document.getElementById(`msg-${emp.id}`) as HTMLTextAreaElement;
                                const activeEl = document.getElementById(`active-${emp.id}`) as HTMLInputElement;
                                if (msgEl && activeEl) {
                                  handleUpdateBroadcast(emp.id, msgEl.value, activeEl.checked);
                                }
                              }}
                              className="h-8.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs"
                            >
                              Save notice
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-slate-400 font-semibold text-xs">
                        No employees loaded inside active database organization registry.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Settings Configuration Modal */}
      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto rounded-2xl dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2"><Settings className="h-5 w-5 text-blue-600" /> System Settings</DialogTitle>
            <DialogDescription className="text-xs">Configure check-in thresholds and geofenced office locations.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-3">
            <div>
              <div className="flex justify-between items-center mb-3">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-350">Late Check-In Threshold</Label>
                <span className="font-bold font-mono text-xs bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg border border-slate-200/50 dark:border-slate-700/50">{lateThresholdHour}:{lateThresholdMinute.toString().padStart(2, '0')} AM</span>
              </div>
              <div className="flex gap-4 items-center bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-855">
                 <div className="flex-1 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Hours slider</span>
                    <Slider value={[lateThresholdHour]} min={7} max={11} step={1} onValueChange={(v) => setLateThresholdHour(v[0])} />
                 </div>
                 <div className="flex-1 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Minutes slider</span>
                    <Slider value={[lateThresholdMinute]} min={0} max={59} step={5} onValueChange={(v) => setLateThresholdMinute(v[0])} />
                 </div>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-855 pt-4">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-350 mb-3 block">Geo-Fenced Offices</Label>
              <div className="space-y-2 mb-3 max-h-[150px] overflow-y-auto border border-slate-100 dark:border-slate-850/80 rounded-xl p-2.5 bg-slate-50/30 dark:bg-slate-950/15">
                {offices.map(office => (
                  <div key={office.id} className="flex justify-between items-center text-xs bg-white dark:bg-slate-900 p-2.5 rounded-xl shadow-3xs border border-slate-100 dark:border-slate-855">
                    <div>
                      <p className="font-bold text-slate-805 dark:text-slate-250">{office.name}</p>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{office.lat.toFixed(4)}, {office.lng.toFixed(4)} • {office.radius}km rad</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg p-0" onClick={() => removeOffice(office.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                  </div>
                ))}
                {offices.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-505 text-center py-4 font-semibold">No active locations configured.</p>}
              </div>
              
              <div className="grid grid-cols-4 gap-2 bg-slate-50/50 dark:bg-slate-950/15 p-3 rounded-xl border border-slate-150 dark:border-slate-855">
                <Input placeholder="Location Name (e.g. Headquarters)" className="col-span-4 h-8.5 text-xs bg-white dark:bg-slate-950" value={newOfficeName} onChange={e => setNewOfficeName(e.target.value)} />
                <Input placeholder="Latitude" className="col-span-2 h-8.5 text-xs bg-white dark:bg-slate-950 font-mono" value={newOfficeLat} onChange={e => setNewOfficeLat(e.target.value)} />
                <Input placeholder="Longitude" className="col-span-2 h-8.5 text-xs bg-white dark:bg-slate-950 font-mono" value={newOfficeLng} onChange={e => setNewOfficeLng(e.target.value)} />
                <Button size="sm" className="col-span-4 h-8.5 mt-1 font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-2xs" onClick={addOffice}><Plus className="h-3.5 w-3.5 mr-1"/> Add Location</Button>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-855 pt-4">
              <div className="flex justify-between items-center mb-3">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-350">Company Holidays</Label>
                <Button variant="outline" size="sm" disabled={isFetchingHolidays} onClick={() => fetchPublicHolidays(new Date().getFullYear())} className="h-7 text-[10px] font-bold border-slate-200 dark:border-slate-800 rounded-lg shadow-3xs bg-white dark:bg-slate-950 text-slate-750 hover:bg-slate-50">
                  <Globe className="h-3 w-3 mr-1.5 text-indigo-500"/> Sync Calendar
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950/20 rounded-xl border border-slate-150 dark:border-slate-855 mb-3">
                  <div className="space-y-0.5">
                      <Label className="text-xs font-semibold text-slate-855 dark:text-slate-300">Second Saturday Off</Label>
                      <p className="text-[9px] text-slate-455 dark:text-slate-500">Automatically treat 2nd Saturday of each month as a holiday.</p>
                  </div>
                  <div className={`w-10 h-5.5 flex items-center rounded-full p-1 cursor-pointer transition-colors ${enableSecondSaturdayHoliday ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-800'}`} onClick={() => handleSecondSatToggle(!enableSecondSaturdayHoliday)}>
                      <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-xs transform transition-transform ${enableSecondSaturdayHoliday ? 'translate-x-4.5' : ''}`} />
                  </div>
              </div>
              
              <div className="space-y-2 mb-3 max-h-[150px] overflow-y-auto border border-slate-100 dark:border-slate-850/80 rounded-xl p-2.5 bg-slate-50/30 dark:bg-slate-950/15">
                {holidays.map(holiday => (
                  <div key={holiday.id} className="flex justify-between items-center text-xs bg-white dark:bg-slate-900 p-2.5 rounded-xl shadow-3xs border border-slate-100 dark:border-slate-855">
                    <div>
                      <p className="font-bold text-slate-850 dark:text-slate-255">
                        {holiday.name} <Badge variant="secondary" className="text-[8px] px-1.5 py-0.2 rounded-full uppercase ml-1">{holiday.type}</Badge>
                      </p>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{format(parseISO(holiday.date), "MMM dd, yyyy")}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className={`text-[8px] font-bold rounded-full ${holiday.is_working_day ? 'text-red-700 bg-red-50 border-red-100 dark:text-red-400 dark:bg-red-950/20' : 'text-blue-700 bg-blue-50 border-blue-100 dark:text-blue-400 dark:bg-blue-950/20'}`}>
                        {holiday.is_working_day ? "Work Day" : "Off Day"}
                      </Badge>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 px-2 rounded-lg" onClick={() => toggleWorkingDay(holiday)}>Toggle</Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg p-0" onClick={() => deleteHoliday(holiday.id)}><Trash2 className="h-4 w-4"/></Button>
                    </div>
                  </div>
                ))}
                {holidays.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-505 text-center py-4 font-semibold">No custom holidays configured.</p>}
              </div>
              
              <div className="grid grid-cols-5 gap-2 bg-slate-50/50 dark:bg-slate-950/15 p-3 rounded-xl border border-slate-150 dark:border-slate-855">
                <Input type="date" className="col-span-2 h-8.5 text-xs bg-white dark:bg-slate-950 font-semibold" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)} />
                <Input placeholder="Holiday Name" className="col-span-2 h-8.5 text-xs bg-white dark:bg-slate-950" value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} />
                <Button size="sm" className="col-span-1 h-8.5 font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-2xs" onClick={addCustomHoliday}>Add</Button>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-100 dark:border-slate-855 pt-4">
             <Button onClick={() => setShowSettingsModal(false)} className="h-9 text-xs font-semibold px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-850 dark:text-slate-200 rounded-xl shadow-3xs border border-slate-200/50 dark:border-slate-700/50">Close Settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Selected Employee Month Detailed Log Modal */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl dark:bg-slate-900 dark:border-slate-800">
          {selectedUser && (() => {
             const userRecords = userMonthData;
             const lateCount = userRecords.filter(r => r.status === 'late').length;
             const totalHrs = userRecords.reduce((acc, r) => acc + (Number(r.total_hours) || 0), 0);
             
             const monthStart = startOfMonth(dateRange.start);
             const monthEnd = endOfMonth(dateRange.start);
             const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
             const startDayOfWeek = getDay(monthStart); 

             const getDayStatusColor = (day: Date) => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const record = userRecords.find(r => r.date === dayStr);
                const holidayInfo = checkIfHoliday(day, dayStr);
                
                if (record) {
                    if (record.status === 'late') return 'bg-yellow-50/80 text-yellow-700 border-yellow-250 dark:bg-yellow-950/20 dark:text-yellow-400 dark:border-yellow-900/30';
                    if (record.status === 'present') return 'bg-emerald-50/80 text-emerald-700 border-emerald-255 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30';
                }
                
                if (holidayInfo.isHoliday) return 'bg-purple-50/80 text-purple-700 border-purple-250 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30';
                return 'bg-slate-50/50 text-slate-400 border-slate-200/50 dark:bg-slate-950/30 dark:border-slate-855';
             };

             return (
               <>
                 <DialogHeader className="mb-4 border-b border-slate-100 dark:border-slate-855 pb-4">
                   <div className="flex justify-between items-start">
                     <div>
                       <DialogTitle className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                         {selectedUser.full_name}
                         <Badge variant="secondary" className="font-bold text-[10px] tracking-wide uppercase px-2 py-0.5 rounded-full">{selectedUser.department}</Badge>
                       </DialogTitle>
                       <DialogDescription className="text-xs font-semibold mt-1">Attendance Analysis Dashboard for {format(dateRange.start, "MMMM yyyy")}</DialogDescription>
                     </div>
                   </div>
                 </DialogHeader>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="col-span-1 space-y-6">
                       <div className="grid grid-cols-2 gap-3">
                          <div className="p-4 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-200/50 dark:border-blue-900/30 rounded-2xl text-center shadow-3xs">
                             <div className="text-[10px] text-blue-600 dark:text-blue-400 font-extrabold uppercase tracking-wider">Total Hours</div>
                             <div className="text-2xl font-black text-blue-700 dark:text-blue-400 mt-1">{totalHrs.toFixed(1)}h</div>
                          </div>
                          <div className="p-4 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-200/50 dark:border-amber-900/30 rounded-2xl text-center shadow-3xs">
                             <div className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold uppercase tracking-wider">Late Counts</div>
                             <div className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1">{lateCount}</div>
                          </div>
                       </div>

                       <div className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xs">
                          <div className="bg-slate-50/50 dark:bg-slate-950/20 p-3.5 border-b border-slate-150 dark:border-slate-855 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Timeline Activity</div>
                          <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-855">
                             {userRecords.slice(0, 10).map(r => (
                                <div key={r.id} className="p-3.5 border-b border-slate-100 dark:border-slate-855 text-sm flex justify-between items-center hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors cursor-pointer group" onClick={() => handleEdit(r)}>
                                   <div>
                                      <div className="font-bold text-slate-800 dark:text-slate-200 text-xs">{format(parseISO(r.date), "MMM dd, yyyy")}</div>
                                      <div className="text-[10px] font-bold text-slate-405 dark:text-slate-500 uppercase font-mono mt-1">{r.check_in ? format(parseISO(r.check_in), "hh:mm a") : "-"}</div>
                                   </div>
                                   <div className="flex flex-col items-end gap-1.5">
                                      <Badge variant="outline" className={`text-[9px] font-bold rounded-full ${r.status === 'late' ? "text-amber-700 bg-amber-50 border-amber-100 dark:text-amber-400 dark:bg-amber-950/20" : "text-emerald-700 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/20"}`}>{r.status}</Badge>
                                      {r.admin_note && <div className="text-[9px] font-bold text-slate-455 dark:text-slate-500 flex items-center gap-1.5"><MessageSquare className="w-2.5 h-2.5"/> note</div>}
                                   </div>
                                </div>
                             ))}
                             {userRecords.length === 0 && <div className="text-center text-slate-400 py-12 text-xs font-semibold">No logs this month yet.</div>}
                          </div>
                       </div>
                    </div>

                    <div className="col-span-2">
                       <div className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl p-4.5 shadow-2xs">
                          <div className="font-bold mb-4 text-center text-slate-805 dark:text-slate-200 text-sm">{format(monthStart, "MMMM yyyy")}</div>
                          <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                             {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
                          </div>
                          <div className="grid grid-cols-7 gap-2">
                             {Array.from({ length: startDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
                             
                             {monthDays.map(day => {
                                const dayStr = format(day, 'yyyy-MM-dd');
                                const record = userRecords.find(r => r.date === dayStr);
                                const holidayInfo = checkIfHoliday(day, dayStr);
                                const color = getDayStatusColor(day);
                                
                                return (
                                   <div 
                                     key={dayStr} 
                                     onClick={() => record && handleEdit(record)}
                                     className={`h-16 border rounded-xl p-1.5 flex flex-col justify-between cursor-pointer hover:ring-2 ring-blue-200 dark:ring-blue-800 transition-all ${color}`}
                                   >
                                      <div className="text-right font-black text-xs">{format(day, "d")}</div>
                                      {record ? (
                                         <div className="text-[9px] leading-tight font-mono font-bold text-center">
                                            <div>{record.check_in ? format(parseISO(record.check_in), "HH:mm") : ""}</div>
                                         </div>
                                      ) : holidayInfo.isHoliday ? (
                                         <div className="text-[8px] leading-tight text-purple-600 dark:text-purple-400 font-bold text-center mt-1 truncate px-0.5" title={holidayInfo.name}>
                                            {holidayInfo.name}
                                         </div>
                                      ) : null}
                                   </div>
                                )
                             })}
                          </div>
                       </div>
                    </div>
                 </div>
               </>
             )
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit Individual Record Modal */}
      <Dialog open={!!editingRecord} onOpenChange={(o) => !o && setEditingRecord(null)}>
         <DialogContent className="max-w-3xl rounded-2xl dark:bg-slate-900 dark:border-slate-800 overflow-y-auto max-h-[90vh]">
            <DialogHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
               <DialogTitle className="text-lg font-bold flex items-center gap-2"><Clock className="h-5 w-5 text-blue-600" /> Biometric Attendance Audit</DialogTitle>
               <DialogDescription className="text-xs">Verify biometric selfies, GPS locations, and devices for {editingRecord && format(parseISO(editingRecord.date), "MMM dd, yyyy")}.</DialogDescription>
            </DialogHeader>

            {editingRecord && (() => {
               // GPS Parser helper
               const parseGpsData = (locationField: any) => {
                 if (!locationField) return null;
                 try {
                   const loc = typeof locationField === "string" ? JSON.parse(locationField) : locationField;
                   if (loc.latitude && loc.longitude) {
                     return {
                       lat: loc.latitude,
                       lng: loc.longitude,
                       accuracy: loc.accuracy || null
                     };
                   }
                   if (loc.coordinates) {
                     const parts = loc.coordinates.split(",");
                     return {
                       lat: parseFloat(parts[0]),
                       lng: parseFloat(parts[1]),
                       accuracy: null
                     };
                   }
                 } catch (e) {
                   console.warn("Could not parse location", e);
                 }
                 return null;
               };

               return (
                 <div className="grid grid-cols-1 md:grid-cols-12 gap-6 py-4">
                   
                   {/* LEFT COLUMN: AUDIT CARD (BIOMETRICS, GPS, DEVICE) */}
                   <div className="md:col-span-5 space-y-4">
                     <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b dark:border-slate-800 pb-1">Biometric Verification</h4>
                     
                     <div className="space-y-4">
                       {/* CHECK IN SNAPSHOT */}
                       <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-150 dark:border-slate-850">
                          <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">Check-In Selfie</div>
                          {editingRecord.selfie_url_check_in ? (
                            <div className="relative w-full h-36 rounded-lg overflow-hidden border dark:border-slate-800 bg-slate-900 shadow-2xs group">
                              <img src={editingRecord.selfie_url_check_in} alt="Check In Selfie" className="w-full h-full object-cover scale-x-[-1]" />
                            </div>
                          ) : (
                            <div className="w-full h-36 bg-slate-100/50 dark:bg-slate-900 rounded-lg flex items-center justify-center text-xs text-slate-450 font-semibold border border-dashed dark:border-slate-800">No Check-in Selfie</div>
                          )}
                          
                          {/* GPS Info */}
                          {(() => {
                             const gps = parseGpsData(editingRecord.location_check_in);
                             if (!gps) return <div className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold mt-2">GPS: Not recorded</div>;
                             return (
                               <div className="mt-2 text-[10px] text-slate-550 dark:text-slate-405 font-mono space-y-0.5">
                                  <div className="font-semibold text-slate-650 dark:text-slate-400">Lat: {gps.lat.toFixed(5)}, Lng: {gps.lng.toFixed(5)}</div>
                                  {gps.accuracy && <div>Accuracy: {gps.accuracy.toFixed(0)}m</div>}
                                  <a href={`https://www.google.com/maps/search/?api=1&query=${gps.lat},${gps.lng}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-450 hover:underline font-bold mt-1 inline-flex items-center gap-1">
                                     View on Google Maps
                                  </a>
                               </div>
                             );
                          })()}
                       </div>

                       {/* CHECK OUT SNAPSHOT */}
                       <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-150 dark:border-slate-850">
                          <div className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Check-Out Selfie</div>
                          {editingRecord.selfie_url_check_out ? (
                            <div className="relative w-full h-36 rounded-lg overflow-hidden border dark:border-slate-800 bg-slate-900 shadow-2xs group">
                              <img src={editingRecord.selfie_url_check_out} alt="Check Out Selfie" className="w-full h-full object-cover scale-x-[-1]" />
                            </div>
                          ) : (
                            <div className="w-full h-36 bg-slate-100/50 dark:bg-slate-900 rounded-lg flex items-center justify-center text-xs text-slate-450 font-semibold border border-dashed dark:border-slate-800">No Check-out Selfie</div>
                          )}

                          {/* GPS Info */}
                          {(() => {
                             const gps = parseGpsData(editingRecord.location_check_out);
                             if (!gps) return <div className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold mt-2">GPS: Not recorded</div>;
                             return (
                               <div className="mt-2 text-[10px] text-slate-550 dark:text-slate-405 font-mono space-y-0.5">
                                  <div className="font-semibold text-slate-650 dark:text-slate-400">Lat: {gps.lat.toFixed(5)}, Lng: {gps.lng.toFixed(5)}</div>
                                  {gps.accuracy && <div>Accuracy: {gps.accuracy.toFixed(0)}m</div>}
                                  <a href={`https://www.google.com/maps/search/?api=1&query=${gps.lat},${gps.lng}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-450 hover:underline font-bold mt-1 inline-flex items-center gap-1">
                                     View on Google Maps
                                  </a>
                               </div>
                             );
                          })()}
                       </div>
                     </div>
                   </div>

                   {/* RIGHT COLUMN: CORRECTION FORM */}
                   <div className="md:col-span-7 space-y-5 border-l border-slate-150 dark:border-slate-800 md:pl-6">
                     <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b dark:border-slate-800 pb-1">Correction Panel</h4>
                     
                     <div className="space-y-4 py-1">
                        <div className="grid grid-cols-4 items-center gap-3">
                           <Label htmlFor="in" className="text-right text-xs font-semibold text-slate-500 uppercase">Check In</Label>
                           <Input id="in" type="time" value={editCheckIn} onChange={e => setEditCheckIn(e.target.value)} className="col-span-3 h-9 bg-white dark:bg-slate-950 rounded-xl" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-3">
                           <Label htmlFor="out" className="text-right text-xs font-semibold text-slate-500 uppercase">Check Out</Label>
                           <Input id="out" type="time" value={editCheckOut} onChange={e => setEditCheckOut(e.target.value)} className="col-span-3 h-9 bg-white dark:bg-slate-950 rounded-xl" />
                        </div>
                        <div className="grid grid-cols-4 items-start gap-3">
                           <Label htmlFor="note" className="text-right mt-2 text-xs font-semibold text-slate-500 uppercase">Reason</Label>
                           <Textarea id="note" value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Provide correction notes..." className="col-span-3 min-h-[80px] bg-white dark:bg-slate-950 text-xs rounded-xl" />
                        </div>
                     </div>

                     {/* Device details summary */}
                     <div className="bg-slate-50/50 dark:bg-slate-950/20 p-3.5 rounded-xl border border-slate-150 dark:border-slate-850 text-[10px] space-y-2.5">
                        <div className="font-bold text-slate-450 uppercase tracking-wider">Device Metadata Logs</div>
                        {editingRecord.device_info_check_in && (
                          <div className="text-slate-500"><span className="font-bold text-slate-700 dark:text-slate-350">In Device:</span> {editingRecord.device_info_check_in} {editingRecord.ip_check_in && `(IP: ${editingRecord.ip_check_in})`}</div>
                        )}
                        {editingRecord.device_info_check_out && (
                          <div className="text-slate-500"><span className="font-bold text-slate-700 dark:text-slate-350">Out Device:</span> {editingRecord.device_info_check_out} {editingRecord.ip_check_out && `(IP: ${editingRecord.ip_check_out})`}</div>
                        )}
                        {!editingRecord.device_info_check_in && !editingRecord.device_info_check_out && (
                          <div className="text-slate-450 italic">No device metadata logs captured for this shift.</div>
                        )}
                     </div>
                   </div>

                 </div>
               );
            })()}

            <DialogFooter className="border-t border-slate-100 dark:border-slate-855 pt-4">
               <Button onClick={() => setEditingRecord(null)} variant="outline" className="h-9 text-xs font-semibold rounded-xl">Cancel</Button>
               <Button type="submit" onClick={saveEdit} className="h-9 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-2xs">Save Corrections</Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>

      {/* Review Missing Checkouts Modal */}
      <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-rose-600"><AlertCircle className="h-5 w-5" /> Review Missing Checkouts</DialogTitle>
            <DialogDescription className="text-xs">Select specific employees who missed yesterday's clock-out to manual adjust.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 my-4">
             {missingRecords.length === 0 ? <p className="text-center text-slate-450 dark:text-slate-505 py-8 text-xs font-semibold">No missing records detected.</p> : (
               <div className="border border-slate-200/60 dark:border-slate-800 rounded-xl overflow-hidden shadow-3xs">
                 <Table>
                   <TableHeader className="bg-slate-50/50 dark:bg-slate-950/20">
                     <TableRow>
                       <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3 uppercase tracking-wider">Employee</TableHead>
                       <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3 uppercase tracking-wider">Check In</TableHead>
                       <TableHead className="text-xs font-bold text-slate-500 dark:text-slate-400 py-3 uppercase tracking-wider text-right pr-5">Action</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {missingRecords.map(r => (
                       <TableRow key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors border-b last:border-0 border-slate-100 dark:border-slate-855">
                         <TableCell className="font-semibold text-slate-850 dark:text-slate-200 text-xs py-3">{r.user?.full_name}</TableCell>
                         <TableCell className="font-mono text-xs text-slate-500 py-3">{r.check_in ? format(parseISO(r.check_in), "hh:mm a") : "-"}</TableCell>
                         <TableCell className="text-right py-3 pr-5"><Button variant="outline" size="sm" onClick={() => handleEdit(r)} className="h-7 text-[10px] font-bold border-slate-250 bg-white dark:bg-slate-950 dark:border-slate-800 text-slate-700 dark:text-slate-350 rounded-lg">Adjust Log</Button></TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </div>
             )}
          </div>
          <DialogFooter className="border-t border-slate-100 dark:border-slate-855 pt-4 flex gap-1.5">
             <Button variant="ghost" onClick={() => setShowReviewModal(false)} className="h-9 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-850 rounded-xl text-slate-750 dark:text-slate-350">Cancel</Button>
             {missingRecords.length > 0 && <Button onClick={bulkFixCheckout} className="h-9 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs">Auto-Fix All to 6:00 PM</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
