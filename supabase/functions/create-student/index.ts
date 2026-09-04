import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const response = (body: string, status: number) =>
  new Response(body, { status, headers: { ...corsHeaders, "Content-Type": "text/plain" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response("Method not allowed", 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return response("Unauthorized", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user: admin }, error: userError } = await userClient.auth.getUser();
  if (userError || !admin) return response("Unauthorized", 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: adminProfile, error: profileLookupError } = await adminClient
    .from("student_profiles")
    .select("role")
    .eq("id", admin.id)
    .single();
  if (profileLookupError) return response(`Admin profile lookup failed: ${profileLookupError.message}`, 500);
  if (adminProfile?.role !== "admin") return response("Admin access required", 403);

  const { name, usn, semester, lab, password } = await request.json();
  if (!name?.trim() || !usn?.trim() || !semester?.trim() || !password || password.length < 6) {
    return response("Name, USN, semester, and a password of at least 6 characters are required", 400);
  }

  const email = `${usn.trim().toLowerCase()}@students.labpilot.local`;
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name.trim(), usn: usn.trim(), semester: semester.trim() },
  });
  if (createError) return response(createError.message, 400);

  const { error: profileError } = await adminClient.from("student_profiles").upsert({
    id: created.user.id,
    full_name: name.trim(),
    usn: usn.trim(),
    semester: semester.trim(),
    assigned_lab: lab || "Data Structures",
    role: "student",
  });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return response(profileError.message, 400);
  }

  return new Response(JSON.stringify({ id: created.user.id, email }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
