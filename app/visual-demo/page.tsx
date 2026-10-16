"use client"

import React from "react"
import { notFound } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AdminMasterDashboard, HierarchyManager, AttendanceMonitor } from "@/components/visuals/admin-visuals"
import { TelecallerMyDay, LeadExecutionScreen } from "@/components/visuals/telecaller-visuals"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function VisualDemoPage() {
    if (process.env.NODE_ENV === "production") {
        notFound()
    }

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Hanva Technologies CRM</h1>
                        <p className="text-slate-500">Visual Architecture & UI Mockups</p>
                    </div>
                    <Link href="/">
                        <Button variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back to App
                        </Button>
                    </Link>
                </div>

                <Tabs defaultValue="process" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
                        <TabsTrigger value="process">Process Flow</TabsTrigger>
                        <TabsTrigger value="admin">Admin Panel</TabsTrigger>
                        <TabsTrigger value="telecaller">Telecaller Panel</TabsTrigger>
                    </TabsList>

                    <TabsContent value="process" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>CRM Lifecycle Process Flow</CardTitle>
                                <CardDescription>Visual representation of the lead management lifecycle</CardDescription>
                            </CardHeader>
                            <CardContent className="prose max-w-none">
                                <div className="bg-slate-50 p-6 rounded-lg border">
                                    <h3 className="text-lg font-semibold mb-4">Workflow Steps</h3>
                                    <ol className="list-decimal list-inside space-y-2">
                                        <li><strong>Start:</strong> Admin Uploads Leads / API Integration</li>
                                        <li><strong>Distribution:</strong> Logic for auto-assigning leads to Telecallers based on department/availability.</li>
                                        <li><strong>Action:</strong>
                                            <ul className="list-disc list-inside ml-6 mt-1 text-slate-600">
                                                <li>Telecaller Logs In</li>
                                                <li>Checks Attendance (Geo-location captured)</li>
                                                <li>Sees assigned leads</li>
                                            </ul>
                                        </li>
                                        <li><strong>Execution:</strong> Telecaller calls/WhatsApps → Updates Status (Interested/Not Interested/Follow-up).</li>
                                        <li><strong>Monitoring:</strong> Manager/Admin views real-time "Live Activity Feed" and performance stats.</li>
                                        <li><strong>End:</strong> Deal Closure/Reporting.</li>
                                    </ol>

                                    <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded text-blue-800 text-sm">
                                        <strong>Note:</strong> A detailed Mermaid.js diagram is available in <code>docs/process_flow.md</code>.
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="admin" className="space-y-8">
                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold border-l-4 border-blue-600 pl-3">1. Master Dashboard</h2>
                            <AdminMasterDashboard />
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold border-l-4 border-blue-600 pl-3">2. Hierarchy Manager</h2>
                            <HierarchyManager />
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold border-l-4 border-blue-600 pl-3">3. Attendance Monitor</h2>
                            <AttendanceMonitor />
                        </div>
                    </TabsContent>

                    <TabsContent value="telecaller" className="space-y-8">
                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold border-l-4 border-green-600 pl-3">1. "My Day" Dashboard</h2>
                            <TelecallerMyDay />
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold border-l-4 border-green-600 pl-3">2. Lead Execution Screen</h2>
                            <TelecallerMyDay /> {/* Reusing header for context if needed, but sticking to request */}
                            <LeadExecutionScreen />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
