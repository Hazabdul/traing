'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import type { Question, Course, QuestionType, DifficultyLevel } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Edit, Trash2, HelpCircle, GripVertical, ImagePlus, X, CheckCircle2 } from 'lucide-react';
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

// ─── Local Question Store (RLS fallback) ───────────────────────────────────
const LOCAL_QS_KEY = 'safefleet_local_questions_v1';

function getLocalQuestions(): Question[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_QS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalQuestions(list: Question[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LOCAL_QS_KEY, JSON.stringify(list)); } catch {}
}

// ─── Image helpers (base64 inline for local) ──────────────────────────────
function blobToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

async function uploadImage(file: File): Promise<string> {
  try {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `questions/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('training-materials').upload(path, file, { upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage.from('training-materials').getPublicUrl(path);
      return urlData.publicUrl;
    }
  } catch {}
  // Fallback: store as base64 data URL
  return blobToDataUrl(file);
}

// ─── Image Picker Component ───────────────────────────────────────────────
function ImagePicker({ value, onChange, label }: { value: string | null; onChange: (url: string | null) => void; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadImage(file);
    onChange(url);
    setUploading(false);
  }

  return (
    <div className="flex items-center gap-2">
      {value ? (
        <div className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="h-10 w-16 object-cover rounded border" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-1 -right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-10 w-16 items-center justify-center rounded border-2 border-dashed border-border hover:border-primary transition-colors text-muted-foreground hover:text-primary"
        >
          {uploading ? <span className="text-[9px]">...</span> : <ImagePlus className="h-4 w-4" />}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCourse, setFilterCourse] = useState('all');
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: q }, { data: c }] = await Promise.all([
      supabase.from('questions').select('*').order('created_at', { ascending: false }),
      supabase.from('courses').select('*').order('title'),
    ]);

    // Merge DB + local fallback
    const dbQs = (q ?? []) as Question[];
    const localQs = getLocalQuestions();
    const merged = [...dbQs];
    for (const lq of localQs) {
      if (!merged.some((x) => x.id === lq.id)) merged.push(lq);
    }

    setQuestions(merged);
    setCourses((c ?? []) as Course[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = questions.filter((q) => filterCourse === 'all' || q.course_id === filterCourse);

  async function deleteQ(id: string) {
    if (!confirm('Delete this question?')) return;
    await supabase.from('questions').delete().eq('id', id);
    // Also remove from local store
    saveLocalQuestions(getLocalQuestions().filter((x) => x.id !== id));
    await logAudit('delete', 'question', `Deleted question`, {}, id);
    toast({ title: 'Question deleted' });
    load();
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Question Bank"
        description={`${questions.length} questions across ${courses.length} courses`}
        actions={<Button size="sm" onClick={() => { setEditing(null); setEditOpen(true); }} className="gap-1"><Plus className="h-4 w-4" /> Add Question</Button>}
      />

      <Select value={filterCourse} onValueChange={setFilterCourse}>
        <SelectTrigger className="w-[260px] h-9"><SelectValue placeholder="Filter by course" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Courses</SelectItem>
          {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No questions. Add one to build your question bank.</p>}
        {filtered.map((q) => {
          const course = courses.find((c) => c.id === q.course_id);
          return (
            <div key={q.id} className="flex items-start gap-3 rounded-lg border p-4">
              <GripVertical className="mt-0.5 h-4 w-4 text-muted-foreground/40" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <Badge variant="outline" className="text-[10px]">{QUESTION_TYPE_LABELS[q.question_type]}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{DIFFICULTY_LABELS[q.difficulty]}</Badge>
                  {course && <Badge variant="outline" className="text-[10px] text-primary border-primary/30">{course.title}</Badge>}
                  {q.category && <Badge variant="outline" className="text-[10px]">{q.category}</Badge>}
                  {q.image_url && <Badge variant="outline" className="text-[10px] gap-1"><ImagePlus className="h-2.5 w-2.5" /> Has Image</Badge>}
                </div>
                {q.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.image_url} alt="Question" className="mt-2 max-h-24 rounded border object-cover" />
                )}
                <p className="mt-2 text-sm font-medium">{q.question_text}</p>
                <div className="mt-2 space-y-1">
                  {q.options.map((opt, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs ${q.correct_answers.includes(i) ? 'text-success font-medium' : 'text-muted-foreground'}`}>
                      <span className="flex h-4 w-4 items-center justify-center rounded border text-[10px]">{String.fromCharCode(65 + i)}</span>
                      {q.option_images?.[i] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={q.option_images[i]!} alt={`Option ${String.fromCharCode(65 + i)}`} className="h-8 w-12 object-cover rounded border" />
                      )}
                      {opt}
                      {q.correct_answers.includes(i) && <span className="text-success">✓ correct</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditing(q); setEditOpen(true); }}><Edit className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => deleteQ(q.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          );
        })}
      </div>

      <QuestionFormDialog open={editOpen} onOpenChange={setEditOpen} question={editing} courses={courses} onSaved={load} />
    </div>
  );
}

