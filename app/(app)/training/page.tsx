'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import type { Course, Plant, TrainingMaterial, TrainingFrequency, MaterialType, Exam } from '@/lib/database-types';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus, BookOpen, FileText, Video, Image as ImageIcon, Headphones, Presentation,
  Clock, Globe, Edit, Trash2, Award, ClipboardCheck, ExternalLink, Settings, Sparkles, Building2, Factory, Edit2, AlertTriangle,
} from 'lucide-react';
import { TRAINING_FREQUENCY_LABELS, MATERIAL_TYPE_LABELS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { createExamRecord } from '@/lib/exam-service';

const MATERIAL_ICONS: Record<MaterialType, typeof FileText> = {
  pdf: FileText,
  powerpoint: Presentation,
  video: Video,
  audio: Headphones,
  image: ImageIcon,
};

export default function TrainingLibraryPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const canEdit = ['system_admin', 'ehss_manager', 'ehss_officer', 'training_coordinator'].includes(profile?.role ?? '');
  const [courses, setCourses] = useState<(Course & { materials?: TrainingMaterial[]; plants?: Plant[]; exam?: Exam | null })[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [plantOpen, setPlantOpen] = useState(false);
  const [managePlantsOpen, setManagePlantsOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [editing, setEditing] = useState<Course | null>(null);
  const [creatingExamCourseId, setCreatingExamCourseId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: c }, { data: m }, { data: pc }, { data: p }, { data: ex }] = await Promise.all([
      supabase.from('courses').select('*').order('title'),
      supabase.from('training_materials').select('*'),
      supabase.from('plant_courses').select('plant_id, course_id'),
      supabase.from('plants').select('*').order('name'),
      supabase.from('exams').select('*').eq('is_active', true),
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

    const examByCourse = new Map<string, Exam>();
    (ex ?? []).forEach((e: Exam) => {
      if (e.course_id) examByCourse.set(e.course_id, e);
    });

    setCourses((c ?? []).map((course: Course) => ({
      ...course,
      materials: matByCourse.get(course.id) ?? [],
      plants: plantsByCourse.get(course.id) ?? [],
      exam: examByCourse.get(course.id) ?? null,
    })));
    setPlants(p ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = courses.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.category ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function createExamForCourse(course: Course) {
    setCreatingExamCourseId(course.id);
    const { data: newExam, error } = await createExamRecord({
      title: `${course.title} Final Exam`,
      description: `Official evaluation exam for course: ${course.title}`,
      course_id: course.id,
      pass_percentage: course.pass_percentage ?? 70,
      time_limit_minutes: 30,
      is_active: true,
      randomize_questions: true,
    });

    setCreatingExamCourseId(null);
    if (error || !newExam) {
      toast({ title: 'Failed to create exam', description: error?.message ?? 'Permission or network error', variant: 'destructive' });
      return;
    }

    await logAudit('create', 'exam', `Created exam for course: ${course.title}`, {}, newExam.id);
    toast({ title: 'Exam created & linked!', description: 'Redirecting to exam manager...' });
    router.push(`/exams/${newExam.id}`);
  }

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
        title="Training Library & Course Management"
        description={`${courses.length} courses available. Manage training materials and link exams.`}
        actions={canEdit ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setManagePlantsOpen(true)} className="gap-1">
              <Factory className="h-4 w-4 text-amber-500" /> Manage Plants ({plants.length})
            </Button>
            <Button onClick={() => { setEditing(null); setEditOpen(true); }} size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Add Course
            </Button>
          </div>
        ) : undefined}
      />

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses by title or category…" className="max-w-md" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <Card key={c.id} className="flex flex-col transition-shadow hover:shadow-md border-border/60">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-1">
                  {c.exam ? (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] gap-1">
                      <ClipboardCheck className="h-3 w-3" /> Exam Linked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">{TRAINING_FREQUENCY_LABELS[c.frequency]}</Badge>
                  )}
                </div>
              </div>
              <CardTitle className="text-base leading-tight mt-2">{c.title}</CardTitle>
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

              {/* Exam Actions Section */}
              <div className="mt-auto pt-3 border-t border-border/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Pass Mark: {c.pass_percentage}%</span>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditing(c); setEditOpen(true); }} title="Edit Course"><Edit className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteCourse(c.id)} title="Delete Course"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div>
                    {c.exam ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs gap-1.5 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        onClick={() => router.push(`/exams/${c.exam?.id}`)}
                      >
                        <Settings className="h-3.5 w-3.5" /> Manage Exam ({c.exam.title})
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full h-8 text-xs gap-1.5 bg-primary/10 text-primary hover:bg-primary/20"
                        onClick={() => createExamForCourse(c)}
                        disabled={creatingExamCourseId === c.id}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {creatingExamCourseId === c.id ? 'Creating Exam...' : '+ Add Exam to Course'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CourseFormDialog open={editOpen} onOpenChange={setEditOpen} course={editing} plants={plants} onSaved={load} />
      <PlantFormDialog
        open={plantOpen}
        onOpenChange={(o) => {
          setPlantOpen(o);
          if (!o) setEditingPlant(null);
        }}
        plant={editingPlant}
        onSaved={load}
      />
      <ManagePlantsDialog
        open={managePlantsOpen}
        onOpenChange={setManagePlantsOpen}
        plants={plants}
        onAdd={() => {
          setEditingPlant(null);
          setPlantOpen(true);
        }}
        onEdit={(p) => {
          setEditingPlant(p);
          setPlantOpen(true);
        }}
        onSaved={load}
      />
    </div>
  );
}

function CourseFormDialog({ open, onOpenChange, course, plants, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; course: Course | null; plants: Plant[]; onSaved: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [createExamChecked, setCreateExamChecked] = useState(true);
  const [form, setForm] = useState({
    title: '', description: '', duration_hours: 1, language: 'English', category: '',
    frequency: 'annual' as TrainingFrequency, trainer: '', pass_percentage: 70, is_mandatory: true,
  });
  const [selectedPlants, setSelectedPlants] = useState<string[]>([]);

  useEffect(() => {
    if (course) {
      setForm({
        title: course.title, description: course.description ?? '', duration_hours: course.duration_hours ?? 1,
        language: course.language ?? 'English', category: course.category ?? '', frequency: course.frequency,
        trainer: course.trainer ?? '', pass_percentage: course.pass_percentage ?? 70, is_mandatory: course.is_mandatory ?? true,
      });
      // Load plant relations
      supabase.from('plant_courses').select('plant_id').eq('course_id', course.id).then(({ data }) => {
        setSelectedPlants((data ?? []).map((x: { plant_id: string }) => x.plant_id));
      });
    } else {
      setForm({
        title: '', description: '', duration_hours: 1, language: 'English', category: 'General Safety',
        frequency: 'annual', trainer: '', pass_percentage: 70, is_mandatory: true,
      });
      setSelectedPlants([]);
      setCreateExamChecked(true);
    }
  }, [course]);

  async function save() {
    if (!form.title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setSaving(true);
    let savedCourseId = course?.id;

    if (course) {
      const { error } = await supabase.from('courses').update(form).eq('id', course.id);
      if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); setSaving(false); return; }
    } else {
      const { data: created, error } = await supabase.from('courses').insert(form).select().single();
      if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); setSaving(false); return; }
      savedCourseId = created.id;

      // Automatically create linked exam if checked
      if (createExamChecked) {
        const { data: newExam } = await supabase.from('exams').insert({
          title: `${form.title} Assessment Exam`,
          description: `Exam evaluation for ${form.title}`,
          course_id: savedCourseId,
          pass_percentage: form.pass_percentage ?? 70,
          time_limit_minutes: 30,
          is_active: true,
          randomize_questions: true,
        }).select().single();

        if (newExam) {
          toast({ title: 'Course and Exam created!', description: 'Navigating to configure exam questions.' });
          onOpenChange(false);
          onSaved();
          router.push(`/exams/${newExam.id}`);
          return;
        }
      }
    }

    // Update plant connections
    if (savedCourseId) {
      await supabase.from('plant_courses').delete().eq('course_id', savedCourseId);
      if (selectedPlants.length) {
        await supabase.from('plant_courses').insert(selectedPlants.map((pId) => ({ course_id: savedCourseId!, plant_id: pId })));
      }
    }

    await logAudit(course ? 'update' : 'create', 'course', `${course ? 'Updated' : 'Created'} course: ${form.title}`, {}, savedCourseId);
    toast({ title: course ? 'Course updated' : 'Course created' });
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{course ? 'Edit Course' : 'Create New Course'}</DialogTitle>
          <DialogDescription>Add course info and configure linked exams.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label className="text-xs">Course Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Chemical Hazard Awareness" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Dangerous Goods" />
            </div>
            <div>
              <Label className="text-xs">Language</Label>
              <Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Frequency</Label>
              <Select value={form.frequency} onValueChange={(val) => setForm({ ...form, frequency: val as TrainingFrequency })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(TRAINING_FREQUENCY_LABELS).map((k) => <SelectItem key={k} value={k}>{TRAINING_FREQUENCY_LABELS[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Duration (hrs)</Label>
              <Input type="number" value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Pass Mark (%)</Label>
              <Input type="number" value={form.pass_percentage} onChange={(e) => setForm({ ...form, pass_percentage: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Trainer</Label>
            <Input value={form.trainer} onChange={(e) => setForm({ ...form, trainer: e.target.value })} placeholder="Lead instructor name" />
          </div>

          {plants.length > 0 && (
            <div>
              <Label className="text-xs mb-1 block">Plant Requirements</Label>
              <div className="flex flex-wrap gap-2 rounded-md border p-2">
                {plants.map((p) => (
                  <div key={p.id} className="flex items-center gap-1 text-xs">
                    <Checkbox
                      id={`p-${p.id}`}
                      checked={selectedPlants.includes(p.id)}
                      onCheckedChange={(c) => setSelectedPlants((prev) => c ? [...prev, p.id] : prev.filter((id) => id !== p.id))}
                    />
                    <label htmlFor={`p-${p.id}`} className="cursor-pointer">{p.code}</label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!course && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
              <Checkbox
                id="create-exam-check"
                checked={createExamChecked}
                onCheckedChange={(c) => setCreateExamChecked(!!c)}
              />
              <label htmlFor="create-exam-check" className="cursor-pointer font-medium text-foreground">
                Automatically create and link an Evaluation Exam for this course
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Course'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlantFormDialog({ open, onOpenChange, plant, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; plant?: Plant | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (plant) {
      setName(plant.name);
      setCode(plant.code);
      setDescription(plant.description ?? '');
    } else {
      setName(''); setCode(''); setDescription('');
    }
  }, [plant, open]);

  async function savePlant() {
    if (!name.trim() || !code.trim()) {
      toast({ title: 'Plant name and code are required', variant: 'destructive' });
      return;
    }
    setSaving(true);

    if (plant) {
      const { error } = await supabase.from('plants').update({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
      }).eq('id', plant.id);

      setSaving(false);
      if (error) {
        toast({ title: 'Failed to update plant', description: error.message, variant: 'destructive' });
        return;
      }
      await logAudit('update', 'plant', `Updated industrial plant: ${name} (${code})`, {}, plant.id);
      toast({ title: 'Industrial Plant updated successfully!' });
    } else {
      const { error } = await supabase.from('plants').insert({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
      });

      setSaving(false);
      if (error) {
        toast({ title: 'Failed to create plant', description: error.message, variant: 'destructive' });
        return;
      }
      await logAudit('create', 'plant', `Created industrial plant: ${name} (${code})`);
      toast({ title: 'Industrial Plant added successfully!' });
    }

    setName(''); setCode(''); setDescription('');
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plant ? `Edit Plant: ${plant.code}` : 'Add Industrial Plant'}</DialogTitle>
          <DialogDescription>Define an industrial plant requirement (e.g., SABIC Jubail, TASNEE Yanbu, ARAMCO).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label className="text-xs font-bold">Plant Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SABIC Jubail Industrial Complex" />
          </div>
          <div>
            <Label className="text-xs font-bold">Plant Code *</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SAB-JUB" />
          </div>
          <div>
            <Label className="text-xs font-bold">Description / Scope</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Site specific requirements, safety guidelines..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={savePlant} disabled={saving}>{saving ? 'Saving...' : plant ? 'Save Changes' : 'Add Plant'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManagePlantsDialog({ open, onOpenChange, plants, onAdd, onEdit, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; plants: Plant[]; onAdd: () => void; onEdit: (p: Plant) => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deletePlant(plant: Plant) {
    if (!confirm(`Are you sure you want to delete Industrial Plant "${plant.name}" (${plant.code})?`)) return;
    setDeletingId(plant.id);

    await supabase.from('plant_courses').delete().eq('plant_id', plant.id);
    const { error } = await supabase.from('plants').delete().eq('id', plant.id);
    setDeletingId(null);

    if (error) {
      toast({ title: 'Failed to delete plant', description: error.message, variant: 'destructive' });
      return;
    }

    await logAudit('delete', 'plant', `Deleted plant: ${plant.name}`);
    toast({ title: 'Industrial Plant deleted' });
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5 text-amber-500" /> Industrial Plants Management
            </DialogTitle>
            <DialogDescription className="mt-1">Add, edit, or remove industrial plant compliance locations.</DialogDescription>
          </div>
          <Button size="sm" onClick={onAdd} className="gap-1 text-xs">
            <Plus className="h-4 w-4" /> Add Plant
          </Button>
        </DialogHeader>

        <div className="space-y-2 py-2 max-h-96 overflow-y-auto">
          {plants.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No industrial plants configured yet.</p>
          ) : (
            plants.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 bg-card">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{p.name}</span>
                    <Badge variant="outline" className="text-[10px] font-mono font-bold text-primary border-primary/30">{p.code}</Badge>
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</p>}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="Edit Plant"
                    onClick={() => onEdit(p)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    title="Delete Plant"
                    disabled={deletingId === p.id}
                    onClick={() => deletePlant(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
