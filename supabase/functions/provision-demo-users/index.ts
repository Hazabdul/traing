import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEMO_USERS = [
  { email: "admin@logistics.sa", password: "password123", fullName: "System Administrator", role: "system_admin" },
  { email: "ehss.manager@logistics.sa", password: "password123", fullName: "EHSS Manager", role: "ehss_manager" },
  { email: "ehss.officer@logistics.sa", password: "password123", fullName: "EHSS Officer", role: "ehss_officer" },
  { email: "hr@logistics.sa", password: "password123", fullName: "HR Manager", role: "hr" },
  { email: "coordinator@logistics.sa", password: "password123", fullName: "Training Coordinator", role: "training_coordinator" },
  { email: "branch.manager@logistics.sa", password: "password123", fullName: "Branch Manager", role: "branch_manager" },
  { email: "driver@logistics.sa", password: "password123", fullName: "Ahmed Al-Saud", role: "driver" },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Parse JSON body if present
    let body: any = {};
    try {
      body = await req.json();
    } catch (_e) {
      body = {};
    }

    const action = body?.action;
    const p = body?.payload || {};

    // Action: create_exam
    if (action === "create_exam") {
      const { data: newExam, error: examErr } = await admin
        .from("exams")
        .insert({
          title: p.title || "New Exam",
          description: p.description || null,
          course_id: p.course_id || null,
          pass_percentage: Number(p.pass_percentage) || 70,
          time_limit_minutes: Number(p.time_limit_minutes) || 30,
          is_active: p.is_active ?? true,
          randomize_questions: p.randomize_questions ?? true,
        })
        .select()
        .single();

      if (examErr) {
        return new Response(JSON.stringify({ error: examErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, exam: newExam }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: update_exam
    if (action === "update_exam") {
      const { data: updExam, error: updErr } = await admin
        .from("exams")
        .update({
          title: p.title,
          description: p.description || null,
          course_id: p.course_id || null,
          pass_percentage: Number(p.pass_percentage) || 70,
          time_limit_minutes: Number(p.time_limit_minutes) || 30,
          is_active: p.is_active ?? true,
          randomize_questions: p.randomize_questions ?? true,
        })
        .eq("id", p.id)
        .select()
        .single();

      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, exam: updExam }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: delete_exam
    if (action === "delete_exam") {
      const { error: delErr } = await admin.from("exams").delete().eq("id", p.id);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: add_exam_question
    if (action === "add_exam_question") {
      const { error: addErr } = await admin.from("exam_questions").insert({
        exam_id: p.exam_id,
        question_id: p.question_id,
        question_order: p.question_order || 1,
      });

      if (addErr) {
        return new Response(JSON.stringify({ error: addErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: remove_exam_question
    if (action === "remove_exam_question") {
      const { error: rmErr } = await admin
        .from("exam_questions")
        .delete()
        .eq("exam_id", p.exam_id)
        .eq("question_id", p.question_id);

      if (rmErr) {
        return new Response(JSON.stringify({ error: rmErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default Action: Provision Demo Users
    const results: { email: string; status: string }[] = [];

    for (const u of DEMO_USERS) {
      const { data: existing } = await admin.auth.admin.listUsers();
      const found = existing.users.find((x: { email: string }) => x.email === u.email);

      if (found) {
        const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.fullName, role: u.role },
        });
        results.push({ email: u.email, status: updErr ? `update_failed: ${updErr.message}` : "updated" });
      } else {
        const { data: created, error: crtErr } = await admin.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.fullName, role: u.role },
        });
        if (crtErr) {
          results.push({ email: u.email, status: `create_failed: ${crtErr.message}` });
        } else {
          if (u.role === "driver" && created) {
            const { data: drv } = await admin
              .from("drivers")
              .select("id")
              .eq("employee_id", "EMP-1001")
              .maybeSingle();
            if (drv) {
              await admin.from("profiles").update({ driver_id: drv.id }).eq("user_id", created.user.id);
            }
          }
          results.push({ email: u.email, status: "created" });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
