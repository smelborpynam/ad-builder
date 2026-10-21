(() => {
  'use strict';
  const { FONTS, SIZE_PRESETS, PACKS, SEED_THEATRES } = AdPresets;
  const R = AdRender;

  // ---------- Utilities ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => String(s || '').replace(/×/g, 'x').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 40) || 'ad';
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));

  const state = { acts: [], theatres: [], shows: [], tab: 'shows', galleryShowId: null, items: [], format: 'jpg' };
  const actById = (id) => state.acts.find((a) => a.id === id);
  const theatreById = (id) => state.theatres.find((t) => t.id === id);
  const showById = (id) => state.shows.find((s) => s.id === id);

  // Images are loaded once per photo id and reused.
  const blobUrls = new Map();
  const imgs = new Map();
  function blobUrl(key, blob) {
    if (!blobUrls.has(key)) blobUrls.set(key, URL.createObjectURL(blob));
    return blobUrls.get(key);
  }
  function loadImage(key, blob) {
    if (!imgs.has(key)) {
      imgs.set(key, new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => { imgs.delete(key); reject(new Error('Could not read image')); };
        im.src = blobUrl(key, blob);
      }));
    }
    return imgs.get(key);
  }

  const fontsReady = Promise.race([
    Promise.all(FONTS.filter((f) => !f.system).map((f) => document.fonts.load(`${f.weight} 40px "${f.family}"`).catch(() => {}))),
    new Promise((r) => setTimeout(r, 5000)),
  ]);

  async function save(store, obj) {
    try {
      await DB.put(store, obj);
      markChanged();
      return true;
    } catch (err) {
      alert(`Couldn't save: ${err && err.name === 'QuotaExceededError' ? 'the browser is out of storage space. Try smaller photos or delete old acts.' : (err && err.message) || err}`);
      return false;
    }
  }

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
  }

  function progress(text, frac) {
    const el = $('#progress');
    if (text === null) { el.hidden = true; return; }
    el.hidden = false;
    $('#progressText').textContent = text;
    $('#progressBar').style.width = `${Math.round((frac || 0) * 100)}%`;
  }

  // ---------- Startup ----------
  async function init() {
    try {
      await DB.open();
    } catch (err) {
      document.body.innerHTML = `<main><div class="empty"><h3>Storage unavailable</h3><p>This browser blocked local storage (${esc(err && err.message)}). Try Chrome or Edge, and not a private window.</p></div></main>`;
      return;
    }
    await seedIfNeeded();
    await reload();
    bindGlobal();
    bindActEditor();
    bindTheatreEditor();
    bindShowEditor();
    renderHome();
    await loadBackupState();
    setInterval(renderBackupStatus, 60000);
  }

  async function seedIfNeeded() {
    const meta = await DB.get('meta', 'seeded');
    if (meta) return;
    for (const t of SEED_THEATRES) {
      await DB.put('theatres', {
        id: uid(), name: t.name, displayName: t.displayName, city: t.city, state: t.state, notes: t.notes,
        sizes: t.sizes.map((r) => normalizeRow(r)),
      });
    }
    await DB.put('meta', { id: 'seeded', at: Date.now() });
  }

  function normalizeRow(r) {
    return { id: uid(), label: r.label || '', w: r.w, h: r.h, unit: r.unit || 'px', count: r.count ?? 1, localized: r.localized !== false, minimal: !!r.minimal };
  }

  async function reload() {
    [state.acts, state.theatres, state.shows] = await Promise.all([DB.all('acts'), DB.all('theatres'), DB.all('shows')]);
    state.acts.sort((a, b) => a.name.localeCompare(b.name));
    state.theatres.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------- Global UI ----------
  function bindGlobal() {
    const menuBtn = $('#fileMenuBtn'), menu = $('#fileMenu');
    const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    $$('.tab').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; renderHome(); }));

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const id = el.dataset.id;
      switch (el.dataset.action) {
        case 'new-act': openActEditor(null); break;
        case 'edit-act': openActEditor(actById(id)); break;
        case 'delete-act': deleteAct(id); break;
        case 'new-theatre': openTheatreEditor(null); break;
        case 'edit-theatre': openTheatreEditor(theatreById(id)); break;
        case 'copy-theatre': openTheatreEditor(theatreById(id), true); break;
        case 'delete-theatre': deleteTheatre(id); break;
        case 'new-show': openShowEditor(null); break;
        case 'edit-show': openShowEditor(showById(id)); break;
        case 'open-show': openGallery(id); break;
        case 'delete-show': deleteShow(id); break;
        case 'export': exportBackup(); break;
        case 'import': $('#importFile').click(); break;
        case 'backup-folder': chooseBackupFolder(); break;
        case 'backup-now': onBackupPill(); break;
        case 'restore-folder': restoreFromFolder(); break;
        default: return;
      }
    });

    $('#importFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) await importBackup(f);
    });

    // Close buttons inside dialogs
    $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  }

  // ---------- Home lists ----------
  function renderHome() {
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
    $$('.tab-panel').forEach((p) => { p.hidden = p.id !== `tab-${state.tab}`; });
    $('#countShows').textContent = state.shows.length;
    $('#countActs').textContent = state.acts.length;
    $('#countTheatres').textContent = state.theatres.length;
    renderShowsList();
    renderActsList();
    renderTheatresList();
  }

  function empty(title, text, action, label) {
    return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p><button class="btn primary" data-action="${action}">${esc(label)}</button></div>`;
  }

  function thumbFor(act) {
    const p = act && act.photos && act.photos[0];
    return p ? `<img src="${blobUrl(p.id, p.blob)}" alt="">` : '◆';
  }

  const firstDate = (s) => ((s.dates || []).map((d) => d.date).filter(Boolean).sort()[0] || '9999');
  const showTotal = (s, th) => s.total || (th ? R.theatreTotal(th) : 0);

  function renderShowsList() {
    const el = $('#tab-shows');
    if (!state.shows.length) {
      el.innerHTML = empty('No shows yet', 'A show is one act playing at one theatre on one or more dates. Set up your acts and theatres, then create a show to make its ad images.', 'new-show', '+ Create New Show');
      return;
    }
    const sorted = [...state.shows].sort((a, b) => firstDate(a).localeCompare(firstDate(b)));
    el.innerHTML = `<div class="list">${sorted.map((s) => {
      const act = actById(s.actId), th = theatreById(s.theatreId);
      return `<div class="row-card">
        <div class="thumb">${thumbFor(act)}</div>
        <div>
          <div class="row-title">${esc(act ? act.name : 'Missing act')} <span class="at">at</span> ${esc(th ? th.name : 'Missing theatre')}</div>
          <div class="row-sub">${esc(R.formatDates(s.dates, s.showTimes) || 'No dates')} · ${showTotal(s, th)} images</div>
        </div>
        <div class="row-actions">
          <button class="btn primary small" data-action="open-show" data-id="${s.id}">Open ads</button>
          <button class="btn small" data-action="edit-show" data-id="${s.id}">Edit</button>
          <button class="btn small ghost danger" data-action="delete-show" data-id="${s.id}">Delete</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  function renderActsList() {
    const el = $('#tab-acts');
    if (!state.acts.length) {
      el.innerHTML = empty('No acts yet', 'An act holds the photos and title design for one touring show. Set it up once and reuse it every year.', 'new-act', '+ New Act');
      return;
    }
    el.innerHTML = `<div class="list">${state.acts.map((a) => {
      const titled = a.photos.filter((p) => p.hasTitle).length;
      const title = a.logo ? 'Logo' : [a.title.pre, a.title.connector, a.title.main].filter(Boolean).join(' ') || 'No title set';
      return `<div class="row-card">
        <div class="thumb">${thumbFor(a)}</div>
        <div>
          <div class="row-title">${esc(a.name)}</div>
          <div class="row-sub">${a.photos.length} photo${a.photos.length === 1 ? '' : 's'}${titled ? ` (${titled} with title art)` : ''} · Title: ${esc(title)}</div>
        </div>
        <div class="row-actions">
          <button class="btn small" data-action="edit-act" data-id="${a.id}">Edit</button>
          <button class="btn small ghost danger" data-action="delete-act" data-id="${a.id}">Delete</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  function renderTheatresList() {
    const el = $('#tab-theatres');
    if (!state.theatres.length) {
      el.innerHTML = empty('No theatres yet', 'A theatre profile lists the image sizes and counts that venue asks for.', 'new-theatre', '+ New Theatre');
      return;
    }
    el.innerHTML = `<div class="list">${state.theatres.map((t) => {
      const where = [t.city, t.state].filter(Boolean).join(', ');
      const rows = R.validRows(t);
      return `<div class="row-card">
        <div class="thumb">🎭</div>
        <div>
          <div class="row-title">${esc(t.name)}</div>
          <div class="row-sub">${where ? `${esc(where)} · ` : ''}Ads say “${esc(t.displayName || t.name)}” · ${rows.length} size${rows.length === 1 ? '' : 's'} · ${R.theatreTotal(t)} images</div>
        </div>
        <div class="row-actions">
          <button class="btn small" data-action="edit-theatre" data-id="${t.id}">Edit</button>
          <button class="btn small ghost" data-action="copy-theatre" data-id="${t.id}">Duplicate</button>
          <button class="btn small ghost danger" data-action="delete-theatre" data-id="${t.id}">Delete</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  async function deleteAct(id) {
    const a = actById(id);
    const used = state.shows.filter((s) => s.actId === id).length;
    if (!confirm(`Delete the act “${a.name}”?${used ? `\n\n${used} show(s) use this act and will stop working.` : ''}`)) return;
    await DB.del('acts', id);
    markChanged();
    await reload(); renderHome();
  }
  async function deleteTheatre(id) {
    const t = theatreById(id);
    const used = state.shows.filter((s) => s.theatreId === id).length;
    if (!confirm(`Delete the theatre “${t.name}”?${used ? `\n\n${used} show(s) use this theatre and will stop working.` : ''}`)) return;
    await DB.del('theatres', id);
    markChanged();
    await reload(); renderHome();
  }
  async function deleteShow(id) {
    if (!confirm('Delete this show? The act and theatre are kept.')) return;
    await DB.del('shows', id);
    markChanged();
    await reload(); renderHome();
  }

  // ---------- Act editor ----------
  let actDraft = null;
  let actPreviewToken = 0;
  const PREVIEW_SIZES = [
    { w: 1200, h: 628, label: 'Google landscape 1200×628', full: true },
    { w: 1080, h: 1080, label: 'Square 1080×1080' },
    { w: 300, h: 600, label: 'Half page 300×600' },
    { w: 728, h: 90, label: 'Leaderboard 728×90', full: true },
  ];

  function newAct() {
    return {
      id: uid(), name: '', photos: [], logo: null,
      title: { pre: '', connector: '', main: '', sub: '' },
      style: { preFont: 'Great Vibes', mainFont: 'Josefin Sans', infoFont: 'Playfair Display', preColor: '#d4202f', mainColor: '#d9b45a', infoColor: '#f3d27a', infoGold: true, bgColor: '#0d0b0b' },
    };
  }

  function bindActEditor() {
    const opts = FONTS.map((f) => `<option value="${esc(f.family)}" style="font-family:'${esc(f.family)}'">${esc(f.family)}</option>`).join('');
    $$('#actForm .font-select').forEach((s) => { s.innerHTML = opts; });
    $('#actPreviewStyle').innerHTML = R.STYLES.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

    const form = $('#actForm');
    form.addEventListener('input', () => scheduleActPreview());
    $('#actPreviewStyle').addEventListener('change', () => scheduleActPreview());
    form.addEventListener('submit', async (e) => { e.preventDefault(); await saveAct(); });

    const drop = $('#photoDrop');
    $('#photoInput').addEventListener('change', async (e) => { await addPhotos([...e.target.files]); e.target.value = ''; });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', async (e) => { e.preventDefault(); drop.classList.remove('over'); await addPhotos([...e.dataTransfer.files]); });

    const grid = $('#photoGrid');
    grid.addEventListener('click', (e) => {
      const item = e.target.closest('.photo-item');
      if (!item) return;
      const p = actDraft.photos.find((x) => x.id === item.dataset.id);
      if (e.target.closest('[data-role=remove]')) {
        actDraft.photos = actDraft.photos.filter((x) => x !== p);
        renderPhotoGrid(); scheduleActPreview();
      } else if (e.target.matches('.photo-thumb img')) {
        const r = e.target.getBoundingClientRect();
        p.fx = clamp01((e.clientX - r.left) / r.width);
        p.fy = clamp01((e.clientY - r.top) / r.height);
        const dot = item.querySelector('.focus-dot');
        dot.style.left = `${p.fx * 100}%`;
        dot.style.top = `${p.fy * 100}%`;
        scheduleActPreview();
      }
    });
    grid.addEventListener('change', (e) => {
      if (!e.target.matches('[data-role=hasTitle]')) return;
      const p = actDraft.photos.find((x) => x.id === e.target.closest('.photo-item').dataset.id);
      p.hasTitle = e.target.checked;
      scheduleActPreview();
    });

    $('#logoInput').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const id = uid();
      try {
        const im = await loadImage(id, f);
        actDraft.logo = { id, blob: f, name: f.name, w: im.naturalWidth, h: im.naturalHeight };
      } catch { alert(`Couldn't read ${f.name}. Use a PNG or JPG.`); }
      renderLogo(); scheduleActPreview();
    });
    $('#logoRemove').addEventListener('click', () => { actDraft.logo = null; renderLogo(); scheduleActPreview(); });
  }

  function openActEditor(act) {
    actDraft = act ? structuredClone(act) : newAct();
    const e = $('#actForm').elements;
    $('#actDialogTitle').textContent = act ? `Edit Act – ${act.name}` : 'Create Act';
    e.actName.value = actDraft.name;
    e.pre.value = actDraft.title.pre;
    e.connector.value = actDraft.title.connector;
    e.main.value = actDraft.title.main;
    e.sub.value = actDraft.title.sub;
    const s = actDraft.style;
    e.preFont.value = s.preFont; e.mainFont.value = s.mainFont; e.infoFont.value = s.infoFont;
    e.preColor.value = s.preColor; e.mainColor.value = s.mainColor; e.infoColor.value = s.infoColor; e.bgColor.value = s.bgColor;
    e.infoGold.checked = !!s.infoGold;
    $('#actPreviewStyle').value = 'clean';
    $('#actPreview').innerHTML = '';
    renderPhotoGrid();
    renderLogo();
    $('#actDialog').showModal();
    scheduleActPreview();
  }

  function readActForm() {
    const e = $('#actForm').elements;
    actDraft.name = e.actName.value.trim();
    actDraft.title = { pre: e.pre.value, connector: e.connector.value, main: e.main.value, sub: e.sub.value };
    Object.assign(actDraft.style, {
      preFont: e.preFont.value, mainFont: e.mainFont.value, infoFont: e.infoFont.value,
      preColor: e.preColor.value, mainColor: e.mainColor.value, infoColor: e.infoColor.value,
      bgColor: e.bgColor.value, infoGold: e.infoGold.checked,
    });
  }

  async function addPhotos(files) {
    const bad = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) { bad.push(file.name); continue; }
      const id = uid();
      try {
        const im = await loadImage(id, file);
        actDraft.photos.push({ id, blob: file, name: file.name, w: im.naturalWidth, h: im.naturalHeight, hasTitle: false, fx: 0.5, fy: 0.4 });
      } catch { bad.push(file.name); }
    }
    if (bad.length) alert(`Couldn't read: ${bad.join(', ')}\nUse JPG, PNG or WebP photos.`);
    renderPhotoGrid();
    scheduleActPreview();
  }

  function renderPhotoGrid() {
    $('#photoGrid').innerHTML = actDraft.photos.map((p) => `
      <div class="photo-item" data-id="${p.id}">
        <div class="photo-thumb"><img src="${blobUrl(p.id, p.blob)}" alt="" title="Click where the faces are"><span class="focus-dot" style="left:${(p.fx ?? 0.5) * 100}%;top:${(p.fy ?? 0.4) * 100}%"></span></div>
        <div class="dims">${p.w}×${p.h}</div>
        <label class="check"><input type="checkbox" data-role="hasTitle" ${p.hasTitle ? 'checked' : ''}> Has title art</label>
        <button type="button" class="icon-btn danger" data-role="remove" title="Remove photo">×</button>
      </div>`).join('');
  }

  function renderLogo() {
    const el = $('#logoPreview');
    el.innerHTML = actDraft.logo ? `<img src="${blobUrl(actDraft.logo.id, actDraft.logo.blob)}" alt="">` : 'No logo';
    $('#logoRemove').hidden = !actDraft.logo;
  }

  const scheduleActPreview = debounce(() => renderActPreview(), 200);

  async function renderActPreview() {
    if (!actDraft) return;
    readActForm();
    const token = ++actPreviewToken;
    await fontsReady;
    const wrap = $('#actPreview');
    if (wrap.children.length !== PREVIEW_SIZES.length) {
      wrap.innerHTML = PREVIEW_SIZES.map((s) => `<figure class="${s.full ? 'full' : ''}"><canvas></canvas><figcaption>${s.label}</figcaption></figure>`).join('');
    }
    const canvases = $$('canvas', wrap);
    const logoImg = actDraft.logo ? await loadImage(actDraft.logo.id, actDraft.logo.blob).catch(() => null) : null;
    const styleId = $('#actPreviewStyle').value;
    const P = actDraft.photos.length;
    for (let i = 0; i < PREVIEW_SIZES.length; i++) {
      const sz = PREVIEW_SIZES[i];
      const photo = P ? actDraft.photos[i % P] : null;
      const img = photo ? await loadImage(photo.id, photo.blob).catch(() => null) : null;
      if (token !== actPreviewToken) return;
      R.render(canvases[i], {
        w: sz.w, h: sz.h, scale: Math.min(1, 560 / Math.max(sz.w, sz.h)),
        act: actDraft, photo, img, logoImg, styleId,
        info: { venue: 'Sample Theatre', dates: 'Dec 6', custom: '', extra: '' },
        localized: true, seed: 'preview',
      });
    }
  }

  async function saveAct() {
    readActForm();
    if (!actDraft.name) { alert('Give the act a name.'); $('#actForm').elements.actName.focus(); return; }
    if (!actDraft.photos.length && !confirm('This act has no photos yet. Save anyway?')) return;
    if (!(await save('acts', actDraft))) return;
    $('#actDialog').close();
    actDraft = null;
    await reload();
    state.tab = state.galleryShowId ? state.tab : 'acts';
    refreshView();
  }

  // ---------- Theatre editor ----------
  let thDraft = null;

  function newTheatre() {
    return { id: uid(), name: '', displayName: '', city: '', state: '', notes: '', sizes: PACKS[0].rows.map(normalizeRow) };
  }

  function bindTheatreEditor() {
    const groups = {};
    SIZE_PRESETS.forEach((p, i) => { (groups[p.group] = groups[p.group] || []).push(`<option value="${i}">${esc(p.label)} — ${p.w}×${p.h}${p.unit === 'in' ? ' in' : ''}</option>`); });
    $('#addSizeSel').innerHTML = '<option value="custom">Custom size…</option>' +
      Object.entries(groups).map(([g, o]) => `<optgroup label="${esc(g)}">${o.join('')}</optgroup>`).join('');
    $('#addPackSel').innerHTML = PACKS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

    $('#addSizeBtn').addEventListener('click', () => {
      const v = $('#addSizeSel').value;
      const p = v === 'custom' ? { label: 'Custom', w: 1000, h: 1000 } : SIZE_PRESETS[+v];
      thDraft.sizes.push(normalizeRow({ ...p, count: 1 }));
      renderSizeRows();
      const last = $('#sizeRows tr:last-child input[data-k=label]');
      if (last) { last.focus(); last.select(); }
    });
    $('#addPackBtn').addEventListener('click', () => {
      const pack = PACKS.find((p) => p.id === $('#addPackSel').value);
      thDraft.sizes.push(...pack.rows.map(normalizeRow));
      renderSizeRows();
    });

    const tbody = $('#sizeRows');
    const onEdit = (e) => {
      const tr = e.target.closest('tr');
      const k = e.target.dataset.k;
      if (!tr || !k) return;
      const row = thDraft.sizes.find((r) => r.id === tr.dataset.id);
      if (e.target.type === 'checkbox') row[k] = e.target.checked;
      else if (k === 'w' || k === 'h' || k === 'count') row[k] = e.target.value === '' ? '' : +e.target.value;
      else row[k] = e.target.value;
      updateSizeHints(tr, row);
      updateSizeTotal();
    };
    tbody.addEventListener('input', onEdit);
    tbody.addEventListener('change', onEdit);
    tbody.addEventListener('click', (e) => {
      if (!e.target.closest('[data-role=del-row]')) return;
      const id = e.target.closest('tr').dataset.id;
      thDraft.sizes = thDraft.sizes.filter((r) => r.id !== id);
      renderSizeRows();
    });

    $('#theatreForm').addEventListener('submit', async (e) => { e.preventDefault(); await saveTheatre(); });
  }

  function openTheatreEditor(theatre, duplicate) {
    if (theatre) {
      thDraft = structuredClone(theatre);
      if (duplicate) {
        thDraft.id = uid();
        thDraft.name = `${theatre.name} (copy)`;
        thDraft.sizes = thDraft.sizes.map((r) => ({ ...r, id: uid() }));
      }
    } else thDraft = newTheatre();
    $('#theatreDialogTitle').textContent = theatre && !duplicate ? `Edit Theatre – ${theatre.name}` : 'New Theatre';
    const e = $('#theatreForm').elements;
    e.thName.value = thDraft.name;
    e.displayName.value = thDraft.displayName;
    e.city.value = thDraft.city;
    e.state.value = thDraft.state;
    e.notes.value = thDraft.notes;
    renderSizeRows();
    $('#theatreDialog').showModal();
  }

  function renderSizeRows() {
    $('#sizeRows').innerHTML = thDraft.sizes.map((r) => `
      <tr data-id="${r.id}">
        <td><input data-k="label" value="${esc(r.label)}"><div class="px-hint"></div></td>
        <td><input data-k="w" type="number" min="0" step="any" value="${esc(r.w)}"></td>
        <td class="x">×</td>
        <td><input data-k="h" type="number" min="0" step="any" value="${esc(r.h)}"></td>
        <td><select data-k="unit"><option value="px" ${r.unit !== 'in' ? 'selected' : ''}>px</option><option value="in" ${r.unit === 'in' ? 'selected' : ''}>in</option></select></td>
        <td><input data-k="count" type="number" min="0" step="1" value="${esc(r.count)}"></td>
        <td class="c"><input type="checkbox" data-k="localized" ${r.localized !== false ? 'checked' : ''}></td>
        <td class="c"><input type="checkbox" data-k="minimal" ${r.minimal ? 'checked' : ''}></td>
        <td><button type="button" class="icon-btn danger" data-role="del-row" title="Remove size">×</button></td>
      </tr>`).join('');
    $$('#sizeRows tr').forEach((tr) => updateSizeHints(tr, thDraft.sizes.find((r) => r.id === tr.dataset.id)));
    updateSizeTotal();
  }

  function updateSizeHints(tr, row) {
    const { w, h } = R.pxSize(row);
    const shape = w && h ? { strip: 'wide banner', landscape: 'landscape', square: 'square', portrait: 'portrait', tower: 'tall' }[R.shapeOf(w, h)] : '';
    tr.querySelector('.px-hint').textContent = row.unit === 'in' ? `${w}×${h} px at 300 dpi · ${shape}` : shape;
  }

  function updateSizeTotal() {
    $('#sizeTotal').textContent = R.theatreTotal(thDraft);
  }

  async function saveTheatre() {
    const e = $('#theatreForm').elements;
    thDraft.name = e.thName.value.trim();
    thDraft.displayName = e.displayName.value.trim() || thDraft.name;
    thDraft.city = e.city.value.trim();
    thDraft.state = e.state.value.trim();
    thDraft.notes = e.notes.value;
    if (!thDraft.name) { alert('Give the theatre profile a name.'); e.thName.focus(); return; }
    if (!R.theatreTotal(thDraft)) { alert('Add at least one size with a count of 1 or more.'); return; }
    if (!(await save('theatres', thDraft))) return;
    $('#theatreDialog').close();
    thDraft = null;
    await reload();
    if (!state.galleryShowId) state.tab = 'theatres';
    refreshView();
  }

  // ---------- Show editor ----------
  let showDraft = null;
  let showOriginal = null;

  function bindShowEditor() {
    const form = $('#showForm');
    form.addEventListener('input', () => updateShowSummary());
    form.addEventListener('change', (e) => {
      if (e.target.name === 'theatreId') { form.elements.total.value = ''; }
      updateShowSummary();
    });
    $('#addDateBtn').addEventListener('click', () => {
      readShowDates();
      const last = showDraft.dates[showDraft.dates.length - 1];
      let next = '';
      if (last && last.date) {
        const [y, m, d] = last.date.split('-').map(Number);
        const dt = new Date(y, m - 1, d + 1);
        next = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      }
      showDraft.dates.push({ date: next, time: last ? last.time : '' });
      renderDateRows();
      updateShowSummary();
    });
    $('#dateRows').addEventListener('click', (e) => {
      if (!e.target.closest('[data-role=del-date]')) return;
      readShowDates();
      const i = +e.target.closest('.date-row').dataset.i;
      showDraft.dates.splice(i, 1);
      if (!showDraft.dates.length) showDraft.dates.push({ date: '', time: '' });
      renderDateRows();
      updateShowSummary();
    });
    $('#totalChips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      form.elements.total.value = c.dataset.n;
      updateShowSummary();
    });
    form.addEventListener('submit', async (e) => { e.preventDefault(); await saveShow(); });
  }

  function openShowEditor(show) {
    if (!state.acts.length || !state.theatres.length) {
      alert(!state.acts.length ? 'Create an act first (File → Create Act).' : 'Create a theatre first (File → New Theatre).');
      if (!state.acts.length) openActEditor(null); else openTheatreEditor(null);
      return;
    }
    showOriginal = show || null;
    showDraft = show ? structuredClone(show) : {
      id: uid(), actId: state.acts[0].id, theatreId: state.theatres[0].id,
      dates: [{ date: '', time: '' }], showTimes: false, customText: '', extraLine: '', total: null, overrides: {}, excluded: [],
    };
    $('#showDialogTitle').textContent = show ? 'Edit Show' : 'Create New Show';
    const e = $('#showForm').elements;
    e.actId.innerHTML = state.acts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    e.theatreId.innerHTML = state.theatres.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    e.actId.value = actById(showDraft.actId) ? showDraft.actId : state.acts[0].id;
    e.theatreId.value = theatreById(showDraft.theatreId) ? showDraft.theatreId : state.theatres[0].id;
    e.showTimes.checked = !!showDraft.showTimes;
    e.customText.value = showDraft.customText || '';
    e.extraLine.value = showDraft.extraLine || '';
    e.total.value = showDraft.total || '';
    renderDateRows();
    updateShowSummary();
    $('#showDialog').showModal();
  }

  function renderDateRows() {
    $('#dateRows').innerHTML = showDraft.dates.map((d, i) => `
      <div class="date-row" data-i="${i}">
        <input type="date" data-k="date" value="${esc(d.date)}" aria-label="Show date">
        <input type="time" data-k="time" value="${esc(d.time)}" aria-label="Show time (optional)">
        <button type="button" class="icon-btn danger" data-role="del-date" title="Remove date">×</button>
      </div>`).join('');
  }

  function readShowDates() {
    showDraft.dates = $$('#dateRows .date-row').map((r) => ({ date: r.querySelector('[data-k=date]').value, time: r.querySelector('[data-k=time]').value }));
  }

  function readShowForm() {
    const e = $('#showForm').elements;
    showDraft.actId = e.actId.value;
    showDraft.theatreId = e.theatreId.value;
    showDraft.showTimes = e.showTimes.checked;
    showDraft.customText = e.customText.value;
    showDraft.extraLine = e.extraLine.value;
    showDraft.total = e.total.value ? Math.max(1, Math.round(+e.total.value)) : null;
    readShowDates();
  }

  function updateShowSummary() {
    readShowForm();
    const th = theatreById(showDraft.theatreId);
    const info = R.showInfo(showDraft, th);
    const e = $('#showForm').elements;
    e.customText.placeholder = [info.venue, info.dates].filter(Boolean).join(', ') || 'Mendel Center, Dec 6';
    $('#adTextPreview').textContent = R.infoPreviewText(info) || '—';
    const def = th ? R.theatreTotal(th) : 0;
    if (!e.total.value) e.total.placeholder = def;
    const current = showDraft.total || def;
    $('#totalChips').innerHTML = [...new Set([10, def, 20, 30])].sort((a, b) => a - b)
      .map((n) => `<button type="button" class="chip ${n === current ? 'on' : ''}" data-n="${n}">${n}${n === def ? ' (theatre)' : ''}</button>`).join('');
    $('#totalHint').textContent = th ? `${th.name} asks for ${def} images. Each size first gets one clean version of each photo; extra images get styled versions (sparkle, black & white, frame…).` : '';
  }

  async function saveShow() {
    readShowForm();
    if (!showDraft.dates.some((d) => d.date)) { alert('Add at least one show date.'); return; }
    showDraft.dates = showDraft.dates.filter((d) => d.date);
    if (showOriginal && (showOriginal.actId !== showDraft.actId || showOriginal.theatreId !== showDraft.theatreId)) {
      showDraft.overrides = {};
      showDraft.excluded = [];
    }
    if (!(await save('shows', showDraft))) return;
    const id = showDraft.id;
    $('#showDialog').close();
    showDraft = null;
    await reload();
    openGallery(id);
  }

  // ---------- Gallery ----------
  function refreshView() {
    if (state.galleryShowId) renderGallery(); else renderHome();
  }

  function openGallery(id) {
    state.galleryShowId = id;
    $('#homeView').hidden = true;
    $('#galleryView').hidden = false;
    window.scrollTo(0, 0);
    renderGallery();
  }

  function closeGallery() {
    state.galleryShowId = null;
    state.renderToken = (state.renderToken || 0) + 1;
    $('#galleryView').hidden = true;
    $('#galleryView').innerHTML = '';
    $('#homeView').hidden = false;
    state.tab = 'shows';
    renderHome();
  }

  function galleryContext() {
    const show = showById(state.galleryShowId);
    if (!show) return null;
    return { show, act: actById(show.actId), th: theatreById(show.theatreId) };
  }

  function buildItems(show, act, th) {
    const items = R.plan(act, th, showTotal(show, th));
    const ov = show.overrides || {};
    for (const it of items) {
      const o = ov[it.key];
      if (o) {
        if (o.photoId && act.photos.some((p) => p.id === o.photoId)) it.photoId = o.photoId;
        if (o.styleId) it.styleId = o.styleId;
        if (o.adj && o.photoId === it.photoId) it.adj = o.adj;
      }
      it.included = !(show.excluded || []).includes(it.key);
    }
    return items;
  }

  const saveShowSoon = debounce((show) => save('shows', show), 300);

  function renderGallery() {
    const ctx = galleryContext();
    const view = $('#galleryView');
    if (!ctx) { closeGallery(); return; }
    const { show, act, th } = ctx;
    if (!act || !th) {
      view.innerHTML = `<button class="back" id="galBack">← All shows</button><div class="empty"><h3>Missing ${!act ? 'act' : 'theatre'}</h3><p>The ${!act ? 'act' : 'theatre'} for this show was deleted. Edit the show to pick another one.</p><button class="btn primary" data-action="edit-show" data-id="${show.id}">Edit show</button></div>`;
      $('#galBack').addEventListener('click', closeGallery);
      return;
    }
    const info = R.showInfo(show, th);
    const items = buildItems(show, act, th);
    state.items = items;
    const def = R.theatreTotal(th);

    const groups = [];
    for (const it of items) {
      let g = groups[groups.length - 1];
      if (!g || g.row.id !== it.row.id) { g = { row: it.row, w: it.w, h: it.h, items: [] }; groups.push(g); }
      g.items.push(it);
    }

    const photoOpts = (sel) => act.photos.map((p, i) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>Photo ${i + 1}${p.hasTitle ? ' (title art)' : ''}</option>`).join('');
    const styleOpts = (it) => {
      const photo = act.photos.find((p) => p.id === it.photoId);
      return R.stylesFor(it.shape, photo).map((s) => `<option value="${s.id}" ${s.id === it.styleId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    };

    view.innerHTML = `
      <div class="gallery-head">
        <div>
          <button class="back" id="galBack">← All shows</button>
          <h1>${esc(act.name)}</h1>
          <div class="sub"><b>${esc(th.name)}</b> · ${esc(info.dates)} · Ads say “${esc(R.infoPreviewText(info))}”</div>
        </div>
        <div class="gallery-tools">
          <label>Images <input type="number" id="galTotal" min="1" max="200" value="${showTotal(show, th)}" title="Theatre asks for ${def}"></label>
          <label>Format <select id="galFormat"><option value="jpg" ${state.format === 'jpg' ? 'selected' : ''}>JPG</option><option value="png" ${state.format === 'png' ? 'selected' : ''}>PNG</option></select></label>
          <button class="btn small ghost" id="galAll">Select all</button>
          <button class="btn small ghost" id="galNone">Select none</button>
          <button class="btn small" data-action="edit-show" data-id="${show.id}">Edit show</button>
          <button class="btn small" data-action="edit-act" data-id="${act.id}">Edit act</button>
          <button class="btn small" data-action="edit-theatre" data-id="${th.id}">Edit theatre</button>
          <button class="btn primary" id="galDownload">Download</button>
        </div>
      </div>
      ${!act.photos.length ? '<div class="empty" style="margin-top:16px"><h3>No photos</h3><p>This act has no photos yet, so the ads only show the title. Edit the act to add photos.</p></div>' : ''}
      ${groups.map((g) => `
        <section class="size-group">
          <h2>${esc(g.row.label || 'Untitled size')} <span class="muted">${g.w}×${g.h}px · ${g.items.length} image${g.items.length === 1 ? '' : 's'}${g.row.localized === false ? ' · no theatre/date' : ''}${g.row.minimal ? ' · minimal text' : ''}</span></h2>
          <div class="ad-grid">
            ${g.items.map((it) => `
              <div class="ad-card ${it.w / it.h >= 2.8 ? 'wide' : ''} ${it.included ? '' : 'off'}" data-key="${esc(it.key)}">
                <div class="ad-canvas" style="aspect-ratio:${it.w}/${it.h}"><canvas></canvas></div>
                <div class="ad-meta">
                  <label class="check"><input type="checkbox" data-role="include" ${it.included ? 'checked' : ''}> #${it.n}</label>
                  <span class="muted">${g.w}×${g.h}</span>
                </div>
                <div class="ad-controls">
                  ${act.photos.length ? `<select data-role="photo" title="Photo">${photoOpts(it.photoId)}</select>` : '<span></span>'}
                  <select data-role="style" title="Look">${styleOpts(it)}</select>
                  <button class="icon-btn" data-role="dl" title="Download just this image">⤓</button>
                </div>
                ${act.photos.length ? `
                <button class="btn small ghost adjust-btn" data-role="adjust">✥ Adjust crop${it.adj ? ' •' : ''}</button>
                <div class="adjust-bar" hidden>
                  <span class="muted">Drag the picture to move it</span>
                  <button class="btn small" data-role="zoom-out" title="Zoom out">−</button>
                  <button class="btn small" data-role="zoom-in" title="Zoom in">+</button>
                  <button class="btn small ghost" data-role="reset">Reset</button>
                  <button class="btn small primary" data-role="done">Done</button>
                </div>` : ''}
              </div>`).join('')}
          </div>
        </section>`).join('')}
    `;

    $('#galBack').addEventListener('click', closeGallery);
    $('#galFormat').addEventListener('change', (e) => { state.format = e.target.value; });
    $('#galTotal').addEventListener('change', async (e) => {
      const n = Math.max(1, Math.min(200, Math.round(+e.target.value || def)));
      show.total = n === def ? null : n;
      await save('shows', show);
      renderGallery();
    });
    $('#galAll').addEventListener('click', () => setAllIncluded(show, true));
    $('#galNone').addEventListener('click', () => setAllIncluded(show, false));
    $('#galDownload').addEventListener('click', () => downloadZip());
    updateDownloadLabel();

    view.querySelectorAll('.ad-card').forEach((card) => {
      const it = items.find((x) => x.key === card.dataset.key);
      card.addEventListener('change', (e) => {
        const role = e.target.dataset.role;
        if (role === 'include') {
          it.included = e.target.checked;
          card.classList.toggle('off', !it.included);
          show.excluded = items.filter((x) => !x.included).map((x) => x.key);
          saveShowSoon(show);
          updateDownloadLabel();
          return;
        }
        if (role === 'photo') {
          it.photoId = e.target.value;
          it.adj = null;
          const photo = act.photos.find((p) => p.id === it.photoId);
          const styles = R.stylesFor(it.shape, photo);
          if (!styles.some((s) => s.id === it.styleId)) it.styleId = 'clean';
          card.querySelector('[data-role=style]').innerHTML = styleOpts(it);
        }
        if (role === 'style') it.styleId = e.target.value;
        saveOverride(show, it);
        renderCard(card, it, show, act, th);
      });
      card.querySelector('[data-role=dl]').addEventListener('click', () => downloadOne(it, show, act, th));
      bindCropAdjust(card, it, show, act, th);
    });

    renderAllCards(view, items, show, act, th);
  }

  function saveOverride(show, it) {
    show.overrides = show.overrides || {};
    show.overrides[it.key] = { photoId: it.photoId, styleId: it.styleId, ...(it.adj ? { adj: it.adj } : {}) };
    saveShowSoon(show);
  }

  // Lets the user drag the photo inside one image and zoom it, when the automatic crop is off.
  function bindCropAdjust(card, it, show, act, th) {
    const btn = card.querySelector('[data-role=adjust]');
    if (!btn) return;
    const bar = card.querySelector('.adjust-bar');
    const canvas = card.querySelector('canvas');
    const wrap = card.querySelector('.ad-canvas');
    let drag = null;
    let pending = false, dirty = false;

    // At most one redraw in flight while dragging; the latest position is always drawn last.
    const redraw = () => {
      dirty = true;
      if (pending) return;
      pending = true;
      setTimeout(async () => {
        try {
          while (dirty) { dirty = false; await renderCard(card, it, show, act, th); }
        } finally { pending = false; }
      }, 16);
    };
    const finish = () => {
      saveOverride(show, it);
      btn.textContent = `✥ Adjust crop${it.adj ? ' •' : ''}`;
    };
    const setEditing = (on) => {
      bar.hidden = !on;
      btn.hidden = on;
      wrap.classList.toggle('adjusting', on);
      if (!on) finish();
    };
    // Current placement, so the first drag starts from what's on screen.
    const current = () => {
      const m = canvas._meta;
      if (!m) return null;
      return m.mode === 'cover'
        ? { fx: m.fx, fy: m.fy, zoom: m.zoom, ...(it.adj || {}) }
        : { cx: m.cx, cy: m.cy, zoom: m.zoom, ...(it.adj || {}) };
    };

    btn.addEventListener('click', () => setEditing(true));
    bar.addEventListener('click', (e) => {
      const role = e.target.dataset.role;
      if (role === 'done') { setEditing(false); return; }
      if (role === 'reset') { it.adj = null; redraw(); return; }
      if (role === 'zoom-in' || role === 'zoom-out') {
        const a = current();
        if (!a) return;
        // A cropped photo can't zoom out past filling the frame; a whole photo can shrink a bit.
        const min = canvas._meta.mode === 'cover' ? 1 : 0.4;
        a.zoom = Math.min(3, Math.max(min, (a.zoom || 1) * (role === 'zoom-in' ? 1.12 : 1 / 1.12)));
        it.adj = a;
        redraw();
      }
    });

    wrap.addEventListener('pointerdown', (e) => {
      if (bar.hidden || !canvas._meta) return;
      e.preventDefault();
      try { wrap.setPointerCapture(e.pointerId); } catch { /* keeps working without capture */ }
      drag = { x: e.clientX, y: e.clientY, start: current(), meta: canvas._meta, k: it.w / wrap.clientWidth };
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) * drag.k, dy = (e.clientY - drag.y) * drag.k;
      const { start, meta } = drag;
      const a = { ...start };
      if (meta.mode === 'cover') {
        const lim = (v, half) => (half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, v)));
        a.fx = lim(start.fx - (dx * meta.srcPerPx) / meta.iw, meta.halfX);
        a.fy = lim(start.fy - (dy * meta.srcPerPx) / meta.ih, meta.halfY);
      } else {
        a.cx = Math.min(1, Math.max(0, start.cx + dx / meta.area.w));
        a.cy = Math.min(1, Math.max(0, start.cy + dy / meta.area.h));
      }
      it.adj = a;
      redraw();
    });
    const endDrag = () => { drag = null; };
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('pointercancel', endDrag);
  }

  function setAllIncluded(show, on) {
    for (const it of state.items) it.included = on;
    show.excluded = on ? [] : state.items.map((x) => x.key);
    $$('#galleryView .ad-card').forEach((c) => {
      c.classList.toggle('off', !on);
      c.querySelector('[data-role=include]').checked = on;
    });
    saveShowSoon(show);
    updateDownloadLabel();
  }

  function updateDownloadLabel() {
    const n = state.items.filter((x) => x.included).length;
    const btn = $('#galDownload');
    if (!btn) return;
    btn.textContent = `Download ${n} image${n === 1 ? '' : 's'} (ZIP)`;
    btn.disabled = !n;
  }

  async function renderItem(canvas, it, show, act, th, scale) {
    await fontsReady;
    const photo = act.photos.find((p) => p.id === it.photoId) || null;
    const img = photo ? await loadImage(photo.id, photo.blob).catch(() => null) : null;
    const logoImg = act.logo ? await loadImage(act.logo.id, act.logo.blob).catch(() => null) : null;
    canvas._meta = R.render(canvas, {
      w: it.w, h: it.h, scale, act, photo, img, logoImg,
      styleId: it.styleId, info: R.showInfo(show, th),
      localized: it.row.localized !== false, minimal: !!it.row.minimal, seed: it.key,
      adjust: it.adj || undefined,
    });
  }

  const previewScale = (it) => Math.min(1, 640 / Math.max(it.w, it.h));

  async function renderCard(card, it, show, act, th) {
    await renderItem(card.querySelector('canvas'), it, show, act, th, previewScale(it));
  }

  async function renderAllCards(view, items, show, act, th) {
    const token = state.renderToken = (state.renderToken || 0) + 1;
    for (const it of items) {
      const card = view.querySelector(`.ad-card[data-key="${CSS.escape(it.key)}"]`);
      if (!card) continue;
      await renderCard(card, it, show, act, th);
      await yieldUI();
      if (token !== state.renderToken) return;
    }
  }

  function canvasToBlob(canvas, fmt) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image too large to export'))), fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92);
    });
  }

  function fileName(it, idx, act, th, fmt) {
    const label = slug(it.row.label || 'size');
    return `${String(idx + 1).padStart(2, '0')}_${slug(act.name)}_${slug(th.displayName || th.name)}_${label}_${it.w}x${it.h}.${fmt}`;
  }

  async function downloadOne(it, show, act, th) {
    const c = document.createElement('canvas');
    await renderItem(c, it, show, act, th, 1);
    const blob = await canvasToBlob(c, state.format);
    saveBlob(blob, fileName(it, state.items.indexOf(it), act, th, state.format));
  }

  async function downloadZip() {
    const ctx = galleryContext();
    if (!ctx) return;
    const { show, act, th } = ctx;
    const items = state.items.filter((x) => x.included);
    if (!items.length) return;
    const zip = Zip.create();
    try {
      for (let i = 0; i < items.length; i++) {
        progress(`Creating full-size image ${i + 1} of ${items.length}…`, i / items.length);
        await yieldUI();
        const it = items[i];
        const c = document.createElement('canvas');
        await renderItem(c, it, show, act, th, 1);
        const blob = await canvasToBlob(c, state.format);
        zip.add(fileName(it, state.items.indexOf(it), act, th, state.format), new Uint8Array(await blob.arrayBuffer()));
        c.width = c.height = 0;
      }
      progress('Packing ZIP…', 1);
      await yieldUI();
      const first = (show.dates.map((d) => d.date).sort()[0]) || '';
      saveBlob(zip.toBlob(), `${slug(act.name)}_${slug(th.displayName || th.name)}${first ? `_${first}` : ''}.zip`);
    } catch (err) {
      alert(`Download failed: ${(err && err.message) || err}`);
    } finally {
      progress(null);
    }
  }

  // ---------- Backup ----------
  const blobToDataURL = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  function dataURLToBlob(url) {
    const [head, data] = url.split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Single-file backup (works in every browser). Photos are embedded in the file.
  async function exportBackup() {
    progress('Preparing backup…', 0.2);
    try {
      const acts = [];
      for (const a of state.acts) {
        const copy = { ...a, photos: [] };
        for (const p of a.photos) copy.photos.push({ ...p, blob: await blobToDataURL(p.blob) });
        if (a.logo) copy.logo = { ...a.logo, blob: await blobToDataURL(a.logo.blob) };
        acts.push(copy);
      }
      const data = { app: 'dhp-ad-builder', version: 1, exportedAt: new Date().toISOString(), acts, theatres: state.theatres, shows: state.shows };
      saveBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `ad-builder-backup-${today()}.json`);
      await setLastBackup('backup file');
    } finally {
      progress(null);
    }
  }

  async function importBackup(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { alert('That file is not an Ad Builder backup.'); return; }
    if (!data || data.app !== 'dhp-ad-builder') { alert('That file is not an Ad Builder backup.'); return; }
    if (data.format === 'folder') {
      alert('That file belongs to a backup folder. Use File → Restore from backup folder… and pick the whole folder, so the photos come back too.');
      return;
    }
    await restoreData(data, (p) => dataURLToBlob(p.blob));
  }

  // Writes backed-up acts, theatres and shows into this browser. `photoBlob` returns each photo's Blob.
  async function restoreData(data, photoBlob) {
    if (!confirm(`Restore ${data.acts.length} acts, ${data.theatres.length} theatres and ${data.shows.length} shows?\nItems already here with the same id are replaced; everything else is kept.`)) return false;
    progress('Restoring…', 0.3);
    try {
      // A same-named profile that no show uses (e.g. a starter theatre on a new computer) is replaced, not duplicated.
      const used = new Set(state.shows.flatMap((s) => [s.actId, s.theatreId]));
      for (const [store, list, mine] of [['acts', data.acts, state.acts], ['theatres', data.theatres, state.theatres]]) {
        const incoming = new Map(list.map((x) => [x.name, x.id]));
        for (const x of mine) {
          if (incoming.has(x.name) && incoming.get(x.name) !== x.id && !used.has(x.id)) await DB.del(store, x.id);
        }
      }
      for (const a of data.acts) {
        const photos = [];
        for (const p of a.photos) {
          const { file, ...rest } = p;
          photos.push({ ...rest, blob: await photoBlob(p) });
        }
        a.photos = photos;
        if (a.logo) {
          const { file, ...rest } = a.logo;
          a.logo = { ...rest, blob: await photoBlob(a.logo) };
        }
        await DB.put('acts', a);
      }
      for (const t of data.theatres) await DB.put('theatres', t);
      for (const s of data.shows) await DB.put('shows', s);
      await reload();
      refreshView();
      markChanged();
      return true;
    } catch (err) {
      alert(`Restore failed: ${(err && err.message) || err}`);
      return false;
    } finally {
      progress(null);
    }
  }

  // ---------- Automatic backup to a folder (Chrome / Edge) ----------
  // Point this at a Google Drive / Dropbox / iCloud folder and every change is copied there.
  // Layout: ad-builder-data.json (profiles), photos/<id>.<ext> (written once), history/<date>.json.
  const BACKUP_FILE = 'ad-builder-data.json';
  const HISTORY_KEEP = 60;
  const CAN_PICK_FOLDER = typeof window.showDirectoryPicker === 'function';
  const backup = { dir: null, last: null, lastChange: 0, paused: false, running: false, error: '' };

  async function loadBackupState() {
    const [dirMeta, lastMeta, changeMeta] = await Promise.all([DB.get('meta', 'backupDir'), DB.get('meta', 'lastBackup'), DB.get('meta', 'lastChange')]);
    backup.dir = (dirMeta && dirMeta.handle) || null;
    backup.last = lastMeta || null;
    backup.lastChange = (changeMeta && changeMeta.at) || 0;
    if (backup.dir) await runBackup(false);
    renderBackupStatus();
  }

  async function setLastBackup(where) {
    backup.last = { id: 'lastBackup', at: Date.now(), where };
    await DB.put('meta', backup.last);
    renderBackupStatus();
  }

  // Called after every change to acts, theatres or shows.
  function markChanged() {
    backup.lastChange = Date.now();
    DB.put('meta', { id: 'lastChange', at: backup.lastChange }).catch(() => {});
    renderBackupStatus();
    scheduleBackup();
  }
  const scheduleBackup = debounce(() => runBackup(false), 2000);

  const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

  async function writeFile(dir, name, data) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
  }

  async function writeImageOnce(photosDir, id, blob) {
    const name = `${id}.${IMAGE_EXT[blob.type] || 'img'}`;
    try {
      await photosDir.getFileHandle(name);
    } catch {
      await writeFile(photosDir, name, blob);
    }
    return name;
  }

  async function writeBackupFolder(dir) {
    const photosDir = await dir.getDirectoryHandle('photos', { create: true });
    const historyDir = await dir.getDirectoryHandle('history', { create: true });
    const acts = [];
    for (const a of state.acts) {
      const copy = { ...a, photos: [] };
      for (const p of a.photos) {
        const { blob, ...rest } = p;
        copy.photos.push({ ...rest, file: await writeImageOnce(photosDir, p.id, blob) });
      }
      if (a.logo) {
        const { blob, ...rest } = a.logo;
        copy.logo = { ...rest, file: await writeImageOnce(photosDir, a.logo.id, blob) };
      }
      acts.push(copy);
    }
    const json = JSON.stringify({
      app: 'dhp-ad-builder', version: 2, format: 'folder', exportedAt: new Date().toISOString(),
      acts, theatres: state.theatres, shows: state.shows,
    }, null, 1);
    await writeFile(dir, BACKUP_FILE, json);
    await writeFile(historyDir, `ad-builder-data-${today()}.json`, json);

    const old = [];
    for await (const [name] of historyDir.entries()) if (name.endsWith('.json')) old.push(name);
    old.sort().reverse().slice(HISTORY_KEEP).forEach((name) => historyDir.removeEntry(name).catch(() => {}));
  }

  // interactive = true when the user clicked something, so the browser may ask for permission.
  async function runBackup(interactive) {
    if (!backup.dir || backup.running) return;
    backup.running = true;
    try {
      let perm = await backup.dir.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted' && interactive) perm = await backup.dir.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') { backup.paused = true; return; }
      backup.paused = false;
      await writeBackupFolder(backup.dir);
      backup.error = '';
      await setLastBackup(backup.dir.name);
    } catch (err) {
      backup.error = (err && err.message) || String(err);
      if (interactive) alert(`Backup failed: ${backup.error}`);
    } finally {
      backup.running = false;
      renderBackupStatus();
    }
  }

  async function chooseBackupFolder() {
    if (!CAN_PICK_FOLDER) {
      alert('This browser can\'t back up to a folder automatically. Open the app in Chrome or Edge, or use File → Save backup file… and put that file in Google Drive.');
      return;
    }
    let dir;
    try {
      dir = await window.showDirectoryPicker({ id: 'ad-builder-backup', mode: 'readwrite' });
    } catch (err) {
      if (err && err.name !== 'AbortError') alert(`Couldn't use that folder: ${err.message}\nTry a folder inside Google Drive, Documents or Desktop.`);
      return;
    }
    backup.dir = dir;
    await DB.put('meta', { id: 'backupDir', handle: dir });
    await runBackup(true);
    if (!backup.error && !backup.paused) alert(`Automatic backup is on.\n\nEverything is saved to “${dir.name}” now and after every change.`);
  }

  async function restoreFromFolder() {
    if (!CAN_PICK_FOLDER) {
      alert('Restoring from a folder needs Chrome or Edge. In other browsers, use File → Restore from backup file….');
      return;
    }
    let dir;
    try {
      dir = await window.showDirectoryPicker({ id: 'ad-builder-backup', mode: 'readwrite' });
    } catch (err) {
      if (err && err.name !== 'AbortError') alert(`Couldn't open that folder: ${err.message}`);
      return;
    }
    let data;
    try {
      const fh = await dir.getFileHandle(BACKUP_FILE);
      data = JSON.parse(await (await fh.getFile()).text());
    } catch {
      alert(`That folder has no Ad Builder backup in it (looking for ${BACKUP_FILE}).`);
      return;
    }
    const photosDir = await dir.getDirectoryHandle('photos');
    const ok = await restoreData(data, async (p) => {
      const file = await (await photosDir.getFileHandle(p.file)).getFile();
      return new Blob([await file.arrayBuffer()], { type: file.type || 'image/jpeg' });
    });
    if (ok && (!backup.dir || !(await backup.dir.isSameEntry(dir))) && confirm(`Restored. Keep backing up automatically to “${dir.name}”?`)) {
      backup.dir = dir;
      await DB.put('meta', { id: 'backupDir', handle: dir });
    }
    if (ok) await runBackup(true);
  }

  function timeAgo(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
    const d = Math.round(s / 86400);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }

  function renderBackupStatus() {
    const el = $('#backupStatus');
    if (!el) return;
    const hasData = state.acts.length || state.shows.length;
    const unsaved = backup.lastChange && (!backup.last || backup.last.at < backup.lastChange);
    let cls = 'ok', text, title;
    if (backup.dir && backup.error) {
      cls = 'warn'; text = 'Backup failed – retry'; title = backup.error;
    } else if (backup.dir && backup.paused) {
      cls = 'warn'; text = 'Backup paused – click to resume'; title = `Click to allow saving to “${backup.dir.name}” again.`;
    } else if (backup.dir) {
      text = backup.last ? `Backed up ${timeAgo(backup.last.at)}` : 'Backing up…';
      title = `Automatic backup to “${backup.dir.name}”. Click to back up now.`;
    } else if (!hasData) {
      cls = 'idle'; text = 'Set up backup'; title = 'Choose a Google Drive folder to back up to automatically.';
    } else {
      cls = unsaved ? 'warn' : 'idle';
      text = backup.last ? `Last backup ${timeAgo(backup.last.at)}` : 'Not backed up';
      title = CAN_PICK_FOLDER ? 'Click to choose a Google Drive folder for automatic backups.' : 'Click to save a backup file.';
    }
    el.className = `backup-pill ${cls}`;
    el.textContent = text;
    el.title = title;
  }

  async function onBackupPill() {
    if (backup.dir) return runBackup(true);
    if (CAN_PICK_FOLDER) return chooseBackupFolder();
    return exportBackup();
  }

  init();
})();
