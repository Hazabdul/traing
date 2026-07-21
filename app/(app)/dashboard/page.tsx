'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users, GraduationCap, CheckCircle2, Clock, AlertTriangle, Award,
  CalendarClock, ClipboardCheck, TrendingUp, TrendingDown, ShieldAlert, BookOpen,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar, LineChart, Line,
} from 'recharts';
import { loadDashboardData, type DashboardData } from '@/lib/dashboard-data';
import { RATING_BAND_COLORS, RATING_BAND_LABELS, TRAINING_FREQUENCY_LABELS } from '@/lib/constants';
import { formatDate, daysUntil, classNamesForDue } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';

export default function DashboardPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${firstName}`}
        description="Operational overview of driver training, compliance and safety performance."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/reports">View Reports</Link>
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Drivers" value={data.totalDrivers} icon={Users} tone="primary" />
        <StatCard label="Active Trainings" value={data.activeTrainings} icon={GraduationCap} tone="primary" />
        <StatCard label="Completed" value={data.completedTrainings} icon={CheckCircle2} tone="success" />
        <StatCard label="Pending" value={data.pendingTrainings} icon={Clock} tone="warning" />
        <StatCard label="Expired" value={data.expiredTrainings} icon={AlertTriangle} tone="danger" />
        <StatCard label="Overdue" value={data.overdueTrainings} icon={ShieldAlert} tone="danger" />
        <StatCard label="Upcoming Exams" value={data.upcomingExams} icon={ClipboardCheck} tone="primary" />
        <StatCard label="Annual Due (60d)" value={data.upcomingAnnual} icon={CalendarClock} tone="warning" />
        <StatCard label="Award Eligible" value={data.awardEligible} icon={Award} tone="success" />
        <StatCard label="Rating D1" value={data.ratingDistribution.find((r) => r.band === 'D1')?.count ?? 0} icon={TrendingUp} tone="success" sub="Top performers" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Driver Rating Distribution</CardTitle>
            <CardDescription>D1 (Excellent) to D4 (High Risk)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={data.ratingDistribution}
                  dataKey="count"
                  nameKey="band"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {data.ratingDistribution.map((entry) => (
                    <Cell key={entry.band} fill={RATING_BAND_COLORS[entry.band as keyof typeof RATING_BAND_COLORS]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, _n: string, p: { payload?: { band?: string } }) => [
                    `${v} drivers`,
                    RATING_BAND_LABELS[(p?.payload?.band ?? '') as keyof typeof RATING_BAND_LABELS] ?? p?.payload?.band,
                  ]}
                />
                <Legend
                  formatter={(v) => RATING_BAND_LABELS[v as keyof typeof RATING_BAND_LABELS] ?? v}
                  wrapperStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Training Completion</CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.monthlyCompletion}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                <Area type="monotone" dataKey="completed" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#g1)" name="Completed" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Training Category Statistics</CardTitle>
            <CardDescription>Courses by category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.categoryStats} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={90} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} name="Courses" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" /> Accident Trend
            </CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.accidentTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--chart-4))" strokeWidth={2.5} dot={{ r: 3 }} name="Accidents" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Violation Trend
            </CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.violationTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--chart-3))" strokeWidth={2.5} dot={{ r: 3 }} name="Violations" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" /> Upcoming Trainings & Exams
              </CardTitle>
              <CardDescription>Due in the next 30 days</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/assignments">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.upcomingItems.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No upcoming items.</p>
            )}
            {data.upcomingItems.map((item) => {
              const days = daysUntil(item.dueDate);
              return (
                <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.courseTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.driverName}</p>
                  </div>
                  <div className="text-right">
                    <p className={classNamesForDue(item.dueDate) + ' text-xs'}>{formatDate(item.dueDate)}</p>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {TRAINING_FREQUENCY_LABELS[item.type] ?? item.type}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive" /> Overdue & Expired
              </CardTitle>
              <CardDescription>Require immediate attention</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/assignments">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.overdueItems.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing overdue. Great job!</p>
            )}
            {data.overdueItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.courseTitle}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.driverName}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-destructive font-medium">
                    {daysUntil(item.dueDate) !== null && (daysUntil(item.dueDate) as number) < 0
                      ? `${Math.abs(daysUntil(item.dueDate) as number)}d overdue`
                      : 'Expired'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(item.dueDate)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
