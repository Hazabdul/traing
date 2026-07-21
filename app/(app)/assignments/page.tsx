'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import type { Training, Course, Driver, TrainingStatus, DriverRatingBand } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/date-picker';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Plus, Zap, Download, Edit2, Trash2, CheckCircle2, Clock, AlertTriangle, XCircle,
  GraduationCap, Bell, Filter, RefreshCw
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { TRAINING_STATUS_LABELS, TRAINING_STATUS_COLORS, RATING_BAND_COLORS } from '@/lib/constants';
import { formatDate, classNamesForDue } from '@/lib/format';
import { exportToCSV } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

interface AssignmentRow extends Training {
  driver_name?: string;
  employee_id?: string;
  course_title?: string;
  driver_band?: DriverRatingBand;
}

export default function AdvancedAssignmentsPage() {
  const { profile } = useAuth();
  const canEdit = ['system_admin', 'ehss_manager', 'ehss_officer', 'training_coordinator', 'branch_manager'].includes(profile?.role ?? '');
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab & Filters state
  const [activeTab, setActiveTab] = useState('all');
  const [globalFilter, setGlobalFilter] = useState('');
  const [bandFilter, setBandFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [assignOpen, setAssignOpen] = useState(false);

  // Edit status modal state
  const [editRow, setEditRow] = useState<AssignmentRow | null>(null);
  const [editStatus, setEditStatus] = useState<TrainingStatus>('assigned');
  const [editScore, setEditScore] = useState<string>('');
  const [editDueDate, setEditDueDate] = useState<string>('');
  const [editCompletedDate, setEditCompletedDate] = useState<string>('');
  const [updating, setUpdating] = useState(false);

  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: d }, { data: c }] = await Promise.all([
      supabase.from('trainings').select('*, course:courses(*), driver:drivers(*)').order('assigned_date', { ascending: false }),
      supabase.from('drivers').select('*').order('full_name'),
      supabase.from('courses').select('*').order('title'),
    ]);
    setDrivers(d ?? []);
    setCourses(c ?? []);
    setRows((t ?? []).map((tr: Training & { course: Course; driver: Driver }) => ({
      ...tr,
      driver_name: tr.driver?.full_name,
      employee_id: tr.driver?.employee_id,
      course_title: tr.course?.title,
      driver_band: tr.driver?.last_rating_band,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Statistics
  const stats = useMemo(() => {
    const total = rows.length;
    const completed = rows.filter((r) => r.status === 'completed').length;
    const pending = rows.filter((r) => r.status === 'assigned' || r.status === 'in_progress').length;
    const overdue = rows.filter((r) => r.status === 'overdue' || r.status === 'expired').length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, overdue, failed, rate };
  }, [rows]);

  // Filter rows based on active Tab and selected filters
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // Tab filter
      if (activeTab === 'pending' && !(r.status === 'assigned' || r.status === 'in_progress')) return false;
      if (activeTab === 'overdue' && !(r.status === 'overdue' || r.status === 'expired')) return false;
      if (activeTab === 'completed' && r.status !== 'completed') return false;
      if (activeTab === 'failed' && r.status !== 'failed') return false;

      // Rating band filter
      if (bandFilter !== 'all' && r.driver_band !== bandFilter) return false;

      // Course filter
      if (courseFilter !== 'all' && r.course_id !== courseFilter) return false;

      return true;
    });
  }, [rows, activeTab, bandFilter, courseFilter]);

  function openEditModal(row: AssignmentRow) {
    setEditRow(row);
    setEditStatus(row.status);
    setEditScore(row.score !== null && row.score !== undefined ? String(row.score) : '');
    setEditDueDate(row.due_date ?? '');
    setEditCompletedDate(row.completed_date ?? '');
  }

  async function updateInlineStatus(row: AssignmentRow, newStatus: TrainingStatus) {
    const isCompleted = newStatus === 'completed';
    const compDate = isCompleted ? new Date().toISOString().slice(0, 10) : (newStatus === 'assigned' || newStatus === 'in_progress' ? null : row.completed_date);

    const { error } = await supabase
      .from('trainings')
      .update({
        status: newStatus,
        completed_date: compDate,
      })
      .eq('id', row.id);

    if (error) {
      toast({ title: 'Failed to update status', description: error.message, variant: 'destructive' });
      return;
    }

    await logAudit('status_change', 'training', `Changed training status for ${row.driver_name} to ${newStatus}`, {
      status: newStatus,
    }, row.driver_id);

    toast({ title: `Status updated to ${TRAINING_STATUS_LABELS[newStatus]}` });
    load();
  }

  async function saveTrainingStatus() {
    if (!editRow) return;
    setUpdating(true);

    const isCompleted = editStatus === 'completed';
    const compDate = isCompleted
      ? (editCompletedDate || new Date().toISOString().slice(0, 10))
      : (editStatus === 'assigned' || editStatus === 'in_progress' ? null : editCompletedDate || null);

    const { error } = await supabase
      .from('trainings')
      .update({
        status: editStatus,
        score: editScore !== '' ? Number(editScore) : null,
        due_date: editDueDate || null,
        completed_date: compDate,
      })
      .eq('id', editRow.id);

    setUpdating(false);
    if (error) {
      toast({ title: 'Failed to update status', description: error.message, variant: 'destructive' });
      return;
    }

    await logAudit('status_change', 'training', `Changed training status for ${editRow.driver_name} to ${editStatus}`, {
      status: editStatus,
      score: editScore,
    }, editRow.driver_id);

    toast({ title: 'Training status updated' });
    setEditRow(null);
    load();
  }

  async function deleteAssignment(id: string, driverName?: string) {
    if (!confirm(`Delete training assignment for ${driverName ?? 'driver'}?`)) return;
    const { error } = await supabase.from('trainings').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Assignment deleted' });
    load();
  }

  async function runAutoEngine() {
    if (!confirm('Run the automatic training assignment engine? This will assign system-selected courses to drivers based on their rating and plant requirements.')) return;
    let assigned = 0;
    const due = new Date(); due.setDate(due.getDate() + 30);
    const dueStr = due.toISOString().slice(0, 10);

    for (const drv of drivers) {
      if (drv.status !== 'active') continue;
      const { data: candidates } = await supabase
        .from('courses')
        .select('id, title')
        .eq('frequency', 'system_selected')
        .limit(2);

      const { data: existing } = await supabase
        .from('trainings')
        .select('course_id')
        .eq('driver_id', drv.id)
        .in('status', ['assigned', 'in_progress', 'completed']);

      const existingIds = new Set((existing ?? []).map((x: { course_id: string }) => x.course_id));
      const toAssign = (candidates ?? []).filter((c: { id: string }) => !existingIds.has(c.id));
      if (toAssign.length) {
        const rowsToInsert = toAssign.map((c: { id: string }) => ({
          driver_id: drv.id, course_id: c.id, status: 'assigned' as const, due_date: dueStr, source: 'system_selected',
        }));
        const { error } = await supabase.from('trainings').insert(rowsToInsert);
        if (!error) assigned += toAssign.length;
      }
    }
    await logAudit('assign', 'training', `Auto-assignment engine ran: ${assigned} courses assigned`, { count: assigned });
    toast({ title: 'Assignment engine complete', description: `${assigned} trainings assigned.` });
    load();
  }

  async function sendOverdueReminders() {
    const overdueRows = rows.filter((r) => r.status === 'overdue' || r.status === 'expired');
    if (overdueRows.length === 0) {
      toast({ title: 'No overdue trainings', description: 'All drivers are up to date!' });
      return;
    }
    let count = 0;
    for (const r of overdueRows) {
      const { data: prof } = await supabase.from('profiles').select('user_id').eq('driver_id', r.driver_id).maybeSingle();
      if (prof?.user_id) {
        await supabase.from('notifications').insert({
          user_id: prof.user_id,
          driver_id: r.driver_id,
          channel: 'in_app',
          title: 'OVERDUE TRAINING ALERT',
          body: `Your training "${r.course_title}" is overdue. Please complete it as soon as possible.`,
        });
        count++;
      }
    }
    toast({ title: 'Reminders Sent', description: `Sent notification alerts to ${count} drivers.` });
  }

  const columns: ColumnDef<AssignmentRow>[] = useMemo(() => [
    {
      accessorKey: 'driver_name', header: 'Driver',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-foreground">{row.original.driver_name ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{row.original.employee_id}</p>
        </div>
      ),
    },
    {
      accessorKey: 'course_title', header: 'Course',
      cell: ({ row }) => <span className="font-medium text-sm">{row.original.course_title}</span>,
    },
    {
      accessorKey: 'status', header: 'Status & Change',
      cell: ({ row }) => (
        <Select
          value={row.original.status}
          onValueChange={(val) => updateInlineStatus(row.original, val as TrainingStatus)}
        >
          <SelectTrigger className="h-8 w-[145px] text-xs font-semibold border-border/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TRAINING_STATUS_LABELS) as TrainingStatus[]).map((st) => (
              <SelectItem key={st} value={st} className="text-xs">
                {TRAINING_STATUS_LABELS[st]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      accessorKey: 'due_date', header: 'Due Date',
      cell: ({ row }) => <span className={classNamesForDue(row.original.due_date)}>{formatDate(row.original.due_date)}</span>,
    },
    { accessorKey: 'completed_date', header: 'Completed', cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.completed_date)}</span> },
    {
      accessorKey: 'score', header: 'Score',
      cell: ({ row }) => <span className="tabular-nums font-bold">{row.original.score !== null && row.original.score !== undefined ? `${row.original.score}%` : '—'}</span>,
    },
    {
      id: 'band', header: 'Rating Band',
      cell: ({ row }) => row.original.driver_band ? (
        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: `${RATING_BAND_COLORS[row.original.driver_band as DriverRatingBand]}20`, color: RATING_BAND_COLORS[row.original.driver_band as DriverRatingBand] }}>
          {row.original.driver_band}
        </span>
      ) : '—',
    },
    {
      accessorKey: 'source', header: 'Source',
      cell: ({ row }) => <Badge variant="outline" className="text-[10px] capitalize">{(row.original.source ?? 'manual').replace('_', ' ')}</Badge>,
    },
    {
      id: 'actions', header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => openEditModal(row.original)}>
            <Edit2 className="h-3.5 w-3.5" /> Details
          </Button>
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => deleteAssignment(row.original.id, row.original.driver_name)} title="Delete Assignment">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ], [canEdit]);

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training Assignments & Compliance"
        description="Enterprise training status dashboard — filter by status tabs or update training status directly."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCSV(filteredRows.map((r) => ({
              Driver: r.driver_name, EmployeeID: r.employee_id, Course: r.course_title,
              Status: TRAINING_STATUS_LABELS[r.status], DueDate: formatDate(r.due_date),
              Completed: formatDate(r.completed_date), Score: r.score ?? '', Source: r.source,
            })), 'assignments.csv')} className="gap-1">
              <Download className="h-4 w-4" /> Export
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={sendOverdueReminders} className="gap-1 text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400">
                <Bell className="h-4 w-4" /> Send Overdue Alerts
              </Button>
            )}
            {canEdit && <Button variant="outline" size="sm" onClick={runAutoEngine} className="gap-1"><Zap className="h-4 w-4" /> Auto-Assign</Button>}
            {canEdit && <Button size="sm" onClick={() => setAssignOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> Assign Course</Button>}
          </div>
        }
      />

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Total Assigned</p>
              <p className="text-2xl font-bold tracking-tight text-foreground">{stats.total}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GraduationCap className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Pending / In-Progress</p>
              <p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{stats.pending}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Completed ({stats.rate}%)</p>
              <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{stats.completed}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Overdue / Expired</p>
              <p className="text-2xl font-bold tracking-tight text-destructive">{stats.overdue}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Filters Toolbar */}
      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/60 p-1">
            <TabsTrigger value="all" className="gap-1.5 text-xs font-semibold">
              All Assignments ({stats.total})
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-1.5 text-xs font-semibold">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              Pending ({stats.pending})
            </TabsTrigger>
            <TabsTrigger value="overdue" className="gap-1.5 text-xs font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              Overdue ({stats.overdue})
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1.5 text-xs font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Completed ({stats.completed})
            </TabsTrigger>
            <TabsTrigger value="failed" className="gap-1.5 text-xs font-semibold">
              <XCircle className="h-3.5 w-3.5 text-rose-500" />
              Failed ({stats.failed})
            </TabsTrigger>
          </TabsList>

          {/* Secondary Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={bandFilter} onValueChange={setBandFilter}>
              <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="Rating Band" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rating Bands</SelectItem>
                <SelectItem value="D1">D1 - Top Performer</SelectItem>
                <SelectItem value="D2">D2 - Good</SelectItem>
                <SelectItem value="D3">D3 - Needs Work</SelectItem>
                <SelectItem value="D4">D4 - High Risk</SelectItem>
              </SelectContent>
            </Select>

            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue placeholder="Course Filter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(bandFilter !== 'all' || courseFilter !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => { setBandFilter('all'); setCourseFilter('all'); }} className="h-9 text-xs gap-1">
                <RefreshCw className="h-3.5 w-3.5" /> Reset Filters
              </Button>
            )}
          </div>
        </div>

        {/* Tab Content Tables */}
        <TabsContent value={activeTab} className="mt-0 space-y-4">
          <DataTable
            columns={columns}
            data={filteredRows}
            globalFilter={globalFilter}
            onGlobalFilterChange={setGlobalFilter}
            searchPlaceholder="Search driver name, ID, or course title..."
          />
        </TabsContent>
      </Tabs>

      {/* Manual Assign Modal */}
      <ManualAssignDialog open={assignOpen} onOpenChange={setAssignOpen} drivers={drivers} courses={courses} onSaved={load} />

      {/* Change Status / Edit Details Modal */}
      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Assignment Details</DialogTitle>
            <DialogDescription>
              Update status, score, due date, and completion date for {editRow?.driver_name}'s assignment ({editRow?.course_title}).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Training Status</Label>
              <Select value={editStatus} onValueChange={(val) => setEditStatus(val as TrainingStatus)}>
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TRAINING_STATUS_LABELS) as TrainingStatus[]).map((st) => (
                    <SelectItem key={st} value={st}>
                      {TRAINING_STATUS_LABELS[st]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Score (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={editScore}
                onChange={(e) => setEditScore(e.target.value)}
                placeholder="e.g. 85"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Due Date</Label>
              <DatePicker value={editDueDate} onChange={setEditDueDate} />
            </div>

            {(editStatus === 'completed' || editStatus === 'failed') && (
              <div>
                <Label className="text-xs font-semibold">Completed Date</Label>
                <DatePicker value={editCompletedDate} onChange={setEditCompletedDate} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={saveTrainingStatus} disabled={updating}>
              {updating ? 'Saving...' : 'Update Assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ManualAssignDialog({ open, onOpenChange, drivers, courses, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; drivers: Driver[]; courses: Course[]; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [dueDate, setDueDate] = useState('');

  async function save() {
    if (!driverId || !courseId) { toast({ title: 'Select driver and course', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('trainings').insert({
      driver_id: driverId, course_id: courseId, status: 'assigned', due_date: dueDate || null, source: 'manual',
    });
    setSaving(false);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    const drv = drivers.find((d) => d.id === driverId);
    const crs = courses.find((c) => c.id === courseId);
    await logAudit('assign', 'training', `Assigned ${crs?.title} to ${drv?.full_name}`, {}, driverId);
    const { data: prof } = await supabase.from('profiles').select('user_id').eq('driver_id', driverId).maybeSingle();
    if (prof?.user_id) {
      await supabase.from('notifications').insert({ user_id: prof.user_id, driver_id: driverId, channel: 'in_app', title: 'Training Assigned', body: `${crs?.title} has been assigned to you.` });
    }
    toast({ title: 'Training assigned' });
    onOpenChange(false);
    setDriverId(''); setCourseId(''); setDueDate('');
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign Training</DialogTitle><DialogDescription>Manually assign a course to a driver.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Driver</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
              <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name} ({d.employee_id})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
              <SelectContent>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Due Date (optional)</Label>
            <DatePicker value={dueDate} onChange={setDueDate} />
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Assign</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
