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
import { fetchExamDetailById } from '@/lib/exam-service';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Languages, Globe, Share2, Copy, MessageCircle } from 'lucide-react';

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
  exit: string;
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
  backToExams: string;
  viewCert: string;
  score: string;
  correct: string;
  finalizing: string;
  share: string;
  copyLink: string;
  whatsApp: string;
  noQuestions: string;
  singleChoice: string;
  multiChoice: string;
}> = {
  en: {
    name: 'English', flag: '🇬🇧', dir: 'ltr',
    exit: 'Exit Exam', questions: 'questions', answered: 'answered', passMark: 'Pass mark',
    submit: 'Submit Exam', submitting: 'Submitting…', timeRemaining: 'Time Remaining',
    passedTitle: 'Exam Passed!', failedTitle: 'Exam Failed',
    passedMsg: 'A certificate has been generated and your training marked complete.',
    failedMsg: 'You did not meet the pass mark. Please review the material and retry.',
    retry: 'Retry Exam', backToExams: 'Back to Exams', viewCert: 'View Certificate',
    score: 'Score', correct: 'Correct', finalizing: 'Submitting will finalize your attempt.',
    share: 'Share Exam', copyLink: 'Copy Link', whatsApp: 'WhatsApp',
    noQuestions: 'This exam has no questions available.',
    singleChoice: 'Single Choice', multiChoice: 'Multiple Choice',
  },
  hi: {
    name: 'हिंदी (Hindi)', flag: '🇮🇳', dir: 'ltr',
    exit: 'परीक्षा से बाहर निकलें', questions: 'प्रश्न', answered: 'उत्तर दिए गए', passMark: 'उत्तीर्ण अंक',
    submit: 'परीक्षा जमा करें', submitting: 'जमा किया जा रहा है…', timeRemaining: 'शेष समय',
    passedTitle: 'परीक्षा उत्तीर्ण!', failedTitle: 'परीक्षा अनुत्तीर्ण',
    passedMsg: 'एक प्रमाण पत्र तैयार किया गया है और आपका प्रशिक्षण पूर्ण चिह्नित किया गया है।',
    failedMsg: 'आप उत्तीर्ण अंक प्राप्त नहीं कर सके। कृपया सामग्री की समीक्षा करें और पुनः प्रयास करें।',
    retry: 'पुनः परीक्षा दें', backToExams: 'परीक्षाओं पर वापस जाएँ', viewCert: 'प्रमाणपत्र देखें',
    score: 'अंक', correct: 'सही', finalizing: 'जमा करने से आपका प्रयास अंतिम रूप से दर्ज हो जाएगा।',
    share: 'परीक्षा शेयर करें', copyLink: 'लिंक कॉपी करें', whatsApp: 'व्हाट्सएप',
    noQuestions: 'इस परीक्षा में कोई प्रश्न उपलब्ध नहीं हैं।',
    singleChoice: 'एकल विकल्प', multiChoice: 'बहु विकल्प',
  },
  ur: {
    name: 'اردو (Urdu)', flag: '🇵🇰', dir: 'rtl',
    exit: 'امتحان سے باہر نکلیں', questions: 'سوالات', answered: 'جواب دیے گئے', passMark: 'پاسنگ مارکس',
    submit: 'امتحان جمع کریں', submitting: 'جمع ہو رہا ہے…', timeRemaining: 'بقیہ وقت',
    passedTitle: 'امتحان پاس ہو گیا!', failedTitle: 'امتحان ناکام ہو گیا',
    passedMsg: 'ایک سرٹیفکیٹ تیار کر دیا گیا ہے اور آپ کی تربیت مکمل نشان زد کر دی گئی ہے۔',
    failedMsg: 'آپ پاسنگ مارکس حاصل نہیں کر سکے۔ براہ کرم مواد کا جائزہ لیں اور دوبارہ کوشش کریں۔',
    retry: 'دوبارہ امتحان دیں', backToExams: 'امتحانات پر واپس جائیں', viewCert: 'سرٹیفکیٹ دیکھیں',
    score: 'اسکور', correct: 'درست', finalizing: 'جمع کرنے سے آپ کی کوشش حتمی ہو جائے گی۔',
    share: 'امتحان شیئر کریں', copyLink: 'لنک کاپی کریں', whatsApp: 'واٹس ایپ',
    noQuestions: 'اس امتحان میں کوئی سوال دستیاب نہیں ہے۔',
    singleChoice: 'واحد انتخاب', multiChoice: 'متعدد التخواب',
  },
  ar: {
    name: 'العربية (Arabic)', flag: '🇸🇦', dir: 'rtl',
    exit: 'الخروج من الاختبار', questions: 'أسئلة', answered: 'تمت الإجابة', passMark: 'درجة النجاح',
    submit: 'إرسال الاختبار', submitting: 'جاري الإرسال…', timeRemaining: 'الوقت المتبقي',
    passedTitle: 'نجحت في الاختبار!', failedTitle: 'لم تجتز الاختبار',
    passedMsg: 'تم إصدار الشهادة واعتبار التدريب مكتملاً بنجاح.',
    failedMsg: 'لم تحقق درجة النجاح المطلوب. يرجى مراجعة المحتوى وإعادة المحاولة.',
    retry: 'إعادة الاختبار', backToExams: 'العودة للاختبارات', viewCert: 'عرض الشهادة',
    score: 'الدرجة', correct: 'الإجابات الصحيحة', finalizing: 'سيؤدي الإرسال إلى إنهاء محاولتك.',
    share: 'مشاركة الاختبار', copyLink: 'نسخ الرابط', whatsApp: 'واتساب',
    noQuestions: 'لا توجد أسئلة متاحة في هذا الاختبار.',
    singleChoice: 'خيار واحد', multiChoice: 'خيارات متعددة',
  },
  tl: {
    name: 'Tagalog (Filipino)', flag: '🇵🇭', dir: 'ltr',
    exit: 'Umalis sa Pagsusulit', questions: 'mga tanong', answered: 'nasagot na', passMark: 'Pasa na Marka',
    submit: 'Isumite ang Pagsusulit', submitting: 'Nagsusumite…', timeRemaining: 'Natitirang Oras',
    passedTitle: 'Pasa ang Pagsusulit!', failedTitle: 'Bagsak sa Pagsusulit',
    passedMsg: 'Gumawa na ng sertipiko at nakumpleto na ang iyong pagsasanay.',
    failedMsg: 'Hindi mo naabot ang kinakailangang marka. Mangyaring suriin ang aralin at sumubok muli.',
    retry: 'Subukang Muli', backToExams: 'Bumalik sa Pagsusulit', viewCert: 'Tingnan ang Sertipiko',
    score: 'Marka', correct: 'Tumpak', finalizing: 'Ang pagsumite ay magtatapos sa iyong pagsubok.',
    share: 'Ibahagi ang Pagsusulit', copyLink: 'Kopyahin ang Link', whatsApp: 'WhatsApp',
    noQuestions: 'Walang available na mga tanong sa pagsusulit na ito.',
    singleChoice: 'Isang Pagpipilian', multiChoice: 'Maraming Pagpipilian',
  },
};

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
  const [lang, setLang] = useState<LangKey>('en');

  const t = DICT[lang];

  const load = useCallback(async () => {
    const examId = params.id;
    setLoading(true);
    const { exam: ex, attachedQuestions: questions } = await fetchExamDetailById(examId);

    if (!ex) { setLoading(false); return; }

    let finalQs = questions;
    if (ex.randomize_questions) {
      finalQs = [...questions].sort(() => Math.random() - 0.5);
    }

    setExam({ exam: ex as Exam & { course: Course }, course: ex.course ?? null, questions: finalQs });
    // Convert time_limit_minutes to seconds
    const minutes = (ex as Exam).time_limit_minutes ?? 30;
    setTimeLeft(minutes * 60);
    setLoading(false);
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  // Timer Countdown
  useEffect(() => {
    if (!exam || result || timeLeft <= 0) return;
    const interval = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(interval);
  }, [exam, result, timeLeft]);

  // Auto-submit when time reaches 0
  useEffect(() => {
    if (timeLeft === 0 && exam && !result && !submitting) {
      toast({ title: 'Time expired!', description: 'Your exam time has ended and was automatically submitted.' });
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

    setResult({ passed, percentage, correct, total });

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

      if (exam.exam.course_id) {
        const { data: trainings } = await supabase
          .from('trainings')
          .select('id')
          .eq('driver_id', profile.driver_id)
          .eq('course_id', exam.exam.course_id)
          .in('status', ['assigned', 'in_progress']);

        if (trainings && trainings.length) {
          await supabase.from('trainings').update({
            status: 'completed', completed_date: new Date().toISOString().slice(0, 10), score: percentage,
          }).in('id', trainings.map((tr: { id: string }) => tr.id));
        }
      }
      await logAudit('complete', 'exam', `Passed exam: ${exam.exam.title} (${percentage}%)`, { attempt_id: attempt.id }, attempt.id);
    } else {
      if (exam.exam.course_id) {
        const { data: trainings } = await supabase
          .from('trainings')
          .select('id')
          .eq('driver_id', profile.driver_id)
          .eq('course_id', exam.exam.course_id)
          .in('status', ['assigned', 'in_progress']);

        if (trainings && trainings.length) {
          await supabase.from('trainings').update({ status: 'failed', score: percentage }).in('id', trainings.map((tr: { id: string }) => tr.id));
        }
      }
      await logAudit('fail_exam', 'exam', `Failed exam: ${exam.exam.title} (${percentage}%)`, { attempt_id: attempt.id }, attempt.id);
    }
    setSubmitting(false);
  }

  if (loading) {
    return <div className="space-y-4 py-8"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!exam) {
    return <div className="py-12 text-center text-muted-foreground">Exam not found.</div>;
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg py-8" dir={t.dir}>
        <Card className="text-center">
          <CardHeader>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: result.passed ? 'hsl(var(--success) / 0.15)' : 'hsl(var(--destructive) / 0.15)' }}>
              {result.passed ? <CheckCircle2 className="h-10 w-10 text-success" /> : <XCircle className="h-10 w-10 text-destructive" />}
            </div>
            <CardTitle className="mt-4 text-2xl">{result.passed ? t.passedTitle : t.failedTitle}</CardTitle>
            <CardDescription>{exam.exam.title}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">{t.score}</p>
                <p className="text-xl font-bold tabular-nums">{result.percentage}%</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">{t.correct}</p>
                <p className="text-xl font-bold tabular-nums">{result.correct}/{result.total}</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">{t.passMark}</p>
                <p className="text-xl font-bold tabular-nums">{exam.exam.pass_percentage}%</p>
              </div>
            </div>
            {result.passed ? (
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {t.passedMsg}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t.failedMsg}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => router.push('/exams')}>{t.backToExams}</Button>
              {!result.passed && <Button className="flex-1" onClick={() => window.location.reload()}>{t.retry}</Button>}
              {result.passed && <Button className="flex-1" onClick={() => router.push(`/drivers/${profile?.driver_id}`)}>{t.viewCert}</Button>}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).filter((k) => answers[k].length > 0).length;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeUrgent = timeLeft <= 60;
  const timeWarn = timeLeft <= 300 && !timeUrgent;

  return (
    <div className="mx-auto max-w-3xl space-y-4" dir={t.dir}>
      {/* Top Header & Language Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push('/exams')} className="-ml-2 gap-1">
          <ArrowLeft className="h-4 w-4" /> {t.exit}
        </Button>

        <div className="flex items-center gap-2 bg-card border rounded-lg p-1">
          <Languages className="h-4 w-4 text-primary ml-1.5" />
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

      <Card className={timeUrgent ? 'border-destructive shadow-md animate-pulse' : timeWarn ? 'border-amber-500/50' : ''}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">{exam.exam.title}</CardTitle>
            <CardDescription>{exam.course?.title} · {exam.questions.length} {t.questions}</CardDescription>
          </div>

          <div className={`flex items-center gap-2 rounded-lg px-3.5 py-2 font-mono text-sm font-bold border transition-colors ${
            timeUrgent
              ? 'bg-red-500/10 text-red-600 border-red-500/40 dark:text-red-400'
              : timeWarn
              ? 'bg-amber-500/10 text-amber-600 border-amber-500/40 dark:text-amber-400'
              : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/40 dark:text-emerald-400'
          }`}>
            <Clock className="h-4 w-4 shrink-0" />
            <span>{minutes}:{seconds.toString().padStart(2, '0')}</span>
          </div>
        </CardHeader>

        <CardContent>
          <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>{answeredCount} of {exam.questions.length} {t.answered}</span>
            <span>{t.passMark}: {exam.exam.pass_percentage}%</span>
          </div>

          {exam.questions.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t.noQuestions}</p>
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
                        <p className="mt-0.5 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{isMulti ? t.multiChoice : t.singleChoice}</p>
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
          <AlertCircle className="h-3.5 w-3.5" /> {t.finalizing}
        </p>
        <Button onClick={submit} disabled={submitting || exam.questions.length === 0} size="lg">
          {submitting ? t.submitting : t.submit}
        </Button>
      </div>
    </div>
  );
}
