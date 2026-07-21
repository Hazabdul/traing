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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Zap, Download, Edit2, Trash2 } from 'lucide-react';
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

export default function AssignmentsPage() {
  const { profile } = useAuth();
  const canEdit = ['system_admin', 'ehss_manager', 'ehss_officer', 'training_coordinator'].includes(profile?.role ?? '');
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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

  const filtered = useMemo(() => rows.filter((r) => statusFilter === 'all' || r.status === statusFilter), [rows, statusFilter]);

  function openEditModal(row: AssignmentRow) {
    setEditRow(row);
    setEditStatus(row.status);
    setEditScore(row.score !== null && row.score !== undefined ? String(row.score) : '');
    setEditDueDate(row.due_date ?? '');
    setEditCompletedDate(row.completed_date ?? '');
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
      const band = drv.last_rating_band;
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

  const columns: ColumnDef<AssignmentRow>[] = useMemo(() => [
    {
      accessorKey: 'driver_name', header: 'Driver',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.driver_name ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{row.original.employee_id}</p>
        </div>
      ),
    },
    { accessorKey: 'course_title', header: 'Course' },
    {
      accessorKey: 'status', header: 'Status',
      cell: ({ row }) => (
        <Badge variant="secondary" className={TRAINING_STATUS_COLORS[row.original.status]}>
          {TRAINING_STATUS_LABELS[row.original.status]}
        </Badge>
      ),
    },
    {
      accessorKey: 'due_date', header: 'Due Date',
      cell: ({ row }) => <span className={classNamesForDue(row.original.due_date)}>{formatDate(row.original.due_date)}</span>,
    },
    { accessorKey: 'completed_date', header: 'Completed', cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.completed_date)}</span> },
    {
      accessorKey: 'score', header: 'Score',
      cell: ({ row }) => <span className="tabular-nums font-medium">{row.original.score !== null && row.original.score !== undefined ? `${row.original.score}%` : '—'}</span>,
    },
    {
      id: 'band', header: 'Rating',
      cell: ({ row }) => row.original.driver_band ? (
        <span className="text-xs font-medium" style={{ color: RATING_BAND_COLORS[row.original.driver_band as DriverRatingBand] }}>{row.original.driver_band}</span>
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
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEditModal(row.original)} title="Change Status / Edit">
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
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
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-10 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training Assignments"
        description={`${rows.length} training records`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCSV(rows.map((r) => ({
              Driver: r.driver_name, EmployeeID: r.employee_id, Course: r.course_title,
              Status: TRAINING_STATUS_LABELS[r.status], DueDate: formatDate(r.due_date),
              Completed: formatDate(r.completed_date), Score: r.score ?? '', Source: r.source,
            })), 'assignments.csv')} className="gap-1">
              <Download className="h-4 w-4" /> Export
            </Button>
            {canEdit && <Button variant="outline" size="sm" onClick={runAutoEngine} className="gap-1"><Zap className="h-4 w-4" /> Auto-Assign</Button>}
            {canEdit && <Button size="sm" onClick={() => setAssignOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> Assign</Button>}
          </div>
        }
      />

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {(Object.keys(TRAINING_STATUS_LABELS) as TrainingStatus[]).map((s) => <SelectItem key={s} value={s}>{TRAINING_STATUS_LABELS[s]}</SelectItem>)}
        </SelectContent>
      </Select>

      <DataTable columns={columns} data={filtered} globalFilter={globalFilter} onGlobalFilterChange={setGlobalFilter} searchPlaceholder="Search by driver or course…" />

      <ManualAssignDialog open={assignOpen} onOpenChange={setAssignOpen} drivers={drivers} courses={courses} onSaved={load} />

      {/* Change Status / Edit Modal */}
      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Training Status</DialogTitle>
            <DialogDescription>
              Update status, score, and completion dates for {editRow?.driver_name}'s assignment ({editRow?.course_title}).
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
              {updating ? 'Saving...' : 'Update Status'}
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
