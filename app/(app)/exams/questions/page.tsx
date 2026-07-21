'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { Plus, Edit, Trash2, HelpCircle, GripVertical } from 'lucide-react';
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

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
    setQuestions((q ?? []) as Question[]);
    setCourses((c ?? []) as Course[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = questions.filter((q) => filterCourse === 'all' || q.course_id === filterCourse);

  async function deleteQ(id: string) {
    if (!confirm('Delete this question?')) return;
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
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
        {filtered.map((q, idx) => {
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
                </div>
                <p className="mt-2 text-sm font-medium">{q.question_text}</p>
                <div className="mt-2 space-y-1">
                  {q.options.map((opt, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs ${q.correct_answers.includes(i) ? 'text-success font-medium' : 'text-muted-foreground'}`}>
                      <span className="flex h-4 w-4 items-center justify-center rounded border text-[10px]">{String.fromCharCode(65 + i)}</span>
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
    } else {
      setForm({ course_id: '', question_text: '', question_type: 'multiple_choice', category: '', difficulty: 'medium', explanation: '' });
      setOptions(['', '', '', '']);
      setCorrect([]);
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

  async function save() {
    if (!form.question_text.trim()) { toast({ title: 'Question text required', variant: 'destructive' }); return; }
    if (options.filter((o) => o.trim()).length < 2) { toast({ title: 'Need at least 2 options', variant: 'destructive' }); return; }
    if (correct.length === 0) { toast({ title: 'Mark at least one correct answer', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = {
      course_id: form.course_id || null,
      question_text: form.question_text,
      question_type: form.question_type,
      category: form.category || null,
      difficulty: form.difficulty,
      options: options.filter((o) => o.trim()),
      correct_answers: correct,
      explanation: form.explanation || null,
    };
    try {
      if (question) {
        const { error } = await supabase.from('questions').update(payload).eq('id', question.id);
        if (error) throw error;
        await logAudit('update', 'question', `Updated question`, {}, question.id);
      } else {
        const { data, error } = await supabase.from('questions').insert(payload).select().single();
        if (error) throw error;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{question ? 'Edit Question' : 'Add Question'}</DialogTitle>
          <DialogDescription>Building the question bank for online exams.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Course</Label>
            <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
              <SelectContent>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Question Text</Label><Textarea value={form.question_text} onChange={(e) => setForm({ ...form, question_text: e.target.value })} /></div>
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
            <div><Label className="text-xs">Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Driving" /></div>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Options (mark correct answers)</Label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Checkbox checked={correct.includes(i)} onCheckedChange={() => toggleCorrect(i)} />
                  <Input value={opt} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`} />
                </div>
              ))}
            </div>
            {form.question_type === 'true_false' && (
              <p className="mt-1 text-[11px] text-muted-foreground">For True/False, use option A = True, B = False.</p>
            )}
          </div>
          <div><Label className="text-xs">Explanation (optional)</Label><Textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
