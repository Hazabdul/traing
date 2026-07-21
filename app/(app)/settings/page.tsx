'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import type { SystemSettings } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Save, Clock, Award, Shield, Database, Trash2, RefreshCw, AlertTriangle, Search, CheckCircle2, ShieldAlert, Settings as SettingsIcon, Plus, Edit2, Check, X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

export interface CustomBand {
  id: string;
  code: string;
  title: string;
  minScore: number;
  maxScore: number;
  description: string;
  trainingCadence: string;
  examCadence: string;
  enforcement: string;
  awardEligible: boolean;
  color: string;
}

const DEFAULT_BANDS: CustomBand[] = [
  {
    id: 'd1', code: 'D1', title: 'Top Performers', minScore: 90, maxScore: 100,
    description: 'High safety compliance, zero major accidents or severe violations. Eligible for annual Safety Award bonus.',
    trainingCadence: 'Quarterly safety refresher', examCadence: 'Annual compliance evaluation',
    enforcement: 'Eligible for Safety Award & Clean-Record Bonus (+5)', awardEligible: true, color: '#16a34a',
  },
  {
    id: 'd2', code: 'D2', title: 'Good Performers', minScore: 76, maxScore: 89,
    description: 'Consistently safe driving record with minor infractions. Standard training schedule applies.',
    trainingCadence: 'Monthly scheduled training', examCadence: 'Bi-monthly evaluation exams',
    enforcement: 'Standard evaluation tier', awardEligible: false, color: '#2563eb',
  },
  {
    id: 'd3', code: 'D3', title: 'Improvement Required', minScore: 51, maxScore: 75,
    description: 'Driver requires mandatory corrective safety modules. Must show score improvement within 2 months.',
    trainingCadence: 'System-selected corrective training', examCadence: 'Mandatory bi-monthly re-evaluations',
    enforcement: 'Warning notice issued if unimproved in 60 days', awardEligible: false, color: '#f59e0b',
  },
  {
    id: 'd4', code: 'D4', title: 'High Risk', minScore: 0, maxScore: 50,
    description: 'Critical safety concern. Restricts transportation of hazardous goods until intensive retraining is passed.',
    trainingCadence: 'Mandatory intensive safety training', examCadence: 'High-frequency compliance re-testing',
    enforcement: 'Barred from hazardous cargo transport', awardEligible: false, color: '#dc2626',
  },
];

interface TableMeta {
  name: string;
  label: string;
  description: string;
  category: 'core' | 'training' | 'exams' | 'incidents' | 'system';
  primaryCol: string;
}

