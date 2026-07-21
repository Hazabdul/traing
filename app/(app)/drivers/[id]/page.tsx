'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { useAuth, isStaff } from '@/lib/auth-context';
import type {
  Driver, Branch, Plant, Training, Course, Accident, Violation, SafetyWarning,
  BehaviourAssessment, DriverRating, ExamAttempt, Certificate, DriverDocument,
  AccidentSeverity, ViolationCategory, WarningCategory, BehaviourRating, TrainingStatus,
} from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Star, Truck, Mail, Phone, MapPin, Calendar, Briefcase, Shield,
  Plus, Trash2, AlertTriangle, AlertCircle, ShieldAlert, ClipboardList, Award, RefreshCw,
} from 'lucide-react';
import {
  RATING_BAND_COLORS, RATING_BAND_LABELS, DRIVER_STATUS_COLORS, DRIVER_STATUS_LABELS,
  ACCIDENT_SEVERITY_LABELS, ACCIDENT_SEVERITY_COLORS, VIOLATION_CATEGORY_LABELS,
  WARNING_CATEGORY_LABELS, BEHAVIOUR_LABELS, TRAINING_STATUS_LABELS, TRAINING_STATUS_COLORS,
} from '@/lib/constants';
import { formatDate, formatDateTime, daysUntil, classNamesForDue } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

interface DriverDetailData {
  driver: Driver;
  branch: Branch | null;
  plant: Plant | null;
  trainings: (Training & { course: Course | null })[];
  accidents: Accident[];
  violations: Violation[];
  warnings: SafetyWarning[];
  behaviours: BehaviourAssessment[];
  rating: DriverRating | null;
  attempts: (ExamAttempt & { exam: { title: string; course_id: string } | null })[];
  certificates: (Certificate & { course: Course | null })[];
  documents: DriverDocument[];
}

