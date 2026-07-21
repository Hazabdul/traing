'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { useAuth, isStaff } from '@/lib/auth-context';
import type { Exam, Course, Question } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2, HelpCircle, Save, CheckCircle2, Clock } from 'lucide-react';
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { updateExamRecord, addQuestionToExamRecord, removeQuestionFromExamRecord, fetchExamDetailById } from '@/lib/exam-service';

export default function ManageExamPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { profile } = useAuth();
  const staff = isStaff(profile?.role);
  const { toast } = useToast();

  const [exam, setExam] = useState<Exam | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [attachedQuestions, setAttachedQuestions] = useState<Question[]>([]);
  const [availableQuestions, setAvailableQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedQId, setSelectedQId] = useState('');

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState('');
  const [passPercentage, setPassPercentage] = useState('70');
  const [timeLimit, setTimeLimit] = useState('30');
  const [isActive, setIsActive] = useState(true);
  const [randomize, setRandomize] = useState(false);

  const load = useCallback(async () => {
    const examId = params.id;
    setLoading(true);

    const [{ exam: ex, attachedQuestions: attached, availableQuestions: available }, { data: c }] = await Promise.all([
      fetchExamDetailById(examId),
      supabase.from('courses').select('*').order('title'),
    ]);

    if (!ex) {
      toast({ title: 'Exam not found', variant: 'destructive' });
      setLoading(false);
      return;
    }

    setExam(ex);
    setCourses((c ?? []) as Course[]);

    setTitle(ex.title);
    setDescription(ex.description ?? '');
    setCourseId(ex.course_id ?? '');
    setPassPercentage(String(ex.pass_percentage ?? 70));
    setTimeLimit(String(ex.time_limit_minutes ?? 30));
    setIsActive(ex.is_active ?? true);
    setRandomize(ex.randomize_questions ?? false);

    setAttachedQuestions(attached);
    setAvailableQuestions(available);
    setLoading(false);
  }, [params.id, toast]);

  useEffect(() => {
    if (profile && !staff) {
      router.replace('/exams');
      return;
    }
    load();
  }, [profile, staff, router, load]);

  async function saveExamDetails() {
    if (!exam) return;
    if (!title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = await updateExamRecord({
      id: exam.id,
      title,
      description: description || null,
      course_id: courseId || null,
      pass_percentage: Number(passPercentage) || 70,
      time_limit_minutes: Number(timeLimit) || 30,
      is_active: isActive,
      randomize_questions: randomize,
    });

    setSaving(false);
    if (error) {
      toast({ title: 'Failed to update exam', description: error.message, variant: 'destructive' });
      return;
    }

    await logAudit('update', 'exam', `Updated exam settings: ${title}`, {}, exam.id);
    toast({ title: 'Exam updated successfully' });
    load();
  }

  async function addQuestionToExam() {
    if (!exam || !selectedQId) return;

    const nextOrder = attachedQuestions.length + 1;
    const { error } = await addQuestionToExamRecord(exam.id, selectedQId, nextOrder);

    if (error) {
      toast({ title: 'Failed to add question', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Question added to exam' });
    setSelectedQId('');
    setAddDialogOpen(false);
    load();
  }

  async function removeQuestionFromExam(questionId: string) {
    if (!exam) return;
    if (!confirm('Remove this question from the exam?')) return;

    const { error } = await removeQuestionFromExamRecord(exam.id, questionId);

    if (error) {
      toast({ title: 'Failed to remove question', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Question removed from exam' });
    load();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!exam) {
    return <div className="py-12 text-center text-muted-foreground">Exam not found.</div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/exams')} className="-ml-2 gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to Examinations
      </Button>

      <PageHeader
        title={`Manage Exam: ${exam.title}`}
        description="Configure exam settings, pass thresholds, and attach questions."
      />

      <div className="grid gap-6 md:grid-cols-3">
        {/* Settings Card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Exam Configuration</CardTitle>
            <CardDescription>Update title, pass percentage, and timing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exam Title" />
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Instructions or scope..."
                rows={3}
              />
            </div>

            <div>
              <Label className="text-xs">Associated Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Pass Mark (%)</Label>
                <Input
                  type="number"
                  value={passPercentage}
                  onChange={(e) => setPassPercentage(e.target.value)}
                  min={1}
                  max={100}
                />
              </div>
              <div>
                <Label className="text-xs">Time Limit (mins)</Label>
                <Input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  min={1}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Label className="text-xs cursor-pointer" htmlFor="active-toggle">Active Status</Label>
              <Switch id="active-toggle" checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs cursor-pointer" htmlFor="rand-toggle">Randomize Questions</Label>
              <Switch id="rand-toggle" checked={randomize} onCheckedChange={setRandomize} />
            </div>

            <Button className="w-full gap-2 mt-4" onClick={saveExamDetails} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </CardContent>
        </Card>

        {/* Questions Section */}
        <Card className="md:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Exam Questions ({attachedQuestions.length})</CardTitle>
              <CardDescription>Questions assigned to this exam attempt.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddDialogOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" /> Add Question
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {attachedQuestions.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No questions added to this exam yet. Click "Add Question" to select from the Question Bank.
              </p>
            ) : (
              attachedQuestions.map((q, idx) => (
                <div key={q.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {idx + 1}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{QUESTION_TYPE_LABELS[q.question_type]}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{DIFFICULTY_LABELS[q.difficulty]}</Badge>
                    </div>
                    <p className="text-sm font-medium pt-1">{q.question_text}</p>
                    <p className="text-xs text-muted-foreground">{q.options.length} options</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeQuestionFromExam(q.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Question Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Question from Bank</DialogTitle>
            <DialogDescription>Select an existing question to attach to this exam.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Select Question</Label>
              <Select value={selectedQId} onValueChange={setSelectedQId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a question..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {availableQuestions.length === 0 ? (
                    <div className="p-2 text-xs text-center text-muted-foreground">No remaining questions in bank</div>
                  ) : (
                    availableQuestions.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.question_text.slice(0, 60)}... ({DIFFICULTY_LABELS[q.difficulty]})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={addQuestionToExam} disabled={!selectedQId}>Add to Exam</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
