import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ADMIN_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const EDITOR_URL = "https://editor.moveandtry.com/";
const PRODUCTION_ORIGIN = "https://editor.moveandtry.com";

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (origin === PRODUCTION_ORIGIN) return origin;
  if (/^https:\/\/(?:[a-z0-9-]+\.)?moveandtry-journal-editor\.pages\.dev$/.test(origin)) {
    return origin;
  }
  return null;
}

function cors(req: Request): Record<string, string> {
  const origin = allowedOrigin(req.headers.get("Origin"));
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function respond(req: Request, data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }

  if (req.method !== "POST") {
    return respond(req, { error: "Method not allowed." }, 405);
  }

  if (req.headers.has("Origin") && !allowedOrigin(req.headers.get("Origin"))) {
    return respond(req, { error: "Nedopušten izvor zahtjeva." }, 403);
  }

  if (!SUPABASE_URL || !PUBLISHABLE_KEY || !ADMIN_KEY) {
    console.error("Journal invite: missing server configuration.");
    return respond(req, { error: "Konfiguracija poslužitelja nije potpuna." }, 500);
  }

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return respond(req, { error: "Prijava je obavezna." }, 401);
    }

    const authClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(
      authorization.slice(7).trim(),
    );
    if (userError || !userData.user) {
      return respond(req, { error: "Nevažeća ili istekla prijava." }, 401);
    }

    const adminClient = createClient(SUPABASE_URL, ADMIN_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: caller, error: callerError } = await adminClient
      .from("journal_profiles")
      .select("id, role, is_active")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (callerError) {
      console.error("Journal invite: admin profile lookup failed", callerError);
      return respond(req, { error: "Provjera ovlasti nije uspjela." }, 500);
    }
    if (!caller || caller.role !== "admin" || caller.is_active !== true) {
      return respond(req, { error: "Nemaš administratorske ovlasti." }, 403);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return respond(req, { error: "Neispravan zahtjev." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return respond(req, { error: "Neispravni podaci." }, 400);
    }
    const input = body as Record<string, unknown>;

    const email = typeof input.email === "string"
      ? input.email.trim().toLowerCase() : "";
    const displayName = typeof input.display_name === "string"
      ? input.display_name.trim() : "";

    if (!email || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond(req, { error: "Unesi ispravnu e-mail adresu." }, 400);
    }
    if (!displayName || displayName.length > 120) {
      return respond(req, { error: "Unesi ime suradnika (najviše 120 znakova)." }, 400);
    }

    const columnist = input.can_write_column;
    const contributor = input.can_contribute;
    if (typeof columnist !== "boolean" || typeof contributor !== "boolean") {
      return respond(req, {
        error: "Odaberi autorsku mogućnost: kolumnist, suradnik ili obje.",
      }, 400);
    }
    if (!columnist && !contributor) {
      return respond(req, {
        error: "Potrebna je najmanje jedna autorska mogućnost.",
      }, 400);
    }

    // Validate the new permissions table BEFORE sending any invitation.
    // A failed deployment/migration must not create partly configured users.
    const { error: schemaError } = await adminClient
      .from("journal_author_permissions").select("user_id").limit(1);
    if (schemaError) {
      console.error("Journal invite: permissions schema unavailable", schemaError);
      return respond(req, {
        error: "Autorske ovlasti još nisu pripremljene u bazi. Pozivnica nije poslana.",
      }, 503);
    }

    // Only an editor Auth account can be invited. Never accept a role from
    // the browser and never modify the administrator security role here.
    const { data: invitation, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: EDITOR_URL,
        data: { display_name: displayName },
      });

    if (inviteError || !invitation?.user?.id) {
      console.error("Journal invite failed", inviteError?.message ?? "No user ID");
      return respond(req, {
        error: "Pozivnica nije poslana. Ako račun već postoji, ovlasti promijeni u kartici Suradnici.",
      }, 400);
    }

    const invitedId = invitation.user.id;
    const { data: existingProfile, error: lookupError } = await adminClient
      .from("journal_profiles")
      .select("id,role,is_active")
      .eq("id", invitedId)
      .maybeSingle();
    if (lookupError) {
      console.error("Journal invite: profile lookup after invite failed", lookupError);
      return respond(req, {
        error: "Pozivnica je poslana, ali profil nije provjeren. Nemoj slati ponovno; provjeri korisnika u Supabaseu.",
      }, 500);
    }

    if (existingProfile &&
        (existingProfile.role !== "editor" || existingProfile.is_active !== true)) {
      return respond(req, {
        error: "Pozivnica je obrađena, ali postojeći profil nije aktivni urednički račun. Ovlasti nisu mijenjane.",
      }, 409);
    }

    if (!existingProfile) {
      const { error: profileError } = await adminClient
        .from("journal_profiles")
        .insert({
          id: invitedId, display_name: displayName,
          role: "editor", is_active: true,
        });
      if (profileError) {
        console.error("Journal invite: profile creation failed", profileError);
        return respond(req, {
          error: "Pozivnica je poslana, ali profil nije izrađen. Nemoj slati ponovno; provjeri Auth i journal_profiles.",
        }, 500);
      }
    }

    const { error: permissionError } = await adminClient
      .from("journal_author_permissions")
      .upsert({
        user_id: invitedId,
        can_write_column: columnist,
        can_contribute: contributor,
        contributor_byline: displayName,
        updated_at: new Date().toISOString(),
        updated_by: userData.user.id,
      }, { onConflict: "user_id" });

    if (permissionError) {
      console.error("Journal invite: author permissions failed", permissionError);
      return respond(req, {
        error: "Pozivnica i profil su izrađeni, ali autorske ovlasti nisu spremljene. Nemoj slati novu pozivnicu; dodijeli ih postojećem računu.",
      }, 500);
    }

    return respond(req, {
      success: true,
      message: "Pozivnica je poslana i autorske ovlasti su spremljene.",
      invited_user_id: invitedId,
    });
  } catch (error) {
    console.error("Journal invite: unexpected error", error);
    return respond(req, { error: "Dogodila se neočekivana pogreška." }, 500);
  }
});
