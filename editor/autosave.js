/*
 * MOVE&TRY — The Journal draft safety layer.
 * Local recovery is immediate; remote working-copy save is optional until the
 * journal_draft_autosaves migration is installed. This does NOT publish or
 * change journal_articles / article revision numbers.
 */
(() => {
  'use strict';
  const bridge = window.MoveTryJournalDraftBridge;
  if (!bridge || window.MoveTryJournalAutosave) return;
  const panel = document.getElementById('editor-panel');
  const form = document.getElementById('article-form');
  if (!panel || !form) return;

  const PREFIX = 'mtjournal:draft:v1:';
  const DELAY = 2800;
  const status = document.createElement('p');
  status.className = 'mt-draft-status';
  status.setAttribute('role','status');
  status.textContent = 'Promjene se automatski čuvaju tijekom pisanja.';
  const actions = form.querySelector('.actions');
  if (actions) form.insertBefore(status,actions);
  else form.append(status);

  let current = null;
  let timer = null;
  let epoch = 0;
  let remoteAvailable = true;
  let lastRecoveryKey = null;

  function context() {
    return bridge.getContext();
  }
  function keyFor(ctx) {
    return PREFIX + ctx.ownerId + ':' + (ctx.articleId ? 'article:' + ctx.articleId : 'new');
  }
  function draftKey(ctx) {
    return ctx.articleId ? 'article:' + ctx.articleId : 'new';
  }
  function readLocal(key) {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      const parsed = JSON.parse(item);
      if (!parsed || typeof parsed.values !== 'object' || !parsed.values) return null;
      return parsed;
    } catch (_) { return null; }
  }
  function writeLocal(key, entry) {
    try {
      localStorage.setItem(key,JSON.stringify(entry));
      return true;
    } catch (_) { return false; }
  }
  function deleteLocal(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }
  function equals(a,b) {
    const keys = new Set([...Object.keys(a||{}),...Object.keys(b||{})]);
    for (const k of keys) {
      if (String(a?.[k] ?? '') !== String(b?.[k] ?? '')) return false;
    }
    return true;
  }
  function setStatus(message, error=false) {
    status.textContent = message;
    status.classList.toggle('error',error);
  }
  function buildSnapshot(ctx) {
    return {
      savedAt: new Date().toISOString(),
      articleId: ctx.articleId || null,
      baseRevision: ctx.revision ?? null,
      values: bridge.getValues()
    };
  }
  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }
  function copyLocal(ctx) {
    if (!ctx || !bridge.hasChanges()) return null;
    const entry = buildSnapshot(ctx);
    const success = writeLocal(keyFor(ctx),entry);
    setStatus(success
      ? 'Lokalna sigurnosna kopija spremljena · čeka se potvrda spremanja'
      : 'Lokalno spremanje nije uspjelo. Koristi SPREMI IZMJENE.',
      !success);
    return entry;
  }
  async function copyRemote(ctx,entry,requestEpoch) {
    if (!remoteAvailable || !entry) return;
    if (context()?.ownerId !== ctx.ownerId || requestEpoch !== epoch) return;
    const row = {
      owner_id:ctx.ownerId,
      draft_key:draftKey(ctx),
      article_id:ctx.articleId || null,
      base_revision:ctx.revision ?? null,
      snapshot:entry.values,
      saved_at:entry.savedAt
    };
    try {
      const {error} = await bridge.db.from('journal_draft_autosaves')
        .upsert(row,{onConflict:'owner_id,draft_key'});
      if (error) throw error;
      if (requestEpoch === epoch && context()?.ownerId === ctx.ownerId &&
          equals(bridge.getValues(),entry.values)) {
        setStatus('Sigurnosna kopija spremljena u Supabase · SPREMI IZMJENE i dalje je dostupno');
      }
    } catch (error) {
      const code = String(error?.code || '');
      if (['42P01','PGRST205','PGRST116'].includes(code) ||
          /journal_draft_autosaves.*(not found|does not exist|schema cache)/i.test(String(error?.message||''))) {
        remoteAvailable = false;
      }
      if (requestEpoch === epoch) setStatus(
        remoteAvailable
          ? 'Lokalna kopija je spremljena; mrežna kopija trenutno nije uspjela.'
          : 'Lokalna kopija je spremljena; poslužiteljsko automatsko spremanje još nije uključeno.'
      );
    }
  }
  function onEdit() {
    if (!current) return;
    const live = context();
    if (!live || keyFor(live)!==keyFor(current)) return;
    clearTimer();
    const entry = copyLocal(live);
    if (!entry) {
      setStatus('Nema nespremljenih izmjena.');
      return;
    }
    const activeEpoch = epoch;
    timer = setTimeout(() => {timer=null;void copyRemote(live,entry,activeEpoch);},DELAY);
  }
  function restoreIfUseful(entry,ctx,label) {
    if (!entry || !entry.values || !context() || keyFor(context())!==keyFor(ctx)) return false;
    if (equals(entry.values,bridge.getValues())) return false;
    const time = entry.savedAt ? new Date(entry.savedAt).toLocaleString('hr-HR') : 'nepoznato vrijeme';
    const conflict = ctx.articleId && entry.baseRevision !== null &&
      ctx.revision !== null && entry.baseRevision !== ctx.revision;
    const warning = conflict
      ? '\n\nPozor: članak je u međuvremenu dobio novu reviziju. Oporavak će zamijeniti trenutačni tekst u uređivaču; prije spremanja provjeri promjene.'
      : '';
    if (!confirm('Pronađena je '+label+' sigurnosna kopija iz '+time+
                 '.\n\nŽeliš li vratiti nespremljeni tekst?'+warning)) return false;
    bridge.applyValues(entry.values);
    writeLocal(keyFor(ctx),entry);
    setStatus('Sigurnosna kopija je vraćena. Provjeri tekst i spremi izmjene.');
    return true;
  }
  async function loadRemote(ctx,requestEpoch) {
    if (!remoteAvailable) return;
    try {
      const {data,error} = await bridge.db.from('journal_draft_autosaves')
        .select('snapshot,saved_at,base_revision')
        .eq('owner_id',ctx.ownerId)
        .eq('draft_key',draftKey(ctx))
        .maybeSingle();
      if (error) throw error;
      if (!data || epoch!==requestEpoch || !current ||
          keyFor(current)!==keyFor(ctx)) return;
      const local = readLocal(keyFor(ctx));
      if (local && Date.parse(local.savedAt||0)>=Date.parse(data.saved_at||0)) return;
      if (bridge.hasChanges()) return; // Never replace work typed since opening.
      restoreIfUseful({
        values:data.snapshot,
        savedAt:data.saved_at,
        baseRevision:data.base_revision
      },ctx,'poslužiteljska');
    } catch(error) {
      if (['42P01','PGRST205'].includes(String(error?.code||'')) ||
          /journal_draft_autosaves.*(not found|does not exist|schema cache)/i.test(String(error?.message||''))) {
        remoteAvailable=false;
      }
    }
  }
  function onOpen() {
    clearTimer();
    epoch++;
    const ctx = context();
    current = ctx;
    if (!ctx) return;
    setStatus('Automatsko čuvanje nacrta je uključeno.');
    const local = readLocal(keyFor(ctx));
    if (local && !equals(local.values,bridge.getValues())) {
      restoreIfUseful(local,ctx,'lokalna');
    } else if (local) {
      setStatus('Lokalna sigurnosna kopija je dostupna.');
    }
    void loadRemote(ctx,epoch);
  }
  async function clearRemote(ownerId,draftKeys) {
    if (!remoteAvailable) return;
    try {
      await bridge.db.from('journal_draft_autosaves')
        .delete().eq('owner_id',ownerId).in('draft_key',draftKeys);
    } catch (_) {}
  }
  function onSaved(event) {
    clearTimer();
    epoch++;
    const previous = current;
    const ctx = context();
    if (!ctx || !previous || ctx.ownerId!==previous.ownerId) return;
    const oldKey=keyFor(previous);
    const nowKey=keyFor(ctx);
    deleteLocal(oldKey);
    deleteLocal(nowKey);
    current=ctx;
    const savedKeys=[draftKey(previous),draftKey(ctx)];
    void clearRemote(ctx.ownerId,[...new Set(savedKeys)]);
    if (bridge.hasChanges()) {
      // User typed again while a manual save was in flight.
      onEdit();
    } else {
      setStatus('Spremljeno u članku · sigurnosna kopija očišćena.');
    }
  }
  function onClose() {
    clearTimer();
    if (current && bridge.hasChanges()) copyLocal(current);
    epoch++;
    current=null;
  }
  function onLogout() {
    clearTimer();
    const ctx=context()||current;
    if (ctx) {
      const scoped=PREFIX+ctx.ownerId+':';
      try {
        for(let i=localStorage.length-1;i>=0;i--) {
          const key=localStorage.key(i);
          if(key?.startsWith(scoped))localStorage.removeItem(key);
        }
      } catch(_){}
    }
    epoch++;
    current=null;
  }

  form.addEventListener('input',event=>{
    if (!event.target.matches('input,textarea,select,[contenteditable]')) return;
    onEdit();
  },true);
  form.addEventListener('change',onEdit,true);
  panel.addEventListener('journal-editor-open',onOpen);
  panel.addEventListener('journal-editor-saved',onSaved);
  panel.addEventListener('journal-editor-closing',onClose);
  panel.addEventListener('journal-editor-logout',onLogout);
  document.addEventListener('visibilitychange',()=>{
    if (document.visibilityState === 'hidden' && current) copyLocal(current);
  });
  window.addEventListener('pagehide',()=>{
    if (current) copyLocal(current);
  });
  window.MoveTryJournalAutosave={
    active:true,
    forgetArticle(ownerId, articleId) {
      deleteLocal(keyFor({ownerId,articleId}));
    }
  };
})();
