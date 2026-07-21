'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import type { Exam, Question, Course, Driver } from '@/lib/database-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Clock, CheckCircle2, XCircle, AlertTriangle, Shield, Languages, UserCheck, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fetchExamDetailById } from '@/lib/exam-service';

interface ExamData {
  exam: Exam;
  course: Course | null;
  questions: Question[];
}

type LangKey = 'en' | 'hi' | 'ur' | 'ar' | 'tl';

const DICT: Record<LangKey, {
  name: string;
  flag: string;
  dir: 'ltr' | 'rtl';
  questions: string;
  answered: string;
  passMark: string;
  submit: string;
  submitting: string;
  timeRemaining: string;
  passedTitle: string;
  failedTitle: string;
  passedMsg: string;
  failedMsg: string;
  retry: string;
  score: string;
  correct: string;
  finalizing: string;
  selectDriver: string;
  driverLabel: string;
  startBtn: string;
}> = {
  en: {
    name: 'English', flag: '🇬🇧', dir: 'ltr',
    questions: 'questions', answered: 'answered', passMark: 'Pass mark',
    submit: 'Submit Exam', submitting: 'Submitting…', timeRemaining: 'Time Remaining',
    passedTitle: 'Exam Passed!', failedTitle: 'Exam Failed',
    passedMsg: 'Congratulations! A certificate has been generated and your training marked complete.',
    failedMsg: 'You did not meet the pass mark. Please review the training material and retry.',
    retry: 'Retry Exam', score: 'Score', correct: 'Correct',
    finalizing: 'Submitting will finalize your attempt.',
    selectDriver: 'Identify Yourself to Start', driverLabel: 'Select Your Name / Employee ID',
    startBtn: 'Start Examination',
  },
  hi: {
    name: 'हिंदी (Hindi)', flag: '🇮🇳', dir: 'ltr',
    questions: 'प्रश्न', answered: 'उत्तर दिए गए', passMark: 'उत्तीर्ण अंक',
    submit: 'परीक्षा जमा करें', submitting: 'जमा किया जा रहा है…', timeRemaining: 'शेष समय',
    passedTitle: 'परीक्षा उत्तीर्ण!', failedTitle: 'परीक्षा अनुत्तीर्ण',
    passedMsg: 'बधाई हो! एक प्रमाण पत्र तैयार किया गया है और आपका प्रशिक्षण पूर्ण चिह्नित किया गया है।',
    failedMsg: 'आप उत्तीर्ण अंक प्राप्त नहीं कर सके। कृपया प्रशिक्षण सामग्री की समीक्षा करें और पुनः प्रयास करें।',
    retry: 'पुनः परीक्षा दें', score: 'अंक', correct: 'सही',
    finalizing: 'जमा करने से आपका प्रयास अंतिम रूप से दर्ज हो जाएगा।',
    selectDriver: 'शुरू करने के लिए अपनी पहचान चुनें', driverLabel: 'अपना नाम / कर्मचारी आईडी चुनें',
    startBtn: 'परीक्षा शुरू करें',
  },
  ur: {
    name: 'اردو (Urdu)', flag: '🇵🇰', dir: 'rtl',
    questions: 'سوالات', answered: 'جواب دیے گئے', passMark: 'پاسنگ مارکس',
    submit: 'امتحان جمع کریں', submitting: 'جمع ہو رہا ہے…', timeRemaining: 'بقیہ وقت',
    passedTitle: 'امتحان پاس ہو گیا!', failedTitle: 'امتحان ناکام ہو گیا',
    passedMsg: 'مبارک ہو! ایک سرٹیفکیٹ تیار کر دیا گیا ہے اور آپ کی تربیت مکمل نشان زد کر دی گئی ہے۔',
    failedMsg: 'آپ پاسنگ مارکس حاصل نہیں کر سکے۔ براہ کرم تربیتی مواد کا جائزہ لیں اور دوبارہ کوشش کریں۔',
    retry: 'دوبارہ امتحان دیں', score: 'اسکور', correct: 'درست',
    finalizing: 'جمع کرنے سے آپ کی کوشش حتمی ہو جائے گی۔',
    selectDriver: 'شروع کرنے کے لیے اپنی شناخت منتخب کریں', driverLabel: 'اپنا نام / ملازم آئی ڈی منتخب کریں',
    startBtn: 'امتحان شروع کریں',
  },
  ar: {
    name: 'العربية (Arabic)', flag: '🇸🇦', dir: 'rtl',
    questions: 'أسئلة', answered: 'تمت الإجابة', passMark: 'درجة النجاح',
    submit: 'إرسال الاختبار', submitting: 'جاري الإرسال…', timeRemaining: 'الوقت المتبقي',
    passedTitle: 'نجحت في الاختبار!', failedTitle: 'لم تجتز الاختبار',
    passedMsg: 'تهانينا! تم إصدار الشهادة واعتبار التدريب مكتملاً بنجاح.',
    failedMsg: 'لم تحقق درجة النجاح المطلوبة. يرجى مراجعة المحتوى وإعادة المحاولة.',
    retry: 'إعادة الاختبار', score: 'الدرجة', correct: 'الإجابات الصحيحة',
    finalizing: 'سيؤدي الإرسال إلى إنهاء محاولتك.',
    selectDriver: 'حدد هويتك للبدء', driverLabel: 'اختر اسمك / الرقم الوظيفي',
    startBtn: 'بدء الاختبار',
  },
  tl: {
    name: 'Tagalog (Filipino)', flag: '🇵🇭', dir: 'ltr',
    questions: 'mga tanong', answered: 'nasagot na', passMark: 'Pasa na Marka',
    submit: 'Isumite ang Pagsusulit', submitting: 'Nagsusumite…', timeRemaining: 'Natitirang Oras',
    passedTitle: 'Pasa ang Pagsusulit!', failedTitle: 'Bagsak sa Pagsusulit',
    passedMsg: 'Maligayang bati! Gumawa na ng sertipiko at nakumpleto na ang iyong pagsasanay.',
    failedMsg: 'Hindi mo naabot ang kinakailangang marka. Mangyaring suriin ang aralin at sumubok muli.',
    retry: 'Subukang Muli', score: 'Marka', correct: 'Tumpak',
    finalizing: 'Ang pagsumite ay magtatapos sa iyong pagsubok.',
    selectDriver: 'Kilalanin ang Sarili Bago Magsimula', driverLabel: 'Piliin ang Pangalan / Employee ID',
    startBtn: 'Simulan ang Pagsusulit',
  },
};

function PublicTakeExamContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryDriverId = searchParams.get('driver_id');
  const { toast } = useToast();

  const [examData, setExamData] = useState<ExamData | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>(queryDriverId ?? '');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [examStarted, setExamStarted] = useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; percentage: number; correct: number; total: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [lang, setLang] = useState<LangKey>('en');

  const t = DICT[lang];

  // Load Exam and Drivers
  const load = useCallback(async () => {
    const examId = params.id;
    setLoading(true);

    const [{ exam: ex, attachedQuestions: questions }, { data: drvList }] = await Promise.all([
      fetchExamDetailById(examId),
      supabase.from('drivers').select('*').order('full_name'),
    ]);

    if (!ex) { setLoading(false); return; }

    setDrivers(drvList ?? []);

    if (queryDriverId) {
      const match = (drvList ?? []).find((d) => d.id === queryDriverId);
      if (match) setSelectedDriver(match);
    }

    let finalQs = questions;
    if (ex.randomize_questions) {
      finalQs = [...questions].sort(() => Math.random() - 0.5);
    }

    setExamData({ exam: ex as Exam & { course: Course }, course: ex.course ?? null, questions: finalQs });
    const minutes = (ex as Exam).time_limit_minutes ?? 30;
    setTimeLeft(minutes * 60);
    setLoading(false);
  }, [params.id, queryDriverId]);

  useEffect(() => { load(); }, [load]);

  // Handle Driver Selection
  function handleDriverChange(dId: string) {
    setSelectedDriverId(dId);
    const drv = drivers.find((d) => d.id === dId);
    setSelectedDriver(drv ?? null);
  }

  // Timer Countdown (Only when started)
  useEffect(() => {
    if (!examStarted || !examData || result || timeLeft <= 0) return;
    const interval = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(interval);
  }, [examStarted, examData, result, timeLeft]);

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (examStarted && timeLeft === 0 && examData && !result && !submitting) {
      toast({ title: 'Time expired!', description: 'Your exam duration ended and answers were automatically submitted.' });
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, examStarted]);

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
    if (!examData || !selectedDriverId || submitting || result) return;
    setSubmitting(true);

    let correct = 0;
    examData.questions.forEach((q) => {
      const userAns = (answers[q.id] ?? []).sort();
      const correctAns = [...q.correct_answers].sort();
      if (userAns.length === correctAns.length && userAns.every((v, i) => v === correctAns[i])) correct++;
    });

    const total = examData.questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = percentage >= examData.exam.pass_percentage;

    const { data: attempt, error } = await supabase.from('exam_attempts').insert({
      exam_id: examData.exam.id,
      driver_id: selectedDriverId,
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

    setResult({ passed, percentage, correct, total });

    // Certificate generation & training completion
    if (passed && examData.exam.course_id) {
      const certNum = `CERT-${Date.now().toString(36).toUpperCase()}`;
      await supabase.from('certificates').insert({
        driver_id: selectedDriverId,
        course_id: examData.exam.course_id,
        exam_attempt_id: attempt.id,
        certificate_number: certNum,
      });

      const { data: trainings } = await supabase
        .from('trainings')
        .select('id')
        .eq('driver_id', selectedDriverId)
        .eq('course_id', examData.exam.course_id)
        .in('status', ['assigned', 'in_progress']);

      if (trainings && trainings.length) {
        await supabase.from('trainings').update({
          status: 'completed', completed_date: new Date().toISOString().slice(0, 10), score: percentage,
        }).in('id', trainings.map((tr: { id: string }) => tr.id));
      }
    } else if (!passed && examData.exam.course_id) {
      const { data: trainings } = await supabase
        .from('trainings')
        .select('id')
        .eq('driver_id', selectedDriverId)
        .eq('course_id', examData.exam.course_id)
        .in('status', ['assigned', 'in_progress']);

      if (trainings && trainings.length) {
        await supabase.from('trainings').update({ status: 'failed', score: percentage }).in('id', trainings.map((tr: { id: string }) => tr.id));
      }
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl space-y-4">
          <Skeleton className="h-12 w-48 mx-auto" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!examData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-6 space-y-3">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold">Exam Not Found</h2>
          <p className="text-sm text-muted-foreground">The requested evaluation exam is inactive or does not exist.</p>
        </Card>
      </div>
    );
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeUrgent = timeLeft <= 60;
  const timeWarn = timeLeft <= 300 && !timeUrgent;
  const answeredCount = Object.keys(answers).filter((k) => answers[k].length > 0).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-foreground py-8 px-4 sm:px-6" dir={t.dir}>
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Top Public Header & Language Switcher */}
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black text-lg shadow-md">
              SF
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-tight">SafeFleet Academy</h1>
              <p className="text-xs text-muted-foreground">Evaluation Examination Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-card border rounded-xl p-1.5 shadow-xs">
            <Languages className="h-4 w-4 text-primary ml-1" />
            <Select value={lang} onValueChange={(v) => setLang(v as LangKey)}>
              <SelectTrigger className="h-8 border-none bg-transparent text-xs font-semibold focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DICT) as LangKey[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    <span className="mr-1.5">{DICT[k].flag}</span> {DICT[k].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results View */}
        {result ? (
          <Card className="text-center shadow-lg border-primary/20">
            <CardHeader>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: result.passed ? 'hsl(var(--success) / 0.15)' : 'hsl(var(--destructive) / 0.15)' }}>
                {result.passed ? <CheckCircle2 className="h-10 w-10 text-success" /> : <XCircle className="h-10 w-10 text-destructive" />}
              </div>
              <CardTitle className="mt-4 text-2xl">{result.passed ? t.passedTitle : t.failedTitle}</CardTitle>
              <CardDescription>{examData.exam.title} · Driver: {selectedDriver?.full_name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{t.score}</p>
                  <p className="text-xl font-extrabold tabular-nums">{result.percentage}%</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{t.correct}</p>
                  <p className="text-xl font-extrabold tabular-nums">{result.correct}/{result.total}</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{t.passMark}</p>
                  <p className="text-xl font-extrabold tabular-nums">{examData.exam.pass_percentage}%</p>
                </div>
              </div>

              {result.passed ? (
                <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-3.5 text-sm text-success font-medium">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  {t.passedMsg}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive font-medium">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  {t.failedMsg}
                </div>
              )}

              {!result.passed && (
                <Button className="w-full h-11 text-base font-bold shadow-md" onClick={() => window.location.reload()}>
                  {t.retry}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : !examStarted ? (
          /* Step 1: Identify Driver & Start Exam */
          <Card className="shadow-lg border-primary/20">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-2">
                <Shield className="h-7 w-7" />
              </div>
              <CardTitle className="text-xl">{examData.exam.title}</CardTitle>
              <CardDescription>{examData.course?.title ?? 'Safety Evaluation'} · {examData.questions.length} {t.questions}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-2">
              <div className="rounded-xl bg-muted/40 p-4 space-y-2 border text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-bold">{examData.exam.time_limit_minutes ?? 30} Minutes</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pass Threshold:</span>
                  <span className="font-bold">{examData.exam.pass_percentage}%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-primary" /> {t.selectDriver}
                </Label>
                <Select value={selectedDriverId} onValueChange={handleDriverChange}>
                  <SelectTrigger className="h-11 text-sm bg-card">
                    <SelectValue placeholder={t.driverLabel} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">
                        <span className="font-bold">{d.full_name}</span> ({d.employee_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full h-11 text-base font-bold gap-2 shadow-lg"
                disabled={!selectedDriverId}
                onClick={() => setExamStarted(true)}
              >
                <Sparkles className="h-5 w-5 text-amber-300" /> {t.startBtn}
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Step 2: Taking the Exam */
          <div className="space-y-5">
            <Card className={timeUrgent ? 'border-destructive shadow-md animate-pulse' : timeWarn ? 'border-amber-500/50' : 'shadow-md'}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">{examData.exam.title}</CardTitle>
                  <CardDescription>Driver: {selectedDriver?.full_name} ({selectedDriver?.employee_id})</CardDescription>
                </div>

                <div className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-base font-black border transition-colors ${
                  timeUrgent
                    ? 'bg-red-500/10 text-red-600 border-red-500/40 dark:text-red-400'
                    : timeWarn
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/40 dark:text-amber-400'
                    : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/40 dark:text-emerald-400'
                }`}>
                  <Clock className="h-5 w-5 shrink-0" />
                  <span>{minutes}:{seconds.toString().padStart(2, '0')}</span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                  <span>{answeredCount} of {examData.questions.length} {t.answered}</span>
                  <span>{t.passMark}: {examData.exam.pass_percentage}%</span>
                </div>

                {examData.questions.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">This exam has no questions available.</p>
                ) : (
                  <div className="space-y-6">
                    {examData.questions.map((q, idx) => {
                      const isMulti = q.question_type === 'multiple_select';
                      return (
                        <div key={q.id} className="rounded-xl border bg-card p-4 space-y-3 shadow-xs">
                          <div className="flex items-start gap-2.5">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
                            <div>
                              <p className="text-sm font-semibold">{q.question_text}</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground uppercase">{q.question_type.replace('_', ' ')}</p>
                            </div>
                          </div>

                          {isMulti ? (
                            <div className="space-y-2 pl-8">
                              {q.options.map((opt, i) => (
                                <div key={i} className="flex items-center gap-2.5">
                                  <Checkbox id={`${q.id}-${i}`} checked={(answers[q.id] ?? []).includes(i)} onCheckedChange={() => setAnswer(q.id, i, true)} />
                                  <Label htmlFor={`${q.id}-${i}`} className="text-sm cursor-pointer font-normal">{opt}</Label>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <RadioGroup value={String((answers[q.id] ?? [])[0] ?? '')} onValueChange={(v) => setAnswer(q.id, Number(v), false)} className="space-y-2 pl-8">
                              {q.options.map((opt, i) => (
                                <div key={i} className="flex items-center gap-2.5">
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

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" /> {t.finalizing}
              </p>
              <Button onClick={submit} disabled={submitting || examData.questions.length === 0} size="lg" className="h-11 text-base font-bold shadow-md">
                {submitting ? t.submitting : t.submit}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PublicTakeExamPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading exam...</div>}>
      <PublicTakeExamContent />
    </Suspense>
  );
}
