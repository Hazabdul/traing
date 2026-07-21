'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import type { Training, Course, Driver, TrainingStatus, DriverRatingBand, TrainingMaterial, Certificate, Exam } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/date-picker';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Plus, Zap, Download, Edit2, Trash2, CheckCircle2, Clock, AlertTriangle, XCircle,
  GraduationCap, Bell, RefreshCw, ClipboardCheck, Play, Sparkles, User, BookOpen,
  FileText, Video, Presentation, Headphones, Image as ImageIcon, Award, ExternalLink, Calendar, ShieldCheck,
  Copy, MessageCircle
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { TRAINING_STATUS_LABELS, TRAINING_STATUS_COLORS, RATING_BAND_COLORS, MATERIAL_TYPE_LABELS } from '@/lib/constants';
import { formatDate, classNamesForDue } from '@/lib/format';
import { exportToCSV } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { createExamRecord, fetchAllExams, updateExamRecord } from '@/lib/exam-service';

interface AssignmentRow extends Training {
  driver_name?: string;
  employee_id?: string;
  course_title?: string;
  driver_band?: DriverRatingBand;
  exam_id?: string | null;
  exam_title?: string | null;
  course?: Course;
  driver?: Driver;
  materials?: TrainingMaterial[];
  certificate?: Certificate | null;
  attempt_count?: number;
}

const MATERIAL_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  powerpoint: Presentation,
  video: Video,
  audio: Headphones,
  image: ImageIcon,
};

