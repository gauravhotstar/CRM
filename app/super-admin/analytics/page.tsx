"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Building2, Users, PhoneCall, TrendingUp, Activity, UserCheck } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts'
import { fetchSuperAdminAnalytics } from "@/app/actions/super-admin-analytics"
import { toast } from "sonner"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export default function SuperAdminAnalytics() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const res = await fetchSuperAdminAnalytics()
      if (res.success) {
        setData(res.data)
      } else {
        toast.error(res.error)
      }
      setLoading(false)
    }
    loadData()
  }, [])

  if (loading) return <LoadingSkeleton variant="dashboard" />
  if (!data) return <div className="p-8 text-center text-slate-500">Failed to load analytics data.</div>

  const { kpis, tenantAnalytics, telecallerAnalytics } = data

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Activity className="h-8 w-8 text-indigo-600" />
            Global Analytics
          </h1>
          <p className="text-slate-500 mt-1">System-wide overview of tenants, users, and leads.</p>
        </div>
        <Button onClick={() => router.push('/super-admin')} variant="outline" className="shadow-sm">
          Back to Console
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-blue-600 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{kpis.totalTenants}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-600 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Users</CardTitle>
            <Users className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{kpis.totalUsers}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active Users (Today)</CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{kpis.activeUsersToday}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-600 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Leads</CardTitle>
            <TrendingUp className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{kpis.totalLeads}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Leads per Tenant</CardTitle>
            <CardDescription>Distribution of leads across different workspaces.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tenantAnalytics.slice(0, 10)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="totalLeads" name="Total Leads" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Telecallers per Tenant</CardTitle>
            <CardDescription>Number of active agents per workspace.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tenantAnalytics.slice(0, 10)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="totalTelecallers" name="Total Telecallers" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Tenant Overview</CardTitle>
            <CardDescription>Detailed statistics per workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant Name</TableHead>
                    <TableHead className="text-right">Telecallers</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenantAnalytics.map((tenant: any) => (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell className="text-right">{tenant.totalTelecallers}</TableCell>
                      <TableCell className="text-right">{tenant.totalLeads}</TableCell>
                    </TableRow>
                  ))}
                  {tenantAnalytics.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-slate-500">No tenants found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Top Telecallers</CardTitle>
            <CardDescription>Lead assignment per telecaller globally.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent Name</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead className="text-right">Assigned Leads</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {telecallerAnalytics.map((telecaller: any) => (
                    <TableRow key={telecaller.id}>
                      <TableCell className="font-medium">{telecaller.name}</TableCell>
                      <TableCell className="text-slate-500">{telecaller.tenantName}</TableCell>
                      <TableCell className="text-right font-bold">{telecaller.totalLeads}</TableCell>
                    </TableRow>
                  ))}
                  {telecallerAnalytics.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-slate-500">No telecallers found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