export default function DriverDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { profile } = useAuth();
  const canEdit = isStaff(profile?.role);
  const { toast } = useToast();
  const [data, setData] = useState<DriverDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accModal, setAccModal] = useState(false);
  const [vioModal, setVioModal] = useState(false);
  const [warnModal, setWarnModal] = useState(false);
  const [behModal, setBehModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const id = params.id;
    const [{ data: driver }, { data: branch }, { data: plant }] = await Promise.all([
      supabase.from('drivers').select('*').eq('id', id).maybeSingle(),
      supabase.from('branches').select('*'),
      supabase.from('plants').select('*'),
    ]);
    if (!driver) { setLoading(false); return; }
    const drv = driver as Driver;
    const b = (branch ?? []).find((x: Branch) => x.id === drv.branch_id) ?? null;
    const p = (plant ?? []).find((x: Plant) => x.id === drv.plant_id) ?? null;

    const [t, acc, vio, war, beh, rating, attempts, certs, docs] = await Promise.all([
      supabase.from('trainings').select('*, course:courses(*)').eq('driver_id', id).order('assigned_date', { ascending: false }),
      supabase.from('accidents').select('*').eq('driver_id', id).order('accident_date', { ascending: false }),
      supabase.from('violations').select('*').eq('driver_id', id).order('violation_date', { ascending: false }),
      supabase.from('safety_warnings').select('*').eq('driver_id', id).order('warning_date', { ascending: false }),
      supabase.from('behaviour_assessments').select('*').eq('driver_id', id).order('assessment_date', { ascending: false }),
      supabase.from('driver_ratings').select('*').eq('driver_id', id).maybeSingle(),
      supabase.from('exam_attempts').select('*, exam:exams(title, course_id)').eq('driver_id', id).order('started_at', { ascending: false }),
      supabase.from('certificates').select('*, course:courses(*)').eq('driver_id', id).order('issued_at', { ascending: false }),
      supabase.from('driver_documents').select('*').eq('driver_id', id).order('uploaded_at', { ascending: false }),
    ]);

    setData({
      driver: drv, branch: b, plant: p,
      trainings: (t.data ?? []) as (Training & { course: Course | null })[],
      accidents: (acc.data ?? []) as Accident[],
      violations: (vio.data ?? []) as Violation[],
      warnings: (war.data ?? []) as SafetyWarning[],
      behaviours: (beh.data ?? []) as BehaviourAssessment[],
      rating: (rating.data ?? null) as DriverRating | null,
      attempts: (attempts.data ?? []) as (ExamAttempt & { exam: { title: string; course_id: string } | null })[],
      certificates: (certs.data ?? []) as (Certificate & { course: Course | null })[],
      documents: (docs.data ?? []) as DriverDocument[],
    });
    setLoading(false);
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  async function recomputeRating() {
    const { error } = await supabase.rpc('recompute_driver_rating', { p_driver_id: params.id });
    if (error) {
      toast({ title: 'Recompute failed', description: error.message, variant: 'destructive' });
      return;
    }
    await load();
    toast({ title: 'Rating recalculated', description: 'Driver rating updated.' });
    await logAudit('update', 'driver_rating', `Recalculated rating for ${data?.driver.employee_id}`, {}, params.id);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!data) {
    return <div className="py-12 text-center text-muted-foreground">Driver not found.</div>;
  }

  const { driver, branch, plant, trainings, accidents, violations, warnings, behaviours, rating, attempts, certificates, documents } = data;
  const initials = driver.full_name.split(' ').map((s) => s[0]).slice(0, 2).join('');
  const band = driver.last_rating_band;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/drivers')} className="-ml-2 gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to Drivers
      </Button>

      {/* Header card */}
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">{driver.full_name}</h2>
                <Badge variant="secondary" className={DRIVER_STATUS_COLORS[driver.status]}>
                  {DRIVER_STATUS_LABELS[driver.status]}
                </Badge>
                <div className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${RATING_BAND_COLORS[band]}20`, color: RATING_BAND_COLORS[band] }}>
                  <Star className="h-3 w-3" fill={RATING_BAND_COLORS[band]} /> {band} · {driver.last_rating_score}
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{driver.employee_id} · {branch?.name ?? 'No branch'} · {plant?.name ?? 'No plant'}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                {driver.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {driver.email}</span>}
                {driver.mobile && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {driver.mobile}</span>}
                {driver.truck_number && <span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> {driver.truck_number}</span>}
                {driver.supervisor && <span className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> {driver.supervisor}</span>}
              </div>
            </div>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={recomputeRating} className="gap-1">
                <RefreshCw className="h-4 w-4" /> Recalculate Rating
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/60 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trainings">Trainings ({trainings.length})</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="rating">Rating Engine</TabsTrigger>
          <TabsTrigger value="exams">Exams ({attempts.length})</TabsTrigger>
          <TabsTrigger value="certs">Certificates ({certificates.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <InfoCard title="Personal Information">
              <InfoRow label="Employee ID" value={driver.employee_id} />
              <InfoRow label="Nationality" value={driver.nationality} />
              <InfoRow label="Gender" value={driver.gender ? driver.gender.charAt(0).toUpperCase() + driver.gender.slice(1) : null} />
              <InfoRow label="Date of Birth" value={formatDate(driver.date_of_birth)} />
              <InfoRow label="Email" value={driver.email} />
              <InfoRow label="Mobile" value={driver.mobile} />
            </InfoCard>
            <InfoCard title="Operational Information">
              <InfoRow label="Branch" value={branch?.name} />
              <InfoRow label="Plant" value={plant?.name} />
              <InfoRow label="Truck Number" value={driver.truck_number} />
              <InfoRow label="Equipment Number" value={driver.equipment_number} />
              <InfoRow label="Supervisor" value={driver.supervisor} />
              <InfoRow label="Experience" value={driver.experience_years ? `${driver.experience_years} years` : null} />
              <InfoRow label="Hire Date" value={formatDate(driver.hire_date)} />
            </InfoCard>
            <InfoCard title="Training Configuration">
              <InfoRow label="Status" value={DRIVER_STATUS_LABELS[driver.status]} />
              <InfoRow label="Annual Frequency" value={`${driver.annual_training_frequency_months} months`} />
              <InfoRow label="Next Annual Training" value={formatDate(driver.next_annual_training_date)} />
              <InfoRow label="Current Rating" value={`${band} (${driver.last_rating_score})`} />
              <InfoRow label="Risk Level" value={driver.last_risk_level} />
            </InfoCard>
          </div>
        </TabsContent>

        {/* Trainings */}
        <TabsContent value="trainings">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Training History</CardTitle>
              <CardDescription>{trainings.length} training records</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {trainings.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No trainings assigned.</p>}
                {trainings.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.course?.title ?? 'Unknown course'}</p>
                      <p className="text-xs text-muted-foreground">
                        Assigned {formatDate(t.assigned_date)} · Due {formatDate(t.due_date)}
                        {t.completed_date && ` · Completed ${formatDate(t.completed_date)}`}
                        {t.score !== null && ` · Score ${t.score}%`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={t.status}
                        onValueChange={async (val) => {
                          const isComp = val === 'completed';
                          const compDate = isComp ? new Date().toISOString().slice(0, 10) : (val === 'assigned' || val === 'in_progress' ? null : t.completed_date);
                          const { error } = await supabase.from('trainings').update({ status: val, completed_date: compDate }).eq('id', t.id);
                          if (error) {
                            toast({ title: 'Failed to update status', description: error.message, variant: 'destructive' });
                          } else {
                            toast({ title: `Training status updated to ${TRAINING_STATUS_LABELS[val as TrainingStatus]}` });
                            load();
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 w-[140px] text-xs font-medium border-border/60">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TRAINING_STATUS_LABELS) as (keyof typeof TRAINING_STATUS_LABELS)[]).map((st) => (
                            <SelectItem key={st} value={st} className="text-xs">
                              {TRAINING_STATUS_LABELS[st]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PerformanceCard
              title="Accident History" icon={AlertTriangle} count={accidents.length}
              tone="danger" canEdit={canEdit} onAdd={() => setAccModal(true)}
            >
              {accidents.map((a) => (
                <RecordItem
                  key={a.id}
                  date={formatDate(a.accident_date)}
                  title={ACCIDENT_SEVERITY_LABELS[a.severity]}
                  desc={a.description}
                  badge={<Badge variant="secondary" className={ACCIDENT_SEVERITY_COLORS[a.severity]}>{ACCIDENT_SEVERITY_LABELS[a.severity]}</Badge>}
                  extra={a.root_cause && <p className="text-xs text-muted-foreground">Root cause: {a.root_cause}</p>}
                />
              ))}
            </PerformanceCard>

            <PerformanceCard
              title="Traffic Violations" icon={AlertCircle} count={violations.length}
              tone="warning" canEdit={canEdit} onAdd={() => setVioModal(true)}
            >
              {violations.map((v) => (
                <RecordItem
                  key={v.id}
                  date={formatDate(v.violation_date)}
                  title={VIOLATION_CATEGORY_LABELS[v.category]}
                  desc={v.description}
                  badge={<Badge variant="outline">{v.amount ? `SAR ${v.amount}` : 'No fine'}</Badge>}
                />
              ))}
            </PerformanceCard>

            <PerformanceCard
              title="Safety Warnings" icon={ShieldAlert} count={warnings.length}
              tone="warning" canEdit={canEdit} onAdd={() => setWarnModal(true)}
            >
              {warnings.map((w) => (
                <RecordItem
                  key={w.id}
                  date={formatDate(w.warning_date)}
                  title={WARNING_CATEGORY_LABELS[w.category]}
                  desc={w.description}
                />
              ))}
            </PerformanceCard>

            <PerformanceCard
              title="Behaviour Assessments" icon={ClipboardList} count={behaviours.length}
              tone="primary" canEdit={canEdit} onAdd={() => setBehModal(true)}
            >
              {behaviours.map((b) => (
                <RecordItem
                  key={b.id}
                  date={formatDate(b.assessment_date)}
                  title={BEHAVIOUR_LABELS[b.rating]}
                  desc={b.comments}
                  badge={<Badge variant="secondary">{BEHAVIOUR_LABELS[b.rating]}</Badge>}
                  extra={b.evaluator && <p className="text-xs text-muted-foreground">By {b.evaluator}</p>}
                />
              ))}
            </PerformanceCard>
          </div>
        </TabsContent>

        {/* Rating Engine */}
        <TabsContent value="rating">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Current Rating</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full" style={{ backgroundColor: `${RATING_BAND_COLORS[band]}15` }}>
                  <Star className="h-10 w-10" style={{ color: RATING_BAND_COLORS[band] }} fill={RATING_BAND_COLORS[band]} />
                </div>
                <p className="mt-3 text-3xl font-bold" style={{ color: RATING_BAND_COLORS[band] }}>{band}</p>
                <p className="text-sm text-muted-foreground">{RATING_BAND_LABELS[band]}</p>
                <div className="mt-4 rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Total Score</p>
                  <p className="text-2xl font-bold tabular-nums">{driver.last_rating_score}/100</p>
                  <p className="text-xs text-muted-foreground">Risk: {driver.last_risk_level}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Scoring Breakdown</CardTitle>
                <CardDescription>Weighted scoring matrix (max 100)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {rating ? (
                  [
                    { label: 'Accident', score: rating.accident_score, max: 35, color: 'bg-red-500' },
                    { label: 'Violation', score: rating.violation_score, max: 25, color: 'bg-amber-500' },
                    { label: 'Warnings', score: rating.warning_score, max: 20, color: 'bg-orange-500' },
                    { label: 'Behaviour', score: rating.behaviour_score, max: 20, color: 'bg-emerald-500' },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{s.label}</span>
                        <span className="tabular-nums text-muted-foreground">{s.score} / {s.max}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${s.color}`} style={{ width: `${(s.score / s.max) * 100}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No rating computed yet. Click "Recalculate Rating".</p>
                )}
                <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Rating Bands</p>
                  <p>D1: 90-100 (Excellent) · D2: 76-89 (Good) · D3: 51-75 (Improve) · D4: Below 50 (High Risk)</p>
                  <p className="mt-1">Recomputes automatically when performance data changes.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Exams */}
        <TabsContent value="exams">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exam History</CardTitle>
              <CardDescription>{attempts.length} attempts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {attempts.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No exam attempts.</p>}
              {attempts.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.exam?.title ?? 'Exam'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(a.started_at)} · {a.correct_answers}/{a.total_questions} correct · {a.percentage}%
                    </p>
                  </div>
                  <Badge variant="secondary" className={a.passed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}>
                    {a.passed ? 'Passed' : 'Failed'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Certificates */}
        <TabsContent value="certs">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4 text-primary" /> Certificates</CardTitle>
              <CardDescription>{certificates.length} issued</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {certificates.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No certificates yet. Pass an exam to earn one.</p>}
              {certificates.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <Award className="h-5 w-5 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.course?.title ?? 'Course'}</p>
                    <p className="text-xs text-muted-foreground">Issued {formatDate(c.issued_at)}</p>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">{c.certificate_number}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents</CardTitle>
              <CardDescription>{documents.length} uploaded</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {documents.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No documents uploaded.</p>}
              {documents.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.file_type ?? 'File'} · {formatDate(d.uploaded_at)}</p>
                  </div>
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View</a>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Performance record modals */}
      <AccidentModal open={accModal} onOpenChange={setAccModal} driverId={driver.id} onSaved={load} />
      <ViolationModal open={vioModal} onOpenChange={setVioModal} driverId={driver.id} onSaved={load} />
      <WarningModal open={warnModal} onOpenChange={setWarnModal} driverId={driver.id} onSaved={load} />
      <BehaviourModal open={behModal} onOpenChange={setBehModal} driverId={driver.id} onSaved={load} />
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2.5">{children}</CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value ?? '—'}</span>
    </div>
  );
}

function PerformanceCard({ title, icon: Icon, count, tone, canEdit, onAdd, children }: {
  title: string; icon: typeof AlertTriangle; count: number; tone: string;
  canEdit: boolean; onAdd: () => void; children: React.ReactNode;
}) {
  const toneCls: Record<string, string> = {
    danger: 'text-destructive',
    warning: 'text-warning',
    primary: 'text-primary',
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className={`h-4 w-4 ${toneCls[tone]}`} /> {title}
          <span className="text-xs font-normal text-muted-foreground">({count})</span>
        </CardTitle>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={onAdd} className="h-8 gap-1">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {count === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No records.</p>}
        {children}
      </CardContent>
    </Card>
  );
}

function RecordItem({ date, title, desc, badge, extra }: {
  date: string; title: string; desc?: string | null; badge?: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>
        {badge}
      </div>
      {desc && <p className="mt-1.5 text-xs text-muted-foreground">{desc}</p>}
      {extra}
    </div>
  );
}

// ---- Accident Modal ----
function AccidentModal({ open, onOpenChange, driverId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; driverId: string; onSaved: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ accident_date: new Date().toISOString().slice(0, 10), severity: 'minor' as AccidentSeverity, type: '', description: '', root_cause: '', recommended_training: '' });

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('accidents').insert({ driver_id: driverId, ...form });
    setSaving(false);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    await supabase.rpc('recompute_driver_rating', { p_driver_id: driverId });
    await logAudit('create', 'accident', `Added accident record`, { driver_id: driverId }, driverId);
    toast({ title: 'Accident recorded', description: 'Rating recalculated.' });
    onOpenChange(false);
    onSaved();
    setForm({ accident_date: new Date().toISOString().slice(0, 10), severity: 'minor', type: '', description: '', root_cause: '', recommended_training: '' });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Accident Record</DialogTitle><DialogDescription>Rating will auto-recalculate.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Date</Label><Input type="date" value={form.accident_date} onChange={(e) => setForm({ ...form, accident_date: e.target.value })} /></div>
            <div>
              <Label className="text-xs">Severity</Label>
              <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as AccidentSeverity })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(['none','minor','moderate','major'] as AccidentSeverity[]).map((s) => <SelectItem key={s} value={s}>{ACCIDENT_SEVERITY_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Type</Label><Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="e.g. Rear-end collision" /></div>
          <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label className="text-xs">Root Cause</Label><Input value={form.root_cause} onChange={(e) => setForm({ ...form, root_cause: e.target.value })} placeholder="e.g. Excessive speed" /></div>
          <div><Label className="text-xs">Recommended Training</Label><Input value={form.recommended_training} onChange={(e) => setForm({ ...form, recommended_training: e.target.value })} placeholder="e.g. Defensive Driving" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Violation Modal ----
function ViolationModal({ open, onOpenChange, driverId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; driverId: string; onSaved: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ violation_date: new Date().toISOString().slice(0, 10), amount: 0, category: 'under_250' as ViolationCategory, description: '' });

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('violations').insert({ driver_id: driverId, ...form, amount: Number(form.amount) });
    setSaving(false);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    await supabase.rpc('recompute_driver_rating', { p_driver_id: driverId });
    await logAudit('create', 'violation', `Added violation record`, { driver_id: driverId }, driverId);
    toast({ title: 'Violation recorded', description: 'Rating recalculated.' });
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Traffic Violation</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Date</Label><Input type="date" value={form.violation_date} onChange={(e) => setForm({ ...form, violation_date: e.target.value })} /></div>
            <div><Label className="text-xs">Amount (SAR)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ViolationCategory })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(['none','under_250','under_1000','over_1000'] as ViolationCategory[]).map((c) => <SelectItem key={c} value={c}>{VIOLATION_CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Warning Modal ----
function WarningModal({ open, onOpenChange, driverId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; driverId: string; onSaved: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ warning_date: new Date().toISOString().slice(0, 10), category: 'one' as WarningCategory, description: '' });

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('safety_warnings').insert({ driver_id: driverId, ...form });
    setSaving(false);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    await supabase.rpc('recompute_driver_rating', { p_driver_id: driverId });
    await logAudit('create', 'safety_warning', `Added safety warning`, { driver_id: driverId }, driverId);
    toast({ title: 'Warning recorded', description: 'Rating recalculated.' });
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Safety Warning</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label className="text-xs">Date</Label><Input type="date" value={form.warning_date} onChange={(e) => setForm({ ...form, warning_date: e.target.value })} /></div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as WarningCategory })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(['none','one','two','more_than_two'] as WarningCategory[]).map((c) => <SelectItem key={c} value={c}>{WARNING_CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Behaviour Modal ----
function BehaviourModal({ open, onOpenChange, driverId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; driverId: string; onSaved: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ assessment_date: new Date().toISOString().slice(0, 10), rating: 'good' as BehaviourRating, evaluator: '', comments: '' });

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('behaviour_assessments').insert({ driver_id: driverId, ...form });
    setSaving(false);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    await supabase.rpc('recompute_driver_rating', { p_driver_id: driverId });
    await logAudit('create', 'behaviour', `Added behaviour assessment`, { driver_id: driverId }, driverId);
    toast({ title: 'Assessment recorded', description: 'Rating recalculated.' });
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Behaviour Assessment</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label className="text-xs">Date</Label><Input type="date" value={form.assessment_date} onChange={(e) => setForm({ ...form, assessment_date: e.target.value })} /></div>
          <div>
            <Label className="text-xs">Rating</Label>
            <Select value={form.rating} onValueChange={(v) => setForm({ ...form, rating: v as BehaviourRating })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(['excellent','good','average','poor'] as BehaviourRating[]).map((r) => <SelectItem key={r} value={r}>{BEHAVIOUR_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Evaluator</Label><Input value={form.evaluator} onChange={(e) => setForm({ ...form, evaluator: e.target.value })} /></div>
          <div><Label className="text-xs">Comments</Label><Textarea value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
