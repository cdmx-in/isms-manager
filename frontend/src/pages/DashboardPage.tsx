import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, getRiskColor, getStatusColor } from '@/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from 'recharts'
import {
  Server,
  AlertTriangle,
  Shield,
  Brain,
  Lock,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Download,
  RefreshCw,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const frameworkIcons: Record<string, React.ElementType> = {
  Shield: Shield,
  Brain: Brain,
  Lock: Lock,
}

const COLORS = ['#22c55e', '#3b82f6', '#eab308', '#f97316', '#ef4444']

export function DashboardPage() {
  const { currentOrganizationId } = useAuthStore()

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-stats', currentOrganizationId],
    queryFn: () => api.dashboard.getStats(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const { data: complianceData } = useQuery({
    queryKey: ['compliance-overview', currentOrganizationId],
    queryFn: () => api.dashboard.getComplianceOverview(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const { data: frameworks } = useQuery({
    queryKey: ['frameworks', currentOrganizationId],
    queryFn: () => api.frameworks.list(currentOrganizationId),
    enabled: !!currentOrganizationId,
  })

  const { data: riskTrend } = useQuery({
    queryKey: ['risk-trend', currentOrganizationId],
    queryFn: () => api.dashboard.getRiskTrend(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const { data: recentActivity } = useQuery({
    queryKey: ['recent-activity', currentOrganizationId],
    queryFn: () => api.dashboard.getRecentActivity(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const risksByLevel = stats?.risksByLevel || []
  const controlsByStatus = stats?.controlsByStatus || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your compliance management system
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button asChild>
            <Link to="/reports">
              <Download className="mr-2 h-4 w-4" />
              Generate Report
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalAssets || 0}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500">+3</span> from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Risks</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.openRisks || 0}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-red-500">{stats?.criticalRisks || 0}</span> critical
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Controls</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.implementedControls || 0}</div>
            <p className="text-xs text-muted-foreground">
              of {stats?.totalControls || 0} implemented
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.documents?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500">{stats?.documents?.indexed || 0}</span> indexed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Multi-Framework Compliance Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance Framework Progress</CardTitle>
          <CardDescription>
            Implementation progress across all active compliance frameworks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {(frameworks?.length ? frameworks : [
              { slug: 'iso27001', shortName: 'ISO 27001', name: 'ISO/IEC 27001:2022', icon: 'Shield', color: '#3b82f6', progress: { progressPercent: 0 }, controlCount: 93 },
              { slug: 'iso42001', shortName: 'ISO 42001', name: 'ISO/IEC 42001:2023', icon: 'Brain', color: '#8b5cf6', progress: { progressPercent: 0 }, controlCount: 39 },
              { slug: 'dpdpa', shortName: 'DPDPA', name: 'DPDPA 2023', icon: 'Lock', color: '#f59e0b', progress: { progressPercent: 0 }, controlCount: 30 },
            ]).map((fw: any) => {
              const IconComponent = frameworkIcons[fw.icon] || Shield
              const progressPercent = typeof fw.progress === 'object' ? (fw.progress?.progressPercent || 0) : (fw.progress || 0)
              return (
                <Link
                  key={fw.slug}
                  to={`/frameworks/${fw.slug}`}
                  className="block group"
                >
                  <div className="flex items-center gap-4 p-3 rounded-lg border transition-colors group-hover:bg-accent">
                    <div
                      className="rounded-lg p-2 flex-shrink-0"
                      style={{ backgroundColor: `${fw.color}20` }}
                    >
                      <IconComponent
                        className="h-5 w-5"
                        style={{ color: fw.color }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{fw.shortName}</span>
                        <span className="text-sm text-muted-foreground">
                          {progressPercent}% complete
                        </span>
                      </div>
                      <Progress value={progressPercent} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {fw.controlCount || 0} controls
                      </p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Risk Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Risk Distribution</CardTitle>
            <CardDescription>Current risks by severity level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={risksByLevel.length > 0 ? risksByLevel : [
                      { name: 'Critical', value: 2, color: '#ef4444' },
                      { name: 'High', value: 5, color: '#f97316' },
                      { name: 'Medium', value: 12, color: '#eab308' },
                      { name: 'Low', value: 8, color: '#22c55e' },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {(risksByLevel.length > 0 ? risksByLevel : [
                      { color: '#ef4444' },
                      { color: '#f97316' },
                      { color: '#eab308' },
                      { color: '#22c55e' },
                    ]).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Control Implementation Status */}
        <Card>
          <CardHeader>
            <CardTitle>Control Implementation Status</CardTitle>
            <CardDescription>Overview of control implementation progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={controlsByStatus.length > 0 ? controlsByStatus : [
                    { status: 'Implemented', count: 52, fill: '#22c55e' },
                    { status: 'Partial', count: 18, fill: '#eab308' },
                    { status: 'Planned', count: 15, fill: '#3b82f6' },
                    { status: 'Not Applicable', count: 8, fill: '#6b7280' },
                  ]}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="status" type="category" width={100} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Trend & Recent Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Risk Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Risk Trend</CardTitle>
            <CardDescription>Risk score trend over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={riskTrend || [
                    { month: 'Jan', score: 68 },
                    { month: 'Feb', score: 65 },
                    { month: 'Mar', score: 72 },
                    { month: 'Apr', score: 58 },
                    { month: 'May', score: 52 },
                    { month: 'Jun', score: 48 },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest changes in the system</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(recentActivity || [
                {
                  id: 1,
                  action: 'Risk Assessment Updated',
                  target: 'Data Breach Risk',
                  user: 'John Doe',
                  time: '2 hours ago',
                  type: 'risk',
                },
                {
                  id: 2,
                  action: 'Control Implemented',
                  target: 'A.8.2 Privileged Access Rights',
                  user: 'Jane Smith',
                  time: '4 hours ago',
                  type: 'control',
                },
                {
                  id: 3,
                  action: 'Policy Updated',
                  target: 'Information Security Policy',
                  user: 'John Doe',
                  time: '1 day ago',
                  type: 'policy',
                },
                {
                  id: 4,
                  action: 'New Asset Added',
                  target: 'Production Database Server',
                  user: 'Mike Johnson',
                  time: '2 days ago',
                  type: 'asset',
                },
                {
                  id: 5,
                  action: 'Incident Closed',
                  target: 'Phishing Attempt #INC-2024-032',
                  user: 'Jane Smith',
                  time: '3 days ago',
                  type: 'incident',
                },
              ]).map((activity: any) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-4 rounded-lg border p-3"
                >
                  <div className="rounded-full bg-muted p-2">
                    {activity.type === 'risk' && <AlertTriangle className="h-4 w-4" />}
                    {activity.type === 'control' && <Shield className="h-4 w-4" />}
                    {activity.type === 'policy' && <FileText className="h-4 w-4" />}
                    {activity.type === 'asset' && <Server className="h-4 w-4" />}
                    {activity.type === 'incident' && <AlertCircle className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="text-sm text-muted-foreground">{activity.target}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{typeof activity.user === 'object' && activity.user 
                        ? `${activity.user.firstName} ${activity.user.lastName}` 
                        : activity.user}</span>
                      <span>•</span>
                      <span>{activity.time || activity.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link to="/risks/new">
                <AlertTriangle className="h-6 w-6" />
                <span>Add Risk</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link to="/assets/new">
                <Server className="h-6 w-6" />
                <span>Add Asset</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link to="/incidents/new">
                <AlertCircle className="h-6 w-6" />
                <span>Report Incident</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link to="/soa">
                <CheckCircle2 className="h-6 w-6" />
                <span>Update SoA</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
