# Journal Writing Assistant – stage 1 (not yet deployed)

This is an isolated addition to the existing Journal Rich Editor. It does NOT modify the
database, published articles, article permissions, or existing draft save procedures.

## User functions
- Import plain text: TXT or Markdown (read locally, max 1 MB).
- Import MP3/M4A/MP4/MPEG/MPGA/WAV/WEBM audio (max 20 MB) and request a transcription.
- Three suggestions for pasted/loaded text: proofreading, style, or article structure.
- Review/edit the result manually and append it to the currently opened article.
- Existing text remains untouched; the user must save the draft through the Editor.
- One AI request may contain at most 12,000 characters; longer text must be split.

## Important: secrets and deployment
AI actions DO NOT work until the Supabase Edge Function is deployed and configured.
Only the server-side function calls the OpenAI API. Do NOT put OPENAI_API_KEY in JS,
GitHub, or the user's browser.

In the actual Supabase project:
1. Set the secret OPENAI_API_KEY using Supabase's Edge Function secrets UI.
   Also ensure SUPABASE_URL, SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY) and
   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) are present.
2. Deploy editor/edge-functions/journal-writing-assistant/index.ts with the
   function name journal-writing-assistant. Keep JWT verification enabled.
3. Set a small OpenAI project spending budget / alerts, and test with a short
   nonsensitive sample text and a short audio sample first.
4. Verify HR and EN text flows, upload limits, denied inactive/anonymous users,
   page close behavior, insertion, saving and draft reload, and mobile layouts.
5. Update privacy notices before processing contributor recordings or interviews.
   Obtain participants' permission; recordings can contain sensitive personal data.
   The browser sends the recording/text to Supabase, which forwards it to OpenAI.
   The function does not intentionally store uploaded audio or source text in the
   Journal database. Third-party retention and processing must be reviewed.

## Notes
Browser dictation remains a separate module and is unaffected.
Stage 1 should be reviewed in PR before any production merge.
Do not enable expensive AI functionality until key / cost / privacy review completes.
