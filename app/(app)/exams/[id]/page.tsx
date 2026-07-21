'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { useAuth, isStaff } from '@/lib/auth-context';
import type { Exam, Course, Question, QuestionType, DifficultyLevel } from '@/lib/database-types';
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
import { ArrowLeft, Plus, Trash2, HelpCircle, Save, CheckCircle2, Clock, Share2, Copy, MessageCircle, ExternalLink } from 'lucide-react';
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

  // Multi-select question states
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);
  const [qSearch, setQSearch] = useState('');

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState('');
  const [passPercentage, setPassPercentage] = useState('70');
  const [timeLimit, setTimeLimit] = useState('30');
  const [validDays, setValidDays] = useState('30');
  const [isActive, setIsActive] = useState(true);
  const [randomize, setRandomize] = useState(true);

  const filteredAvailableQuestions = useMemo(() => {
    return availableQuestions.filter((q) =>
      q.question_text.toLowerCase().includes(qSearch.toLowerCase()) ||
      (q.category ?? '').toLowerCase().includes(qSearch.toLowerCase()) ||
      q.difficulty.toLowerCase().includes(qSearch.toLowerCase())
    );
  }, [availableQuestions, qSearch]);

  function toggleQuestionSelect(qId: string) {
    setSelectedQIds((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    );
  }

  function selectAllQuestions() {
    setSelectedQIds(filteredAvailableQuestions.map((q) => q.id));
  }

  function clearQuestionSelection() {
    setSelectedQIds([]);
  }

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

  function copyShareableLink() {
    if (!exam) return;
    const url = `${window.location.origin}/exams/${exam.id}/take`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied to clipboard!', description: 'Drivers can use this link to take the exam.' });
  }

  function shareOnWhatsApp() {
    if (!exam) return;
    const url = `${window.location.origin}/exams/${exam.id}/take`;
    const message = `📋 SafeFleet Evaluation Exam: ${exam.title}\n\nPlease click the link below to take your assigned evaluation exam:\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
  }

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

  async function addQuestionsToExam() {
    if (!exam || selectedQIds.length === 0) return;

    let addedCount = 0;
    for (let i = 0; i < selectedQIds.length; i++) {
      const qId = selectedQIds[i];
      const nextOrder = attachedQuestions.length + i + 1;
      const { error } = await addQuestionToExamRecord(exam.id, qId, nextOrder);
      if (!error) addedCount++;
    }

    toast({ title: 'Questions Added', description: `Successfully attached ${addedCount} question(s) to exam.` });
    setSelectedQIds([]);
    setAddDialogOpen(false);
    setQSearch('');
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
        description="Configure exam settings, pass thresholds, share links, and attach questions."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyShareableLink} className="gap-1.5">
              <Copy className="h-4 w-4" /> Copy Share Link
            </Button>
            <Button variant="default" size="sm" onClick={shareOnWhatsApp} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs">
              <MessageCircle className="h-4 w-4" /> Share to WhatsApp
            </Button>
          </div>
        }
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
              <Plus className="h-4 w-4" /> Add Questions ({availableQuestions.length} available)
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {attachedQuestions.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No questions added to this exam yet. Click "Add Questions" to select multiple items from the Question Bank.
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

      {/* Multi-Select Add Questions Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Questions from Bank</DialogTitle>
            <DialogDescription>
              Select single or multiple questions from your question bank to attach to this exam.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">
                Available Questions ({selectedQIds.length} of {availableQuestions.length} selected)
              </Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAllQuestions} className="h-6 text-[11px] px-2 text-primary">
                  Select All ({filteredAvailableQuestions.length})
                </Button>
                {selectedQIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearQuestionSelection} className="h-6 text-[11px] px-2 text-muted-foreground">
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <Input
              placeholder="Search questions by text, category, or difficulty..."
              value={qSearch}
              onChange={(e) => setQSearch(e.target.value)}
              className="h-8 text-xs"
            />

            <div className="max-h-60 overflow-y-auto rounded-lg border bg-card p-2 space-y-2">
              {filteredAvailableQuestions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No matching questions available in bank.</p>
              ) : (
                filteredAvailableQuestions.map((q) => {
                  const isChecked = selectedQIds.includes(q.id);
                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleQuestionSelect(q.id)}
                      className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked ? 'bg-primary/10 border-primary/40' : 'hover:bg-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary accent-primary shrink-0"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px]">{QUESTION_TYPE_LABELS[q.question_type]}</Badge>
                          <Badge variant="secondary" className="text-[9px]">{DIFFICULTY_LABELS[q.difficulty]}</Badge>
                        </div>
                        <p className="font-medium text-foreground leading-snug">{q.question_text}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={addQuestionsToExam} disabled={selectedQIds.length === 0}>
              {selectedQIds.length > 0
                ? `Add ${selectedQIds.length} Question(s) to Exam`
                : 'Add Questions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
