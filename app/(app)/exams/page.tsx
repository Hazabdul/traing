'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { useAuth, isStaff } from '@/lib/auth-context';
import type { Exam, Course, ExamAttempt } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { ClipboardCheck, Clock, CheckCircle2, XCircle, Play, Plus, Settings, Copy, MessageCircle } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { createExamRecord, fetchAllExams } from '@/lib/exam-service';

export default function ExamsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const staff = isStaff(profile?.role);
  const [exams, setExams] = useState<(Exam & { course: Course | null; questionCount: number })[]>([]);
  const [attempts, setAttempts] = useState<(ExamAttempt & { exam: { title: string } | null })[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Exam modal states
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState('');
  const [passPercentage, setPassPercentage] = useState('70');
  const [timeLimit, setTimeLimit] = useState('30');

  const load = useCallback(async () => {
    setLoading(true);
    const [allEx, { data: c }] = await Promise.all([
      fetchAllExams(),
      supabase.from('courses').select('*').order('title'),
    ]);
    setExams(allEx);
    setCourses((c ?? []) as Course[]);

    // Load attempts for current driver
    if (profile?.driver_id) {
      const { data: att } = await supabase
        .from('exam_attempts')
        .select('*, exam:exams(title)')
        .eq('driver_id', profile.driver_id)
        .order('started_at', { ascending: false });
      setAttempts((att ?? []) as (ExamAttempt & { exam: { title: string } | null })[]);
    }
    setLoading(false);
  }, [profile?.driver_id]);

  useEffect(() => { load(); }, [load]);

  async function startExam(examId: string) {
    if (!profile?.driver_id) {
      toast({ title: 'No driver profile linked', description: 'Only driver accounts can take exams.', variant: 'destructive' });
      return;
    }
    router.push(`/exams/${examId}/take`);
  }

  async function createExam() {
    if (!title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    setCreating(true);
    const { data: newExam, error } = await createExamRecord({
      title,
      description: description || null,
      course_id: courseId || null,
      pass_percentage: Number(passPercentage) || 70,
      time_limit_minutes: Number(timeLimit) || 30,
      is_active: true,
    });

    setCreating(false);
    if (error || !newExam) {
      toast({ title: 'Failed to create exam', description: error?.message ?? 'Permission or connection error', variant: 'destructive' });
      return;
    }

    await logAudit('create', 'exam', `Created exam: ${title}`, {}, newExam.id);
    toast({ title: 'Exam created successfully' });
    setCreateOpen(false);
    setTitle(''); setDescription(''); setCourseId('');
    router.push(`/exams/${newExam.id}`);
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examinations"
        description={staff ? 'Manage exams and question banks.' : 'Take your assigned exams.'}
        actions={
          staff ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => router.push('/exams/questions')}>
                Question Bank
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1">
                <Plus className="h-4 w-4" /> Create Exam
              </Button>
            </div>
          ) : undefined
        }
      />

      <Tabs defaultValue="available">
        <TabsList>
          <TabsTrigger value="available">Available Exams</TabsTrigger>
          {!staff && <TabsTrigger value="history">My Results ({attempts.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="available" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {exams.length === 0 && <p className="col-span-full py-12 text-center text-sm text-muted-foreground">No exams available.</p>}
            {exams.map((ex) => (
              <Card key={ex.id} className="flex flex-col transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <ClipboardCheck className="h-5 w-5" />
                    </div>
                    <div className="flex gap-1">
                      {!ex.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                      <Badge variant="outline" className="text-[10px]">{ex.questionCount} Qs</Badge>
                    </div>
                  </div>
                  <CardTitle className="text-base leading-tight">{ex.title}</CardTitle>
                  <CardDescription className="text-xs">{ex.course?.title ?? 'General Exam'}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  {ex.description && <p className="text-xs text-muted-foreground line-clamp-2">{ex.description}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {ex.time_limit_minutes ?? 30} min</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Pass {ex.pass_percentage}%</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={() => {
                        const url = `${window.location.origin}/exams/${ex.id}/take`;
                        navigator.clipboard.writeText(url);
                        toast({ title: 'Shareable link copied!', description: 'Exam URL copied to clipboard.' });
                      }}>
                        <Copy className="h-3.5 w-3.5" /> Copy Link
                      </Button>
                      <Button variant="default" size="sm" className="flex-1 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                        const url = `${window.location.origin}/exams/${ex.id}/take`;
                        const msg = `📋 SafeFleet Evaluation Exam: ${ex.title}\n\nPlease click the link to start your exam:\n${url}`;
                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
                      }}>
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </Button>
                    </div>

                    {!staff ? (
                      <Button size="sm" className="w-full gap-1" onClick={() => startExam(ex.id)} disabled={ex.questionCount === 0 || !ex.is_active}>
                        <Play className="h-4 w-4" /> Start Exam
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="w-full gap-1 border-primary/30 text-primary hover:bg-primary/10" onClick={() => router.push(`/exams/${ex.id}`)}>
                        <Settings className="h-4 w-4" /> Manage Exam Configuration
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {!staff && (
          <TabsContent value="history">
            <Card>
              <CardHeader><CardTitle className="text-base">Exam Results</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {attempts.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No attempts yet.</p>}
                {attempts.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
                    {a.passed ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.exam?.title ?? 'Exam'}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(a.started_at)} · {a.correct_answers}/{a.total_questions} · {a.percentage}%</p>
                    </div>
                    <Badge variant="secondary" className={a.passed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}>
                      {a.passed ? 'Passed' : 'Failed'}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Create Exam Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Exam</DialogTitle>
            <DialogDescription>Define basic exam details and link it to a course.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="text-xs">Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Defensive Driving Final Assessment" />
            </div>
            <div>
              <Label className="text-xs">Associated Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger><SelectValue placeholder="Select course (optional)" /></SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Exam guidelines or instructions..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Pass Percentage (%)</Label>
                <Input type="number" value={passPercentage} onChange={(e) => setPassPercentage(e.target.value)} min={1} max={100} />
              </div>
              <div>
                <Label className="text-xs">Time Limit (mins)</Label>
                <Input type="number" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} min={1} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createExam} disabled={creating}>{creating ? 'Creating...' : 'Create Exam'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