export default function AdvancedAssignmentsPage() {
  const router = useRouter();
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

  // Detail Modal state
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentRow | null>(null);
  const [detailMaterials, setDetailMaterials] = useState<TrainingMaterial[]>([]);
  const [detailCertificate, setDetailCertificate] = useState<Certificate | null>(null);
  const [editStatus, setEditStatus] = useState<TrainingStatus>('assigned');
  const [editScore, setEditScore] = useState<string>('');
  const [editDueDate, setEditDueDate] = useState<string>('');
  const [editCompletedDate, setEditCompletedDate] = useState<string>('');
  const [updating, setUpdating] = useState(false);

  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: d }, { data: c }, { data: ex }, { data: attempts }] = await Promise.all([
      supabase.from('trainings').select('*, course:courses(*), driver:drivers(*)').order('assigned_date', { ascending: false }),
      supabase.from('drivers').select('*').order('full_name'),
      supabase.from('courses').select('*').order('title'),
      supabase.from('exams').select('id, course_id, title').eq('is_active', true),
      supabase.from('exam_attempts').select('driver_id, exam_id'),
    ]);

    const examMap = new Map<string, { id: string; title: string }>();
    (ex ?? []).forEach((e: { id: string; course_id: string | null; title: string }) => {
      if (e.course_id) examMap.set(e.course_id, { id: e.id, title: e.title });
    });

    const attemptsMap = new Map<string, number>();
    (attempts ?? []).forEach((a: { driver_id: string; exam_id: string }) => {
      const key = `${a.driver_id}_${a.exam_id}`;
      attemptsMap.set(key, (attemptsMap.get(key) ?? 0) + 1);
    });

    setDrivers(d ?? []);
    setCourses(c ?? []);
    setRows((t ?? []).map((tr: Training & { course: Course; driver: Driver }) => {
      const exam = tr.course_id ? examMap.get(tr.course_id) : null;
      const count = (tr.driver_id && exam?.id) ? (attemptsMap.get(`${tr.driver_id}_${exam.id}`) ?? 0) : 0;

      return {
        ...tr,
        driver_name: tr.driver?.full_name,
        employee_id: tr.driver?.employee_id,
        course_title: tr.course?.title,
        driver_band: tr.driver?.last_rating_band,
        exam_id: exam?.id ?? null,
        exam_title: exam?.title ?? null,
        attempt_count: count,
      };
    }));
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

  async function openDetailModal(row: AssignmentRow) {
    setSelectedAssignment(row);
    setEditStatus(row.status);
    setEditScore(row.score !== null && row.score !== undefined ? String(row.score) : '');
    setEditDueDate(row.due_date ?? '');
    setEditCompletedDate(row.completed_date ?? '');

    // Fetch course materials
    if (row.course_id) {
      const { data: mats } = await supabase.from('training_materials').select('*').eq('course_id', row.course_id);
      setDetailMaterials((mats ?? []) as TrainingMaterial[]);
    } else {
      setDetailMaterials([]);
    }

    // Fetch certificate if completed
    if (row.driver_id && row.course_id) {
      const { data: cert } = await supabase
        .from('certificates')
        .select('*')
        .eq('driver_id', row.driver_id)
        .eq('course_id', row.course_id)
        .maybeSingle();
      setDetailCertificate(cert as Certificate | null);
    } else {
      setDetailCertificate(null);
    }
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

  async function createExamForCourse(row: AssignmentRow) {
    if (!row.course_id) return;
    const { data: newExam, error } = await createExamRecord({
      title: `${row.course_title} Final Exam`,
      description: `Evaluation exam for course: ${row.course_title}`,
      course_id: row.course_id,
      pass_percentage: 70,
      time_limit_minutes: 30,
      is_active: true,
      randomize_questions: true,
    });

    if (error || !newExam) {
      toast({ title: 'Failed to create exam', description: error?.message ?? 'Permission or network error', variant: 'destructive' });
      return;
    }

    toast({ title: 'Exam created and linked!', description: 'Redirecting to add exam questions...' });
    router.push(`/exams/${newExam.id}`);
  }

  async function saveTrainingStatus() {
    if (!selectedAssignment) return;
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
      .eq('id', selectedAssignment.id);

    setUpdating(false);
    if (error) {
      toast({ title: 'Failed to update status', description: error.message, variant: 'destructive' });
      return;
    }

    await logAudit('status_change', 'training', `Changed training status for ${selectedAssignment.driver_name} to ${editStatus}`, {
      status: editStatus,
      score: editScore,
    }, selectedAssignment.driver_id);

    toast({ title: 'Training details updated successfully' });
    setSelectedAssignment(null);
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
    if (selectedAssignment?.id === id) setSelectedAssignment(null);
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
        <button
          onClick={() => router.push(`/assignments/${row.original.id}`)}
          className="text-left hover:underline group cursor-pointer"
        >
          <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{row.original.driver_name ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{row.original.employee_id}</p>
        </button>
      ),
    },
    {
      accessorKey: 'course_title', header: 'Course',
      cell: ({ row }) => (
        <button onClick={() => router.push(`/assignments/${row.original.id}`)} className="text-left hover:underline cursor-pointer">
          <span className="font-semibold text-sm text-foreground">{row.original.course_title}</span>
        </button>
      ),
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
      id: 'course_exam', header: 'Evaluation Exam',
      cell: ({ row }) => {
        const attempts = row.original.attempt_count ?? 0;
        const isDone = row.original.status === 'completed';
        if (row.original.exam_id) {
          return (
            <div className="flex flex-col gap-1.5 items-start">
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={isDone || attempts > 0 ? "outline" : "default"}
                  className={`h-8 text-xs gap-1 ${isDone || attempts > 0 ? 'border-primary/40 text-primary hover:bg-primary/10' : 'shadow-xs'}`}
                  onClick={() => router.push(`/exams/${row.original.exam_id}/take`)}
                >
                  {attempts > 0 || isDone ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 text-primary" /> Retake Exam
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" /> Start Exam
                    </>
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Copy Exam Share Link"
                  onClick={() => {
                    const url = `${window.location.origin}/exams/${row.original.exam_id}/take`;
                    navigator.clipboard.writeText(url);
                    toast({ title: 'Shareable link copied!', description: 'Exam URL copied to clipboard.' });
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  title="Share to WhatsApp"
                  onClick={() => {
                    const url = `${window.location.origin}/exams/${row.original.exam_id}/take`;
                    const msg = `📋 SafeFleet Evaluation Exam: ${row.original.exam_title ?? 'Course Exam'}\n\nPlease click the link to start your exam:\n${url}`;
                    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
                  }}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
              {attempts > 0 ? (
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Attended: {attempts} time{attempts > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">Not taken yet</span>
              )}
            </div>
          );
        }
        return canEdit ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => createExamForCourse(row.original)}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" /> + Add Exam
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">No Exam</span>
        );
      },
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
      id: 'actions', header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="default" className="h-8 text-xs gap-1 shadow-xs" onClick={() => router.push(`/assignments/${row.original.id}`)}>
            <Edit2 className="h-3.5 w-3.5" /> Detailed View
          </Button>
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => deleteAssignment(row.original.id, row.original.driver_name)} title="Delete Assignment">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ], [canEdit, router]);

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training Assignments & Compliance"
        description="Enterprise training status dashboard — click Detailed View on any row for full course materials, exam, and driver info."
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

      {/* Comprehensive Detailed View Modal */}
      <Dialog open={!!selectedAssignment} onOpenChange={(open) => !open && setSelectedAssignment(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-6">
              <div>
                <DialogTitle className="text-xl leading-tight">{selectedAssignment?.course_title}</DialogTitle>
                <DialogDescription className="mt-1">
                  Assignment Details & Compliance Tracking for {selectedAssignment?.driver_name}
                </DialogDescription>
              </div>
              <Badge variant="secondary" className={selectedAssignment ? TRAINING_STATUS_COLORS[selectedAssignment.status] : ''}>
                {selectedAssignment ? TRAINING_STATUS_LABELS[selectedAssignment.status] : ''}
              </Badge>
            </div>
          </DialogHeader>

          <div className="grid gap-6 py-2">
            {/* Driver Profile Summary Box */}
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{selectedAssignment?.driver_name}</h4>
                    <p className="text-xs text-muted-foreground">ID: {selectedAssignment?.employee_id} · Band: {selectedAssignment?.driver_band ?? '—'}</p>
                  </div>
                </div>
                {selectedAssignment?.driver_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => { setSelectedAssignment(null); router.push(`/drivers/${selectedAssignment.driver_id}`); }}
                  >
                    View Driver Profile <ExternalLink className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {/* Course Info & Attached Materials */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-primary" /> Course Information & Training Materials
              </h4>

              <div className="grid grid-cols-2 gap-3 text-xs bg-card p-3 rounded-lg border">
                <div><span className="text-muted-foreground">Category:</span> <span className="font-semibold">{selectedAssignment?.course?.category ?? 'General Safety'}</span></div>
                <div><span className="text-muted-foreground">Language:</span> <span className="font-semibold">{selectedAssignment?.course?.language ?? 'English'}</span></div>
                <div><span className="text-muted-foreground">Duration:</span> <span className="font-semibold">{selectedAssignment?.course?.duration_hours ?? 1} hours</span></div>
                <div><span className="text-muted-foreground">Pass Mark:</span> <span className="font-semibold">{selectedAssignment?.course?.pass_percentage ?? 70}%</span></div>
              </div>

              {detailMaterials.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Attached Learning Materials ({detailMaterials.length}):</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {detailMaterials.map((m) => {
                      const Icon = MATERIAL_ICONS[m.material_type] ?? FileText;
                      return (
                        <a
                          key={m.id}
                          href={m.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-lg border p-2.5 text-xs hover:bg-muted transition-colors"
                        >
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0 flex-1 truncate">
                            <p className="font-semibold truncate">{m.title}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">{m.material_type} · v{m.version}</p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No uploaded training files attached to this course.</p>
              )}
            </div>

            {/* Evaluation Exam & Certificate Section */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ClipboardCheck className="h-4 w-4 text-primary" /> Evaluation Exam & Certificate
              </h4>

              {selectedAssignment?.exam_id ? (
                <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                  <div>
                    <p className="text-sm font-bold text-primary flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4" /> {selectedAssignment.exam_title ?? 'Course Evaluation Exam'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Automated scoring with instant certificate issuance upon passing.</p>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 shadow-sm"
                    onClick={() => {
                      const examId = selectedAssignment.exam_id;
                      setSelectedAssignment(null);
                      router.push(`/exams/${examId}/take`);
                    }}
                  >
                    <Play className="h-4 w-4" /> Start Exam
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl border p-3.5 text-xs text-muted-foreground">
                  <span>No evaluation exam currently linked to this course.</span>
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => selectedAssignment && createExamForCourse(selectedAssignment)}>
                      + Create Exam
                    </Button>
                  )}
                </div>
              )}

              {detailCertificate && (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-bold">Issued Certificate: {detailCertificate.certificate_number}</p>
                    <p className="text-[11px] opacity-80">Issued on {formatDate(detailCertificate.issued_at)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Status & Dates Editor */}
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Manage Assignment State</h4>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold">Training Status</Label>
                  <Select value={editStatus} onValueChange={(val) => setEditStatus(val as TrainingStatus)}>
                    <SelectTrigger className="w-full mt-1 text-xs">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TRAINING_STATUS_LABELS) as TrainingStatus[]).map((st) => (
                        <SelectItem key={st} value={st} className="text-xs">
                          {TRAINING_STATUS_LABELS[st]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Achieved Score (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editScore}
                    onChange={(e) => setEditScore(e.target.value)}
                    placeholder="e.g. 85"
                    className="mt-1 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Due Date</Label>
                  <DatePicker value={editDueDate} onChange={setEditDueDate} />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Completed Date</Label>
                  <DatePicker value={editCompletedDate} onChange={setEditCompletedDate} />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between border-t pt-3">
            {canEdit ? (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1" onClick={() => selectedAssignment && deleteAssignment(selectedAssignment.id, selectedAssignment.driver_name)}>
                <Trash2 className="h-4 w-4" /> Delete Assignment
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelectedAssignment(null)}>Close</Button>
              <Button onClick={saveTrainingStatus} disabled={updating}>
                {updating ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
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
  const [courseId, setCourseId] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Driver selection states
  const [driverSearch, setDriverSearch] = useState('');
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);

  // Exam list & selection states
  const [allExams, setAllExams] = useState<(Exam & { course?: Course | null })[]>([]);
  const [examMode, setExamMode] = useState<'existing' | 'create' | 'none'>('existing');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [examSearch, setExamSearch] = useState('');
  const [examTitle, setExamTitle] = useState('');
  const [passPercentage, setPassPercentage] = useState('70');
  const [timeLimit, setTimeLimit] = useState('30');
  const [loadingExams, setLoadingExams] = useState(false);

  useEffect(() => {
    if (!open) return;
    async function loadExams() {
      setLoadingExams(true);
      const list = await fetchAllExams();
      setAllExams(list);
      setLoadingExams(false);
    }
    loadExams();
  }, [open]);

  useEffect(() => {
    if (!courseId) {
      setSelectedExamId('');
      setExamTitle('');
      return;
    }

    const selectedCourse = courses.find((c) => c.id === courseId);
    if (selectedCourse) {
      setExamTitle(`${selectedCourse.title} Final Exam`);
      setPassPercentage(String(selectedCourse.pass_percentage ?? 70));
    }

    const matchingExam = allExams.find((e) => e.course_id === courseId);
    if (matchingExam) {
      setSelectedExamId(matchingExam.id);
      setExamMode('existing');
    } else {
      setSelectedExamId('');
      setExamMode('create');
    }
  }, [courseId, courses, allExams]);

  // Filtered drivers list based on search query
  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) =>
      d.full_name.toLowerCase().includes(driverSearch.toLowerCase()) ||
      d.employee_id.toLowerCase().includes(driverSearch.toLowerCase()) ||
      (d.last_rating_band ?? '').toLowerCase().includes(driverSearch.toLowerCase())
    );
  }, [drivers, driverSearch]);

  const filteredExamsList = useMemo(() => {
    return allExams.filter((e) =>
      e.title.toLowerCase().includes(examSearch.toLowerCase()) ||
      (e.course?.title ?? '').toLowerCase().includes(examSearch.toLowerCase())
    );
  }, [allExams, examSearch]);

  function toggleDriver(id: string) {
    setSelectedDriverIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAllDrivers() {
    const allIds = filteredDrivers.map((d) => d.id);
    setSelectedDriverIds(allIds);
  }

  function clearDriverSelection() {
    setSelectedDriverIds([]);
  }

  async function save() {
    if (selectedDriverIds.length === 0 || !courseId) {
      toast({ title: 'Select at least one driver and a course', variant: 'destructive' });
      return;
    }
    setSaving(true);

    let finalExamId = selectedExamId || null;

    // Option 1: Create a brand new exam
    if (examMode === 'create' && examTitle.trim()) {
      const { data: newExam, error: examErr } = await createExamRecord({
        title: examTitle.trim(),
        description: `Evaluation exam for course`,
        course_id: courseId,
        pass_percentage: Number(passPercentage) || 70,
        time_limit_minutes: Number(timeLimit) || 30,
        is_active: true,
        randomize_questions: true,
      });

      if (!examErr && newExam) {
        finalExamId = newExam.id;
      }
    }

    // Option 2: Link an existing exam from /exams list to this course
    if (examMode === 'existing' && selectedExamId) {
      const chosenExam = allExams.find((e) => e.id === selectedExamId);
      if (chosenExam && chosenExam.course_id !== courseId) {
        await updateExamRecord({
          id: chosenExam.id,
          title: chosenExam.title,
          description: chosenExam.description,
          course_id: courseId,
          pass_percentage: chosenExam.pass_percentage,
          time_limit_minutes: chosenExam.time_limit_minutes ?? 30,
          is_active: chosenExam.is_active ?? true,
          randomize_questions: chosenExam.randomize_questions ?? true,
        });
      }
    }

    // Batch insert assignments for all selected drivers
    const rowsToInsert = selectedDriverIds.map((id) => ({
      driver_id: id,
      course_id: courseId,
      status: 'assigned' as const,
      due_date: dueDate || null,
      source: 'manual',
    }));

    const { error } = await supabase.from('trainings').insert(rowsToInsert);

    setSaving(false);
    if (error) { toast({ title: 'Failed to assign course', description: error.message, variant: 'destructive' }); return; }

    const crs = courses.find((c) => c.id === courseId);

    // Audit logs & notifications for each selected driver
    for (const dId of selectedDriverIds) {
      const drv = drivers.find((d) => d.id === dId);
      await logAudit('assign', 'training', `Assigned ${crs?.title} to ${drv?.full_name}`, {}, dId);

      const { data: prof } = await supabase.from('profiles').select('user_id').eq('driver_id', dId).maybeSingle();
      if (prof?.user_id) {
        await supabase.from('notifications').insert({
          user_id: prof.user_id,
          driver_id: dId,
          channel: 'in_app',
          title: 'Training & Exam Assigned',
          body: `${crs?.title} and evaluation exam have been assigned to you.`,
        });
      }
    }

    toast({
      title: 'Training Assigned',
      description: `Assigned ${crs?.title} to ${selectedDriverIds.length} driver(s) successfully!`,
    });

    onOpenChange(false);
    setSelectedDriverIds([]); setCourseId(''); setDueDate(''); setSelectedExamId(''); setDriverSearch('');
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Training & Exam</DialogTitle>
          <DialogDescription>Assign a course to single or multiple drivers with evaluation exam options.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Driver Multi-Select Component */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">
                Select Drivers ({selectedDriverIds.length} of {drivers.length} selected)
              </Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAllDrivers} className="h-6 text-[11px] px-2 text-primary">
                  Select All ({filteredDrivers.length})
                </Button>
                {selectedDriverIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearDriverSelection} className="h-6 text-[11px] px-2 text-muted-foreground">
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <Input
              placeholder="Search driver by name, ID (e.g. EMP-1001), or band..."
              value={driverSearch}
              onChange={(e) => setDriverSearch(e.target.value)}
              className="h-8 text-xs"
            />

            <div className="max-h-40 overflow-y-auto rounded-lg border bg-card p-2 space-y-1">
              {filteredDrivers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">No drivers matching search.</p>
              ) : (
                filteredDrivers.map((d) => {
                  const isChecked = selectedDriverIds.includes(d.id);
                  return (
                    <div
                      key={d.id}
                      onClick={() => toggleDriver(d.id)}
                      className={`flex items-center justify-between p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                        isChecked ? 'bg-primary/10 border-primary/40 font-semibold' : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 truncate">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-gray-300 text-primary accent-primary"
                        />
                        <span className="truncate">{d.full_name}</span>
                        <span className="text-[11px] text-muted-foreground">({d.employee_id})</span>
                      </div>
                      {d.last_rating_band && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: `${RATING_BAND_COLORS[d.last_rating_band as DriverRatingBand]}20`,
                            color: RATING_BAND_COLORS[d.last_rating_band as DriverRatingBand],
                          }}
                        >
                          {d.last_rating_band}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Select Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select course to assign" /></SelectTrigger>
              <SelectContent>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Evaluation Exam Selector Box */}
          {courseId && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" /> Evaluation Exam Selector
                </Label>
                <div className="flex items-center gap-1 bg-background p-0.5 rounded-lg border text-[11px]">
                  <button
                    type="button"
                    onClick={() => setExamMode('existing')}
                    className={`px-2 py-1 rounded-md font-semibold transition-colors ${examMode === 'existing' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    From /exams List
                  </button>
                  <button
                    type="button"
                    onClick={() => setExamMode('create')}
                    className={`px-2 py-1 rounded-md font-semibold transition-colors ${examMode === 'create' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Create New
                  </button>
                  <button
                    type="button"
                    onClick={() => setExamMode('none')}
                    className={`px-2 py-1 rounded-md font-semibold transition-colors ${examMode === 'none' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    No Exam
                  </button>
                </div>
              </div>

              {/* Mode 1: Select from Existing Exams */}
              {examMode === 'existing' && (
                <div className="space-y-2 pt-1">
                  <Input
                    placeholder="Search exam title or course..."
                    value={examSearch}
                    onChange={(e) => setExamSearch(e.target.value)}
                    className="h-8 text-xs bg-card"
                  />

                  <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                    <SelectTrigger className="w-full h-9 text-xs bg-card">
                      <SelectValue placeholder={loadingExams ? 'Loading exams...' : 'Choose an exam from /exams list'} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredExamsList.map((ex) => (
                        <SelectItem key={ex.id} value={ex.id} className="text-xs">
                          <span className="font-semibold">{ex.title}</span> (Pass: {ex.pass_percentage}% · {ex.time_limit_minutes ?? 30}m)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedExamId && (
                    <div className="flex items-center gap-2 rounded-lg bg-card p-2.5 border text-xs text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <div>
                        <p className="font-bold">Exam Linked to Assignments</p>
                        <p className="text-[11px] opacity-80">This evaluation exam will be required for course completion.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mode 2: Create Brand New Exam */}
              {examMode === 'create' && (
                <div className="space-y-2.5 pt-1">
                  <div>
                    <Label className="text-[11px] font-semibold text-muted-foreground">New Exam Title</Label>
                    <Input
                      value={examTitle}
                      onChange={(e) => setExamTitle(e.target.value)}
                      placeholder="e.g. Hazardous Driving Final Exam"
                      className="mt-0.5 h-8 text-xs bg-card"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] font-semibold text-muted-foreground">Pass Percentage (%)</Label>
                      <Input
                        type="number"
                        value={passPercentage}
                        onChange={(e) => setPassPercentage(e.target.value)}
                        className="mt-0.5 h-8 text-xs bg-card"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold text-muted-foreground">Time Limit (minutes)</Label>
                      <Input
                        type="number"
                        value={timeLimit}
                        onChange={(e) => setTimeLimit(e.target.value)}
                        className="mt-0.5 h-8 text-xs bg-card"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 3: No Exam */}
              {examMode === 'none' && (
                <p className="text-xs text-muted-foreground italic py-1">No evaluation exam will be linked to this course assignment.</p>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs font-semibold">Due Date (optional)</Label>
            <DatePicker value={dueDate} onChange={setDueDate} />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || selectedDriverIds.length === 0 || !courseId}>
            {saving
              ? 'Assigning...'
              : selectedDriverIds.length > 1
              ? `Assign to ${selectedDriverIds.length} Drivers`
              : 'Assign Course & Exam'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
