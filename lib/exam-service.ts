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

export interface UpdateExamPayload extends CreateExamPayload {
  id: string;
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

  // 2. Admin Edge Function Fallback
  try {
    const { data: fnRes, error: fnErr } = await supabase.functions.invoke('provision-demo-users', {
      body: { action: 'create_exam', payload },
    });

    if (!fnErr && fnRes?.exam) {
      return { data: fnRes.exam as Exam, error: null };
    }
    return { data: null, error: new Error(fnErr?.message || fnRes?.error || 'Failed to create exam') };
  } catch (e: unknown) {
    const errObj = e instanceof Error ? e : new Error(String(e));
    return { data: null, error: errObj };
  }
}

export async function updateExamRecord(payload: UpdateExamPayload): Promise<{ data: Exam | null; error: Error | null }> {
  // 1. Try standard client update
  const { data: updExam, error: updErr } = await supabase
    .from('exams')
    .update({
      title: payload.title,
      description: payload.description || null,
      course_id: payload.course_id || null,
      pass_percentage: payload.pass_percentage ?? 70,
      time_limit_minutes: payload.time_limit_minutes ?? 30,
      is_active: payload.is_active,
      randomize_questions: payload.randomize_questions,
    })
    .eq('id', payload.id)
    .select()
    .single();

  if (!updErr && updExam) {
    return { data: updExam as Exam, error: null };
  }

  // 2. Admin Edge Function Fallback
  try {
    const { data: fnRes, error: fnErr } = await supabase.functions.invoke('provision-demo-users', {
      body: { action: 'update_exam', payload },
    });

    if (!fnErr && fnRes?.exam) {
      return { data: fnRes.exam as Exam, error: null };
    }
    return { data: null, error: new Error(fnErr?.message || fnRes?.error || 'Failed to update exam') };
  } catch (e: unknown) {
    const errObj = e instanceof Error ? e : new Error(String(e));
    return { data: null, error: errObj };
  }
}

export async function deleteExamRecord(id: string): Promise<{ error: Error | null }> {
  const { error: delErr } = await supabase.from('exams').delete().eq('id', id);
  if (!delErr) return { error: null };

  try {
    const { data: fnRes, error: fnErr } = await supabase.functions.invoke('provision-demo-users', {
      body: { action: 'delete_exam', payload: { id } },
    });
    if (!fnErr && fnRes?.ok) return { error: null };
    return { error: new Error(fnErr?.message || fnRes?.error || 'Failed to delete exam') };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function addQuestionToExamRecord(examId: string, questionId: string, order: number): Promise<{ error: Error | null }> {
  const { error: addErr } = await supabase.from('exam_questions').insert({
    exam_id: examId,
    question_id: questionId,
    question_order: order,
  });

  if (!addErr) return { error: null };

  try {
    const { data: fnRes, error: fnErr } = await supabase.functions.invoke('provision-demo-users', {
      body: { action: 'add_exam_question', payload: { exam_id: examId, question_id: questionId, question_order: order } },
    });
    if (!fnErr && fnRes?.ok) return { error: null };
    return { error: new Error(fnErr?.message || fnRes?.error || 'Failed to add question to exam') };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function removeQuestionFromExamRecord(examId: string, questionId: string): Promise<{ error: Error | null }> {
  const { error: rmErr } = await supabase.from('exam_questions').delete().eq('exam_id', examId).eq('question_id', questionId);
  if (!rmErr) return { error: null };

  try {
    const { data: fnRes, error: fnErr } = await supabase.functions.invoke('provision-demo-users', {
      body: { action: 'remove_exam_question', payload: { exam_id: examId, question_id: questionId } },
    });
    if (!fnErr && fnRes?.ok) return { error: null };
    return { error: new Error(fnErr?.message || fnRes?.error || 'Failed to remove question from exam') };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
