(function () {
  'use strict';

  const SUPABASE_URL = 'https://pdyngeaykfpybeafjtpw.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_liv_WfA9YbjizQvpOrB68w_mkVgR_WK';

  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = id => document.getElementById(id);

  const views = {
    loading: $('loading-view'),
    login: $('login-view'),
    password: $('password-view'),
    dashboard: $('dashboard-view')
  };

  const STATUS = {
    draft: 'Skica',
    submitted: 'Čeka odobrenje',
    revision: 'Vraćeno na doradu',
    approved: 'Odobreno',
    scheduled: 'Zakazano',
    published: 'Objavljeno'
  };

  const CATEGORY = {
    editorial: 'Urednički tekstovi',
    personal: 'Osobne kolumne',
    guest: 'Gostujuće priče',
    news: 'Novosti',
    inspiration: 'Inspiracija'
  };

  const ACTIONS = {
    created: 'Članak stvoren',
        edited: 'Članak uređen',
    submitted: 'Poslano na odobrenje',
    revision_requested: 'Zatražena dorada',
    approved: 'Članak odobren',
    scheduled: 'Objava zakazana',
    published: 'Članak objavljen',
    unpublished: 'Članak povučen',
    comment_added: 'Dodan komentar'
  };

  let currentUser = null;
  let currentProfile = null;
  let articles = [];
  let profiles = [];
  let authorPermissions = new Map();
  let permissionManagementAvailable = false;
  let columns = [];
  let columnsAvailable = false;
  let currentWritingMode = 'contribution';
  let activeTab = 'home';
  let selectedArticleId = null;
  let currentArticleId = null;
  let currentArticleRevision = null;
  let currentEditorMode = 'author';
  let editorInitialValues = null;
  let passwordFlow = false;
  let busy = false;
  let dashboardRequest = 0;
  let notifications = [];
  let pushBusy = false;
  let notificationRequest = 0;


  const isAdmin = () => currentProfile?.role === 'admin';

  // Minimal interface for isolated autosave module; same authenticated Supabase client.
  window.MoveTryJournalDraftBridge = {
    db,
    getContext: () => currentUser && currentProfile && !$('editor-panel').hidden
      ? {
          ownerId: currentUser.id,
          articleId: currentArticleId,
          revision: currentArticleRevision,
          mode: currentEditorMode
        }
      : null,
    getValues: () => readEditorValues(),
    hasChanges: () => editorValuesChanged(),
    applyValues: values => {
      const inputs = {
        p_title: 'article-title',
        p_excerpt: 'article-excerpt',
        p_content: 'article-content',
        p_category: 'article-category',
        p_cover_image: 'article-cover',
        p_title_en: 'article-title-en',
        p_excerpt_en: 'article-excerpt-en',
        p_content_en: 'article-content-en'
      };
      const allowed = currentEditorMode === 'admin'
        ? Object.keys(inputs)
        : Object.keys(inputs).filter(key => !key.endsWith('_en'));
      for (const key of allowed) {
        if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
        const field = $(inputs[key]);
        if (field) field.value = values[key] || '';
      }
      // Preserve the recovered category without silently switching authorship.
      configureWritingMode(currentArticleId ? articleById(currentArticleId) : null,
        values.p_category === 'personal' ? 'column' : 'contribution');
      $('editor-panel').dispatchEvent(new Event('journal-editor-restore'));
    }
  };

  // Filter za autorske članke.
  // Dodaje se u postojeću sekciju bez promjene njezina izgleda.
  const myArticlesSection = $('tab-mine');
  const myArticlesList = $('my-articles');
  const myFilters = document.createElement('div');
  myFilters.className = 'filters';

  const myStatusFilter = document.createElement('select');
  myStatusFilter.id = 'my-article-status-filter';
  myStatusFilter.setAttribute('aria-label', 'Filtriraj moje članke');

  [
    ['all', 'Svi statusi'],
    ['draft_revision', 'Skice i dorade'],
    ['submitted', 'Čeka odobrenje'],
    ['approved_published', 'Odobreno, zakazano i objavljeno'],
    ['scheduled', 'Zakazano']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    myStatusFilter.appendChild(option);
  });

  myFilters.appendChild(myStatusFilter);
  myArticlesSection.insertBefore(myFilters, myArticlesList);

  function showView(name) {
    Object.entries(views).forEach(([key, element]) => {
      element.hidden = key !== name;
    });
  }

  function setMessage(id, text, error = false) {
    const element = $(id);
    element.textContent = text || '';
    element.classList.toggle('error', error);
  }

  function friendlyError(error) {
    return error?.message || 'Dogodila se pogreška. Pokušaj ponovno.';
  }

  function dateLabel(value) {
    if (!value) return '—';

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat('hr-HR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
          timeZone: 'Europe/Zagreb'
        }).format(date);
  }

  function statusLabel(status) {
    return STATUS[status] || status || 'Nepoznato';
  }

  function categoryLabel(category) {
    return CATEGORY[category] || category || '—';
  }

  function personName(id) {
    const profile = profiles.find(p => p.id === id);
    return profile?.display_name || 'Nepoznati autor';
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);

    return element;
  }

  function emptyMessage(text) {
    return createElement('p', 'empty', text);
  }

  function makeButton(text, callback, className = 'btn secondary small-btn') {
    const button = createElement('button', className, text);
    button.type = 'button';
    button.addEventListener('click', callback);
    return button;
  }

  function setBusy(value) {
    busy = value;

    [
      'save-draft-btn',
      'submit-article-btn',
      'confirm-revision-btn',
      'add-comment-btn',
      'confirm-schedule-btn'
    ].forEach(id => {
      const button = $(id);
      if (button) button.disabled = value;
    });

    if (!value) updateSubmitAvailability();
  }

  function articleById(id) {
    return articles.find(article => article.id === id);
  }

  async function loadProfile(user) {
    const { data, error } = await db
      .from('journal_profiles')
      .select('id, display_name, role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function refreshDashboard() {
    if (!currentUser || !currentProfile) return;

    const request = ++dashboardRequest;

    const { data, error } = await db
      .from('journal_articles')
      .select('id, author_id, title, excerpt, content, title_en, excerpt_en, content_en, category, cover_image, column_id, status, updated_at, created_at, revision_number, scheduled_at, published_at')
      .order('updated_at', { ascending: false })
      .limit(1000);

    if (error) throw error;
    if (request !== dashboardRequest) return;

    articles = data || [];

    if (isAdmin()) {
      const result = await db
        .from('journal_profiles')
        .select('id, display_name, role, is_active, created_at')
        .order('created_at', { ascending: true })
        .limit(1000);

      if (result.error) {
        profiles = [currentProfile];

        setMessage(
          'dashboard-message',
          'Članci su učitani, ali popis suradnika nije dostupan: ' +
            friendlyError(result.error),
          true
        );
      } else {
        profiles = result.data || [];
      }
    } else {
      profiles = [currentProfile];
    }

    {
      const result = await db.from('journal_author_permissions')
        .select('user_id,can_write_column,can_contribute,contributor_byline').limit(1000);
      if (request !== dashboardRequest) return;
      if (result.error) {
        authorPermissions = new Map();
        permissionManagementAvailable = false;
        setMessage('dashboard-message',
          'Upravljanje autorskim ovlastima još nije dostupno u bazi. Postojeći članci su učitani.',
          true);
      } else {
        authorPermissions = new Map((result.data || []).map(p => [p.user_id, p]));
        permissionManagementAvailable = true;
      }
    }

    const columnsResult = await db.from('journal_columns')
      .select('id,columnist_id,title,slug,public_byline,description,is_active')
      .order('title',{ascending:true}).limit(1000);
    if (request !== dashboardRequest) return;
    columnsAvailable = !columnsResult.error;
    columns = columnsResult.data || [];

    renderDashboard();

    if (selectedArticleId && !articleById(selectedArticleId)) {
      closeDetail();
    }
  }

  function renderDashboard() {
    const visible = isAdmin()
      ? articles
      : articles.filter(a => a.author_id === currentUser.id);

    const drafts = visible.filter(a =>
      ['draft', 'revision'].includes(a.status)
    );

    const pending = visible.filter(a => a.status === 'submitted');

    const approved = visible.filter(a =>
      ['approved', 'scheduled', 'published'].includes(a.status)
    );

    $('stat-total').textContent = visible.length;
    $('stat-drafts').textContent = drafts.length;
    $('stat-pending').textContent = pending.length;
    $('stat-approved').textContent = approved.length;

    $('stat-total-label').textContent =
      isAdmin() ? 'Ukupno članaka' : 'Mojih članaka';

    $('home-heading').textContent =
      isAdmin() ? 'Urednički pregled' : 'Pregled mojih članaka';

    renderArticleList('recent-articles', visible.slice(0, 5));
    renderMyArticles();
    renderPublishedArticles();

    if (isAdmin()) {
      renderAllArticles();
      renderArticleList('pending-articles', pending);
      renderCollaborators();
      renderColumns();
    }
  }

  function makeArticleRow(article) {
    const row = createElement('div', 'article-row');
    const info = createElement('div', 'article-info');

    info.appendChild(
      createElement(
        'p',
        'article-title',
        article.title || 'Bez naslova'
      )
    );

    const details = [
      statusLabel(article.status),
      dateLabel(article.updated_at)
    ];
    if (article.status === 'scheduled' && article.scheduled_at) {
      details.push('Objava: ' + dateLabel(article.scheduled_at));
    }

    if (isAdmin()) {
      details.push(personName(article.author_id));
    }

    info.appendChild(
      createElement('div', 'article-meta', details.join(' · '))
    );

    const actions = createElement('div', 'actions');
    actions.style.marginTop = '0';

    actions.appendChild(
      makeButton('PREGLEDAJ', () => openDetail(article.id))
    );

    const canEditOwn =
      article.author_id === currentUser.id &&
      ['draft', 'revision'].includes(article.status);

    if (canEditOwn) {
      actions.appendChild(
        makeButton('UREDI', () => openEditor(article))
      );
    }

    row.append(info, actions);
    return row;
  }

  function renderArticleList(targetId, list) {
    const target = $(targetId);
    target.replaceChildren();

    if (!list.length) {
      target.appendChild(
        emptyMessage('Nema članaka za prikaz.')
      );
      return;
    }

    list.forEach(article => {
      target.appendChild(makeArticleRow(article));
    });
  }

  function matchesStatusFilter(article, status) {
    if (status === 'all') return true;

    if (status === 'draft_revision') {
      return ['draft', 'revision'].includes(article.status);
    }

    if (status === 'approved_published') {
      return ['approved', 'scheduled', 'published'].includes(article.status);
    }

    return article.status === status;
  }

  function renderPublishedArticles() {
    // This tab is intentionally read-only and never displays other authors'
    // publications to a non-admin user.
    const published = articles.filter(article =>
      article.status === 'published' &&
      (isAdmin() || article.author_id === currentUser.id)
    );
    $('published-section-title').textContent = isAdmin()
      ? 'Svi objavljeni članci'
      : 'Moji objavljeni članci';
    $('published-section-label').textContent = isAdmin()
      ? 'THE JOURNAL · OBJAVLJENO'
      : 'MOJI OBJAVLJENI RADOVI';
    renderArticleList('published-articles', published);
  }

  function renderMyArticles() {
    const status = $('my-article-status-filter').value;

    const mine = articles.filter(article =>
      article.author_id === currentUser.id &&
      matchesStatusFilter(article, status)
    );

    renderArticleList('my-articles', mine);
  }

  function openStatArticles(status) {
    if (isAdmin()) {
      $('article-search').value = '';
      $('article-status-filter').value = status;
      switchTab('all');
      renderAllArticles();
    } else {
      $('my-article-status-filter').value = status;
      switchTab('mine');
      renderMyArticles();
    }
  }

  function renderAllArticles() {
    const query = $('article-search').value.trim().toLowerCase();
    const status = $('article-status-filter').value;

    const filtered = articles.filter(article => {
      const matchesStatus =
        matchesStatusFilter(article, status);

      const text = [
        article.title,
        article.title_en,
        personName(article.author_id),
        categoryLabel(article.category)
      ].join(' ').toLowerCase();

      return matchesStatus && text.includes(query);
    });

    renderArticleList('all-articles', filtered);
  }

  function activeColumnFor(userId) {
    return columns.find(c => c.columnist_id === userId && c.is_active);
  }
  function currentAuthorOptions() {
    const p=authorPermissions.get(currentUser?.id);
    return {columnist:isAdmin() || !!p?.can_write_column,
      contributor:isAdmin() || !!p?.can_contribute,
      column:activeColumnFor(currentUser?.id)};
  }
  function renderColumns() {
    if(!isAdmin())return;
    const panel=$('column-management-panel');
    panel.hidden=!permissionManagementAvailable || !columnsAvailable;
    if(panel.hidden)return;
    const writer=$('column-writer');
    const prior=writer.value;
    writer.replaceChildren();
    profiles.filter(p=>p.is_active &&
      (p.role==='admin'||authorPermissions.get(p.id)?.can_write_column) &&
      !columns.some(c=>c.columnist_id===p.id)).forEach(p=>{
      const option=document.createElement('option');
      option.value=p.id;
      option.textContent=p.display_name||'Bez imena';
      writer.append(option);
    });
    if([...writer.options].some(x=>x.value===prior))writer.value=prior;
    $('column-create-btn').disabled=busy||!writer.options.length;
    const list=$('columns-list');list.replaceChildren();
    if(!columns.length)list.append(emptyMessage('Još nema dodijeljenih kolumni.'));
    for(const c of columns){
      const row=createElement('div','collaborator');
      const info=createElement('div');
      info.append(createElement('strong','article-title',c.title),
        createElement('p','article-meta',
          personName(c.columnist_id)+' · '+c.public_byline+' · /'+c.slug+
          (c.is_active?' · aktivna':' · neaktivna')));
      const button=makeButton(c.is_active?'DEAKTIVIRAJ':'AKTIVIRAJ',
        ()=>toggleColumn(c.id),'btn secondary small-btn');
      button.disabled=busy;row.append(info,button);list.append(row);
    }
  }
  async function saveColumnRpc(name,params){
    if(!isAdmin()||busy)return;
    busy=true;
    try{
      setMessage('column-message','Spremanje kolumne...');
      const {error}=await db.rpc(name,params);
      if(error)throw error;
      await refreshDashboard();
      setMessage('column-message','Kolumna je spremljena.');
    }catch(error){
      setMessage('column-message',friendlyError(error),true);
    }finally{busy=false;renderColumns();}
  }
  function toggleColumn(id){
    const c=columns.find(x=>x.id===id);
    if(!c||!confirm((c.is_active?'Deaktivirati':'Aktivirati')+' kolumnu '+c.title+'?'))return;
    void saveColumnRpc('journal_admin_update_column',{
      p_column_id:id,p_title:c.title,p_slug:c.slug,
      p_public_byline:c.public_byline,p_description:c.description||'',
      p_is_active:!c.is_active});
  }
  function configureWritingMode(article, selectedMode = null){
    const field=$('writing-mode-field');
    const category=$('article-category');
    const mode=$('article-writing-mode');
    if(isAdmin()||currentEditorMode==='admin'){
      currentWritingMode='admin';field.hidden=true;category.disabled=false;
      for(const option of category.options){option.hidden=false;option.disabled=false;}
      return;
    }
    const options=currentAuthorOptions();
    const canColumn=options.columnist && !!options.column;
    currentWritingMode=article ? (article.category==='personal'?'column':'contribution')
      : (selectedMode === 'column' && canColumn ? 'column'
        : selectedMode === 'contribution' && options.contributor ? 'contribution'
        : canColumn && !options.contributor ? 'column' : 'contribution');
    field.hidden=!!article || !(canColumn && options.contributor);
    mode.value=currentWritingMode;
    category.disabled=currentWritingMode==='column';
    if(currentWritingMode==='column'){
      category.value='personal';
      $('writing-mode-description').textContent=options.column?.title||'Moja kolumna';
    }else if(category.value==='personal'){category.value='guest';}
    for(const option of category.options){
      option.disabled=option.value==='personal'&&currentWritingMode!=='column';
      option.hidden=option.disabled;
    }
  }

  function renderCollaborators() {
    const target = $('collaborators-list');
    target.replaceChildren();

    if (!profiles.length) {
      target.appendChild(emptyMessage('Nema dostupnih suradnika.'));
      return;
    }

    profiles.forEach(profile => {
      const row = createElement('div', 'collaborator');
      row.dataset.profileId = profile.id;
      const info = createElement('div');

      info.appendChild(createElement(
        'p', 'article-title', profile.display_name || 'Bez prikaznog imena'
      ));

      const authored = articles.filter(a => a.author_id === profile.id).length;
      const perms = authorPermissions.get(profile.id);
      const role = profile.role === 'admin'
        ? 'Administrator'
        : !permissionManagementAvailable ? 'Autor / urednik'
        : [perms?.can_write_column ? 'Kolumnist' : '',
           perms?.can_contribute ? 'Suradnik' : ''].filter(Boolean).join(' + ') || 'Bez autorskih ovlasti';

      info.appendChild(createElement(
        'div', 'article-meta',
        `${role} · ${authored} članaka · Od ${dateLabel(profile.created_at)}`
      ));

      const status = createElement(
        'span', profile.is_active ? 'pill' : 'pill inactive',
        profile.is_active ? 'AKTIVAN' : 'DEAKTIVIRAN'
      );

      const controls = createElement('div', 'top-actions');
      controls.appendChild(status);

      if (isAdmin() && profile.role === 'editor' && profile.id !== currentUser.id) {
        if (permissionManagementAvailable) {
          const permissionsButton = makeButton(
            'UREDI OVLASTI',
            () => editAuthorPermissions(profile.id),
            'btn secondary small-btn'
          );
          permissionsButton.disabled = busy;
          controls.appendChild(permissionsButton);
        }
        const button = makeButton(
          profile.is_active ? 'DEAKTIVIRAJ' : 'AKTIVIRAJ',
          () => setCollaboratorStatus(profile.id, !profile.is_active),
          profile.is_active ? 'btn danger small-btn' : 'btn green small-btn'
        );
        button.disabled = busy;
        controls.appendChild(button);
      }

      row.append(info, controls);
      target.appendChild(row);
    });
  }

  async function editAuthorPermissions(userId) {
    if (!isAdmin() || !permissionManagementAvailable || busy) return;
    const profile = profiles.find(p => p.id === userId);
    if (!profile || profile.role !== 'editor' || userId === currentUser.id) return;
    const previous = authorPermissions.get(userId) || {
      can_write_column: false, can_contribute: false
    };
    const container = document.createElement('div');
    container.className = 'journal-permission-editor';
    const heading = document.createElement('strong');
    heading.textContent = 'Autorske mogućnosti: ' + (profile.display_name || 'Korisnik');
    const columnist = document.createElement('input');
    columnist.type = 'checkbox'; columnist.checked = !!previous.can_write_column;
    const contributor = document.createElement('input');
    contributor.type = 'checkbox'; contributor.checked = !!previous.can_contribute;
    const makeChoice = (control,labelText) => {
      const label = document.createElement('label');
      label.append(control,document.createTextNode(' ' + labelText));
      return label;
    };
    container.append(heading,
      makeChoice(columnist,'Kolumnist — dodijeljena kolumna'),
      makeChoice(contributor,'Suradnik — pojedinačni članci'));
    const bylineLabel=document.createElement('label');
    bylineLabel.textContent='Javni potpis za pojedinačne članke';
    const bylineInput=document.createElement('input');
    bylineInput.type='text';
    bylineInput.maxLength=160;
    bylineInput.value=previous.contributor_byline || profile.display_name || '';
    bylineInput.setAttribute('aria-label','Javni potpis suradnika');
    container.append(bylineLabel,bylineInput);
    const buttons = document.createElement('div');
    buttons.className = 'actions';
    const save = makeButton('SPREMI OVLASTI',async () => {
      if (!columnist.checked && !contributor.checked &&
          !confirm('Korisnik neće imati nijednu autorsku mogućnost. Nastaviti?')) return;
      if (busy) return;
      const byline=bylineInput.value.trim();
      if(!byline || byline.length>160){
        setMessage('dashboard-message','Unesi javni potpis suradnika (1–160 znakova).',true);
        return;
      }
      busy = true;
      save.disabled = true;
      try {
        const { error } = await db.rpc('journal_admin_set_author_permissions', {
          p_user_id:userId,
          p_columnist:columnist.checked,
          p_contributor:contributor.checked,
          p_public_byline:byline
        });
        if (error) throw error;
        await refreshDashboard();
        setMessage('dashboard-message','Autorske ovlasti i javni potpis su ažurirani.');
      } catch (error) {
        setMessage('dashboard-message',friendlyError(error),true);
      } finally {
        busy = false;
        renderCollaborators();
      }
    },'btn green small-btn');
    const cancel = makeButton('ODUSTANI', () => {
      container.remove();
    },'btn secondary small-btn');
    buttons.append(save,cancel);
    container.append(buttons);
    const target = document.getElementById('collaborators-list');
    target.querySelector('.journal-permission-editor')?.remove();
    const row = Array.from(target.children)
      .find(el => el.dataset.profileId === userId);
    if (row) row.append(container);
  }

  async function setCollaboratorStatus(collaboratorId, isActive) {
    if (!isAdmin() || busy) return;

    const profile = profiles.find(p => p.id === collaboratorId);
    if (!profile || profile.role !== 'editor' || collaboratorId === currentUser.id) return;

    const name = profile.display_name || 'ovog suradnika';
    const question = isActive
      ? `Želiš li ponovno aktivirati suradnika ${name}?`
      : `Želiš li deaktivirati suradnika ${name}?\n\nNjegovi članci, komentari i povijest ostat će sačuvani.`;
    if (!confirm(question)) return;

    busy = true;
    renderCollaborators();
    setMessage('dashboard-message', isActive ? 'Aktivacija suradnika...' : 'Deaktivacija suradnika...');

    try {
      const { data: sessionData, error: sessionError } = await db.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Sesija je istekla. Prijavi se ponovno.');
      }

      const { data, error } = await db.functions.invoke('journal-set-collaborator-status', {
        body: { collaborator_id: collaboratorId, is_active: isActive },
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` }
      });

      if (error) {
        let detail = '';
        try {
          const body = await error.context?.json();
          detail = body?.error || '';
        } catch (_) { /* Nema JSON tijela. */ }
        throw new Error(detail || error.message || 'Promjena statusa nije uspjela.');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Promjena statusa nije potvrđena.');
      }

      try {
        await refreshDashboard();
        setMessage('dashboard-message', data.message || 'Status suradnika je promijenjen.');
      } catch (refreshError) {
        setMessage(
          'dashboard-message',
          'Status je promijenjen, ali popis nije osvježen: ' + friendlyError(refreshError),
          true
        );
      }
    } catch (error) {
      setMessage('dashboard-message', friendlyError(error), true);
    } finally {
      busy = false;
      renderCollaborators();
    }
  }

  function switchTab(name) {
    const allowed = [
      'home',
      'mine',
      'published',
      'all',
      'pending',
      'people'
    ];

    if (!allowed.includes(name)) return;

    if (!isAdmin() && !['home', 'mine', 'published'].includes(name)) {
      name = 'home';
    }

    activeTab = name;

    allowed.forEach(tab => {
      $('tab-' + tab).hidden = tab !== name;
    });

    document.querySelectorAll('[data-tab]').forEach(button => {
      const selected = button.dataset.tab === name;

      button.classList.toggle('active', selected);
      button.setAttribute(
        'aria-current',
        selected ? 'page' : 'false'
      );
    });

    closeEditor();
    closeDetail();

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  function readEditorValues() {
    const values = {
      p_title: $('article-title').value.trim(),
      p_excerpt: $('article-excerpt').value.trim(),
      p_content: $('article-content').value.trim(),
      p_category: $('article-category').value,
      p_cover_image: $('article-cover').value.trim() || null
    };
    if (currentEditorMode === 'admin') {
      values.p_title_en = $('article-title-en').value.trim() || null;
      values.p_excerpt_en = $('article-excerpt-en').value.trim() || null;
      values.p_content_en = $('article-content-en').value.trim() || null;
    }
    return values;
  }
    function editorValuesChanged() {
    if (!editorInitialValues) return false;

    const current = readEditorValues();

    return Object.keys(current).some(key =>
      current[key] !== editorInitialValues[key]
    );
  }

  function updateSubmitAvailability() {
    $('submit-article-btn').disabled =
      busy ||
      !currentArticleId ||
      currentEditorMode !== 'author' ||
      isAdmin();
  }

  function openEditor(article = null, adminEdit = false) {
    if (busy) return;

    if (adminEdit && !isAdmin()) return;

    if (!article && !isAdmin()) {
      if (!permissionManagementAvailable || !columnsAvailable) {
        setMessage('dashboard-message',
          'Autorske ovlasti još nisu pripremljene. Novi članak zasad nije dostupan.',true);
        return;
      }
      const options=currentAuthorOptions();
      if (!options.contributor && !(options.columnist && options.column)) {
        setMessage('dashboard-message',
          options.columnist
            ? 'Kolumna ti još nije dodijeljena. Obrati se administratorici.'
            : 'Nemaš ovlast za pisanje novog članka.',true);
        return;
      }
    }

    if (!adminEdit && article) {
      const allowed =
        article.author_id === currentUser.id &&
        ['draft', 'revision'].includes(article.status);

      if (!allowed) {
        setMessage(
          'dashboard-message',
          'Ovaj članak nije dostupan za autorsko uređivanje.',
          true
        );
        return;
      }
    }

    closeDetail();

    currentArticleId = article?.id || null;
    currentArticleRevision = article?.revision_number ?? null;
    currentEditorMode = adminEdit ? 'admin' : 'author';

    $('editor-heading').textContent = adminEdit
      ? 'Administratorsko uređivanje'
      : article ? 'Uredi članak' : 'Novi članak';

    $('editor-context').textContent = article
      ? `${statusLabel(article.status)} · Revizija ${article.revision_number ?? '—'}`
      : 'Nova skica';

    $('article-title').value = article?.title || '';
    $('article-excerpt').value = article?.excerpt || '';
    $('article-content').value = article?.content || '';
    $('article-category').value = article?.category || (isAdmin()?'editorial':'guest');
    configureWritingMode(article);
    $('article-cover').value = article?.cover_image || '';
    $('admin-en-fields').hidden = !adminEdit;
    $('article-title-en').value = article?.title_en || '';
    $('article-excerpt-en').value = article?.excerpt_en || '';
    $('article-content-en').value = article?.content_en || '';

    editorInitialValues = readEditorValues();

    // Admin writes directly as an editor and never submits work to herself.
    $('submit-article-btn').hidden = isAdmin() || adminEdit;
    $('submit-article-btn').disabled = !currentArticleId;

    setMessage('editor-message', '');
    $('editor-panel').hidden = false;
    // Always reload the visual surface from this article, even if the editor
    // was already visible when switching from one article to another.
    $('editor-panel').dispatchEvent(new Event('journal-editor-open'));

    $('editor-panel').scrollIntoView({
      behavior: 'smooth'
    });
  }

  function closeEditor() {
    if (busy) return;

    $('editor-panel').dispatchEvent(new Event('journal-editor-closing'));
    $('editor-panel').hidden = true;
    $('admin-en-fields').hidden = true;
    currentArticleId = null;
    currentArticleRevision = null;
    currentEditorMode = 'author';
    editorInitialValues = null;

    setMessage('editor-message', '');
  }

  async function saveDraft(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setMessage('editor-message', 'Spremanje...');

    try {
      const values = readEditorValues();
      const previousArticleId = currentArticleId;
      let result;

      if (currentEditorMode === 'admin') {
        result = await db.rpc(
          'journal_admin_edit_article_bilingual_checked',
          {
            p_article_id: currentArticleId,
            p_expected_revision: currentArticleRevision,
            ...values
          }
        );
      } else {
        result = await db.rpc(
          'journal_save_draft_bilingual_checked',
          {
            p_article_id: currentArticleId,
            p_expected_revision: currentArticleRevision,
            ...values
          }
        );
      }

      if (result.error) throw result.error;

      if (currentEditorMode === 'author' && !currentArticleId) {
        currentArticleId = result.data;
      }

      await refreshDashboard();

      const updated = articleById(currentArticleId);

      currentArticleRevision =
        updated?.revision_number ?? currentArticleRevision;

      // Only the values actually sent to Supabase are considered saved.
      // Later typing while the request is in flight must remain unsaved.
      editorInitialValues = values;
      $('editor-panel').dispatchEvent(new CustomEvent('journal-editor-saved', {
        detail: { previousArticleId, articleId: currentArticleId }
      }));

      $('editor-context').textContent =
        `${statusLabel(updated?.status)} · Revizija ${currentArticleRevision ?? '—'}`;

      setMessage(
        'editor-message',
        'Izmjene su spremljene.'
      );
    } catch (error) {
      setMessage(
        'editor-message',
        friendlyError(error),
        true
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitArticle() {
    if (!currentArticleId || busy || isAdmin()) return;

    if (editorValuesChanged()) {
      setMessage(
        'editor-message',
        'Imaš nespremljene izmjene. Prvo spremi članak, zatim ga pošalji.',
        true
      );
      return;
    }

    const confirmed = confirm(
      'Želiš li poslati članak na odobrenje? Nakon slanja nećeš ga moći uređivati dok ne bude vraćen na doradu.'
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage(
      'editor-message',
      'Slanje na odobrenje...'
    );

    try {
      const { error } = await db.rpc(
        'journal_submit_article',
        {
          p_article_id: currentArticleId
        }
      );

      if (error) throw error;

      setBusy(false);
      closeEditor();

      await refreshDashboard();

      setMessage(
        'dashboard-message',
        'Članak je uspješno poslan na odobrenje.'
      );
    } catch (error) {
      setMessage(
        'editor-message',
        friendlyError(error),
        true
      );
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id) {
    if (busy) return;

    closeEditor();

    const article = articleById(id);
    if (!article) return;

    selectedArticleId = id;
    $('detail-panel').hidden = false;
    $('revision-section').hidden = true;
    $('schedule-section').hidden = true;
    $('revision-note').value = '';

    $('detail-title').textContent =
      article.title || 'Bez naslova';

    const meta = [
      statusLabel(article.status),
      categoryLabel(article.category),
      dateLabel(article.updated_at),
      `Revizija ${article.revision_number ?? '—'}`
    ];
    if (article.status === 'scheduled') meta.push('Zakazano: ' + dateLabel(article.scheduled_at));
    if (article.published_at) meta.push('Objavljeno: ' + dateLabel(article.published_at));

    if (isAdmin()) {
      meta.push(personName(article.author_id));
    }
    const assignedColumn = columns.find(c => c.id === article.column_id);
    const byline = article.category === 'personal'
      ? assignedColumn?.public_byline || personName(article.author_id)
      : profiles.find(p => p.id === article.author_id)?.role === 'admin'
        ? 'MOVE&TRY Editorial'
        : authorPermissions.get(article.author_id)?.contributor_byline ||
          personName(article.author_id);
    meta.push('Potpis: ' + byline);

    $('detail-meta').textContent = meta.join(' · ');
    $('detail-excerpt').textContent = article.excerpt || '';
    const hrBody = $('detail-content');
    if (window.MoveTryJournalFormatting?.renderText) {
      window.MoveTryJournalFormatting.renderText(hrBody,article.content || '');
      window.MoveTryJournalMedia?.hydrate(hrBody);
    } else {
      hrBody.textContent = article.content || 'Članak nema teksta.';
    }
    $('detail-en-section').hidden = !isAdmin() && !article.title_en && !article.excerpt_en && !article.content_en;
    $('detail-title-en').textContent = article.title_en || 'Engleski naslov nije unesen';
    $('detail-excerpt-en').textContent = article.excerpt_en || '';
    const enBody = $('detail-content-en');
    if (window.MoveTryJournalFormatting?.renderText) {
      window.MoveTryJournalFormatting.renderText(enBody,article.content_en || '');
      window.MoveTryJournalMedia?.hydrate(enBody);
    } else {
      enBody.textContent = article.content_en || 'Engleski tekst nije unesen.';
    }

    const cover = $('detail-cover');
    cover.hidden = true;
    cover.removeAttribute('src');

    if (article.cover_image) {
      if (window.MoveTryJournalMedia?.isMediaRef(article.cover_image)) {
        cover.dataset.mtMediaRequested=article.cover_image;
        void window.MoveTryJournalMedia.setImage(cover,article.cover_image);
      } else {
        try {
          const url = new URL(article.cover_image);
          if (url.protocol === 'https:') {
            cover.src = url.href;
            cover.hidden = false;
          }
        } catch (_) {
          // Ne prikazujemo neispravnu poveznicu.
        }
      }
    }

    const actions = $('detail-actions');
    actions.replaceChildren();

    if (isAdmin()) {
      if (
        ['draft', 'submitted', 'revision', 'approved']
          .includes(article.status)
      ) {
        actions.appendChild(
          makeButton(
            'UREDI KAO ADMINISTRATOR',
            () => openEditor(article, true)
          )
        );
      }

      if (article.status === 'approved') {
        actions.appendChild(makeButton('OBJAVI ODMAH', () => publishArticle(id), 'btn green'));
        actions.appendChild(makeButton('ZAKAŽI OBJAVU', () => {
          $('schedule-section').hidden = false;
          $('schedule-date').focus();
        }, 'btn secondary'));
      }

      if (article.status === 'submitted') {
        actions.appendChild(
          makeButton(
            'ODOBRI ČLANAK',
            () => approveArticle(id),
            'btn green'
          )
        );

        actions.appendChild(
          makeButton(
            'VRATI NA DORADU',
            () => {
              $('revision-section').hidden = false;
              $('revision-note').focus();
            },
            'btn secondary'
          )
        );
      }
    }

    if (
      article.author_id === currentUser.id &&
      ['draft', 'revision'].includes(article.status)
    ) {
      actions.appendChild(
        makeButton(
          'UREDI SVOJ ČLANAK',
          () => openEditor(article)
        )
      );
    }

    setMessage('detail-message', '');

    $('detail-comments').replaceChildren();
    $('detail-versions').replaceChildren();
    $('detail-activity').replaceChildren();

    $('detail-comments').appendChild(
      emptyMessage('Učitavanje komentara...')
    );

    $('detail-versions').appendChild(
      emptyMessage('Učitavanje verzija...')
    );

    $('detail-activity').appendChild(
      emptyMessage('Učitavanje aktivnosti...')
    );

    $('detail-panel').scrollIntoView({
      behavior: 'smooth'
    });

    await loadArticleDetails(id);
  }

  function closeDetail() {
    $('detail-panel').hidden = true;
    $('revision-section').hidden = true;
    $('schedule-section').hidden = true;
    selectedArticleId = null;

    setMessage('detail-message', '');
  }

  async function loadArticleDetails(id) {
    const [comments, versions, activity] = await Promise.all([
      db.from('journal_comments')
        .select('id, article_id, author_id, content, comment_type, created_at')
        .eq('article_id', id)
        .order('created_at', { ascending: true })
        .limit(500),

      db.from('journal_article_versions')
        .select('id, article_id, version_number, title, excerpt, content, title_en, excerpt_en, content_en, category, cover_image, edited_by, change_note, created_at')
        .eq('article_id', id)
        .order('version_number', { ascending: false })
        .limit(500),

      db.from('journal_activity_log')
        .select('id, article_id, actor_id, action, details, created_at')
        .eq('article_id', id)
        .order('created_at', { ascending: false })
        .limit(500)
    ]);

    if (selectedArticleId !== id) return;

    renderComments(comments);
    renderVersions(versions);
    renderActivity(activity);
  }

  function renderComments(result) {
    const target = $('detail-comments');
    target.replaceChildren();

    if (result.error) {
      target.appendChild(
        emptyMessage(
          'Komentari nisu dostupni: ' +
          friendlyError(result.error)
        )
      );
      return;
    }

    if (!result.data?.length) {
      target.appendChild(
        emptyMessage('Još nema komentara.')
      );
      return;
    }

    result.data.forEach(comment => {
      const box = createElement('div', 'note');

      const type =
        comment.comment_type === 'revision_request'
          ? 'Zahtjev za doradu'
          : comment.comment_type === 'editorial_note'
            ? 'Urednička napomena'
            : 'Komentar';

      box.appendChild(
        createElement(
          'div',
          'note-meta',
          `${type} · ${personName(comment.author_id)} · ${dateLabel(comment.created_at)}`
        )
      );

      box.appendChild(
        createElement(
          'div',
          'note-body',
          comment.content || ''
        )
      );

      target.appendChild(box);
    });
  }

  function renderVersions(result) {
    const target = $('detail-versions');
    target.replaceChildren();

    if (result.error) {
      target.appendChild(
        emptyMessage(
          'Povijest verzija nije dostupna: ' +
          friendlyError(result.error)
        )
      );
      return;
    }

    if (!result.data?.length) {
      target.appendChild(
        emptyMessage('Nema spremljenih verzija.')
      );
      return;
    }

    result.data.forEach(version => {
      const row = createElement('div', 'version-row');

      const heading = createElement(
        'div',
        '',
        `Verzija ${version.version_number} · ${dateLabel(version.created_at)} · ${personName(version.edited_by)}`
      );

      row.appendChild(heading);

      const button = makeButton(
        'PRIKAŽI VERZIJU',
        () => {
          const isHidden = details.hidden;
          details.hidden = !isHidden;
                    button.textContent = isHidden
            ? 'SAKRIJ VERZIJU'
            : 'PRIKAŽI VERZIJU';
        },
        'btn secondary small-btn'
      );

      button.style.marginTop = '10px';

      const details = createElement(
        'div',
        'version-content'
      );

      details.hidden = true;

      const lines = [
        `Naslov: ${version.title || 'Bez naslova'}`,
        `Kategorija: ${categoryLabel(version.category)}`,
        '',
        version.excerpt || '',
        '',
        version.content || '',
        '',
        'ENGLISH VERSION',
        `Title: ${version.title_en || '—'}`,
        version.excerpt_en || '',
        '',
        version.content_en || '',
        '',
        version.change_note
          ? `Napomena: ${version.change_note}`
          : ''
      ];

      details.textContent = lines.join('\n');

      row.append(button, details);
      target.appendChild(row);
    });
  }

  function renderActivity(result) {
    const target = $('detail-activity');
    target.replaceChildren();

    if (result.error) {
      target.appendChild(
        emptyMessage(
          'Dnevnik nije dostupan: ' +
          friendlyError(result.error)
        )
      );
      return;
    }

    if (!result.data?.length) {
      target.appendChild(
        emptyMessage('Nema zabilježenih aktivnosti.')
      );
      return;
    }

    result.data.forEach(item => {
      const row = createElement('div', 'version-row');

      row.textContent = [
        ACTIONS[item.action] || item.action,
        personName(item.actor_id),
        dateLabel(item.created_at)
      ].join(' · ');

      target.appendChild(row);
    });
  }


  // Convert Zagreb wall-clock time to an unambiguous UTC instant, including DST.
  function zagrebTimeToIso(dateValue, timeValue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) {
      throw new Error('Odaberi datum i vrijeme objave.');
    }
    const desired = `${dateValue}T${timeValue}`;
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    const matching = [];
    const guess = Date.parse(desired + ':00Z');
    for (let offset = -180; offset <= 180; offset += 30) {
      const instant = new Date(guess + offset * 60000);
      const parts = Object.fromEntries(formatter.formatToParts(instant).map(x => [x.type, x.value]));
      if (`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` === desired) {
        matching.push(instant.toISOString());
      }
    }
    const unique = [...new Set(matching)];
    if (unique.length === 0) throw new Error('Odabrano lokalno vrijeme ne postoji zbog promjene sata. Odaberi drugo vrijeme.');
    if (unique.length > 1) throw new Error('Odabrano vrijeme pojavljuje se dvaput zbog promjene sata. Odaberi drugo vrijeme.');
    if (Date.parse(unique[0]) <= Date.now()) throw new Error('Datum i vrijeme objave moraju biti u budućnosti.');
    return unique[0];
  }

  async function publishArticle(id, schedule = false) {
    if (!isAdmin() || busy || selectedArticleId !== id) return;
    const article = articleById(id);
    if (!article || article.status !== 'approved') {
      setMessage('detail-message', 'Osvježi članak prije objavljivanja.', true);
      return;
    }
    const required = [article.title, article.excerpt, article.content,
      article.title_en, article.excerpt_en, article.content_en];
    if (required.some(value => !String(value || '').trim())) {
      setMessage('detail-message', 'Prije objave popuni HR i EN naslov, opis i tekst u administratorskom uređivanju.', true);
      return;
    }
    let scheduledAt = null;
    if (schedule) {
      try { scheduledAt = zagrebTimeToIso($('schedule-date').value, $('schedule-time').value); }
      catch (error) { setMessage('detail-message', friendlyError(error), true); return; }
    }
    const question = schedule
      ? `Zakaži objavu članka za ${dateLabel(scheduledAt)} (Zagreb)?`
      : 'Objaviti članak odmah? Ova radnja mijenja status u Objavljeno.';
    if (!confirm(question)) return;
    setBusy(true);
    setMessage('detail-message', schedule ? 'Zakazivanje objave...' : 'Objavljivanje...');
    try {
      const { error } = await db.rpc('journal_publish_or_schedule', {
        p_article_id: id,
        p_expected_revision: article.revision_number,
        p_scheduled_at: scheduledAt
      });
      if (error) throw error;
      await refreshDashboard();
      setBusy(false);
      await openDetail(id);
      setMessage('detail-message', schedule
        ? `Objava je zakazana za ${dateLabel(scheduledAt)}.`
        : 'Članak je objavljen u bazi. Prikaz na javnom Journalu povezujemo zasebno.');
    } catch (error) {
      setMessage('detail-message', friendlyError(error), true);
    } finally { setBusy(false); }
  }

  async function approveArticle(id) {
    if (!isAdmin() || busy) return;

    if (
      !confirm(
        'Želiš li odobriti ovaj članak? Odobravanje ne znači javnu objavu.'
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage(
      'detail-message',
      'Odobravanje...'
    );

    try {
      const { error } = await db.rpc(
        'journal_approve_article',
        {
          p_article_id: id
        }
      );

      if (error) throw error;

      await refreshDashboard();

      setBusy(false);
      await openDetail(id);

      setMessage(
        'detail-message',
        'Članak je odobren. Još nije javno objavljen.'
      );
    } catch (error) {
      setMessage(
        'detail-message',
        friendlyError(error),
        true
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestRevision() {
    if (!isAdmin() || !selectedArticleId || busy) return;

    const id = selectedArticleId;
    const note = $('revision-note').value.trim();

    if (!note) {
      setMessage(
        'detail-message',
        'Napiši napomenu prije vraćanja članka na doradu.',
        true
      );
      return;
    }

    setBusy(true);
    setMessage(
      'detail-message',
      'Vraćanje na doradu...'
    );

    try {
      const { error } = await db.rpc(
        'journal_request_revision_with_note',
        {
          p_article_id: id,
          p_note: note
        }
      );

      if (error) throw error;

      await refreshDashboard();

      setBusy(false);
      await openDetail(id);

      setMessage(
        'detail-message',
        'Članak je vraćen na doradu, a napomena je spremljena.'
      );
    } catch (error) {
      setMessage(
        'detail-message',
        friendlyError(error),
        true
      );
    } finally {
      setBusy(false);
    }
  }

  async function addComment() {
    if (!selectedArticleId || busy) return;

    const content = $('new-comment').value.trim();

    if (!content) {
      setMessage(
        'detail-message',
        'Napiši komentar.',
        true
      );
      return;
    }

    setBusy(true);
    setMessage(
      'detail-message',
      'Spremanje komentara...'
    );

    try {
      const id = selectedArticleId;

      const { error } = await db
        .from('journal_comments')
        .insert({
          article_id: id,
          author_id: currentUser.id,
          content,
          comment_type: 'comment'
        });

      if (error) throw error;

      $('new-comment').value = '';

      await loadArticleDetails(id);

      setMessage(
        'detail-message',
        'Komentar je spremljen.'
      );
    } catch (error) {
      setMessage(
        'detail-message',
        friendlyError(error),
        true
      );
    } finally {
      setBusy(false);
    }
  }


  // Obavijesti su trajne i neovisne o push pretplati.
  const NOTIFICATION_ACTIONS = {
    submitted: 'Članak je poslan na odobrenje',
    revision_requested: 'Zatražena je dorada članka',
    approved: 'Članak je odobren',
    comment_added: 'Novi komentar na članku'
  };

  function setToolbarVisible(visible) {
    $('editor-toolbar').hidden = !visible;
    $('topbar-note').hidden = visible;
    if (!visible) {
      $('settings-panel').hidden = true;
      $('notification-panel').hidden = true;
    }
  }

  function renderNotifications() {
    const unread = notifications.filter(item => !item.read_at).length;
    $('notification-count').hidden = unread === 0;
    $('notification-count').textContent = unread > 99 ? '99+' : String(unread);
    $('notifications-btn').setAttribute('aria-label', `Centar obavijesti, ${unread} nepročitanih`);
    $('mark-all-read-btn').disabled = unread === 0;
    const target = $('notification-list');
    target.replaceChildren();
    if (!notifications.length) {
      target.appendChild(emptyMessage('Nema obavijesti za prikaz.'));
      return;
    }
    for (const item of notifications) {
      const activity = item.journal_activity_log;
      const article = activity ? articleById(activity.article_id) : null;
      const button = createElement('button', 'notification-item' + (!item.read_at ? ' unread' : ''));
      button.type = 'button';
      button.appendChild(createElement('strong', '', NOTIFICATION_ACTIONS[activity?.action] || 'Urednička obavijest'));
      button.appendChild(createElement('span', '', (article?.title || 'Članak') + ' · ' + dateLabel(item.created_at)));
      button.addEventListener('click', () => openNotification(item));
      target.appendChild(button);
    }
  }

  async function refreshNotifications() {
    if (!currentUser) return;
    const request = ++notificationRequest;
    const { data, error } = await db.from('journal_notifications')
      .select('id, activity_id, created_at, read_at, journal_activity_log!journal_notifications_activity_id_fkey(article_id, action, details)')
      .eq('recipient_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    if (request !== notificationRequest) return;
    notifications = data || [];
    renderNotifications();
  }

  async function markNotificationsRead(ids = null) {
    const { error } = await db.rpc('journal_mark_notifications_read', {
      p_notification_ids: ids
    });
    if (error) throw error;
    const chosen = ids ? new Set(ids) : null;
    notifications.forEach(item => {
      if (!item.read_at && (!chosen || chosen.has(item.id))) item.read_at = new Date().toISOString();
    });
    renderNotifications();
  }

  async function openNotification(item) {
    try {
      if (!item.read_at) await markNotificationsRead([item.id]);
      const articleId = item.journal_activity_log?.article_id;
      if (!articleId) {
        setMessage('notifications-message', 'Povezani članak nije dostupan.', true);
        return;
      }
      $('notification-panel').hidden = true;
      $('notifications-btn').setAttribute('aria-expanded', 'false');
      await openArticleLink(articleId);
    } catch (error) {
      setMessage('notifications-message', friendlyError(error), true);
    }
  }

  async function openArticleLink(id) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) return;
    if (!articleById(id)) {
      await refreshDashboard();
    }
    if (!articleById(id)) {
      setMessage('dashboard-message', 'Članak nije dostupan ili nemaš pristup.', true);
      return;
    }
    switchTab(isAdmin() ? 'all' : 'mine');
    await openDetail(id);
    const url = new URL(window.location.href);
    url.searchParams.set('article', id);
    history.replaceState({}, '', url.pathname + url.search);
  }

  async function openInitialArticle() {
    const id = new URLSearchParams(window.location.search).get('article');
    if (id) await openArticleLink(id);
  }

  function closeSettings() {
    $('settings-panel').hidden = true;
    $('settings-btn').setAttribute('aria-expanded', 'false');
  }

  // PUSH: user-initiated subscription, no background permission prompts.
  function pushSupported() {
    return window.isSecureContext && 'serviceWorker' in navigator &&
      'PushManager' in window && 'Notification' in window;
  }

  function decodeVapidKey(base64url) {
    const normalized = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (bytes.length !== 65) throw new Error('VAPID ključ nije ispravnog formata.');
    return bytes;
  }

  async function refreshPushStatus() {
    const button = $('push-enable-btn');
    const status = $('push-status-text');
    if (!pushSupported()) {
      button.disabled = true;
      button.textContent = 'OBAVIJESTI NISU PODRŽANE';
      status.textContent = 'Ovaj preglednik ne podržava push obavijesti.';
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration('./');
      const subscription = registration && await registration.pushManager.getSubscription();
      const enabled = Boolean(subscription);
      button.disabled = pushBusy || (!enabled && Notification.permission === 'denied');
      button.textContent = enabled ? 'ISKLJUČI OBAVIJESTI' : 'UKLJUČI OBAVIJESTI';
      status.textContent = enabled ? 'Push obavijesti uključene su na ovom uređaju.' :
        Notification.permission === 'denied' ? 'Obavijesti su blokirane u postavkama preglednika.' :
        'Push obavijesti isključene su na ovom uređaju.';
    } catch (error) {
      button.disabled = true;
      status.textContent = 'Status obavijesti nije moguće provjeriti.';
      console.warn('Push status:', error);
    }
  }

  async function enableJournalPush() {
    if (!currentUser || pushBusy || !pushSupported()) return;
    pushBusy = true;
    $('push-enable-btn').disabled = true;
    try {
      const registration = await navigator.serviceWorker.getRegistration('./');
      const existing = registration && await registration.pushManager.getSubscription();
      const { data: sessionData, error: sessionError } = await db.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (sessionError || !token) throw new Error('Sesija je istekla. Prijavi se ponovno.');
      if (existing) {
        setMessage('push-message', 'Isključivanje obavijesti...');
        // Najprije brišemo zapis u bazi. Ako zahtjev ne uspije, zadržavamo pretplatu.
        const { data, error } = await db.functions.invoke('journal-push-subscribe', {
          body: { action: 'unsubscribe', endpoint: existing.endpoint },
          headers: { Authorization: `Bearer ${token}` }
        });
        if (error || !data?.success) throw new Error(data?.error || error?.message || 'Odjava pretplate nije uspjela.');
        const removed = await existing.unsubscribe();
        if (!removed) throw new Error('Pretplata je uklonjena iz baze, ali preglednik nije potvrdio odjavu. Pokušaj ponovno.');
        setMessage('push-message', 'Push obavijesti isključene su na ovom uređaju.');
      } else {
        if (Notification.permission === 'denied') throw new Error('Omogući obavijesti u postavkama preglednika.');
        setMessage('push-message', 'Uključivanje obavijesti...');
        const permission = Notification.permission === 'granted'
          ? 'granted' : await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Nisi dopustila obavijesti.');
        const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
        const { data: keyData, error: keyError } = await db.functions.invoke('journal-push-subscribe', {
          method: 'GET', headers: { Authorization: `Bearer ${token}` }
        });
        if (keyError || !keyData?.publicKey) throw new Error('Nije moguće dohvatiti javni push ključ.');
        const applicationServerKey = decodeVapidKey(keyData.publicKey);
        let subscription = await reg.pushManager.getSubscription();
        if (!subscription) subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        const { data, error } = await db.functions.invoke('journal-push-subscribe', {
          body: { subscription: subscription.toJSON() },
          headers: { Authorization: `Bearer ${token}` }
        });
        if (error || !data?.success) throw new Error(data?.error || error?.message || 'Pretplata nije spremljena.');
        setMessage('push-message', 'Push obavijesti uključene su na ovom uređaju.');
      }
    } catch (error) {
      setMessage('push-message', friendlyError(error), true);
    } finally {
      pushBusy = false;
      await refreshPushStatus();
    }
  }

  async function enterDashboard(user) {
    const profile = await loadProfile(user);

    if (!profile || !profile.is_active) {
      await db.auth.signOut();

      currentUser = null;
      currentProfile = null;
      setToolbarVisible(false);

      showView('login');

      setMessage(
        'login-message',
        'Ovaj račun nema aktivan pristup uredničkom prostoru.',
        true
      );

      return;
    }

    currentUser = user;
    currentProfile = profile;

    $('welcome-title').textContent =
      isAdmin()
        ? 'Urednički pregled.'
        : 'Moji članci.';

    $('user-description').textContent =
      `${profile.display_name || user.email} · ${
        isAdmin() ? 'Administrator' : 'Autor / urednik'
      }`;

    document.querySelectorAll('.admin-only').forEach(element => {
      element.hidden = !isAdmin();
    });

    showView('dashboard');
    setToolbarVisible(true);
    refreshPushStatus();

    await refreshDashboard();
    switchTab('home');
    try { await refreshNotifications(); }
    catch (error) { setMessage('dashboard-message', 'Obavijesti nisu učitane: ' + friendlyError(error), true); }
    await openInitialArticle();
  }

  async function initialize() {
    setToolbarVisible(false);
    try {
      const params = new URLSearchParams(
        window.location.search
      );

      const hash = new URLSearchParams(
        window.location.hash.substring(1)
      );

      const type =
        params.get('type') || hash.get('type');

      passwordFlow =
        type === 'recovery' || type === 'invite';

      if (params.get('code')) {
        const { error } =
          await db.auth.exchangeCodeForSession(
            params.get('code')
          );

        if (error) throw error;
      }

      const {
        data: { session },
        error
      } = await db.auth.getSession();

      if (error) throw error;

      if (passwordFlow && session) {
        showView('password');
      } else if (session?.user) {
        await enterDashboard(session.user);
      } else {
        showView('login');
      }
    } catch (error) {
      showView('login');

      setMessage(
        'login-message',
        friendlyError(error),
        true
      );
    }
  }

  $('login-form').addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      setMessage(
        'login-message',
        'Prijava...'
      );

      try {
        const email =
          $('login-email').value.trim();

        const password =
          $('login-password').value;

        const { data, error } =
          await db.auth.signInWithPassword({
            email,
            password
          });

        if (error) throw error;

        await enterDashboard(data.user);
      } catch (error) {
        showView('login');

        setMessage(
          'login-message',
          friendlyError(error),
          true
        );
      }
    }
  );

  $('password-form').addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      const password =
        $('new-password').value;

      const confirmation =
        $('confirm-password').value;

      if (password !== confirmation) {
        setMessage(
          'password-message',
          'Lozinke se ne podudaraju.',
          true
        );
        return;
      }

      setMessage(
        'password-message',
        'Spremanje lozinke...'
      );

      try {
        const { error } =
          await db.auth.updateUser({
            password
          });

        if (error) throw error;

        history.replaceState(
          {},
          '',
          window.location.pathname
        );

        passwordFlow = false;

        const {
          data: { user },
          error: userError
        } = await db.auth.getUser();

        if (userError) throw userError;

        if (user) {
          await enterDashboard(user);
        } else {
          showView('login');
        }
      } catch (error) {
        setMessage(
          'password-message',
          friendlyError(error),
          true
        );
      }
    }
  );

  $('forgot-password').addEventListener(
    'click',
    async () => {
      const email =
        $('login-email').value.trim();

      if (!email) {
        setMessage(
          'login-message',
          'Prvo upiši svoju e-mail adresu.',
          true
        );
        return;
      }

      setMessage(
        'login-message',
        'Slanje poveznice...'
      );

      const { error } =
        await db.auth.resetPasswordForEmail(
          email,
          {
            redirectTo:
              	new URL('./', window.location.href).href
          }
        );

      setMessage(
        'login-message',
        error
          ? friendlyError(error)
          : 'Ako račun postoji, poslana je poruka za promjenu lozinke.',
        !!error
      );
    }
  );

  $('push-enable-btn').addEventListener('click', enableJournalPush);
  $('settings-btn').addEventListener('click', async () => {
    const opening = $('settings-panel').hidden;
    $('settings-panel').hidden = !opening;
    $('settings-btn').setAttribute('aria-expanded', String(opening));
    if (opening) {
      $('notification-panel').hidden = true;
      $('notifications-btn').setAttribute('aria-expanded', 'false');
      await refreshPushStatus();
    }
  });
  $('notifications-btn').addEventListener('click', async () => {
    const opening = $('notification-panel').hidden;
    $('notification-panel').hidden = !opening;
    $('notifications-btn').setAttribute('aria-expanded', String(opening));
    closeSettings();
    if (opening) {
      setMessage('notifications-message', '');
      try { await refreshNotifications(); }
      catch (error) { setMessage('notifications-message', friendlyError(error), true); }
      $('notification-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  $('close-notifications-btn').addEventListener('click', () => {
    $('notification-panel').hidden = true;
    $('notifications-btn').setAttribute('aria-expanded', 'false');
  });
  $('mark-all-read-btn').addEventListener('click', async () => {
    try { await markNotificationsRead(); setMessage('notifications-message', 'Sve obavijesti označene su pročitanima.'); }
    catch (error) { setMessage('notifications-message', friendlyError(error), true); }
  });
  document.addEventListener('click', event => {
    if (!$('settings-panel').hidden && !event.target.closest('#settings-panel, #settings-btn')) closeSettings();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSettings(); });

  $('logout-btn').addEventListener(
    'click',
    async () => {
      $('editor-panel').dispatchEvent(new Event('journal-editor-logout'));
      await db.auth.signOut();

      dashboardRequest++;

      currentUser = null;
      currentProfile = null;
      articles = [];
      profiles = [];
      selectedArticleId = null;
      currentArticleId = null;

      $('detail-panel').hidden = true;
      $('editor-panel').hidden = true;
      notifications = [];
      notificationRequest++;
      renderNotifications();
      setToolbarVisible(false);
      showView('login');
    }
  );

  $('refresh-btn').addEventListener(
    'click',
    async () => {
      setMessage(
        'dashboard-message',
        'Osvježavanje...'
      );

      try {
        const profile =
          await loadProfile(currentUser);

        if (!profile || !profile.is_active) {
          await db.auth.signOut();

          currentUser = null;
          currentProfile = null;

          showView('login');

          setMessage(
            'login-message',
            'Urednički pristup više nije aktivan.',
            true
          );
          return;
        }

        currentProfile = profile;

        await refreshDashboard();
        await refreshNotifications();
        await refreshPushStatus();

        setMessage(
          'dashboard-message',
          'Podaci su osvježeni.'
        );
      } catch (error) {
        setMessage(
          'dashboard-message',
          friendlyError(error),
          true
        );
      }
    }
  );

  document
    .querySelectorAll('[data-tab]')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          switchTab(button.dataset.tab);
        }
      );
    });

  document
    .querySelectorAll('[data-stat-filter]')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          openStatArticles(
            button.dataset.statFilter
          );
        }
      );
    });

  $('my-article-status-filter').addEventListener(
    'change',
    renderMyArticles
  );

  $('article-search').addEventListener(
    'input',
    renderAllArticles
  );

  $('article-status-filter').addEventListener(
    'change',
    renderAllArticles
  );

  $('article-writing-mode').addEventListener('change',()=>{
    if(isAdmin()||currentArticleId)return;
    const chosen=$('article-writing-mode').value;
    configureWritingMode(null,chosen);
    $('article-category').dispatchEvent(new Event('input',{bubbles:true}));
  });

  $('column-create-form').addEventListener('submit',event=>{
    event.preventDefault();
    if(!isAdmin()||!columnsAvailable||busy)return;
    const writer=$('column-writer').value;
    const title=$('column-title').value.trim();
    const slug=$('column-slug').value.trim();
    const byline=$('column-byline').value.trim();
    const description=$('column-description').value.trim();
    if(!writer||!title||!byline||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){
      setMessage('column-message','Provjeri kolumnista, naziv, potpis i URL oznaku.',true);return;
    }
    if(!confirm('Dodijeliti kolumnu odabranom autoru?'))return;
    void saveColumnRpc('journal_admin_create_column',{
      p_columnist_id:writer,p_title:title,p_slug:slug,
      p_public_byline:byline,p_description:description});
  });

  $('invite-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!isAdmin() || busy) return;

    const name = $('invite-name').value.trim();
    const email = $('invite-email').value.trim().toLowerCase();
    const canWriteColumn = $('invite-columnist').checked;
    const canContribute = $('invite-contributor').checked;
    if (!name || !email || !$('invite-email').checkValidity()) {
      setMessage('invite-message', 'Upiši ime i ispravnu e-mail adresu.', true);
      return;
    }

    if (!canWriteColumn && !canContribute) {
      setMessage('invite-message','Odaberi kolumnista, suradnika ili obje mogućnosti.',true);
      return;
    }
    if (!permissionManagementAvailable) {
      setMessage('invite-message','Autorske ovlasti još nisu pripremljene u Supabaseu. Pozivnica nije poslana.',true);
      return;
    }
    if (!confirm(`Poslati pozivnicu na ${email}?\n\nOvlasti: ${[
      canWriteColumn ? 'Kolumnist' : '',
      canContribute ? 'Suradnik' : ''
    ].filter(Boolean).join(' + ')}`)) return;

    const button = $('invite-submit-btn');
    button.disabled = true;
    setMessage('invite-message', 'Slanje pozivnice...');

    try {
      const { data: sessionData, error: sessionError } = await db.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Sesija je istekla. Prijavi se ponovno.');
      }

      const { data, error } = await db.functions.invoke('journal-invite-collaborator-v2', {
        body: { email, display_name: name,
          can_write_column: canWriteColumn,
          can_contribute: canContribute },
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` }
      });

      if (error) {
        // FunctionsHttpError može sadržavati detaljniju poruku u HTTP odgovoru.
        let detail = '';
        try {
          const body = await error.context?.json();
          detail = body?.error || '';
        } catch (_) { /* Nema JSON tijela. */ }
        throw new Error(detail || error.message || 'Slanje pozivnice nije uspjelo.');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Nije potvrđeno slanje pozivnice.');
      }

      setMessage('invite-message', data.message || 'Pozivnica je obrađena.');
      $('invite-form').reset();
      try {
        await refreshDashboard();
      } catch (refreshError) {
        setMessage('dashboard-message', 'Pozivnica je obrađena, ali popis suradnika nije osvježen: ' + friendlyError(refreshError), true);
      }
    } catch (error) {
      setMessage('invite-message', friendlyError(error), true);
    } finally {
      button.disabled = false;
    }
  });

  $('new-article-btn').addEventListener(
    'click',
    () => openEditor()
  );

  $('close-editor-btn').addEventListener(
    'click',
    closeEditor
  );

  $('article-form').addEventListener(
    'submit',
    saveDraft
  );

  $('submit-article-btn').addEventListener(
    'click',
    submitArticle
  );

  $('close-detail-btn').addEventListener(
    'click',
    closeDetail
  );

  $('cancel-revision-btn').addEventListener(
    'click',
    () => {
      $('revision-section').hidden = true;
      $('revision-note').value = '';
    }
  );

  $('confirm-revision-btn').addEventListener(
    'click',
    requestRevision
  );

  $('confirm-schedule-btn').addEventListener('click', () => {
    if (selectedArticleId) publishArticle(selectedArticleId, true);
  });
  $('cancel-schedule-btn').addEventListener('click', () => {
    $('schedule-section').hidden = true;
  });

  $('add-comment-btn').addEventListener(
    'click',
    addComment
  );

  initialize();
})();
