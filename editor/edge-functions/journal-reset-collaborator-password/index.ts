import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const adminKey = Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const editorUrl = "https://editor.moveandtry.com/";
const editorOrigin = new URL(editorUrl).origin;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const headers = {
    ...(origin === editorOrigin ? { "Access-Control-Allow-Origin": editorOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const respond = (status: number, data: Record<string, unknown>) =>
    Response.json(data, { status, headers });

  if (origin && origin !== editorOrigin) {
    return respond(403, { error: "Nedopušten izvor zahtjeva." });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return respond(405, { error: "Nedopuštena metoda." });
  if (!url || !publicKey || !adminKey) {
    return respond(503, { error: "Slanje poveznice nije konfigurirano." });
  }

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return respond(401, { error: "Prijava je obavezna." });

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const auth = createClient(url, publicKey, options).auth;
  const admin = createClient(url, adminKey, options);

  try {
    const { data: { user }, error: authError } = await auth.getUser(token);
    if (authError || !user) return respond(401, { error: "Prijavi se ponovno." });

    const { data: caller, error: callerError } = await admin.from("journal_profiles")
      .select("role,is_active").eq("id", user.id).maybeSingle();
    if (callerError) throw callerError;
    if (caller?.role !== "admin" || !caller.is_active) {
      return respond(403, { error: "Potrebne su administratorske ovlasti." });
    }

    const body = await req.json().catch(() => null);
    const id = body?.profile_id;
    if (typeof id !== "string" || !uuid.test(id)) {
      return respond(400, { error: "Odaberi suradnika." });
    }

    const { data: target, error: profileError } = await admin.from("journal_profiles")
      .select("role,is_active").eq("id", id).maybeSingle();
    if (profileError) throw profileError;
    if (target?.role !== "editor" || !target.is_active) {
      return respond(404, { error: "Aktivni suradnik nije pronađen." });
    }

    const { data: { user: account }, error: accountError } = await admin.auth.admin.getUserById(id);
    if (accountError && accountError.status !== 404) throw accountError;
    if (!account?.email) return respond(404, { error: "Račun nema dostupnu e-mail adresu." });

    const { error } = await auth.resetPasswordForEmail(account.email, { redirectTo: editorUrl });
    if (error) {
      console.error("Journal password recovery request failed", error.status, error.code);
      if (error.status === 429 || error.code === "over_email_send_rate_limit" ||
          error.code === "over_request_rate_limit") {
        return respond(429, { error: "Dosegnut je limit slanja. Pričekaj pa pokušaj ponovno." });
      }
      return respond(502, { error: "Slanje nije uspjelo. Za detalje provjeri Auth zapise u Supabaseu." });
    }

    console.info("Journal password recovery requested", { administrator: user.id, collaborator: id });
    return respond(200, { success: true });
  } catch (error) {
    console.error("Journal password recovery failed", error instanceof Error ? error.name : "database");
    return respond(500, { error: "Zahtjev nije dovršen. Provjeri zapise funkcije u Supabaseu." });
  }
});
