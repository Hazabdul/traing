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

    const results: { email: string; status: string }[] = [];

    for (const u of DEMO_USERS) {
      // Check if user exists by listing users with this email
      const { data: existing } = await admin.auth.admin.listUsers();
      const found = existing.users.find((x: { email: string }) => x.email === u.email);

      if (found) {
        // Update password to ensure it is hashed by GoTrue itself
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
          // Link driver role user to driver record EMP-1001
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
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