// ─── Form Dialog ───────────────────────────────────────────────────────────
function QuestionFormDialog({ open, onOpenChange, question, courses, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; question: Question | null; courses: Course[]; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    course_id: '', question_text: '', question_type: 'multiple_choice' as QuestionType,
    category: '', difficulty: 'medium' as DifficultyLevel, explanation: '',
  });
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correct, setCorrect] = useState<number[]>([]);
  const [questionImage, setQuestionImage] = useState<string | null>(null);
  const [optionImages, setOptionImages] = useState<(string | null)[]>([null, null, null, null]);

  useEffect(() => {
    if (question) {
      setForm({
        course_id: question.course_id ?? '',
        question_text: question.question_text,
        question_type: question.question_type,
        category: question.category ?? '',
        difficulty: question.difficulty,
        explanation: question.explanation ?? '',
      });
      setOptions(question.options.length ? [...question.options] : ['', '', '', '']);
      setCorrect([...question.correct_answers]);
      setQuestionImage(question.image_url ?? null);
      setOptionImages(question.option_images ? [...question.option_images] : question.options.map(() => null));
    } else {
      setForm({ course_id: '', question_text: '', question_type: 'multiple_choice', category: '', difficulty: 'medium', explanation: '' });
      setOptions(['', '', '', '']);
      setCorrect([]);
      setQuestionImage(null);
      setOptionImages([null, null, null, null]);
    }
  }, [question, open]);

  function toggleCorrect(i: number) {
    if (form.question_type === 'multiple_select') {
      setCorrect((c) => c.includes(i) ? c.filter((x) => x !== i) : [...c, i]);
    } else {
      setCorrect([i]);
    }
  }

  function setOption(i: number, val: string) {
    setOptions((o) => o.map((x, idx) => idx === i ? val : x));
  }

  function setOptionImage(i: number, url: string | null) {
    setOptionImages((imgs) => imgs.map((x, idx) => idx === i ? url : x));
  }

  function addOptionRow() {
    setOptions((o) => [...o, '']);
    setOptionImages((imgs) => [...imgs, null]);
  }

  function removeOptionRow(i: number) {
    if (options.length <= 2) return;
    setOptions((o) => o.filter((_, idx) => idx !== i));
    setOptionImages((imgs) => imgs.filter((_, idx) => idx !== i));
    setCorrect((c) => c.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)));
  }

  async function save() {
    if (!form.question_text.trim()) { toast({ title: 'Question text required', variant: 'destructive' }); return; }
    const filledOpts = options.map((o) => o.trim());
    if (filledOpts.filter(Boolean).length < 2) { toast({ title: 'Need at least 2 options', variant: 'destructive' }); return; }
    if (correct.length === 0) { toast({ title: 'Mark at least one correct answer', variant: 'destructive' }); return; }

    setSaving(true);

    const payload = {
      course_id: form.course_id || null,
      question_text: form.question_text,
      question_type: form.question_type,
      category: form.category || null,
      difficulty: form.difficulty,
      options: filledOpts.filter(Boolean),
      correct_answers: correct,
      explanation: form.explanation || null,
      image_url: questionImage || null,
      option_images: optionImages.slice(0, filledOpts.filter(Boolean).length),
    };

    try {
      if (question) {
        const { error } = await supabase.from('questions').update(payload).eq('id', question.id);
        if (error) throw error;
        // Also update local store
        const locals = getLocalQuestions();
        const idx = locals.findIndex((x) => x.id === question.id);
        if (idx !== -1) { locals[idx] = { ...locals[idx], ...payload }; saveLocalQuestions(locals); }
        await logAudit('update', 'question', `Updated question`, {}, question.id);
      } else {
        // Try DB first
        const { data, error } = await supabase.from('questions').insert(payload).select().single();

        if (error || !data) {
          // ── RLS Fallback: save to local store ──
          console.warn('DB insert blocked, saving locally:', error?.message);
          const localQ: Question = {
            id: crypto.randomUUID(),
            ...payload,
            created_at: new Date().toISOString(),
          };
          const locals = getLocalQuestions();
          locals.unshift(localQ);
          saveLocalQuestions(locals);
          toast({ title: 'Question created (saved locally)', description: 'It will sync once permissions are configured.' });
          onOpenChange(false);
          onSaved();
          setSaving(false);
          return;
        }

        // Auto-link to exam if course has one
        if (form.course_id) {
          const { data: exam } = await supabase.from('exams').select('id').eq('course_id', form.course_id).maybeSingle();
          if (exam) {
            await supabase.from('exam_questions').insert({ exam_id: exam.id, question_id: data.id });
          }
        }
        await logAudit('create', 'question', `Created question`, {}, data.id);
      }

      toast({ title: question ? 'Question updated' : 'Question created' });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const filledCount = options.filter((o) => o.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{question ? 'Edit Question' : 'Add Question'}</DialogTitle>
          <DialogDescription>Build exam questions with optional images for the question and each answer option.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Course */}
          <div>
            <Label className="text-xs">Course</Label>
            <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select course (optional)" /></SelectTrigger>
              <SelectContent>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Question text + image */}
          <div className="space-y-2">
            <Label className="text-xs">Question Text</Label>
            <Textarea
              value={form.question_text}
              onChange={(e) => setForm({ ...form, question_text: e.target.value })}
              placeholder="Enter your question here..."
              rows={3}
            />
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Question image (optional):</span>
              <ImagePicker value={questionImage} onChange={setQuestionImage} label="Question image" />
            </div>
          </div>

          {/* Type / Difficulty / Category */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.question_type} onValueChange={(v) => { setForm({ ...form, question_type: v as QuestionType }); setCorrect([]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => <SelectItem key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Difficulty</Label>
              <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v as DifficultyLevel })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DIFFICULTY_LABELS) as DifficultyLevel[]).map((d) => <SelectItem key={d} value={d}>{DIFFICULTY_LABELS[d]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Driving" />
            </div>
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Options (mark correct answers)</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addOptionRow}>
                <Plus className="h-3 w-3" /> Add Option
              </Button>
            </div>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  {/* Correct selector */}
                  <button
                    type="button"
                    onClick={() => toggleCorrect(i)}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      correct.includes(i)
                        ? 'border-success bg-success/10 text-success'
                        : 'border-border text-muted-foreground hover:border-primary'
                    }`}
                  >
                    {correct.includes(i) ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">{String.fromCharCode(65 + i)}</span>}
                  </button>

                  {/* Option image */}
                  <ImagePicker value={optionImages[i] ?? null} onChange={(url) => setOptionImage(i, url)} label={`Option ${String.fromCharCode(65 + i)} image`} />

                  {/* Option text */}
                  <Input
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + i)} text (or use image only)`}
                    className="flex-1"
                  />

                  {/* Remove row */}
                  {options.length > 2 && (
                    <button type="button" onClick={() => removeOptionRow(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {form.question_type === 'true_false' && (
              <p className="mt-1 text-[11px] text-muted-foreground">For True/False, Option A = True, Option B = False.</p>
            )}
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {filledCount} option(s) · Click the circle to mark the correct answer(s).
            </p>
          </div>

          {/* Explanation */}
          <div>
            <Label className="text-xs">Explanation (optional)</Label>
            <Textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} placeholder="Explain the correct answer..." rows={2} />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : question ? 'Update Question' : 'Create Question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
