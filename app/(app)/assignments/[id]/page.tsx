'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { useAuth, isStaff } from '@/lib/auth-context';
import type { Training, Course, Driver, TrainingStatus, DriverRatingBand, TrainingMaterial, Certificate, Exam } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/date-picker';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  ArrowLeft, User, BookOpen, FileText, Video, Presentation, Headphones, Image as ImageIcon,
  Clock, Globe, Award, Play, Sparkles, ShieldCheck, CheckCircle2, AlertTriangle, Trash2,
  ExternalLink, Save, Calendar, Edit2, Download, RefreshCw, Copy, MessageCircle
} from 'lucide-react';
import { TRAINING_STATUS_LABELS, TRAINING_STATUS_COLORS, RATING_BAND_COLORS, MATERIAL_TYPE_LABELS } from '@/lib/constants';
import { formatDate, classNamesForDue } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { createExamRecord } from '@/lib/exam-service';

interface FullAssignmentDetail extends Training {
  course: Course | null;
  driver: Driver | null;
  exam: Exam | null;
  certificate: Certificate | null;
  materials: TrainingMaterial[];
}

const MATERIAL_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  powerpoint: Presentation,
  video: Video,
  audio: Headphones,
  image: ImageIcon,
};

export default function AssignmentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { profile } = useAuth();
  const staff = isStaff(profile?.role);
  const canEdit = ['system_admin', 'ehss_manager', 'ehss_officer', 'training_coordinator', 'branch_manager'].includes(profile?.role ?? '');
  const { toast } = useToast();

  const [data, setData] = useState<FullAssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form & Exam states
  const [status, setStatus] = useState<TrainingStatus>('assigned');
  const [score, setScore] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [completedDate, setCompletedDate] = useState<string>('');
  const [attemptCount, setAttemptCount] = useState<number>(0);

  const load = useCallback(async () => {
    const assignmentId = params.id;
    setLoading(true);

    // Fetch training record with course and driver
    const { data: tr, error } = await supabase
      .from('trainings')
      .select('*, course:courses(*), driver:drivers(*)')
      .eq('id', assignmentId)
      .maybeSingle();

    if (error || !tr) {
      toast({ title: 'Assignment not found', variant: 'destructive' });
      setLoading(false);
      return;
    }

    const courseId = tr.course_id;
    const driverId = tr.driver_id;

    // Parallel fetch for materials, linked exam, certificate, and attempt count
    const [{ data: mats }, { data: ex }, { data: cert }] = await Promise.all([
      courseId ? supabase.from('training_materials').select('*').eq('course_id', courseId) : Promise.resolve({ data: [] }),
      courseId ? supabase.from('exams').select('*').eq('course_id', courseId).eq('is_active', true).maybeSingle() : Promise.resolve({ data: null }),
      (courseId && driverId) ? supabase.from('certificates').select('*').eq('course_id', courseId).eq('driver_id', driverId).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    let count = 0;
    if (ex?.id && driverId) {
      const { count: attCount } = await supabase
        .from('exam_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', driverId)
        .eq('exam_id', ex.id);
      count = attCount ?? 0;
    }

    const fullDetail: FullAssignmentDetail = {
      ...tr,
      course: tr.course,
      driver: tr.driver,
      exam: ex as Exam | null,
      certificate: cert as Certificate | null,
      materials: (mats ?? []) as TrainingMaterial[],
    };

    setData(fullDetail);
    setAttemptCount(count);
    setStatus(tr.status);
    setScore(tr.score !== null && tr.score !== undefined ? String(tr.score) : '');
    setDueDate(tr.due_date ?? '');
    setCompletedDate(tr.completed_date ?? '');
    setLoading(false);
  }, [params.id, toast]);

  useEffect(() => { load(); }, [load]);

  function copyExamShareLink() {
    if (!data?.exam) return;
    const url = `${window.location.origin}/exams/${data.exam.id}/take`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Shareable link copied!', description: 'Exam link copied to clipboard.' });
  }

  function shareExamWhatsApp() {
    if (!data?.exam) return;
    const url = `${window.location.origin}/exams/${data.exam.id}/take`;
    const message = `📋 Evaluation Exam: ${data.exam.title}\n\nPlease click the link below to complete your evaluation exam:\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
  }

  async function saveAssignment() {
    if (!data) return;
    setSaving(true);

    const isCompleted = status === 'completed';
    const compDate = isCompleted
      ? (completedDate || new Date().toISOString().slice(0, 10))
      : (status === 'assigned' || status === 'in_progress' ? null : completedDate || null);

    const { error } = await supabase
      .from('trainings')
      .update({
        status,
        score: score !== '' ? Number(score) : null,
        due_date: dueDate || null,
        completed_date: compDate,
      })
      .eq('id', data.id);

    setSaving(false);
    if (error) {
      toast({ title: 'Failed to update assignment', description: error.message, variant: 'destructive' });
      return;
    }

    await logAudit('status_change', 'training', `Updated assignment for ${data.driver?.full_name} (${data.course?.title}) to ${status}`, {
      status,
      score,
    }, data.driver_id);

    toast({ title: 'Assignment updated successfully' });
    load();
  }

  async function createExamForCourse() {
    if (!data?.course_id) return;
    const { data: newExam, error } = await createExamRecord({
      title: `${data.course?.title} Final Exam`,
      description: `Evaluation exam for course: ${data.course?.title}`,
      course_id: data.course_id,
      pass_percentage: data.course?.pass_percentage ?? 70,
      time_limit_minutes: 30,
      is_active: true,
      randomize_questions: true,
    });

    if (error || !newExam) {
      toast({ title: 'Failed to create exam', description: error?.message ?? 'Permission or network error', variant: 'destructive' });
      return;
    }

    toast({ title: 'Exam created & linked!', description: 'Redirecting to add exam questions...' });
    router.push(`/exams/${newExam.id}`);
  }

  async function deleteAssignment() {
    if (!data) return;
    if (!confirm(`Are you sure you want to delete this assignment for ${data.driver?.full_name}?`)) return;

    const { error } = await supabase.from('trainings').delete().eq('id', data.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Assignment deleted successfully' });
    router.push('/assignments');
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-96 md:col-span-2" />
          <Skeleton className="h-96 md:col-span-1" />
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="py-12 text-center text-muted-foreground">Assignment not found.</div>;
  }

  const driver = data.driver;
  const course = data.course;
  const exam = data.exam;
  const certificate = data.certificate;
  const band = driver?.last_rating_band ?? 'D1';

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/assignments')} className="-ml-2 gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to Training Assignments
      </Button>

      {/* Header Banner */}
      <Card className="overflow-hidden border-border/60 shadow-md">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-foreground">{course?.title ?? 'Training Assignment'}</h2>
                <Badge variant="secondary" className={TRAINING_STATUS_COLORS[data.status]}>
                  {TRAINING_STATUS_LABELS[data.status]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Assigned to <span className="font-semibold text-foreground">{driver?.full_name ?? 'Driver'}</span> ({driver?.employee_id}) · Due {formatDate(data.due_date)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {exam && (
                <Button
                  size="sm"
                  className="gap-1.5 shadow-sm"
                  onClick={() => router.push(`/exams/${exam.id}/take`)}
                >
                  <Play className="h-4 w-4" /> Start Evaluation Exam
                </Button>
              )}
              {canEdit && (
                <Button variant="destructive" size="sm" onClick={deleteAssignment} className="gap-1">
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Driver & Course Details */}
        <div className="space-y-6 md:col-span-2">
          {/* Driver Summary */}
          <Card className="border-border/60 shadow-xs">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">{driver?.full_name}</CardTitle>
                  <CardDescription>Employee ID: {driver?.employee_id}</CardDescription>
                </div>
              </div>
              {driver && (
                <Button variant="outline" size="sm" onClick={() => router.push(`/drivers/${driver.id}`)} className="gap-1 text-xs">
                  Full Driver Profile <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 bg-muted/30 p-3 rounded-lg border">
                <div><span className="text-muted-foreground">Rating Band:</span> <span className="font-bold" style={{ color: RATING_BAND_COLORS[band as DriverRatingBand] }}>{band}</span></div>
                <div><span className="text-muted-foreground">Truck #:</span> <span className="font-semibold">{driver?.truck_number ?? 'Unassigned'}</span></div>
                <div><span className="text-muted-foreground">Supervisor:</span> <span className="font-semibold">{driver?.supervisor ?? '—'}</span></div>
                <div><span className="text-muted-foreground">Email:</span> <span className="font-semibold">{driver?.email ?? '—'}</span></div>
                <div><span className="text-muted-foreground">Mobile:</span> <span className="font-semibold">{driver?.mobile ?? '—'}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className="font-semibold capitalize">{driver?.status ?? 'Active'}</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Course Details & Materials */}
          <Card className="border-border/60 shadow-xs">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Course Information & Materials</CardTitle>
                  <CardDescription>{course?.category ?? 'General Safety'} · {course?.language ?? 'English'}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {course?.description && (
                <p className="text-xs text-muted-foreground leading-relaxed bg-muted/20 p-3 rounded-lg border">
                  {course.description}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="rounded-lg bg-card p-2.5 border">
                  <p className="text-muted-foreground text-[10px]">Duration</p>
                  <p className="font-bold text-sm">{course?.duration_hours ?? 1} Hours</p>
                </div>
                <div className="rounded-lg bg-card p-2.5 border">
                  <p className="text-muted-foreground text-[10px]">Pass Mark</p>
                  <p className="font-bold text-sm">{course?.pass_percentage ?? 70}%</p>
                </div>
                <div className="rounded-lg bg-card p-2.5 border">
                  <p className="text-muted-foreground text-[10px]">Frequency</p>
                  <p className="font-bold text-sm capitalize">{course?.frequency ?? 'Annual'}</p>
                </div>
                <div className="rounded-lg bg-card p-2.5 border">
                  <p className="text-muted-foreground text-[10px]">Trainer</p>
                  <p className="font-bold text-sm truncate">{course?.trainer ?? 'EHSS Team'}</p>
                </div>
              </div>

              {/* Uploaded Materials */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Learning Materials ({data.materials.length})</h4>
                {data.materials.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No learning files uploaded for this course yet.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {data.materials.map((m) => {
                      const Icon = MATERIAL_ICONS[m.material_type] ?? FileText;
                      return (
                        <a
                          key={m.id}
                          href={m.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2.5 rounded-lg border p-3 text-xs hover:bg-muted transition-colors group"
                        >
                          <Icon className="h-5 w-5 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                          <div className="min-w-0 flex-1 truncate">
                            <p className="font-semibold truncate">{m.title}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">{m.material_type} · v{m.version}</p>
                          </div>
                          <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Certificate Card */}
          {certificate && (
            <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-xs">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 shrink-0">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 text-[10px] mb-1">
                    Verified Certification
                  </Badge>
                  <h4 className="text-sm font-bold text-foreground">Certificate #{certificate.certificate_number}</h4>
                  <p className="text-xs text-muted-foreground">Issued to {driver?.full_name} on {formatDate(certificate.issued_at)}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Status & Assignment Management */}
        <div className="space-y-6 md:col-span-1">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Assignment Management</CardTitle>
              <CardDescription>Update status, score %, and due dates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs font-semibold">Training Status</Label>
                <Select value={status} onValueChange={(val) => setStatus(val as TrainingStatus)}>
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
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Evaluation Exam</Label>
                  {attemptCount > 0 && (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      Attended: {attemptCount} time{attemptCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {exam ? (
                  <div className="mt-1 space-y-2">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs space-y-1">
                      <p className="font-bold text-primary flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" /> {exam.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Pass mark: {exam.pass_percentage}% · Time: {exam.time_limit_minutes ?? 30}m</p>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      <Button
                        size="sm"
                        variant={attemptCount > 0 ? "outline" : "default"}
                        className="w-full text-xs gap-1.5 shadow-xs"
                        onClick={() => router.push(`/exams/${exam.id}/take`)}
                      >
                        {attemptCount > 0 ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 text-primary" /> Retake Evaluation Exam
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" /> Start Exam
                          </>
                        )}
                      </Button>

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={copyExamShareLink} className="flex-1 text-[11px] h-7 gap-1">
                          <Copy className="h-3 w-3" /> Copy Link
                        </Button>
                        <Button variant="default" size="sm" onClick={shareExamWhatsApp} className="flex-1 text-[11px] h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                          <MessageCircle className="h-3 w-3" /> WhatsApp
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 space-y-2">
                    <p className="text-xs text-muted-foreground italic">No exam linked to course</p>
                    {canEdit && (
                      <Button size="sm" variant="outline" className="w-full text-xs gap-1" onClick={createExamForCourse}>
                        + Create & Link Exam
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold">Achieved Score (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="e.g. 85"
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Due Date</Label>
                <DatePicker value={dueDate} onChange={setDueDate} />
              </div>

              <div>
                <Label className="text-xs font-semibold">Completed Date</Label>
                <DatePicker value={completedDate} onChange={setCompletedDate} />
              </div>

              <div className="pt-2">
                <Button className="w-full gap-2" onClick={saveAssignment} disabled={saving}>
                  <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