const MANAGED_TABLES: TableMeta[] = [
  { name: 'drivers', label: 'Drivers Directory', description: 'Core driver profiles, license, employee IDs, and status', category: 'core', primaryCol: 'id' },
  { name: 'branches', label: 'Branches', description: 'Logistics branch offices and locations', category: 'core', primaryCol: 'id' },
  { name: 'plants', label: 'Industrial Plants', description: 'Plant definitions and compliance rules', category: 'core', primaryCol: 'id' },
  { name: 'plant_courses', label: 'Plant Course Requirements', description: 'Required courses per industrial plant', category: 'core', primaryCol: 'plant_id' },

  { name: 'courses', label: 'Course Library', description: 'Training courses, categories, and modules', category: 'training', primaryCol: 'id' },
  { name: 'training_materials', label: 'Training Materials', description: 'Attached course files (PDFs, PPTs, Videos)', category: 'training', primaryCol: 'id' },
  { name: 'trainings', label: 'Training Assignments', description: 'Assigned driver trainings, due dates, and progress', category: 'training', primaryCol: 'id' },

  { name: 'exams', label: 'Examinations', description: 'Exam definitions, time limits, and thresholds', category: 'exams', primaryCol: 'id' },
  { name: 'questions', label: 'Question Bank', description: 'Evaluation questions, choices, and correct answers', category: 'exams', primaryCol: 'id' },
  { name: 'exam_questions', label: 'Exam Question Mappings', description: 'Questions attached to specific exams', category: 'exams', primaryCol: 'exam_id' },
  { name: 'exam_attempts', label: 'Exam Results / Attempts', description: 'Completed exam submissions and scores', category: 'exams', primaryCol: 'id' },
  { name: 'certificates', label: 'Issued Certificates', description: 'Generated certificates for passed exams', category: 'exams', primaryCol: 'id' },

  { name: 'accidents', label: 'Accident Records', description: 'Recorded driver traffic accidents', category: 'incidents', primaryCol: 'id' },
  { name: 'violations', label: 'Traffic Violations', description: 'Logged traffic fines and violations', category: 'incidents', primaryCol: 'id' },
  { name: 'safety_warnings', label: 'Safety Warnings', description: 'Issued safety warnings and penalties', category: 'incidents', primaryCol: 'id' },
  { name: 'behaviour_assessments', label: 'Behaviour Evaluations', description: 'Periodic driver performance assessments', category: 'incidents', primaryCol: 'id' },
  { name: 'driver_ratings', label: 'Driver Rating Snapshots', description: 'Computed rating band history (D1-D4)', category: 'incidents', primaryCol: 'driver_id' },
  { name: 'driver_documents', label: 'Driver Documents', description: 'Uploaded driver licenses, IDs, and certificates', category: 'incidents', primaryCol: 'id' },

  { name: 'notifications', label: 'Notifications', description: 'In-app alert logs and dispatched notices', category: 'system', primaryCol: 'id' },
  { name: 'audit_logs', label: 'Audit Logs', description: 'System event trails and administrative actions', category: 'system', primaryCol: 'id' },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'system_admin';

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Table management state
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  // Rating Bands state
  const [bands, setBands] = useState<CustomBand[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_BANDS;
    try {
      const raw = localStorage.getItem('safefleet_rating_bands_v1');
      return raw ? JSON.parse(raw) : DEFAULT_BANDS;
    } catch {
      return DEFAULT_BANDS;
    }
  });

  const [bandModalOpen, setBandModalOpen] = useState(false);
  const [editingBand, setEditingBand] = useState<CustomBand | null>(null);

  const [confirmTable, setConfirmTable] = useState<TableMeta | null>(null);
  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false);
  const [clearing, setClearing] = useState(false);

  function saveBandsToStorage(list: CustomBand[]) {
    setBands(list);
    try { localStorage.setItem('safefleet_rating_bands_v1', JSON.stringify(list)); } catch {}
  }

  function handleSaveBand(band: CustomBand) {
    const existingIdx = bands.findIndex((b) => b.id === band.id);
    let updated: CustomBand[];
    if (existingIdx !== -1) {
      updated = [...bands];
      updated[existingIdx] = band;
    } else {
      updated = [...bands, band];
    }
    saveBandsToStorage(updated);
    toast({ title: 'Rating Band saved successfully' });
    setBandModalOpen(false);
    setEditingBand(null);
  }

  function handleDeleteBand(bandId: string, code: string) {
    if (!confirm(`Are you sure you want to delete Rating Band ${code}?`)) return;
    const updated = bands.filter((b) => b.id !== bandId);
    saveBandsToStorage(updated);
    toast({ title: `Rating Band ${code} deleted` });
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('system_settings').select('*').eq('id', 1).maybeSingle();
    setSettings(data as SystemSettings | null);
    setLoading(false);
  }, []);

  const loadTableCounts = useCallback(async () => {
    setLoadingCounts(true);
    const countsMap: Record<string, number> = {};

    await Promise.all(
      MANAGED_TABLES.map(async (t) => {
        const { data } = await supabase.from(t.name).select('*').limit(500);
        countsMap[t.name] = data?.length ?? 0;
      })
    );

    setTableCounts(countsMap);
    setLoadingCounts(false);
  }, []);

  useEffect(() => {
    load();
    loadTableCounts();
  }, [load, loadTableCounts]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase.from('system_settings').update({
      annual_training_months: settings.annual_training_months,
      d2_training_months: settings.d2_training_months,
      d3_training_months: settings.d3_training_months,
      d4_training_months: settings.d4_training_months,
      exam_pass_percentage: settings.exam_pass_percentage,
      exam_interval_months: settings.exam_interval_months,
      d3_improvement_months: settings.d3_improvement_months,
      safety_award_enabled: settings.safety_award_enabled,
    }).eq('id', 1);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('update', 'system_settings', 'Updated system settings');
    toast({ title: 'Settings saved', description: 'System configuration updated.' });
  }

  async function clearSingleTable(table: TableMeta) {
    setClearing(true);

    // Fetch existing IDs first to ensure valid Supabase PostgREST delete filter
    const { data: rows, error: fetchErr } = await supabase.from(table.name).select(table.primaryCol);

    if (fetchErr) {
      setClearing(false);
      setConfirmTable(null);
      toast({ title: `Failed to read ${table.label}`, description: fetchErr.message, variant: 'destructive' });
      return;
    }

    if (!rows || rows.length === 0) {
      setClearing(false);
      setConfirmTable(null);
      toast({ title: 'Table is empty', description: `${table.label} has no records to delete.` });
      loadTableCounts();
      return;
    }

    const ids = rows.map((r: any) => r[table.primaryCol]).filter(Boolean);
    const { error } = await supabase.from(table.name).delete().in(table.primaryCol, ids);

    setClearing(false);
    setConfirmTable(null);

    if (error) {
      toast({ title: `Failed to clear ${table.label}`, description: error.message, variant: 'destructive' });
      return;
    }

    if (table.name === 'questions') {
      try { localStorage.removeItem('safefleet_local_questions_v1'); } catch {}
    }

    toast({ title: 'Table Cleared', description: `Successfully deleted ${ids.length} records from ${table.label}.` });
    await logAudit('delete', table.name, `Admin purged table ${table.name}`);
    loadTableCounts();
  }

  async function purgeAllTables() {
    setClearing(true);

    const order = [
      'certificates', 'exam_attempts', 'trainings', 'exam_questions', 'questions',
      'exams', 'training_materials', 'courses', 'plant_courses', 'accidents',
      'violations', 'safety_warnings', 'behaviour_assessments', 'driver_ratings',
      'driver_documents', 'drivers', 'plants', 'branches', 'notifications', 'audit_logs'
    ];

    for (const tableName of order) {
      const meta = MANAGED_TABLES.find((m) => m.name === tableName);
      const col = meta?.primaryCol ?? 'id';
      const { data: rows } = await supabase.from(tableName).select(col);
      if (rows && rows.length > 0) {
        const ids = rows.map((r: any) => r[col]).filter(Boolean);
        await supabase.from(tableName).delete().in(col, ids);
      }
    }

    try { localStorage.removeItem('safefleet_local_questions_v1'); } catch {}

    setClearing(false);
    setConfirmPurgeAll(false);
    toast({ title: 'System Reset Complete', description: 'All database tables have been cleared.' });
    await logAudit('delete', 'system', 'Admin executed Master Database Purge');
    loadTableCounts();
  }

  if (loading || !settings) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  const filteredTables = MANAGED_TABLES.filter((t) => {
    if (!tableSearch) return true;
    const q = tableSearch.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
  });

  const totalRecordCount = Object.values(tableCounts).reduce((acc, curr) => acc + curr, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings & Data Management"
        description="Configure training cadence, pass thresholds, and manage database table records."
        actions={
          <Button onClick={save} disabled={saving} className="gap-1">
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Settings'}
          </Button>
        }
      />

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/60 p-1">
          <TabsTrigger value="settings" className="gap-1.5">
            <SettingsIcon className="h-4 w-4 text-primary" /> Configuration
          </TabsTrigger>
          <TabsTrigger value="bands" className="gap-1.5">
            <Award className="h-4 w-4 text-emerald-500" /> Rating Bands & Rules
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-1.5">
            <Database className="h-4 w-4 text-amber-500" /> Database Management
            {totalRecordCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-amber-500/15 text-amber-600 font-bold">
                {totalRecordCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: System Settings ─────────────────────────────────────── */}
        <TabsContent value="settings">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Training Frequencies</CardTitle>
                <CardDescription>How often trainings are scheduled per rating band.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <NumberField label="Default Annual Training (months)" value={settings.annual_training_months} onChange={(v) => setSettings({ ...settings, annual_training_months: v })} min={1} max={24} />
                <NumberField label="D2 Training Interval (months)" value={settings.d2_training_months} onChange={(v) => setSettings({ ...settings, d2_training_months: v })} min={1} max={12} />
                <NumberField label="D3 Training Interval (months)" value={settings.d3_training_months} onChange={(v) => setSettings({ ...settings, d3_training_months: v })} min={1} max={12} />
                <NumberField label="D4 Training Interval (months)" value={settings.d4_training_months} onChange={(v) => setSettings({ ...settings, d4_training_months: v })} min={1} max={12} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Examination & Compliance</CardTitle>
                <CardDescription>Exam and improvement thresholds.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <NumberField label="Exam Pass Percentage (%)" value={settings.exam_pass_percentage} onChange={(v) => setSettings({ ...settings, exam_pass_percentage: v })} min={1} max={100} />
                <NumberField label="Exam Interval (months)" value={settings.exam_interval_months} onChange={(v) => setSettings({ ...settings, exam_interval_months: v })} min={1} max={12} />
                <NumberField label="D3 Improvement Window (months)" value={settings.d3_improvement_months} onChange={(v) => setSettings({ ...settings, d3_improvement_months: v })} min={1} max={12} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4 text-primary" /> Safety Awards</CardTitle>
                <CardDescription>Eligibility configuration.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm font-medium">Safety Award Program</Label>
                    <p className="text-xs text-muted-foreground">Enable D1 driver eligibility for safety awards.</p>
                  </div>
                  <Switch checked={settings.safety_award_enabled ?? false} onCheckedChange={(c) => setSettings({ ...settings, safety_award_enabled: c })} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 2: Rating Bands & Rules ──────────────────────────────── */}
        <TabsContent value="bands">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Award className="h-4 w-4 text-emerald-500" /> Rating Bands & Classification Rules
                </CardTitle>
                <CardDescription className="mt-1">Add, edit, or remove driver performance bands, score thresholds, descriptions, and enforcement rules.</CardDescription>
              </div>

              {isAdmin && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingBand({
                      id: crypto.randomUUID(),
                      code: 'D5',
                      title: 'New Rating Band',
                      minScore: 80,
                      maxScore: 89,
                      description: 'Custom band description...',
                      trainingCadence: 'Monthly safety training',
                      examCadence: 'Quarterly exam',
                      enforcement: 'Standard evaluation',
                      awardEligible: false,
                      color: '#8b5cf6',
                    });
                    setBandModalOpen(true);
                  }}
                  className="gap-1 text-xs"
                >
                  <Plus className="h-4 w-4" /> Add Rating Band
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {bands.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-xl border p-4 space-y-2 transition-shadow hover:shadow-sm bg-card"
                    style={{ borderColor: `${b.color}40`, backgroundColor: `${b.color}08` }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="font-bold text-white" style={{ backgroundColor: b.color }}>
                          Band {b.code}
                        </Badge>
                        {b.awardEligible && (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 font-bold">
                            Award Eligible
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono" style={{ color: b.color }}>
                          Score {b.minScore} – {b.maxScore}
                        </span>

                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              title="Edit Band"
                              onClick={() => {
                                setEditingBand(b);
                                setBandModalOpen(true);
                              }}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              title="Delete Band"
                              onClick={() => handleDeleteBand(b.id, b.code)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    <h4 className="text-sm font-bold text-foreground">{b.title}</h4>
                    <p className="text-xs text-muted-foreground">{b.description}</p>
                    <div className="pt-2 text-[11px] space-y-1 font-medium text-foreground/80">
                      <p>• Training: {b.trainingCadence}</p>
                      <p>• Exams: {b.examCadence}</p>
                      <p>• Rule: {b.enforcement}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Database Table Management (Admin Only) ──────────── */}
        <TabsContent value="database" className="space-y-4">
          <Card className="border-amber-500/30">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2 text-foreground">
                  <Database className="h-5 w-5 text-amber-500" /> Database Table Management
                </CardTitle>
                <CardDescription className="mt-1">
                  Selectively clear specific tables or purge all operational data while preserving schema and columns.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTableCounts}
                  disabled={loadingCounts}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingCounts ? 'animate-spin' : ''}`} /> Refresh Counts
                </Button>

                {isAdmin && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmPurgeAll(true)}
                    className="gap-1.5 text-xs font-bold"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Purge All Tables
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-2">
              {!isAdmin ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3 text-sm text-amber-800 dark:text-amber-300">
                  <ShieldAlert className="h-5 w-5 shrink-0" />
                  <span>Table purging is restricted to <strong>System Administrators</strong> only.</span>
                </div>
              ) : (
                <>
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Search tables by name or description…"
                      className="pl-8 h-9 text-xs"
                    />
                  </div>

                  {/* Table Grid */}
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {filteredTables.map((table) => {
                      const count = tableCounts[table.name] ?? 0;
                      const hasData = count > 0;

                      return (
                        <div
                          key={table.name}
                          className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-all ${
                            hasData ? 'border-amber-500/30 bg-card hover:border-amber-500/50' : 'border-border/60 bg-muted/20'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold font-mono text-foreground">{table.name}</span>
                              <Badge
                                variant="secondary"
                                className={`text-[10px] font-bold px-1.5 py-0 ${
                                  hasData ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-600'
                                }`}
                              >
                                {count} {count === 1 ? 'row' : 'rows'}
                              </Badge>
                            </div>
                            <p className="text-xs font-medium text-foreground/80 mt-0.5 truncate">{table.label}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{table.description}</p>
                          </div>

                          <Button
                            variant={hasData ? 'destructive' : 'outline'}
                            size="sm"
                            disabled={!hasData || clearing}
                            onClick={() => setConfirmTable(table)}
                            className="h-8 text-xs gap-1 shrink-0"
                          >
                            <Trash2 className="h-3 w-3" /> Clear
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Single Table Clear Confirmation Modal */}
      <Dialog open={!!confirmTable} onOpenChange={(open) => !open && setConfirmTable(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">Clear Table: {confirmTable?.name}</DialogTitle>
            <DialogDescription className="text-center text-xs">
              Are you sure you want to delete all rows from <strong>{confirmTable?.label}</strong> ({confirmTable?.name})?
              The schema, columns, and indexes will remain intact.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" size="sm" onClick={() => setConfirmTable(null)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={clearing}
              onClick={() => confirmTable && clearSingleTable(confirmTable)}
            >
              {clearing ? 'Clearing…' : 'Yes, Delete Table Rows'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Master Purge All Tables Confirmation Modal */}
      <Dialog open={confirmPurgeAll} onOpenChange={setConfirmPurgeAll}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
              <Trash2 className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-destructive">Master Database Purge</DialogTitle>
            <DialogDescription className="text-center text-xs">
              WARNING: This will delete ALL data across all 20 operational tables (drivers, courses, assignments, exams, certificates, and incidents).
              Database structure, authentication accounts, and schema will be preserved.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" size="sm" onClick={() => setConfirmPurgeAll(false)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={clearing}
              onClick={purgeAllTables}
            >
              {clearing ? 'Purging…' : 'Purge All Database Tables'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit / Add Rating Band Modal */}
      {editingBand && (
        <BandFormModal
          open={bandModalOpen}
          onOpenChange={(open) => {
            setBandModalOpen(open);
            if (!open) setEditingBand(null);
          }}
          band={editingBand}
          onSave={handleSaveBand}
        />
      )}
    </div>
  );
}

function BandFormModal({ open, onOpenChange, band, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; band: CustomBand; onSave: (b: CustomBand) => void;
}) {
  const [form, setForm] = useState<CustomBand>(band);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{band.id ? `Edit Rating Band: ${band.code}` : 'Add Rating Band'}</DialogTitle>
          <DialogDescription>Configure score thresholds, band titles, training cadence, and descriptions.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold">Band Code *</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. D1" />
            </div>
            <div>
              <Label className="text-xs font-bold">Theme Color</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-9 w-12 rounded cursor-pointer border"
                />
                <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="font-mono text-xs" />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold">Band Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Top Performers" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold">Min Score (0-100)</Label>
              <Input type="number" min={0} max={100} value={form.minScore} onChange={(e) => setForm({ ...form, minScore: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs font-bold">Max Score (0-100)</Label>
              <Input type="number" min={0} max={100} value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold">Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief summary of band criteria..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold">Training Cadence</Label>
              <Input value={form.trainingCadence} onChange={(e) => setForm({ ...form, trainingCadence: e.target.value })} placeholder="e.g. Quarterly refresher" />
            </div>
            <div>
              <Label className="text-xs font-bold">Exam Cadence</Label>
              <Input value={form.examCadence} onChange={(e) => setForm({ ...form, examCadence: e.target.value })} placeholder="e.g. Annual exam" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold">Enforcement Rule</Label>
            <Input value={form.enforcement} onChange={(e) => setForm({ ...form, enforcement: e.target.value })} placeholder="e.g. Eligible for Safety Award" />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Safety Award Program</Label>
              <p className="text-xs text-muted-foreground">Driver in this band is eligible for annual Safety Award.</p>
            </div>
            <Switch checked={form.awardEligible} onCheckedChange={(c) => setForm({ ...form, awardEligible: c })} />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(form)}>Save Rating Band</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
