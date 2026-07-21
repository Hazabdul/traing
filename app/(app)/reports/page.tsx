'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import type { Driver, Training, Course, Accident, Violation, SafetyWarning, BehaviourAssessment, Branch } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/data-table';
import { Star, Download, FileText, Award } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { RATING_BAND_COLORS, DRIVER_STATUS_LABELS, ACCIDENT_SEVERITY_LABELS, VIOLATION_CATEGORY_LABELS, WARNING_CATEGORY_LABELS, BEHAVIOUR_LABELS, TRAINING_STATUS_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { exportToCSV, exportToPDF } from '@/lib/export';

interface ReportData {
  drivers: Driver[];
  branches: Branch[];
  trainings: (Training & { course: Course | null })[];
  accidents: Accident[];
  violations: Violation[];
  warnings: SafetyWarning[];
  behaviours: BehaviourAssessment[];
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('training_completion');
  const [branchFilter, setBranchFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const [d, t, acc, vio, war, beh, b] = await Promise.all([
      supabase.from('drivers').select('*'),
      supabase.from('trainings').select('*, course:courses(*)'),
      supabase.from('accidents').select('*'),
      supabase.from('violations').select('*'),
      supabase.from('safety_warnings').select('*'),
      supabase.from('behaviour_assessments').select('*'),
      supabase.from('branches').select('*'),
    ]);
    setData({
      drivers: (d.data ?? []) as Driver[],
      branches: (b.data ?? []) as Branch[],
      trainings: (t.data ?? []) as (Training & { course: Course | null })[],
      accidents: (acc.data ?? []) as Accident[],
      violations: (vio.data ?? []) as Violation[],
      warnings: (war.data ?? []) as SafetyWarning[],
      behaviours: (beh.data ?? []) as BehaviourAssessment[],
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  const { drivers, branches, trainings, accidents, violations, warnings, behaviours } = data;
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const driverMap = new Map(drivers.map((d) => [d.id, d]));

  const filteredDrivers = drivers.filter((d) => branchFilter === 'all' || d.branch_id === branchFilter);
  const filteredTrainings = trainings.filter((t) => branchFilter === 'all' || driverMap.get(t.driver_id)?.branch_id === branchFilter);

  const REPORTS = [
    { id: 'training_completion', label: 'Training Completion', desc: 'All training records with status' },
    { id: 'driver_rating', label: 'Driver Rating Report', desc: 'Driver ratings and risk levels' },
    { id: 'expired', label: 'Expired Training', desc: 'Expired and overdue trainings' },
    { id: 'upcoming', label: 'Upcoming Training', desc: 'Trainings due in 30 days' },
    { id: 'accidents', label: 'Accident Analysis', desc: 'All accident records' },
    { id: 'violations', label: 'Violation Report', desc: 'All traffic violations' },
    { id: 'warnings', label: 'Safety Warning Report', desc: 'All safety warnings' },
    { id: 'behaviour', label: 'Behaviour Analysis', desc: 'Behaviour assessments' },
    { id: 'awards', label: 'Award Eligible Drivers', desc: 'D1 rated active drivers' },
    { id: 'branch', label: 'Branch-wise Statistics', desc: 'Drivers and trainings per branch' },
  ];

  const current = REPORTS.find((r) => r.id === reportType)!;

  function getRows(): Record<string, unknown>[] {
    switch (reportType) {
      case 'training_completion':
        return filteredTrainings.map((t) => ({
          Driver: driverMap.get(t.driver_id)?.full_name ?? '—',
          EmployeeID: driverMap.get(t.driver_id)?.employee_id ?? '—',
          Course: t.course?.title ?? '—',
          Status: TRAINING_STATUS_LABELS[t.status],
          Assigned: formatDate(t.assigned_date),
          Due: formatDate(t.due_date),
          Completed: formatDate(t.completed_date),
          Score: t.score ?? '',
        }));
      case 'driver_rating':
        return filteredDrivers.map((d) => ({
          EmployeeID: d.employee_id, Name: d.full_name, Branch: branchMap.get(d.branch_id ?? '') ?? '—',
          Rating: d.last_rating_band, Score: d.last_rating_score, Risk: d.last_risk_level,
          Status: DRIVER_STATUS_LABELS[d.status],
        }));
      case 'expired':
        return filteredTrainings.filter((t) => t.status === 'expired' || t.status === 'overdue').map((t) => ({
          Driver: driverMap.get(t.driver_id)?.full_name ?? '—',
          Course: t.course?.title ?? '—', Status: TRAINING_STATUS_LABELS[t.status],
          Due: formatDate(t.due_date), Branch: branchMap.get(driverMap.get(t.driver_id)?.branch_id ?? '') ?? '—',
        }));
      case 'upcoming':
        return filteredTrainings.filter((t) => {
          if (!t.due_date || (t.status !== 'assigned' && t.status !== 'in_progress')) return false;
          const days = Math.ceil((new Date(t.due_date).getTime() - Date.now()) / 86400000);
          return days >= 0 && days <= 30;
        }).map((t) => ({
          Driver: driverMap.get(t.driver_id)?.full_name ?? '—',
          Course: t.course?.title ?? '—', Due: formatDate(t.due_date),
          Status: TRAINING_STATUS_LABELS[t.status],
        }));
      case 'accidents':
        return accidents.map((a) => ({
          Driver: driverMap.get(a.driver_id)?.full_name ?? '—',
          Date: formatDate(a.accident_date), Severity: ACCIDENT_SEVERITY_LABELS[a.severity],
          Type: a.type ?? '', RootCause: a.root_cause ?? '', RecommendedTraining: a.recommended_training ?? '',
        }));
      case 'violations':
        return violations.map((v) => ({
          Driver: driverMap.get(v.driver_id)?.full_name ?? '—',
          Date: formatDate(v.violation_date), Category: VIOLATION_CATEGORY_LABELS[v.category],
          Amount: v.amount ?? 0, Description: v.description ?? '',
        }));
      case 'warnings':
        return warnings.map((w) => ({
          Driver: driverMap.get(w.driver_id)?.full_name ?? '—',
          Date: formatDate(w.warning_date), Category: WARNING_CATEGORY_LABELS[w.category],
          Description: w.description ?? '',
        }));
      case 'behaviour':
        return behaviours.map((b) => ({
          Driver: driverMap.get(b.driver_id)?.full_name ?? '—',
          Date: formatDate(b.assessment_date), Rating: BEHAVIOUR_LABELS[b.rating],
          Evaluator: b.evaluator ?? '', Comments: b.comments ?? '',
        }));
      case 'awards':
        return drivers.filter((d) => d.last_rating_band === 'D1' && d.status === 'active').map((d) => ({
          EmployeeID: d.employee_id, Name: d.full_name, Branch: branchMap.get(d.branch_id ?? '') ?? '—',
          Score: d.last_rating_score, ExperienceYears: d.experience_years ?? 0,
        }));
      case 'branch':
        return branches.map((b) => {
          const bDrivers = drivers.filter((d) => d.branch_id === b.id);
          const bTrainings = trainings.filter((t) => driverMap.get(t.driver_id)?.branch_id === b.id);
          return {
            Branch: b.name, Manager: b.manager_name ?? '—', Drivers: bDrivers.length,
            TotalTrainings: bTrainings.length,
            Completed: bTrainings.filter((t) => t.status === 'completed').length,
            Overdue: bTrainings.filter((t) => t.status === 'overdue' || t.status === 'expired').length,
            D1Drivers: bDrivers.filter((d) => d.last_rating_band === 'D1').length,
          };
        });
      default:
        return [];
    }
  }

  const rows = getRows();
  const columns = rows.length ? Object.keys(rows[0]) : [];

  function handleExportCSV() {
    exportToCSV(rows, `${reportType}_${new Date().toISOString().slice(0, 10)}.csv`);
  }
  function handleExportPDF() {
    exportToPDF(current.label, columns, rows.map((r) => columns.map((c) => String(r[c] ?? ''))), `${reportType}.pdf`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Generate and export compliance reports."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1"><Download className="h-4 w-4" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1"><FileText className="h-4 w-4" /> PDF</Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={reportType} onValueChange={setReportType}>
          <SelectTrigger className="w-[260px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {REPORTS.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{current.label}</CardTitle>
          <CardDescription>{current.desc} · {rows.length} records</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No data for this report.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>{columns.map((c) => <th key={c} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t">
                      {columns.map((c) => <td key={c} className="px-3 py-2.5">{String(r[c] ?? '—')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && <p className="p-3 text-center text-xs text-muted-foreground">Showing first 50 of {rows.length}. Export for full data.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
