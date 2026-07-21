'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import type { SystemSettings } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Settings as SettingsIcon, Clock, Award, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('system_settings').select('*').eq('id', 1).maybeSingle();
    setSettings(data as SystemSettings | null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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

  if (loading || !settings) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="System Settings" description="Configure training frequencies, exam thresholds, and safety awards." actions={<Button onClick={save} disabled={saving} className="gap-1"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Changes'}</Button>} />

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
    </div>
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
