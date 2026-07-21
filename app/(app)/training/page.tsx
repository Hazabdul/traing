'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import type { Course, Plant, TrainingMaterial, TrainingFrequency, MaterialType } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus, BookOpen, FileText, Video, Image as ImageIcon, Headphones, Presentation,
  Clock, Globe, Calendar, Edit, Trash2, Award,
} from 'lucide-react';
import { TRAINING_FREQUENCY_LABELS, MATERIAL_TYPE_LABELS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

const MATERIAL_ICONS: Record<MaterialType, typeof FileText> = {
  pdf: FileText,
  powerpoint: Presentation,
  video: Video,
  audio: Headphones,
  image: ImageIcon,
};

export default function TrainingLibraryPage() {
  const { profile } = useAuth();
  const canEdit = ['system_admin', 'ehss_manager', 'ehss_officer', 'training_coordinator'].includes(profile?.role ?? '');
  const [courses, setCourses] = useState<(Course & { materials?: TrainingMaterial[]; plants?: Plant[] })[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: c }, { data: m }, { data: pc }, { data: p }] = await Promise.all([
      supabase.from('courses').select('*').order('title'),
      supabase.from('training_materials').select('*'),
      supabase.from('plant_courses').select('plant_id, course_id'),
      supabase.from('plants').select('*').order('name'),
    ]);
    const matByCourse = new Map<string, TrainingMaterial[]>();
    (m ?? []).forEach((x: TrainingMaterial) => {
      const arr = matByCourse.get(x.course_id) ?? [];
      arr.push(x);
      matByCourse.set(x.course_id, arr);
    });
    const plantsByCourse = new Map<string, Plant[]>();
    (pc ?? []).forEach((x: { course_id: string; plant_id: string }) => {
      const plant = (p ?? []).find((pl: Plant) => pl.id === x.plant_id);
      if (plant) {
        const arr = plantsByCourse.get(x.course_id) ?? [];
        arr.push(plant);
        plantsByCourse.set(x.course_id, arr);
      }
    });
    setCourses((c ?? []).map((course: Course) => ({
      ...course,
      materials: matByCourse.get(course.id) ?? [],
      plants: plantsByCourse.get(course.id) ?? [],
    })));
    setPlants(p ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = courses.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.category ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function deleteCourse(id: string) {
    if (!confirm('Delete this course and all its materials?')) return;
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('delete', 'course', `Deleted course`, {}, id);
    toast({ title: 'Course deleted' });
    load();
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training Library"
        description={`${courses.length} courses available`}
        actions={canEdit ? <Button onClick={() => { setEditing(null); setEditOpen(true); }} size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Course</Button> : undefined}
      />

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses by title or category…" className="max-w-md" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <Card key={c.id} className="flex flex-col transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <Badge variant="outline" className="text-[10px]">{TRAINING_FREQUENCY_LABELS[c.frequency]}</Badge>
              </div>
              <CardTitle className="text-base leading-tight">{c.title}</CardTitle>
              <CardDescription className="line-clamp-2 text-xs">{c.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {c.duration_hours ?? 1}h</span>
                <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {c.language}</span>
                {c.trainer && <span className="flex items-center gap-1"><Award className="h-3 w-3" /> {c.trainer}</span>}
              </div>
              {c.category && <Badge variant="secondary" className="w-fit text-[10px]">{c.category}</Badge>}
              {c.plants && c.plants.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.plants.map((p) => <Badge key={p.id} variant="outline" className="text-[10px] text-primary border-primary/30">{p.code}</Badge>)}
                </div>
              )}
              {c.materials && c.materials.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {c.materials.map((m) => {
                    const Icon = MATERIAL_ICONS[m.material_type];
                    return (
                      <span key={m.id} className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground" title={m.title}>
                        <Icon className="h-3 w-3" /> {MATERIAL_TYPE_LABELS[m.material_type]}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="mt-auto flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">Pass: {c.pass_percentage}%</span>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditing(c); setEditOpen(true); }}><Edit className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => deleteCourse(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CourseFormDialog open={editOpen} onOpenChange={setEditOpen} course={editing} plants={plants} onSaved={load} />
    </div>
  );
}

function CourseFormDialog({ open, onOpenChange, course, plants, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; course: Course | null; plants: Plant[]; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', duration_hours: 1, language: 'English', category: '',
    frequency: 'annual' as TrainingFrequency, trainer: '', pass_percentage: 70, is_mandatory: true,
  });
  const [selectedPlants, setSelectedPlants] = useState<string[]>([]);

  useEffect(() => {
    if (course) {
      setForm({
        title: course.title, description: course.description ?? '', duration_hours: course.duration_hours ?? 1,
        language: course.language ?? 'English', category: course.category ?? '',
        frequency: course.frequency, trainer: course.trainer ?? '', pass_percentage: course.pass_percentage,
        is_mandatory: course.is_mandatory ?? true,
      });
    } else {
      setForm({ title: '', description: '', duration_hours: 1, language: 'English', category: '', frequency: 'annual', trainer: '', pass_percentage: 70, is_mandatory: true });
    }
  }, [course, open]);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        duration_hours: Number(form.duration_hours),
        pass_percentage: Number(form.pass_percentage),
      };
      let id = course?.id;
      if (course) {
        const { error } = await supabase.from('courses').update(payload).eq('id', course.id);
        if (error) throw error;
        await logAudit('update', 'course', `Updated course ${form.title}`, {}, course.id);
      } else {
        const { data, error } = await supabase.from('courses').insert(payload).select().single();
        if (error) throw error;
        id = data.id;
        await logAudit('create', 'course', `Created course ${form.title}`, {}, data.id);
      }
      // Sync plant requirements
      if (id) {
        await supabase.from('plant_courses').delete().eq('course_id', id);
        if (selectedPlants.length) {
          await supabase.from('plant_courses').insert(selectedPlants.map((pid) => ({ plant_id: pid, course_id: id })));
        }
      }
      toast({ title: course ? 'Course updated' : 'Course created' });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{course ? 'Edit Course' : 'Add Course'}</DialogTitle>
          <DialogDescription>{course ? 'Update course details.' : 'Create a new training course.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div><Label className="text-xs">Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Duration (hours)</Label><Input type="number" min={1} value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: Number(e.target.value) })} /></div>
            <div><Label className="text-xs">Language</Label><Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} /></div>
            <div><Label className="text-xs">Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Safety, Hazmat" /></div>
            <div>
              <Label className="text-xs">Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as TrainingFrequency })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRAINING_FREQUENCY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Trainer</Label><Input value={form.trainer} onChange={(e) => setForm({ ...form, trainer: e.target.value })} /></div>
            <div><Label className="text-xs">Pass %</Label><Input type="number" min={1} max={100} value={form.pass_percentage} onChange={(e) => setForm({ ...form, pass_percentage: Number(e.target.value) })} /></div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="mand" checked={form.is_mandatory} onCheckedChange={(c) => setForm({ ...form, is_mandatory: c === true })} />
            <Label htmlFor="mand" className="text-xs">Mandatory</Label>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Plant Requirements</Label>
            <div className="flex flex-wrap gap-3 rounded-lg border p-3">
              {plants.map((p) => (
                <div key={p.id} className="flex items-center gap-1.5">
                  <Checkbox id={`p-${p.id}`} checked={selectedPlants.includes(p.id)} onCheckedChange={(c) => {
                    if (c === true) setSelectedPlants([...selectedPlants, p.id]);
                    else setSelectedPlants(selectedPlants.filter((x) => x !== p.id));
                  }} />
                  <Label htmlFor={`p-${p.id}`} className="text-xs cursor-pointer">{p.name}</Label>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
