'use client';

import { supabase } from '@/lib/supabase-client';
import type { Driver, Training, Course, DriverRating } from '@/lib/database-types';

export interface DashboardData {
  totalDrivers: number;
  activeTrainings: number;
  completedTrainings: number;
  pendingTrainings: number;
  expiredTrainings: number;
  overdueTrainings: number;
  upcomingExams: number;
  upcomingAnnual: number;
  awardEligible: number;
  ratingDistribution: { band: string; count: number }[];
  monthlyCompletion: { month: string; completed: number }[];
  categoryStats: { category: string; count: number }[];
  accidentTrend: { month: string; count: number }[];
  violationTrend: { month: string; count: number }[];
  upcomingItems: { id: string; driverName: string; courseTitle: string; dueDate: string; type: string }[];
  overdueItems: { id: string; driverName: string; courseTitle: string; dueDate: string }[];
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function loadDashboardData(): Promise<DashboardData> {
  const [{ data: drivers }, { data: trainings }, { data: courses }, { data: ratings }] = await Promise.all([
    supabase.from('drivers').select('*'),
    supabase.from('trainings').select('*, course:courses(*)').order('assigned_date', { ascending: false }),
    supabase.from('courses').select('*'),
    supabase.from('driver_ratings').select('*'),
  ]);

  const d = (drivers ?? []) as Driver[];
  const t = (trainings ?? []) as (Training & { course: Course | null })[];
  const c = (courses ?? []) as Course[];
  const r = (ratings ?? []) as DriverRating[];

  const totalDrivers = d.length;
  const activeTrainings = t.filter((x) => x.status === 'assigned' || x.status === 'in_progress').length;
  const completedTrainings = t.filter((x) => x.status === 'completed').length;
  const pendingTrainings = t.filter((x) => x.status === 'assigned').length;
  const expiredTrainings = t.filter((x) => x.status === 'expired').length;
  const overdueTrainings = t.filter((x) => x.status === 'overdue').length;

  // Rating distribution
  const bandCounts: Record<string, number> = { D1: 0, D2: 0, D3: 0, D4: 0 };
  d.forEach((drv) => { bandCounts[drv.last_rating_band] = (bandCounts[drv.last_rating_band] ?? 0) + 1; });
  const ratingDistribution = ['D1', 'D2', 'D3', 'D4'].map((b) => ({ band: b, count: bandCounts[b] ?? 0 }));

  // Monthly completion (last 6 months from completed_date)
  const now = new Date();
  const monthlyMap: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthlyMap[`${m.getFullYear()}-${m.getMonth()}`] = 0;
  }
  t.filter((x) => x.status === 'completed' && x.completed_date).forEach((x) => {
    const cd = new Date(x.completed_date as string);
    const key = `${cd.getFullYear()}-${cd.getMonth()}`;
    if (key in monthlyMap) monthlyMap[key]++;
  });
  const monthlyCompletion = Object.entries(monthlyMap).map(([k, v]) => {
    const [, mo] = k.split('-');
    return { month: MONTH_LABELS[parseInt(mo, 10)], completed: v };
  });

  // Category statistics from courses
  const catMap: Record<string, number> = {};
  c.forEach((cr) => { catMap[cr.category ?? 'Uncategorized'] = (catMap[cr.category ?? 'Uncategorized'] ?? 0) + 1; });
  const categoryStats = Object.entries(catMap).map(([category, count]) => ({ category, count }));

  // Accident & violation trends (by month, last 6) — derived from trainings' assigned_date months as proxy
  // We use accidents/violations tables for real trend.
  const [{ data: accidents }, { data: violations }] = await Promise.all([
    supabase.from('accidents').select('accident_date'),
    supabase.from('violations').select('violation_date'),
  ]);
  const accMap: Record<string, number> = {};
  const vioMap: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    accMap[`${m.getFullYear()}-${m.getMonth()}`] = 0;
    vioMap[`${m.getFullYear()}-${m.getMonth()}`] = 0;
  }
  (accidents ?? []).forEach((a: { accident_date: string }) => {
    const dt = new Date(a.accident_date);
    const key = `${dt.getFullYear()}-${dt.getMonth()}`;
    if (key in accMap) accMap[key]++;
  });
  (violations ?? []).forEach((v: { violation_date: string }) => {
    const dt = new Date(v.violation_date);
    const key = `${dt.getFullYear()}-${dt.getMonth()}`;
    if (key in vioMap) vioMap[key]++;
  });
  const accidentTrend = Object.entries(accMap).map(([k, v]) => {
    const [, mo] = k.split('-');
    return { month: MONTH_LABELS[parseInt(mo, 10)], count: v };
  });
  const violationTrend = Object.entries(vioMap).map(([k, v]) => {
    const [, mo] = k.split('-');
    return { month: MONTH_LABELS[parseInt(mo, 10)], count: v };
  });

  // Upcoming exams: trainings with due_date in next 30 days, status assigned/in_progress, course has exam
  const upcomingExams = t.filter((x) => {
    if (x.status !== 'assigned' && x.status !== 'in_progress') return false;
    if (!x.due_date) return false;
    const days = Math.ceil((new Date(x.due_date).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  }).length;

  // Upcoming annual trainings: drivers with next_annual_training_date in next 60 days
  const upcomingAnnual = d.filter((drv) => {
    if (!drv.next_annual_training_date) return false;
    const days = Math.ceil((new Date(drv.next_annual_training_date).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 60;
  }).length;

  // Award eligible: D1 drivers with active status
  const awardEligible = d.filter((drv) => drv.last_rating_band === 'D1' && drv.status === 'active').length;

  // Upcoming items list
  const driverNameById = new Map(d.map((drv) => [drv.id, drv.full_name]));
  const upcomingItems = t
    .filter((x) => x.due_date && (x.status === 'assigned' || x.status === 'in_progress'))
    .filter((x) => {
      const days = Math.ceil((new Date(x.due_date as string).getTime() - Date.now()) / 86400000);
      return days >= 0 && days <= 30;
    })
    .slice(0, 6)
    .map((x) => ({
      id: x.id,
      driverName: driverNameById.get(x.driver_id) ?? 'Unknown',
      courseTitle: x.course?.title ?? '—',
      dueDate: x.due_date as string,
      type: x.course?.frequency ?? 'training',
    }));

  const overdueItems = t
    .filter((x) => x.status === 'overdue' || x.status === 'expired')
    .slice(0, 6)
    .map((x) => ({
      id: x.id,
      driverName: driverNameById.get(x.driver_id) ?? 'Unknown',
      courseTitle: x.course?.title ?? '—',
      dueDate: x.due_date as string,
    }));

  return {
    totalDrivers,
    activeTrainings,
    completedTrainings,
    pendingTrainings,
    expiredTrainings,
    overdueTrainings,
    upcomingExams,
    upcomingAnnual,
    awardEligible,
    ratingDistribution,
    monthlyCompletion,
    categoryStats,
    accidentTrend,
    violationTrend,
    upcomingItems,
    overdueItems,
  };
}
