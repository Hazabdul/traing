'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { useAuth, ROLE_LABELS } from '@/lib/auth-context';
import type { Driver, Training, Certificate, ExamAttempt } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Mail, Phone, Briefcase, MapPin, Star, Award, GraduationCap, ClipboardCheck, Truck,
} from 'lucide-react';
import { RATING_BAND_COLORS, RATING_BAND_LABELS, DRIVER_STATUS_LABELS, DRIVER_STATUS_COLORS, TRAINING_STATUS_LABELS, TRAINING_STATUS_COLORS, ROLE_BADGE_STYLES } from '@/lib/constants';
import { formatDate } from '@/lib/format';

export default function ProfilePage() {
  const { profile, user } = useAuth();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [trainings, setTrainings] = useState<(Training & { course: { title: string } | null })[]>([]);
  const [certs, setCerts] = useState<(Certificate & { course: { title: string } | null })[]>([]);
  const [attempts, setAttempts] = useState<(ExamAttempt & { exam: { title: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) { setLoading(false); return; }
    setLoading(true);
    if (profile.driver_id) {
      const [d, t, c, a] = await Promise.all([
        supabase.from('drivers').select('*').eq('id', profile.driver_id).maybeSingle(),
        supabase.from('trainings').select('*, course:courses(title)').eq('driver_id', profile.driver_id).order('assigned_date', { ascending: false }).limit(5),
        supabase.from('certificates').select('*, course:courses(title)').eq('driver_id', profile.driver_id).order('issued_at', { ascending: false }),
        supabase.from('exam_attempts').select('*, exam:exams(title)').eq('driver_id', profile.driver_id).order('started_at', { ascending: false }).limit(5),
      ]);
      setDriver((d.data ?? null) as Driver | null);
      setTrainings((t.data ?? []) as (Training & { course: { title: string } | null })[]);
      setCerts((c.data ?? []) as (Certificate & { course: { title: string } | null })[]);
      setAttempts((a.data ?? []) as (ExamAttempt & { exam: { title: string } | null })[]);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!profile) return null;

  const initials = (profile.full_name ?? 'U').split(' ').map((s) => s[0]).slice(0, 2).join('');

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" description="Your account and driver information." />

      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold">{profile.full_name}</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <Badge className={`mt-2 ${ROLE_BADGE_STYLES[profile.role]}`}>{ROLE_LABELS[profile.role]}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {driver && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Driver Profile</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <Row label="Employee ID" value={driver.employee_id} />
              <Row label="Status" value={<Badge variant="secondary" className={DRIVER_STATUS_COLORS[driver.status]}>{DRIVER_STATUS_LABELS[driver.status]}</Badge>} />
              <Row label="Rating" value={<span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5" style={{ color: RATING_BAND_COLORS[driver.last_rating_band] }} fill={RATING_BAND_COLORS[driver.last_rating_band]} /> {RATING_BAND_LABELS[driver.last_rating_band]} ({driver.last_rating_score})</span>} />
              <Row label="Risk Level" value={driver.last_risk_level} />
              <Row label="Experience" value={`${driver.experience_years ?? 0} years`} />
              <Row label="Truck" value={driver.truck_number} />
              <Row label="Supervisor" value={driver.supervisor} />
              <Row label="Next Annual Training" value={formatDate(driver.next_annual_training_date)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" /> Recent Trainings</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {trainings.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No trainings.</p>}
              {trainings.map((t) => (
                <div key={t.id} className="rounded-lg border p-2.5">
                  <p className="truncate text-sm font-medium">{t.course?.title}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{formatDate(t.due_date)}</span>
                    <Badge variant="secondary" className={`text-[10px] ${TRAINING_STATUS_COLORS[t.status]}`}>{TRAINING_STATUS_LABELS[t.status]}</Badge>
                  </div>
                </div>
              ))}
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href={`/drivers/${driver.id}`}>View Full Profile</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4 text-primary" /> Certificates</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {certs.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No certificates yet.</p>}
              {certs.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                  <Award className="h-4 w-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.course?.title}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{c.certificate_number}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {driver && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" /> Recent Exam Attempts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {attempts.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No exam attempts.</p>}
            {attempts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.exam?.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(a.started_at)} · {a.percentage}%</p>
                </div>
                <Badge variant="secondary" className={a.passed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}>
                  {a.passed ? 'Passed' : 'Failed'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? '—'}</span>
    </div>
  );
}
