'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import type { Exam, Question, Course, ExamAttempt } from '@/lib/database-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Clock, CheckCircle2, XCircle, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

interface ExamData {
  exam: Exam;
  course: Course | null;
  questions: Question[];
}

export default function TakeExamPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [exam, setExam] = useState<ExamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; percentage: number; correct: number; total: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const examId = params.id;
    const { data: ex } = await supabase.from('exams').select('*, course:courses(*)').eq('id', examId).maybeSingle();
    if (!ex) { setLoading(false); return; }
    const { data: eq } = await supabase.from('exam_questions').select('question_id').eq('exam_id', examId);
    const qIds = (eq ?? []).map((x: { question_id: string }) => x.question_id);
    let questions: Question[] = [];
    if (qIds.length) {
      const { data: qs } = await supabase.from('questions').select('*').in('id', qIds);
      questions = (qs ?? []) as Question[];
      if (ex.randomize_questions) {
        questions = [...questions].sort(() => Math.random() - 0.5);
      }
    }
    setExam({ exam: ex as Exam & { course: Course }, course: (ex as Exam & { course: Course }).course, questions });
    setTimeLeft((ex as Exam).time_limit_minutes ?? 30);
    setLoading(false);
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  // Timer
  useEffect(() => {
    if (!exam || result || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [exam, result, timeLeft]);

  useEffect(() => {
    if (timeLeft === 0 && exam && !result && !submitting) {
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  function setAnswer(qId: string, optionIdx: number, multi: boolean) {
    setAnswers((prev) => {
      const cur = prev[qId] ?? [];
      if (multi) {
        return { ...prev, [qId]: cur.includes(optionIdx) ? cur.filter((i) => i !== optionIdx) : [...cur, optionIdx] };
      }
      return { ...prev, [qId]: [optionIdx] };
    });
  }

  async function submit() {
    if (!exam || !profile?.driver_id || submitting || result) return;
    setSubmitting(true);
    let correct = 0;
    exam.questions.forEach((q) => {
      const userAns = (answers[q.id] ?? []).sort();
      const correctAns = [...q.correct_answers].sort();
      if (userAns.length === correctAns.length && userAns.every((v, i) => v === correctAns[i])) correct++;
    });
    const total = exam.questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = percentage >= exam.exam.pass_percentage;

    const { data: attempt, error } = await supabase.from('exam_attempts').insert({
      exam_id: exam.exam.id,
      driver_id: profile.driver_id,
      completed_at: new Date().toISOString(),
      score: correct,
      total_questions: total,
      correct_answers: correct,
      percentage,
      passed,
      answers,
    }).select().single();

    if (error) {
      toast({ title: 'Submit failed', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    setAttemptId(attempt.id);
    setResult({ passed, percentage, correct, total });

    // If passed, generate certificate and mark related training complete
    if (passed) {
      const certNum = `CERT-${Date.now().toString(36).toUpperCase()}`;
      if (exam.exam.course_id) {
        await supabase.from('certificates').insert({
          driver_id: profile.driver_id,
          course_id: exam.exam.course_id,
          exam_attempt_id: attempt.id,
          certificate_number: certNum,
        });
      }

      // Mark any assigned/in_progress training for this course as completed
      if (exam.exam.course_id) {
        const { data: trainings } = await supabase
          .from('trainings')
          .select('id')
          .eq('driver_id', profile.driver_id)
          .eq('course_id', exam.exam.course_id)
          .in('status', ['assigned', 'in_progress']);

        if (trainings && trainings.length) {
          const { error: updErr } = await supabase.from('trainings').update({
            status: 'completed', completed_date: new Date().toISOString().slice(0, 10), score: percentage,
          }).in('id', trainings.map((t: { id: string }) => t.id));

          if (updErr) {
            console.error('Failed to update training status to completed:', updErr);
          }
        }
      }
      await logAudit('complete', 'exam', `Passed exam: ${exam.exam.title} (${percentage}%)`, { attempt_id: attempt.id }, attempt.id);
    } else {
      // Mark related training as failed
      if (exam.exam.course_id) {
        const { data: trainings } = await supabase
          .from('trainings')
          .select('id')
          .eq('driver_id', profile.driver_id)
          .eq('course_id', exam.exam.course_id)
          .in('status', ['assigned', 'in_progress']);

        if (trainings && trainings.length) {
          const { error: updErr } = await supabase.from('trainings').update({ status: 'failed', score: percentage }).in('id', trainings.map((t: { id: string }) => t.id));
          if (updErr) {
            console.error('Failed to update training status to failed:', updErr);
          }
        }
      }
      await logAudit('fail_exam', 'exam', `Failed exam: ${exam.exam.title} (${percentage}%)`, { attempt_id: attempt.id }, attempt.id);
    }
    setSubmitting(false);
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!exam) {
    return <div className="py-12 text-center text-muted-foreground">Exam not found.</div>;
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <Card className="text-center">
          <CardHeader>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: result.passed ? 'hsl(var(--success) / 0.15)' : 'hsl(var(--destructive) / 0.15)' }}>
              {result.passed ? <CheckCircle2 className="h-10 w-10 text-success" /> : <XCircle className="h-10 w-10 text-destructive" />}
            </div>
            <CardTitle className="mt-4 text-2xl">{result.passed ? 'Exam Passed!' : 'Exam Failed'}</CardTitle>
            <CardDescription>{exam.exam.title}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Score</p>
                <p className="text-xl font-bold tabular-nums">{result.percentage}%</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Correct</p>
                <p className="text-xl font-bold tabular-nums">{result.correct}/{result.total}</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Pass Mark</p>
                <p className="text-xl font-bold tabular-nums">{exam.exam.pass_percentage}%</p>
              </div>
            </div>
            {result.passed ? (
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                A certificate has been generated and your training marked complete.
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                You did not meet the pass mark. Please review the material and retry.
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => router.push('/exams')}>Back to Exams</Button>
              {!result.passed && <Button className="flex-1" onClick={() => window.location.reload()}>Retry</Button>}
              {result.passed && <Button className="flex-1" onClick={() => router.push(`/drivers/${profile?.driver_id}`)}>View Certificate</Button>}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).filter((k) => answers[k].length > 0).length;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeWarn = timeLeft <= 60;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" onClick={() => router.push('/exams')} className="-ml-2 gap-1">
        <ArrowLeft className="h-4 w-4" /> Exit Exam
      </Button>

      <Card className={timeWarn ? 'border-destructive/40' : ''}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">{exam.exam.title}</CardTitle>
            <CardDescription>{exam.course?.title} · {exam.questions.length} questions</CardDescription>
          </div>
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-sm font-bold ${timeWarn ? 'bg-destructive/10 text-destructive' : 'bg-muted'}`}>
            <Clock className="h-4 w-4" /> {minutes}:{seconds.toString().padStart(2, '0')}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>{answeredCount} of {exam.questions.length} answered</span>
            <span>Pass mark: {exam.exam.pass_percentage}%</span>
          </div>
          {exam.questions.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">This exam has no questions yet.</p>
          ) : (
            <div className="space-y-6">
              {exam.questions.map((q, idx) => {
                const isMulti = q.question_type === 'multiple_select';
                return (
                  <div key={q.id} className="rounded-lg border p-4">
                    <div className="mb-3 flex items-start gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
                      <div>
                        <p className="text-sm font-medium">{q.question_text}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground uppercase">{q.question_type.replace('_', ' ')}</p>
                      </div>
                    </div>
                    {isMulti ? (
                      <div className="space-y-2 pl-8">
                        {q.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Checkbox id={`${q.id}-${i}`} checked={(answers[q.id] ?? []).includes(i)} onCheckedChange={() => setAnswer(q.id, i, true)} />
                            <Label htmlFor={`${q.id}-${i}`} className="text-sm cursor-pointer font-normal">{opt}</Label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <RadioGroup value={String((answers[q.id] ?? [])[0] ?? '')} onValueChange={(v) => setAnswer(q.id, Number(v), false)} className="space-y-2 pl-8">
                        {q.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <RadioGroupItem value={String(i)} id={`${q.id}-${i}`} />
                            <Label htmlFor={`${q.id}-${i}`} className="text-sm cursor-pointer font-normal">{opt}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" /> Submitting will finalize your attempt.
        </p>
        <Button onClick={submit} disabled={submitting || exam.questions.length === 0} size="lg">
          {submitting ? 'Submitting…' : 'Submit Exam'}
        </Button>
      </div>
    </div>
  );
}
