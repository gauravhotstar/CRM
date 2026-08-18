"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { 
  Upload, CheckCircle, AlertCircle, Download, 
  Zap, ArrowRight, History, PieChart, Share2, Sparkles,
  Search, Copy, Check, Phone
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

// --- Interfaces ---

interface Telecaller {
  id: string
  full_name: string
  email: string
}

interface DBField {
  key: string
  label: string
  required: boolean
}

const DB_FIELDS: DBField[] = [
  { key: 'name', label: 'Full Name', required: true },
  { key: 'phone', label: 'Phone Number', required: true },
  { key: 'email', label: 'Email Address', required: false },
  { key: 'company', label: 'Company', required: false },
  { key: 'designation', label: 'Designation', required: false },
  { key: 'address', label: 'Address', required: false },
  { key: 'city', label: 'City', required: false },
  { key: 'state', label: 'State', required: false },
  { key: 'notes', label: 'Notes', required: false },
  { key: 'loan_amount', label: 'Loan Amount', required: false },
]

// --- Helper Functions ---

const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

const cleanPhoneNumber = (phone: string) => {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length > 10 && cleaned.startsWith('91')) {
    return cleaned.substring(2);
  }
  return cleaned;
}

export default function UploadPage() {
  const router = useRouter()
  const supabase = createClient()

  // --- State: General ---
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [telecallers, setTelecallers] = useState<Telecaller[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  
  // --- State: Step 1 (File) ---
  const [file, setFile] = useState<File | null>(null)
  const [rawFileContent, setRawFileContent] = useState<string>("")
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  
  // --- State: Step 2 (Mapping) ---
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({}) 
  
  // --- State: Step 3 (Configuration & Preview) ---
  const [previewData, setPreviewData] = useState<any[]>([])
  const [selectedTelecaller, setSelectedTelecaller] = useState<string | null>(null)
  const [autoDistribute, setAutoDistribute] = useState(false)
  const [activeCount, setActiveCount] = useState<number>(0)
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'allow'>('skip')
  const [globalSource, setGlobalSource] = useState("other") 
  const [globalTags, setGlobalTags] = useState("")
  const [autoPrioritize, setAutoPrioritize] = useState(true)
  const [highPriorityCount, setHighPriorityCount] = useState(0)
  const [mediumPriorityCount, setMediumPriorityCount] = useState(0)
  const [lowPriorityCount, setLowPriorityCount] = useState(0)
  
  // --- State: Step 4 (Upload & Progress) ---
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadStats, setUploadStats] = useState({ total: 0, success: 0, failed: 0, skipped: 0 })
  const [failedRows, setFailedRows] = useState<any[]>([])
  
  // --- NEW STATE: Assignment Summary & Skipped Numbers ---
  const [assignmentSummary, setAssignmentSummary] = useState<Record<string, number>>({})
  const [showSummaryDialog, setShowSummaryDialog] = useState(false)
  const [skippedRows, setSkippedRows] = useState<any[]>([])
  const [showSkippedDialog, setShowSkippedDialog] = useState(false)
  const [skippedSearchQuery, setSkippedSearchQuery] = useState("")
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null)

  // --- Effects ---
  useEffect(() => {
    const initData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .single()
        if (profile?.tenant_id) {
          setTenantId(profile.tenant_id)
          await Promise.all([
             fetchTelecallers(profile.tenant_id),
             checkActiveTelecallersCount(profile.tenant_id)
          ])
        }
      }
    }
    initData()
  }, [])

  // --- Data Fetching ---
  const fetchTelecallers = async (tId: string) => {
    const { data } = await supabase.from("users").select("id, full_name, email").eq("role", "telecaller").eq("is_active", true).eq("tenant_id", tId)
    if (data) setTelecallers(data)
  }

  const checkActiveTelecallersCount = async (tId: string) => {
    const { data: tenantUsers } = await supabase.from("users").select("id").eq("tenant_id", tId).eq("role", "telecaller")
    const userIds = tenantUsers?.map(u => u.id) || []
    if (userIds.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      const { count } = await supabase.from("attendance").select("user_id", { count: 'exact', head: true }).eq("date", today).not("check_in", "is", null).in("user_id", userIds)
      if (count !== null) setActiveCount(count)
    } else {
      setActiveCount(0)
    }
  }

  // --- Handlers: Step 1 (File Selection) ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile)
      const text = await selectedFile.text()
      setRawFileContent(text)
      
      const lines = text.split("\n").filter(line => line.trim())
      if (lines.length > 0) {
        const headers = lines[0].split(",").map(h => h.trim())
        setCsvHeaders(headers)
        
        const initialMapping: Record<string, string> = {}
        DB_FIELDS.forEach(dbField => {
            const match = headers.find(h => h.toLowerCase().includes(dbField.key) || h.toLowerCase() === dbField.label.toLowerCase())
            if (match) initialMapping[dbField.key] = match
        })
        setColumnMapping(initialMapping)
      }
    } else {
      alert("Please select a valid CSV file")
    }
  }

  const goToStep2 = () => {
    if (!file) return;
    setStep(2)
  }

  // --- Handlers: Step 2 (Mapping) ---
  const goToStep3 = () => {
    const missingRequired = DB_FIELDS.filter(f => f.required && !columnMapping[f.key])
    if (missingRequired.length > 0) {
        alert(`Please map the following required fields: ${missingRequired.map(f => f.label).join(', ')}`)
        return
    }

    const lines = rawFileContent.split("\n").filter(line => line.trim()).slice(1) 
    const parsed = lines.slice(0, 50).map((line, idx) => {
        const values = line.split(",").map(v => v.trim())
        const row: any = { _id: idx } 
        
        Object.entries(columnMapping).forEach(([dbKey, csvHeader]) => {
            const headerIndex = csvHeaders.indexOf(csvHeader)
            if (headerIndex !== -1) {
                row[dbKey] = values[headerIndex]
            }
        })
        return row
    })
    setPreviewData(parsed)
    setStep(3)
  }

  // --- Handlers: Step 3 (Preview & Logic) ---
  const handleCellEdit = (rowId: number, field: string, value: string) => {
    setPreviewData(prev => prev.map(row => row._id === rowId ? { ...row, [field]: value } : row))
  }

  const processUpload = async () => {
    setIsUploading(true)
    setUploadStats({ total: 0, success: 0, failed: 0, skipped: 0 })
    setFailedRows([])
    setAssignmentSummary({}) 
    setSkippedRows([])
    setHighPriorityCount(0)
    setMediumPriorityCount(0)
    setLowPriorityCount(0)
    
    // 1. Parse ALL Data
    const lines = rawFileContent.split("\n").filter(line => line.trim()).slice(1)
    
    let tempSkipCount = 0;
    const seenPhonesInFile = new Set<string>();
    const tempSkippedRows: any[] = [];
    
    // Parse and Deduplicate within the file immediately
    const uniqueRows = lines.reduce((acc: any[], line, idx) => {
        const values = line.split(",").map(v => v.trim())
        const row: any = {}
        
        Object.entries(columnMapping).forEach(([dbKey, csvHeader]) => {
            const headerIndex = csvHeaders.indexOf(csvHeader)
            if (headerIndex !== -1) {
                let val = values[headerIndex]
                if (dbKey === 'phone') val = cleanPhoneNumber(val)
                row[dbKey] = val
            }
        })

        row._originalIndex = idx + 2; 

        if (row.phone) {
            if (seenPhonesInFile.has(row.phone)) {
                if (duplicateAction === 'skip') {
                    tempSkipCount++;
                    tempSkippedRows.push({
                        phone: row.phone,
                        name: row.name || 'Unknown',
                        reason: 'Duplicate in CSV file',
                        agent: '-',
                        _originalIndex: idx + 2
                    });
                    return acc;
                }
            } else {
                seenPhonesInFile.add(row.phone);
            }
        }

        acc.push(row);
        return acc;
    }, []);

    const BATCH_SIZE = 50
    let successCount = 0
    let roundRobinIndex = 0
    let skipCount = tempSkipCount; 
    let failCount = 0
    const errors: any[] = []

    // 2. Prepare Auto-Assign List
    let distributionList: string[] = []
    if (autoDistribute && tenantId) {
        const { data: tenantUsers } = await supabase.from("users").select("id").eq("tenant_id", tenantId).eq("role", "telecaller").eq("is_active", true)
        const tenantUserIds = tenantUsers?.map((u: any) => u.id) || []
        
        if (tenantUserIds.length > 0) {
            const today = new Date().toISOString().split('T')[0]
            const { data: activeUsers } = await supabase.from("attendance").select("user_id").eq("date", today).not("check_in", "is", null).in("user_id", tenantUserIds)
            if (activeUsers) distributionList = shuffleArray(activeUsers.map((u: any) => u.user_id))
        }
    }

    // 3. Batch Process
    for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
        const batch = uniqueRows.slice(i, i + BATCH_SIZE)
        const leadsToInsert: any[] = []

        if (duplicateAction === 'skip') {
            const phones = batch.map(r => r.phone).filter(Boolean)
            
            const { data: existing } = await supabase
                .from("leads")
                .select("id, phone, status, notes, assigned_to, name")
                .in("phone", phones)
            
            const existingMap = new Map<string, any>();
            if (existing) {
                existing.forEach((e: any) => existingMap.set(e.phone, e));
            }

            const skipStatuses = ['Interested', 'follow_up', 'DISBURSED', 'Disbursed', 'Login', 'Documents_Sent'];

            for (const row of batch) {
                if (existingMap.has(row.phone)) {
                    const existingLead = existingMap.get(row.phone);
                    const existingStatus = existingLead.status;
                    
                    if (existingStatus && skipStatuses.includes(existingStatus)) {
                        skipCount++
                        const agentName = telecallers.find(t => t.id === existingLead.assigned_to)?.full_name || 'Unassigned';
                        tempSkippedRows.push({
                            phone: row.phone,
                            name: row.name || existingLead.name || 'Unknown',
                            reason: `Existing Lead (${existingStatus})`,
                            agent: agentName,
                            _originalIndex: row._originalIndex || '-'
                        });
                    } else {
                        // SMART MERGE: Update the existing lead instead of creating a duplicate!
                        try {
                            const { _originalIndex, _id, ...cleanLeadData } = row;
                            
                            // Determine assignee: if lead is not in skipStatuses, assign/re-assign it according to selection
                            let assigneeId = existingLead.assigned_to;
                            let wasAssignedInThisUpload = false;

                            if (autoDistribute && distributionList.length > 0) {
                                assigneeId = distributionList[roundRobinIndex % distributionList.length];
                                roundRobinIndex++;
                                wasAssignedInThisUpload = true;
                            } else if (selectedTelecaller && selectedTelecaller !== "unassigned") {
                                assigneeId = selectedTelecaller;
                                wasAssignedInThisUpload = true;
                            } else if (selectedTelecaller === "unassigned") {
                                assigneeId = null;
                            }

                            // Determine priority
                            let finalPriority = 'medium';
                            if (autoPrioritize) {
                                const amount = Number(row.loan_amount || 0);
                                const designation = String(row.designation || "").toLowerCase();
                                const notes = String(row.notes || "").toLowerCase();
                                const isHighAmount = amount >= 1500000;
                                const isLowAmount = amount > 0 && amount < 300000;
                                const isHighProfile = designation.includes("director") || designation.includes("owner") || designation.includes("founder") || designation.includes("ceo") || designation.includes("vp") || designation.includes("president") || designation.includes("partner") || designation.includes("manager");
                                const isHighIntent = notes.includes("urgent") || notes.includes("interested") || notes.includes("now") || notes.includes("immediately");

                                if (isHighAmount || isHighProfile || isHighIntent) {
                                    finalPriority = 'high';
                                } else if (isLowAmount) {
                                    finalPriority = 'low';
                                }
                            }

                            // Merge notes: append instead of overwriting completely
                            let mergedNotes = cleanLeadData.notes || "";
                            if (existingLead.notes && cleanLeadData.notes) {
                                mergedNotes = `${existingLead.notes}\n\n[Import Update]: ${cleanLeadData.notes}`;
                            } else if (existingLead.notes) {
                                mergedNotes = existingLead.notes;
                            }

                            const updatePayload: any = {
                                tenant_id: tenantId,
                                name: cleanLeadData.name || undefined,
                                email: cleanLeadData.email || null,
                                company: cleanLeadData.company || null,
                                designation: cleanLeadData.designation || null,
                                address: cleanLeadData.address || null,
                                city: cleanLeadData.city || null,
                                state: cleanLeadData.state || null,
                                notes: mergedNotes || null,
                                source: (globalSource || cleanLeadData.source || "other").toLowerCase(),
                                tags: globalTags ? globalTags.split(",").map(t => t.trim()) : [],
                                assigned_to: assigneeId,
                                assigned_by: wasAssignedInThisUpload && assigneeId ? currentUserId : undefined,
                                assigned_at: wasAssignedInThisUpload && assigneeId ? new Date().toISOString() : undefined,
                                status: wasAssignedInThisUpload ? 'new' : undefined,
                                priority: finalPriority,
                                updated_at: new Date().toISOString()
                            };

                            // Clean undefined keys from payload
                            Object.keys(updatePayload).forEach(key => {
                                if (updatePayload[key] === undefined) {
                                    delete updatePayload[key];
                                }
                            });

                            const { error: updateError } = await supabase
                                .from("leads")
                                .update(updatePayload)
                                .eq("id", existingLead.id);

                            if (updateError) {
                                throw updateError;
                            }

                            // Update stats for successfully updated lead
                            if (finalPriority === 'high') setHighPriorityCount(prev => prev + 1);
                            else if (finalPriority === 'low') setLowPriorityCount(prev => prev + 1);
                            else setMediumPriorityCount(prev => prev + 1);

                            if (assigneeId && wasAssignedInThisUpload) {
                                setAssignmentSummary(prev => ({
                                    ...prev,
                                    [assigneeId]: (prev[assigneeId] || 0) + 1
                                }));
                            }

                            successCount++;
                        } catch (err: any) {
                            failCount++;
                            errors.push({ ...row, error: err.message || "Failed to update lead" });
                        }
                    }
                } else {
                    leadsToInsert.push(row);
                }
            }
        } else {
            leadsToInsert.push(...batch);
        }

        if (leadsToInsert.length > 0) {
            const currentBatchAssignments: Record<string, number> = {} 

            const finalLeads = leadsToInsert.map((lead, idx) => {
                  let assigneeId = null
                  if (autoDistribute && distributionList.length > 0) {
                      assigneeId = distributionList[roundRobinIndex % distributionList.length];
                      roundRobinIndex++;
                  } else if (selectedTelecaller && selectedTelecaller !== "unassigned") {
                      assigneeId = selectedTelecaller
                  }

                  if (assigneeId) {
                     currentBatchAssignments[assigneeId] = (currentBatchAssignments[assigneeId] || 0) + 1
                  }

                  const { _originalIndex, _id, ...cleanLeadData } = lead;

                  // --- INTELLIGENT LEAD PRIORITIZATION ---
                  let finalPriority = 'medium';
                  if (autoPrioritize) {
                      const amount = Number(lead.loan_amount || 0);
                      const designation = String(lead.designation || "").toLowerCase();
                      const notes = String(lead.notes || "").toLowerCase();
                      
                      const isHighAmount = amount >= 1500000; // 15L or more
                      const isLowAmount = amount > 0 && amount < 300000;   // Less than 3L
                      
                      const isHighProfile = designation.includes("director") || 
                                           designation.includes("owner") || 
                                           designation.includes("founder") || 
                                           designation.includes("ceo") || 
                                           designation.includes("vp") || 
                                           designation.includes("president") ||
                                           designation.includes("partner") ||
                                           designation.includes("manager");
                                           
                      const isHighIntent = notes.includes("urgent") || 
                                           notes.includes("interested") || 
                                           notes.includes("now") || 
                                           notes.includes("immediately");

                      if (isHighAmount || isHighProfile || isHighIntent) {
                          finalPriority = 'high';
                      } else if (isLowAmount) {
                          finalPriority = 'low';
                      }
                  }

                   return {
                      ...cleanLeadData,
                      tenant_id: tenantId,
                      created_at: new Date().toISOString(),
                      source: (globalSource || lead.source || "other").toLowerCase(),
                      tags: globalTags ? globalTags.split(",").map(t => t.trim()) : [],
                      assigned_to: assigneeId,
                      assigned_by: currentUserId,
                      assigned_at: assigneeId ? new Date().toISOString() : null,
                      email: lead.email || null,
                      company: lead.company || null,
                      priority: finalPriority,
                      status: 'new',
                   }
             })

            const { error } = await supabase.from("leads").insert(finalLeads)
            
            if (error) {
                failCount += leadsToInsert.length
                leadsToInsert.forEach(l => errors.push({ ...l, error: error.message }))
            } else {
                successCount += leadsToInsert.length
                
                let high = 0;
                let med = 0;
                let low = 0;
                finalLeads.forEach((l: any) => {
                    if (l.priority === 'high') high++;
                    else if (l.priority === 'low') low++;
                    else med++;
                });
                setHighPriorityCount(prev => prev + high);
                setMediumPriorityCount(prev => prev + med);
                setLowPriorityCount(prev => prev + low);

                setAssignmentSummary(prev => {
                    const next = { ...prev }
                    Object.entries(currentBatchAssignments).forEach(([id, count]) => {
                        next[id] = (next[id] || 0) + count
                    })
                    return next
                })
            }
        }

        const processed = Math.min(i + BATCH_SIZE, uniqueRows.length)
        setProgress(Math.round((processed / uniqueRows.length) * 100))
    }

    setUploadStats({
        total: uniqueRows.length + (lines.length - uniqueRows.length), 
        success: successCount,
        skipped: skipCount,
        failed: failCount
    })
    setFailedRows(errors)
    setSkippedRows(tempSkippedRows)
    setIsUploading(false)

    // Log the bulk import event in CRM audit log to trigger Recent Activity view
    if (successCount > 0) {
      await supabase.from("audit_logs").insert({
        table_name: "leads",
        record_id: "bulk_import",
        operation: "INSERT",
        performed_by: currentUserId,
        new_data: { 
          success_count: successCount, 
          skipped_count: skipCount, 
          failed_count: failCount, 
          source: globalSource 
        },
        old_data: {},
        changed_fields: ["bulk_import"]
      });
    }

    setStep(4)
    
    if (autoDistribute || (selectedTelecaller && selectedTelecaller !== 'unassigned')) {
        setShowSummaryDialog(true)
    }
  }

  // --- Handlers: Step 4 (Results & Sharing) ---
  
  // Generates a "Screenshot" canvas image of the report and triggers native share
  const handleShareReport = async () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const entries = Object.entries(assignmentSummary)
    const rowHeight = 45
    const paddingTop = 140
    const paddingBottom = 60

    canvas.width = 600
    canvas.height = paddingTop + (entries.length * rowHeight) + paddingBottom

    // Background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Header Banner
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, 100)
    ctx.strokeStyle = '#e2e8f0'
    ctx.strokeRect(0, 0, canvas.width, 100)

    // Title
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif'
    ctx.fillText('Assignment Report', 40, 50)

    // Subtitle Date
    ctx.fillStyle = '#64748b'
    ctx.font = '16px system-ui, -apple-system, sans-serif'
    const dateStr = new Date().toLocaleString(undefined, { 
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    })
    ctx.fillText(dateStr, 40, 80)

    // Total Stat (Top Right)
    ctx.fillStyle = '#0284c7'
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`${uploadStats.success} Distributed`, 560, 80)

    // Rows
    let y = paddingTop
    ctx.textAlign = 'left'

    entries.forEach(([id, count]) => {
      const agent = telecallers.find(t => t.id === id)
      const name = agent?.full_name || 'Unknown Agent'

      // Agent Name
      ctx.fillStyle = '#334155'
      ctx.font = '600 18px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(name, 40, y)

      // Count Badge Background
      ctx.fillStyle = '#f1f5f9'
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(480, y - 22, 80, 30, 15)
      } else {
        ctx.fillRect(480, y - 22, 80, 30) // Fallback for older browsers
      }
      ctx.fill()

      // Count Text
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 16px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${count}`, 520, y - 1)

      // Divider Line
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(40, y + 20)
      ctx.lineTo(560, y + 20)
      ctx.stroke()

      y += rowHeight
    })

    // Footer
    ctx.fillStyle = '#94a3b8'
    ctx.font = '14px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Generated by Hanva CRM', canvas.width / 2, canvas.height - 20)

    // Generate File and Share
    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], `Assignment_Report_${Date.now()}.png`, { type: 'image/png' })

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: 'Lead Distribution Report',
            files: [file]
          })
        } catch (err) {
          console.error('Share cancelled or failed', err)
        }
      } else {
        // Fallback: Force Download if Share API isn't supported (e.g., Desktop Chrome)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
      }
    })
  }

  const downloadErrorCSV = () => {
    if (failedRows.length === 0) return
    const headers = ["Row", "Name", "Phone", "Error Message"]
    const csvContent = [headers.join(","), ...failedRows.map(row => `${row._originalIndex || '-'},"${row.name || ''}","${row.phone || ''}","${row.error}"`)].join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `upload-errors-${new Date().toISOString()}.csv`
    a.click()
  }

  const downloadTemplate = () => {
    const template = `Name,Phone,Email,Company,Designation,Address,City,Loan Amount,Notes\nJohn Doe,9876543210,john@example.com,Acme Corp,Manager,123 Main St,Mumbai,500000,Interested in PL`
    const blob = new Blob([template], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "leads_template.csv"
    a.click()
  }

  const downloadSkippedCSV = () => {
    if (skippedRows.length === 0) return;
    const headers = ["Row", "Name", "Phone", "Reason", "Assigned Agent"];
    const csvContent = [
      headers.join(","),
      ...skippedRows.map(row => `${row._originalIndex || '-'},"${(row.name || '').replace(/"/g, '""')}","${row.phone || ''}","${(row.reason || '').replace(/"/g, '""')}","${(row.agent || '').replace(/"/g, '""')}"`)
    ].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skipped-duplicates-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6 min-h-screen animate-in fade-in duration-300">
      
      {/* Header & Steps Indicator */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-2">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Import Leads Wizard</h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Bulk upload your spreadsheet, resolve duplicates, and auto-assign in seconds.</p>
        </div>
        
        {/* Modern Progress Stepper */}
        <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-900/60 rounded-full border border-slate-200/50 dark:border-slate-800 shadow-2xs">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            step === 1 
              ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs" 
              : "text-slate-500 dark:text-slate-400"
          }`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700/80 text-[10px] flex items-center justify-center font-extrabold">1</span>
            <span>File</span>
          </div>
          <div className="h-1 w-3 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            step === 2 
              ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs" 
              : "text-slate-500 dark:text-slate-400"
          }`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700/80 text-[10px] flex items-center justify-center font-extrabold">2</span>
            <span>Map</span>
          </div>
          <div className="h-1 w-3 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            step === 3 
              ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs" 
              : "text-slate-500 dark:text-slate-400"
          }`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700/80 text-[10px] flex items-center justify-center font-extrabold">3</span>
            <span>Review</span>
          </div>
          <div className="h-1 w-3 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            step === 4 
              ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs" 
              : "text-slate-500 dark:text-slate-400"
          }`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700/80 text-[10px] flex items-center justify-center font-extrabold">4</span>
            <span>Finish</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        
        {/* STEP 1: FILE UPLOAD */}
        {step === 1 && (
          <Card className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
              <CardTitle className="text-base font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Upload className="h-4.5 w-4.5 text-blue-500" /> Choose Lead Spreadsheet
              </CardTitle>
              <CardDescription className="text-xs">Select the CSV file that contains the target leads information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center hover:bg-slate-50/50 dark:hover:bg-slate-950/30 transition-all group relative overflow-hidden flex flex-col items-center justify-center">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform duration-300 mb-4">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="space-y-3 z-10">
                  <Label htmlFor="csv-file" className="cursor-pointer inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700 font-bold text-xs py-2 px-5 rounded-xl shadow-sm hover:shadow-md transition-all">
                    Browse CSV File
                  </Label>
                  <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
                    {file ? file.name : "Supported formats: CSV (Comma-separated Values)"}
                  </p>
                  {file && (
                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-[11px] shadow-2xs animate-bounce mt-2">
                      <CheckCircle className="w-3.5 h-3.5" /> File Selected Successfully
                    </div>
                  )}
                </div>
              </div>
              
              <div className="pt-2">
                <Button variant="outline" onClick={downloadTemplate} size="sm" className="w-full border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 font-bold text-xs tracking-tight shadow-2xs py-4.5 rounded-xl flex items-center gap-2">
                  <Download className="h-4 w-4" /> Download Sample CSV Template
                </Button>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-4 bg-slate-50/50 dark:bg-slate-950/20">
              <Button onClick={goToStep2} disabled={!file} className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm rounded-xl py-4.5 px-6 flex items-center gap-1.5">
                Next: Map Columns <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 2: COLUMN MAPPING */}
        {step === 2 && (
          <Card className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
              <CardTitle className="text-base font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                Map Fields to CRM Schema
              </CardTitle>
              <CardDescription className="text-xs">Connect the headers in your CSV file to Hanva CRM fields.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {DB_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center justify-between p-3 border border-slate-200/60 dark:border-slate-800 rounded-xl bg-slate-50/20 dark:bg-slate-950/10 shadow-2xs hover:shadow-xs transition-shadow duration-300">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1">
                        {field.label}
                        {field.required && <span className="text-rose-500 font-extrabold text-xs">*</span>}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Database field</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-700" />
                      <Select 
                        value={columnMapping[field.key] || "ignore"} 
                        onValueChange={(val) => setColumnMapping(prev => ({ ...prev, [field.key]: val === "ignore" ? "" : val }))}
                      >
                        <SelectTrigger className={`w-[170px] font-semibold text-xs rounded-xl shadow-2xs ${!columnMapping[field.key] && field.required ? "border-rose-300 dark:border-rose-950 focus:ring-rose-500" : ""}`}>
                          <SelectValue placeholder="Ignore field" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="ignore" className="text-slate-400 dark:text-slate-500 italic font-semibold">Ignore column</SelectItem>
                          {csvHeaders.map(header => (
                            <SelectItem key={header} value={header}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-4 bg-slate-50/50 dark:bg-slate-950/20">
              <Button variant="ghost" onClick={() => setStep(1)} className="font-semibold shadow-none rounded-xl">Back</Button>
              <Button onClick={goToStep3} className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm rounded-xl py-4.5 px-6 flex items-center gap-1.5">
                Next: Review Data <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 3: PREVIEW & CONFIGURATION */}
        {step === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Table Preview */}
            <Card className="lg:col-span-2 border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden flex flex-col">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                <CardTitle className="text-base font-extrabold text-slate-800 dark:text-slate-200">Data Validation Preview</CardTitle>
                <CardDescription className="text-xs">Review the first 50 rows. Click on any text box to fix typos instantly before upload.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 flex-grow">
                <div className="overflow-x-auto max-h-[460px] border-b border-slate-100 dark:border-slate-850">
                  <Table className="border-collapse text-left min-w-[700px]">
                    <TableHeader>
                      <TableRow className="border-b border-slate-200 dark:border-slate-850 bg-slate-50/70 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400 text-[11px] font-extrabold uppercase tracking-wider">
                        {DB_FIELDS.filter(f => columnMapping[f.key]).map(f => (
                          <TableHead key={f.key} className="py-3 px-4 font-bold whitespace-nowrap">{f.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs divide-y divide-slate-100 dark:divide-slate-800/80">
                      {previewData.map((row) => (
                        <TableRow key={row._id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/30 transition-colors">
                          {DB_FIELDS.filter(f => columnMapping[f.key]).map(f => (
                            <TableCell key={f.key} className="p-1 px-2 border-r border-slate-100 dark:border-slate-850/60 last:border-r-0">
                              <input 
                                className="w-full bg-transparent text-xs px-2.5 py-1.5 focus:outline-none focus:bg-blue-500/10 focus:ring-1 focus:ring-blue-500/30 font-semibold text-slate-800 dark:text-slate-200 dark:focus:bg-blue-500/5 rounded-lg transition-all"
                                value={row[f.key] || ""}
                                onChange={(e) => handleCellEdit(row._id, f.key, e.target.value)}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Import Settings Panel */}
            <Card className="h-fit border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                <CardTitle className="text-base font-extrabold text-slate-800 dark:text-slate-200">Import Rules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                
                {/* Duplicate Handling */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Duplicate Prevention</Label>
                  <Select value={duplicateAction} onValueChange={(val: any) => setDuplicateAction(val)}>
                    <SelectTrigger className="font-semibold text-xs rounded-xl shadow-2xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="skip" className="font-semibold text-xs">Skip active matching duplicates</SelectItem>
                      <SelectItem value="allow" className="font-semibold text-xs">Allow all duplicates</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold italic mt-1 leading-normal">
                    * Skip blocks existing phone records flagged as: Interested, Follow Up, Login, Docs Sent, or Disbursed.
                  </p>
                </div>

                {/* Global Attributes */}
                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-blue-500" /> Default Metadata</Label>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold text-slate-450">Lead Source</Label>
                    <Select value={globalSource} onValueChange={setGlobalSource}>
                      <SelectTrigger className="font-semibold text-xs rounded-xl shadow-2xs">
                        <SelectValue placeholder="Select Source" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="website" className="font-semibold text-xs">Website</SelectItem>
                        <SelectItem value="referral" className="font-semibold text-xs">Referral</SelectItem>
                        <SelectItem value="campaign" className="font-semibold text-xs">Campaign</SelectItem>
                        <SelectItem value="cold_call" className="font-semibold text-xs">Cold Call</SelectItem>
                        <SelectItem value="other" className="font-semibold text-xs">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-slate-450">Default Tags (comma separated)</Label>
                    <Input value={globalTags} onChange={(e) => setGlobalTags(e.target.value)} placeholder="e.g. Diwali Promo, Prime" className="font-semibold text-xs rounded-xl shadow-2xs" />
                  </div>
                </div>

                {/* Assignment Logic */}
                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Lead Allocation</Label>
                  <div className="flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/80 shadow-2xs">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-350">
                        <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500/10" />
                        Auto-Distribute
                      </Label>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{activeCount} agents online today</p>
                    </div>
                    <Switch checked={autoDistribute} onCheckedChange={setAutoDistribute} />
                  </div>
                  
                  {!autoDistribute && (
                    <Select value={selectedTelecaller || ""} onValueChange={setSelectedTelecaller}>
                      <SelectTrigger className="font-semibold text-xs rounded-xl shadow-2xs">
                        <SelectValue placeholder="Select specific user" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="unassigned" className="font-semibold text-xs">Unassigned</SelectItem>
                        {telecallers.map(tc => (
                          <SelectItem key={tc.id} value={tc.id}>{tc.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Intelligent Prioritization */}
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/80 shadow-2xs">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-350">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-500 animate-pulse" />
                        AI Intent Scoring
                      </Label>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold leading-normal">Sets High/Low priority tags dynamically using Loan Volume & Job Roles.</p>
                    </div>
                    <Switch checked={autoPrioritize} onCheckedChange={setAutoPrioritize} />
                  </div>
                </div>

              </CardContent>
              <CardFooter className="flex flex-col gap-2 border-t border-slate-100 dark:border-slate-800 pt-4 bg-slate-50/50 dark:bg-slate-950/20">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 font-bold shadow-sm rounded-xl py-4.5 flex items-center justify-center gap-2" onClick={processUpload} disabled={isUploading}>
                  <CheckCircle className="h-4 w-4" /> Start Bulk Import
                </Button>
                <Button variant="ghost" size="sm" className="w-full font-semibold rounded-xl" onClick={() => setStep(2)} disabled={isUploading}>Back</Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* STEP 3.5: UPLOADING PROGRESS OVERLAY */}
        {isUploading && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-300">
            <Card className="w-[380px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <CardContent className="p-8 text-center space-y-5">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20 animate-bounce">
                  <Upload className="h-6 w-6 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-lg font-extrabold text-slate-850 dark:text-slate-100">Processing CRM Import</CardTitle>
                  <CardDescription className="text-xs">Injecting lead roster into databases. Do not reload.</CardDescription>
                </div>
                <div className="space-y-2">
                  <Progress value={progress} className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full" />
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400">{progress}% completed</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP 4: RESULTS SUMMARY */}
        {step === 4 && (
          <Card className="max-w-2xl mx-auto text-center border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <CardHeader className="pb-4 pt-8">
              <div className="mx-auto bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-2xl w-fit mb-4 text-emerald-600 dark:text-emerald-450 shadow-2xs">
                <CheckCircle className="h-8 w-8" />
              </div>
              <CardTitle className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Lead Roster Import Successful</CardTitle>
              <CardDescription className="text-xs">Database transactions committed and leads allocated successfully.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-6">
              
              {/* Core Analytics Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50/50 dark:bg-slate-950/20 p-4.5 rounded-2xl border border-slate-200/50 dark:border-slate-800/80 shadow-2xs flex flex-col justify-center">
                  <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-200">{uploadStats.total}</div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mt-1">Total Spreadsheet Rows</div>
                </div>
                <div className="bg-emerald-500/5 p-4.5 rounded-2xl border border-emerald-500/10 shadow-2xs flex flex-col justify-center">
                  <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{uploadStats.success}</div>
                  <div className="text-[10px] uppercase font-bold text-emerald-650/80 dark:text-emerald-500 mt-1">Uploaded to CRM</div>
                </div>
                <div 
                  onClick={() => {
                    if (uploadStats.skipped > 0) setShowSkippedDialog(true);
                  }}
                  className={`bg-amber-500/5 p-4.5 rounded-2xl border border-amber-500/10 shadow-2xs flex flex-col justify-center transition-all ${
                    uploadStats.skipped > 0 ? "cursor-pointer hover:bg-amber-500/10 hover:border-amber-500/30 group relative" : ""
                  }`}
                  title={uploadStats.skipped > 0 ? "Click to view skipped duplicate numbers" : undefined}
                >
                  <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5">
                    {uploadStats.skipped}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-amber-650/80 dark:text-amber-500 mt-1 flex items-center justify-center gap-1">
                    Skipped (Duplicate Check)
                  </div>
                  {uploadStats.skipped > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-amber-500/10 flex items-center justify-center gap-1 text-[11px] font-extrabold text-amber-600 dark:text-amber-400 group-hover:underline">
                      <span>Click to view numbers</span>
                      <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  )}
                </div>
              </div>

              {/* AI PRIORITIZATION METRICS */}
              {autoPrioritize && uploadStats.success > 0 && (
                <div className="bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-white dark:to-slate-900/5 p-5 rounded-2xl border border-indigo-200/40 dark:border-indigo-900/30 text-left space-y-4 shadow-2xs">
                  <h3 className="text-xs font-bold text-indigo-950 dark:text-indigo-350 flex items-center gap-1.5 uppercase tracking-wider">
                    <Sparkles className="h-4 w-4 text-indigo-500 fill-indigo-500/10 animate-pulse" />
                    AI scoring intent analysis
                  </h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-3xs">
                      <div className="text-lg font-extrabold text-rose-600 dark:text-rose-400">{highPriorityCount}</div>
                      <div className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider mt-0.5">High Priority</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-3xs">
                      <div className="text-lg font-extrabold text-blue-600 dark:text-blue-400">{mediumPriorityCount}</div>
                      <div className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider mt-0.5">Medium Priority</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-3xs">
                      <div className="text-lg font-extrabold text-slate-650 dark:text-slate-455">{lowPriorityCount}</div>
                      <div className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider mt-0.5">Low Priority</div>
                    </div>
                  </div>
                </div>
              )}

              {/* DISTRIBUTION SUMMARY & SKIPPED DUPLICATES BUTTONS */}
              {(Object.keys(assignmentSummary).length > 0 || uploadStats.skipped > 0) && (
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  {(Object.keys(assignmentSummary).length > 0) && (
                    <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="gap-2 border-blue-200/60 dark:border-slate-800 bg-blue-500/5 text-blue-600 hover:bg-blue-500/10 font-bold text-xs py-5 px-6 rounded-xl hover:shadow-sm shadow-2xs">
                          <PieChart className="h-4 w-4" />
                          View Allocation Breakdown Report
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md overflow-hidden">
                        <DialogHeader className="flex flex-row items-center justify-between pr-6 border-b border-slate-100 dark:border-slate-800 pb-3 bg-slate-50/50 dark:bg-slate-950/20">
                          <div className="space-y-0.5 text-left">
                            <DialogTitle className="text-base font-extrabold text-slate-850 dark:text-slate-100">Roster Distribution Report</DialogTitle>
                            <DialogDescription className="text-xs">Agent allocation details for this batch.</DialogDescription>
                          </div>
                          <Button variant="secondary" size="sm" onClick={handleShareReport} className="gap-1.5 bg-blue-500/10 text-blue-600 hover:bg-blue-500/15 dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white font-bold text-xs rounded-lg py-1 px-3 shadow-none border-0">
                            <Share2 className="h-3.5 w-3.5" /> Share
                          </Button>
                        </DialogHeader>
                        <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 px-2">
                          {Object.entries(assignmentSummary).map(([id, count]) => {
                            const agent = telecallers.find(t => t.id === id)
                            return (
                              <div key={id} className="flex items-center justify-between py-3 first:pt-0">
                                <span className="font-bold text-slate-800 dark:text-slate-250 text-xs">{agent?.full_name || "Unknown Agent"}</span>
                                <Badge className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-350 font-extrabold text-[11px] py-1 px-2.5 rounded-lg border-0 shadow-none">
                                  {count} leads
                                </Badge>
                              </div>
                            )
                          })}
                        </div>

                        {uploadStats.skipped > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-amber-500/5 p-3 rounded-xl border border-amber-500/20">
                            <div className="flex flex-col text-left">
                              <span className="font-bold text-amber-800 dark:text-amber-300 text-xs flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                Skipped Duplicates
                              </span>
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">{uploadStats.skipped} numbers skipped during import</span>
                            </div>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => {
                                setShowSummaryDialog(false);
                                setShowSkippedDialog(true);
                              }}
                              className="bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50 font-bold text-[11px] h-7 px-3 rounded-lg flex items-center gap-1 shadow-2xs"
                            >
                              View Numbers <ArrowRight className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  )}

                  {uploadStats.skipped > 0 && (
                    <Button 
                      variant="outline" 
                      onClick={() => setShowSkippedDialog(true)} 
                      className="gap-2 border-amber-200/60 dark:border-amber-900/40 bg-amber-500/5 text-amber-600 hover:bg-amber-500/10 font-bold text-xs py-5 px-6 rounded-xl hover:shadow-sm shadow-2xs"
                    >
                      <AlertCircle className="h-4 w-4" />
                      View Skipped Duplicates ({uploadStats.skipped})
                    </Button>
                  )}

                  {/* SKIPPED DUPLICATES DIALOG */}
                  <Dialog open={showSkippedDialog} onOpenChange={setShowSkippedDialog}>
                    <DialogContent className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-xl overflow-hidden max-h-[85vh] flex flex-col">
                      <DialogHeader className="flex flex-row items-center justify-between pr-6 border-b border-slate-100 dark:border-slate-800 pb-3 bg-slate-50/50 dark:bg-slate-950/20">
                        <div className="space-y-0.5 text-left">
                          <DialogTitle className="text-base font-extrabold text-slate-850 dark:text-slate-100 flex items-center gap-2">
                            <AlertCircle className="h-4.5 w-4.5 text-amber-500" />
                            Skipped Duplicate Leads ({skippedRows.length})
                          </DialogTitle>
                          <DialogDescription className="text-xs">
                            Numbers skipped due to existing database records or duplicate CSV rows.
                          </DialogDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={downloadSkippedCSV} className="gap-1.5 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 font-bold text-xs rounded-lg py-1 px-3 shadow-2xs">
                          <Download className="h-3.5 w-3.5" /> Export CSV
                        </Button>
                      </DialogHeader>

                      {/* Filter Search Input */}
                      <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/10">
                        <div className="relative">
                          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                          <Input
                            placeholder="Search by phone number or name..."
                            value={skippedSearchQuery}
                            onChange={(e) => setSkippedSearchQuery(e.target.value)}
                            className="pl-9 h-9 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs"
                          />
                        </div>
                      </div>

                      {/* Numbers List */}
                      <div className="space-y-2 max-h-[360px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 px-4 py-2">
                        {skippedRows
                          .filter(row => {
                            if (!skippedSearchQuery) return true;
                            const q = skippedSearchQuery.toLowerCase();
                            return (
                              String(row.phone || "").toLowerCase().includes(q) ||
                              String(row.name || "").toLowerCase().includes(q) ||
                              String(row.reason || "").toLowerCase().includes(q) ||
                              String(row.agent || "").toLowerCase().includes(q)
                            );
                          })
                          .map((row, idx) => (
                            <div key={idx} className="flex items-center justify-between py-3 first:pt-1 last:pb-1 text-left">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold text-xs flex items-center justify-center flex-shrink-0">
                                  {row._originalIndex ? `#${row._originalIndex}` : '-'}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    <span className="font-mono text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
                                      {row.phone || "No Phone"}
                                    </span>
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                    {row.name !== 'Unknown' ? row.name : 'Unnamed Lead'}
                                    {row.agent && row.agent !== '-' ? ` • Agent: ${row.agent}` : ''}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900 font-bold text-[10px] py-0.5 px-2 rounded-md">
                                  {row.reason}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleCopyPhone(row.phone)}
                                  className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  title="Copy Phone Number"
                                >
                                  {copiedPhone === row.phone ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))}
                        {skippedRows.filter(row => {
                          if (!skippedSearchQuery) return true;
                          const q = skippedSearchQuery.toLowerCase();
                          return (
                            String(row.phone || "").toLowerCase().includes(q) ||
                            String(row.name || "").toLowerCase().includes(q) ||
                            String(row.reason || "").toLowerCase().includes(q) ||
                            String(row.agent || "").toLowerCase().includes(q)
                          );
                        }).length === 0 && (
                          <div className="text-center py-8 text-xs font-semibold text-slate-400 dark:text-slate-500">
                            No skipped numbers match your search.
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}

              {/* Error Box */}
              {uploadStats.failed > 0 && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4.5 flex items-center justify-between text-left shadow-2xs">
                  <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-xs">{uploadStats.failed} records failed database validation</span>
                      <span className="text-[10px] text-rose-550 dark:text-slate-500 font-semibold leading-normal">Errors are usually caused by malformed phone numbers or empty required columns.</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadErrorCSV} className="border-rose-250 dark:border-rose-950 text-rose-750 dark:text-rose-400 hover:bg-rose-500/10 font-bold text-xs tracking-tight shadow-2xs rounded-lg py-1 px-2.5">
                    <Download className="h-3.5 w-3.5 mr-1" /> Log
                  </Button>
                </div>
              )}
            </CardContent>
            
            <CardFooter className="flex justify-center gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 bg-slate-50/50 dark:bg-slate-950/20">
              <Button variant="outline" onClick={() => window.location.reload()} className="font-bold border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl py-4.5">Upload Another File</Button>
              <Button onClick={() => router.push("/admin/leads")} className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm rounded-xl py-4.5 px-6">View Leads Directory</Button>
            </CardFooter>
          </Card>
        )}
      </div>

      {/* RECENT HISTORY SECTION */}
      {step === 1 && (
        <Card className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-200">
              <History className="h-4.5 w-4.5 text-slate-500" /> Recent Upload Activities
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 italic leading-relaxed">
              (Session history is cleared on refresh. To configure permanent records, ensure 'upload_logs' table is created in Supabase.)
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
