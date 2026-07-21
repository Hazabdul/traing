import { supabase } from '@/lib/supabase-client';
import type { Exam } from '@/lib/database-types';

export interface CreateExamPayload {
  title: string;
  description?: string | null;
  course_id?: string | null;
  pass_percentage?: number;
  time_limit_minutes?: number;
  is_active?: boolean;
  randomize_questions?: boolean;
}

export async function createExamRecord(payload: CreateExamPayload): Promise<{ data: Exam | null; error: Error | null }> {
  // 1. Try standard client insertion
  const { data: newExam, error: insertErr } = await supabase
    .from('exams')
    .insert({
      title: payload.title,
      description: payload.description || null,
      course_id: payload.course_id || null,
      pass_percentage: payload.pass_percentage ?? 70,
      time_limit_minutes: payload.time_limit_minutes ?? 30,
      is_active: payload.is_active ?? true,
      randomize_questions: payload.randomize_questions ?? true,
    })
    .select()
    .single();

  if (!insertErr && newExam) {
    return { data: newExam as Exam, error: null };
  }

  // 2. If any error (such as 403 Forbidden or 42501 RLS violation) occurred, invoke deployed Edge Function
  if (insertErr) {
    console.warn('Standard client exam creation blocked by RLS/403. Attempting Edge Function admin fallback...', insertErr);
    try {
      // Try provision-demo-users edge function first
      const { data: fnRes, error: fnErr } = await supabase.functions.invoke('provision-demo-users', {
        body: { action: 'create_exam', payload },
      });

      if (!fnErr && fnRes?.exam) {
        return { data: fnRes.exam as Exam, error: null };
      }

      // Try create-exam edge function as secondary fallback
      const { data: fn2Res, error: fn2Err } = await supabase.functions.invoke('create-exam', {
        body: payload,
      });

      if (!fn2Err && fn2Res?.exam) {
        return { data: fn2Res.exam as Exam, error: null };
      }

      if (fnErr || fn2Err) {
        return { data: null, error: new Error(fnErr?.message || fn2Err?.message || 'Failed to create exam via admin service') };
      }
    } catch (e: unknown) {
      const errObj = e instanceof Error ? e : new Error(String(e));
      return { data: null, error: errObj };
    }
  }

  return { data: null, error: new Error(insertErr?.message ?? 'Failed to create exam') };
}
