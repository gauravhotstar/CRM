"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  DropdownMenu, 
  DropdownMenuCheckboxItem, 
  DropdownMenuContent, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"
import { Search, X, ChevronDown, UserCheck, Calendar as CalendarIcon, RefreshCw } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"

interface ReportsFiltersProps {
  telecallers: Array<{ id: string; full_name: string }>
  defaultStartDate: string
  defaultEndDate: string
}

// Format local Date object to YYYY-MM-DD string without UTC offset issues
function formatLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function ReportsFilters({ telecallers, defaultStartDate, defaultEndDate }: ReportsFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [telecallerSearch, setTelecallerSearch] = useState("")
  
  // Initialize selected telecallers from URL params (comma separated)
  const [selectedTelecallers, setSelectedTelecallers] = useState<string[]>(() => {
    const param = searchParams.get("telecaller")
    if (!param || param === "all") return []
    return param.split(",").filter(Boolean)
  })

  const [telecallerStatus, setTelecallerStatus] = useState<Record<string, boolean>>({})

  // Keep state synced if props or URL search params change
  useEffect(() => {
    setStartDate(defaultStartDate)
    setEndDate(defaultEndDate)
    const param = searchParams.get("telecaller")
    if (!param || param === "all") {
      setSelectedTelecallers([])
    } else {
      setSelectedTelecallers(param.split(",").filter(Boolean))
    }
  }, [defaultStartDate, defaultEndDate, searchParams])

  // Fetch telecaller attendance status for today
  useEffect(() => {
    const fetchTelecallerStatus = async () => {
      try {
        const today = formatLocalDate(new Date())
        const { data: attendanceRecords } = await supabase
          .from("attendance")
          .select("user_id, check_in")
          .eq("date", today)
        
        if (attendanceRecords) {
          const statusMap: Record<string, boolean> = {}
          attendanceRecords.forEach((record: any) => {
            statusMap[record.user_id] = !!record.check_in
          })
          setTelecallerStatus(statusMap)
        }
      } catch (err) {
        console.error("Error fetching telecaller status:", err)
      }
    }

    fetchTelecallerStatus()
  }, [supabase])

  const pushNavigation = (s: string, e: string, tcs: string[]) => {
    const params = new URLSearchParams()
    if (s) params.set("start_date", s)
    if (e) params.set("end_date", e)
    if (tcs.length > 0) {
      params.set("telecaller", tcs.join(","))
    }
    router.push(`/admin/reports?${params.toString()}`)
  }

  const applyFilters = () => {
    pushNavigation(startDate, endDate, selectedTelecallers)
  }

  const clearFilters = () => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 30)

    const s = formatLocalDate(start)
    const e = formatLocalDate(end)

    setStartDate(s)
    setEndDate(e)
    setSelectedTelecallers([])
    router.push("/admin/reports")
  }

  const selectPreset = (presetKey: string) => {
    const today = new Date()
    let s = ""
    let e = formatLocalDate(today)

    if (presetKey === "today") {
      s = formatLocalDate(today)
      e = formatLocalDate(today)
    } else if (presetKey === "yesterday") {
      const yest = new Date(today)
      yest.setDate(yest.getDate() - 1)
      s = formatLocalDate(yest)
      e = formatLocalDate(yest)
    } else if (presetKey === "7days") {
      const past = new Date(today)
      past.setDate(past.getDate() - 6)
      s = formatLocalDate(past)
    } else if (presetKey === "30days") {
      const past = new Date(today)
      past.setDate(past.getDate() - 29)
      s = formatLocalDate(past)
    } else if (presetKey === "thisMonth") {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      s = formatLocalDate(startOfMonth)
    } else if (presetKey === "lastMonth") {
      const startOfLast = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const endOfLast = new Date(today.getFullYear(), today.getMonth(), 0)
      s = formatLocalDate(startOfLast)
      e = formatLocalDate(endOfLast)
    }

    setStartDate(s)
    setEndDate(e)
    pushNavigation(s, e, selectedTelecallers)
  }

  // Determine active preset if matching
  const activePreset = useMemo(() => {
    const today = new Date()
    const todayStr = formatLocalDate(today)
    
    if (startDate === todayStr && endDate === todayStr) return "today"
    
    const yest = new Date(today)
    yest.setDate(yest.getDate() - 1)
    const yestStr = formatLocalDate(yest)
    if (startDate === yestStr && endDate === yestStr) return "yesterday"

    const d7 = new Date(today)
    d7.setDate(d7.getDate() - 6)
    if (startDate === formatLocalDate(d7) && endDate === todayStr) return "7days"

    const d30 = new Date(today)
    d30.setDate(d30.getDate() - 29)
    if (startDate === formatLocalDate(d30) && endDate === todayStr) return "30days"

    const d30Old = new Date(today)
    d30Old.setDate(d30Old.getDate() - 30)
    if (startDate === formatLocalDate(d30Old) && endDate === todayStr) return "30days"

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    if (startDate === formatLocalDate(startOfMonth) && endDate === todayStr) return "thisMonth"

    const startOfLast = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const endOfLast = new Date(today.getFullYear(), today.getMonth(), 0)
    if (startDate === formatLocalDate(startOfLast) && endDate === formatLocalDate(endOfLast)) return "lastMonth"

    return "custom"
  }, [startDate, endDate])

  const toggleTelecaller = (id: string) => {
    setSelectedTelecallers(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
      return next
    })
  }

  const selectAllTelecallers = () => {
    setSelectedTelecallers(telecallers.map(t => t.id))
  }

  const clearTelecallerSelection = () => {
    setSelectedTelecallers([])
  }

  const filteredTelecallers = useMemo(() => {
    if (!telecallerSearch.trim()) return telecallers
    return telecallers.filter(tc => 
      tc.full_name.toLowerCase().includes(telecallerSearch.toLowerCase())
    )
  }, [telecallers, telecallerSearch])

  return (
    <div className="space-y-4">
      {/* Quick Date Range Pills */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-200/60 dark:border-slate-800">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" /> Quick Range:
          </span>
          <Button
            type="button"
            variant={activePreset === "today" ? "default" : "outline"}
            size="sm"
            onClick={() => selectPreset("today")}
            className={`h-7 text-xs font-semibold rounded-lg transition-all ${
              activePreset === "today"
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                : "bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            Today
          </Button>
          <Button
            type="button"
            variant={activePreset === "yesterday" ? "default" : "outline"}
            size="sm"
            onClick={() => selectPreset("yesterday")}
            className={`h-7 text-xs font-semibold rounded-lg transition-all ${
              activePreset === "yesterday"
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                : "bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            Yesterday
          </Button>
          <Button
            type="button"
            variant={activePreset === "7days" ? "default" : "outline"}
            size="sm"
            onClick={() => selectPreset("7days")}
            className={`h-7 text-xs font-semibold rounded-lg transition-all ${
              activePreset === "7days"
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                : "bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            Last 7 days
          </Button>
          <Button
            type="button"
            variant={activePreset === "30days" ? "default" : "outline"}
            size="sm"
            onClick={() => selectPreset("30days")}
            className={`h-7 text-xs font-semibold rounded-lg transition-all ${
              activePreset === "30days"
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                : "bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            Last 30 days
          </Button>
          <Button
            type="button"
            variant={activePreset === "thisMonth" ? "default" : "outline"}
            size="sm"
            onClick={() => selectPreset("thisMonth")}
            className={`h-7 text-xs font-semibold rounded-lg transition-all ${
              activePreset === "thisMonth"
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                : "bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            This Month
          </Button>
          <Button
            type="button"
            variant={activePreset === "lastMonth" ? "default" : "outline"}
            size="sm"
            onClick={() => selectPreset("lastMonth")}
            className={`h-7 text-xs font-semibold rounded-lg transition-all ${
              activePreset === "lastMonth"
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                : "bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            Last Month
          </Button>
        </div>

        {activePreset === "custom" && (
          <Badge variant="outline" className="text-[11px] font-semibold bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300">
            Custom Range Active
          </Badge>
        )}
      </div>

      {/* Main Filter Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 items-end">
        <div>
          <Label htmlFor="start-date" className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
            Start Date
          </Label>
          <Input 
            id="start-date" 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9.5 text-xs bg-white dark:bg-slate-900 rounded-xl border-slate-200 dark:border-slate-800"
          />
        </div>

        <div>
          <Label htmlFor="end-date" className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
            End Date
          </Label>
          <Input 
            id="end-date" 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9.5 text-xs bg-white dark:bg-slate-900 rounded-xl border-slate-200 dark:border-slate-800"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Telecallers
            </Label>
            {selectedTelecallers.length > 0 && (
              <button 
                type="button" 
                className="text-[10px] text-blue-600 font-semibold cursor-pointer hover:underline" 
                onClick={clearTelecallerSelection}
              >
                Reset
              </button>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full h-9.5 justify-between font-normal bg-white dark:bg-slate-900 rounded-xl border-slate-200 dark:border-slate-800 text-xs px-3"
              >
                {selectedTelecallers.length === 0 ? (
                  <span className="text-slate-500 dark:text-slate-400 font-medium">All Telecallers ({telecallers.length})</span>
                ) : selectedTelecallers.length === 1 ? (
                  <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
                    {telecallers.find(t => t.id === selectedTelecallers[0])?.full_name || "1 Telecaller"}
                  </span>
                ) : (
                  <span className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5" />
                    {selectedTelecallers.length} Telecallers Selected
                  </span>
                )}
                <ChevronDown className="ml-1.5 h-3.5 w-3.5 opacity-50 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[280px] p-2 rounded-xl shadow-lg border-slate-200 dark:border-slate-800" align="start">
              <div className="p-1 mb-1">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <Input
                    placeholder="Search telecaller..."
                    value={telecallerSearch}
                    onChange={(e) => setTelecallerSearch(e.target.value)}
                    className="h-8 pl-8 text-xs rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-2 py-1.5 text-xs border-y border-slate-100 dark:border-slate-800 mb-1">
                <button
                  type="button"
                  onClick={selectAllTelecallers}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={clearTelecallerSelection}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  Clear Selection
                </button>
              </div>

              <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                {filteredTelecallers.map((tc) => {
                  const isChecked = selectedTelecallers.includes(tc.id)
                  const isOnline = telecallerStatus[tc.id]
                  return (
                    <DropdownMenuCheckboxItem
                      key={tc.id}
                      checked={isChecked}
                      onCheckedChange={() => toggleTelecaller(tc.id)}
                      className="text-xs py-1.5 rounded-lg cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span 
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? "bg-emerald-500 shadow-xs shadow-emerald-500/50" : "bg-slate-300 dark:bg-slate-600"}`}
                          title={isOnline ? "Checked in today" : "Offline / Not checked in"}
                        />
                        <span className="truncate font-medium">{tc.full_name}</span>
                      </div>
                    </DropdownMenuCheckboxItem>
                  )
                })}
                {filteredTelecallers.length === 0 && (
                  <div className="text-center py-3 text-xs text-slate-400">
                    No telecaller found
                  </div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            onClick={applyFilters} 
            className="flex-1 h-9.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center justify-center gap-1.5"
          >
            <Search className="h-3.5 w-3.5" />
            Apply Filter
          </Button>
          <Button 
            variant="outline" 
            onClick={clearFilters} 
            title="Reset to Last 30 Days and show all telecallers"
            className="h-9.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>

      {/* Selected Telecallers Chips */}
      {selectedTelecallers.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[11px] font-semibold text-slate-500">Filtered by:</span>
          {selectedTelecallers.map(id => {
            const tc = telecallers.find(t => t.id === id)
            return (
              <Badge 
                key={id} 
                variant="secondary" 
                className="text-[11px] font-medium bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/50 pl-2 pr-1 py-0.5 rounded-lg flex items-center gap-1"
              >
                {tc?.full_name || id.substring(0, 8)}
                <button
                  type="button"
                  onClick={() => toggleTelecaller(id)}
                  className="hover:bg-blue-200/50 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearTelecallerSelection}
            className="h-6 text-[10px] text-slate-500 hover:text-slate-800 p-1"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  )
}
