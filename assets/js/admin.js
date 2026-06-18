import { loadCatalog, escapeHtml } from './common.js';
import * as gh from './github-api.js';
import { getInstallStats, clearStatsCache } from './jsdelivr.js';

const root = document.getElementById('root');
const toasts = document.getElementById('toasts');

const PRIVATE_JS_PATH = 'assets/js/private.js';
const CATALOG_PATH = 'catalog.json';

let state = {
  tab: 'scripts',
  catalog: null,
  loading: false,
};

// ============ Toast ============
function toast(msg, type = 'success', ms = 4000) {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span><span>${escapeHtml(msg)}</span>`;
  toasts.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ============ SHA-256 ============
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============ Bootstrap ============
async function boot() {
  if (!gh.getToken() || !gh.getRepo().owner) {
    return renderGate();
  }
  try {
    await gh.checkAuth();
  } catch (e) {
    return renderGate(`Не удалось подключиться: ${e.message}`);
  }
  try {
    state.catalog = await loadCatalog();
  } catch {
    state.catalog = { version: 1, scripts: [], categories: [] };
  }
  renderApp();
}

// ============ Gate ============
function renderGate(err = '') {
  root.innerHTML = `
    <div class="gate">
      <div class="gate-card">
        <h1>Вход в админку</h1>
        <p>Введите GitHub-токен (Fine-grained PAT) с правами <strong>Contents: Read and write</strong> и название репозитория. Подробная инструкция — в README.</p>
        ${err ? `<div class="callout" style="border-color:var(--danger);background:rgba(255,77,109,0.08);margin-bottom:16px"><strong>Ошибка:</strong> ${escapeHtml(err)}</div>` : ''}
        <form id="gate-form">
          <div class="field">
            <label for="g-pat">GitHub токен (PAT)</label>
            <input id="g-pat" class="input" type="password" placeholder="github_pat_..." required />
            <div class="hint">Создаётся на github.com/settings/tokens?type=beta</div>
          </div>
          <div class="field">
            <label for="g-repo">Репозиторий</label>
            <input id="g-repo" class="input" type="text" placeholder="ваш-логин/название-репо" required pattern="[^/\\s]+/[^/\\s]+" />
            <div class="hint">Например: <code>ivanov/scripts</code></div>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%">Войти</button>
        </form>
      </div>
    </div>
  `;
  const form = document.getElementById('gate-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pat = document.getElementById('g-pat').value.trim();
    const repo = document.getElementById('g-repo').value.trim();
    gh.setAuth(pat, repo);
    const btn = form.querySelector('button');
    btn.dataset.loading = '1';
    btn.textContent = 'Проверяю…';
    try {
      await gh.checkAuth();
      toast('Подключено к ' + repo);
      boot();
    } catch (err) {
      gh.clearAuth();
      btn.dataset.loading = '';
      btn.textContent = 'Войти';
      renderGate(err.message + ' (проверьте токен и название репо)');
    }
  });
}

// ============ App shell ============
function renderApp() {
  const repo = gh.getRepo();
  root.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="sidebar-logo"><span class="sidebar-logo-mark">⚡</span><span>Script Store</span></div>
        <nav class="nav">
          ${navItem('scripts', '📜', 'Скрипты')}
          ${navItem('categories', '🗂', 'Категории')}
          ${navItem('stats', '📊', 'Статистика')}
          ${navItem('settings', '⚙️', 'Настройки')}
        </nav>
        <div class="sidebar-foot">
          <a href="index.html" target="_blank">Открыть магазин ↗</a><br>
          <a href="private.html" target="_blank">Открыть приватный ↗</a>
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div class="connection">
            <span class="dot"></span>
            <span>${escapeHtml(repo.owner)}/${escapeHtml(repo.name)}</span>
          </div>
          <button id="logout" class="btn-logout">Выйти</button>
        </div>
        <div id="content" class="content"></div>
      </main>
    </div>
  `;
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.addEventListener('click', () => { state.tab = b.dataset.tab; renderApp(); });
  });
  document.getElementById('logout').addEventListener('click', () => {
    if (confirm('Выйти и очистить токен?')) { gh.clearAuth(); boot(); }
  });
  renderTab();
}
function navItem(id, icon, label) {
  return `<button class="nav-item ${state.tab === id ? 'active' : ''}" data-tab="${id}"><span class="icon">${icon}</span>${label}</button>`;
}

function renderTab() {
  const el = document.getElementById('content');
  if (state.tab === 'scripts') return renderScripts(el);
  if (state.tab === 'categories') return renderCategories(el);
  if (state.tab === 'stats') return renderStats(el);
  if (state.tab === 'settings') return renderSettings(el);
}

// ============ Scripts tab ============
function renderScripts(el) {
  const scripts = state.catalog.scripts || [];
  el.innerHTML = `
    <h1>Скрипты</h1>
    <p class="subtitle">Всего ${scripts.length}. Изменения сохраняются прямо в репозиторий.</p>
    <div class="toolbar">
      <button id="add" class="btn btn-primary">+ Добавить скрипт</button>
      <div class="spacer"></div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th>Название</th><th>Категория</th><th>Версия</th><th>Видимость</th><th></th>
        </tr></thead>
        <tbody>
          ${scripts.length ? scripts.map(rowHtml).join('') : `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">Пока нет скриптов</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('add').addEventListener('click', () => openScriptModal(null));
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openScriptModal(b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteScript(b.dataset.del)));
}

function rowHtml(s) {
  const cat = (state.catalog.categories || []).find((c) => c.id === s.category);
  return `
    <tr>
      <td>
        <span class="row-icon" style="background:${escapeHtml(s.color || '#6C63FF')}33;border:1px solid ${escapeHtml(s.color || '#6C63FF')}66">${escapeHtml(s.icon || '📜')}</span>
        <strong>${escapeHtml(s.name)}</strong>
      </td>
      <td>${escapeHtml(cat?.name || s.category)}</td>
      <td>v${escapeHtml(s.version)}</td>
      <td><span class="badge ${s.visibility === 'public' ? 'badge-public' : 'badge-private'}">${s.visibility === 'public' ? 'Публичный' : 'Приватный'}</span></td>
      <td><div class="row-actions">
        <button class="icon-btn" data-edit="${escapeHtml(s.id)}" title="Редактировать">✏️</button>
        <button class="icon-btn danger" data-del="${escapeHtml(s.id)}" title="Удалить">🗑️</button>
      </div></td>
    </tr>
  `;
}

// ============ Script modal ============
function openScriptModal(id) {
  const editing = !!id;
  const orig = editing ? state.catalog.scripts.find((s) => s.id === id) : null;
  const s = orig ? { ...orig, tags: [...(orig.tags || [])], images: [...(orig.images || [])] } : {
    id: '', name: '', description: '', category: state.catalog.categories[0]?.id || '',
    visibility: 'public', version: '1.0', file: '', icon: '📜', color: '#6C63FF',
    images: [], tags: [],
  };

  let pendingFile = null;        // {file, name}
  const pendingImages = [];      // [{file, name, dataUrl}]
  const removedImages = [];      // existing paths to delete on save

  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2>${editing ? 'Редактировать скрипт' : 'Новый скрипт'}</h2>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>Название</label>
          <input class="input" data-f="name" value="${escapeHtml(s.name)}" />
        </div>
        <div class="field">
          <label>ID (латиница, дефисы)</label>
          <input class="input" data-f="id" value="${escapeHtml(s.id)}" ${editing ? 'disabled' : ''} />
          <div class="hint">Используется в путях к файлам и не меняется после создания.</div>
        </div>
        <div class="field">
          <label>Описание</label>
          <textarea class="textarea" data-f="description">${escapeHtml(s.description)}</textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Категория</label>
            <select class="select" data-f="category">
              ${(state.catalog.categories || []).map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === s.category ? 'selected' : ''}>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Видимость</label>
            <div class="toggle" data-toggle="visibility">
              <button type="button" data-v="public" class="${s.visibility === 'public' ? 'active' : ''}">Публичный</button>
              <button type="button" data-v="private" class="${s.visibility === 'private' ? 'active' : ''}">Приватный</button>
            </div>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Версия</label>
            <input class="input" data-f="version" value="${escapeHtml(s.version)}" />
          </div>
          <div class="field">
            <label>Иконка (эмодзи)</label>
            <input class="input" data-f="icon" value="${escapeHtml(s.icon)}" />
          </div>
        </div>
        <div class="field">
          <label>Цвет акцента</label>
          <input type="color" data-f="color" value="${escapeHtml(s.color)}" />
        </div>
        <div class="field">
          <label>Теги</label>
          <div class="chips-input" id="chips">
            ${s.tags.map((t) => tagChip(t)).join('')}
            <input type="text" id="chips-in" placeholder="Введите тег и Enter" />
          </div>
        </div>
        <div class="field">
          <label>Файл скрипта (.user.js)</label>
          <div class="dropzone" id="dz-script">
            <div class="big">📜</div>
            <div>Перетащите файл сюда или нажмите, чтобы выбрать</div>
            <div class="hint" style="margin-top:6px">${editing && s.file ? `Сейчас: <code>${escapeHtml(s.file)}</code>` : 'Файл будет загружен в репозиторий при сохранении'}</div>
          </div>
          <div id="script-pill"></div>
        </div>
        <div class="field">
          <label>Скриншоты (необязательно)</label>
          <div class="dropzone" id="dz-img">
            <div class="big">🖼</div>
            <div>Перетащите картинки или нажмите</div>
          </div>
          <div class="thumbs" id="thumbs">
            ${s.images.map((src, i) => thumbExisting(src, i)).join('')}
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>Отмена</button>
        <button class="btn btn-primary" id="save">💾 Сохранить</button>
      </div>
    </div>
  `;
  document.body.appendChild(back);

  function close() { back.remove(); }
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

  // Toggle
  back.querySelectorAll('[data-toggle="visibility"] button').forEach((b) => {
    b.addEventListener('click', () => {
      s.visibility = b.dataset.v;
      back.querySelectorAll('[data-toggle="visibility"] button').forEach((x) => x.classList.toggle('active', x.dataset.v === s.visibility));
    });
  });

  // Field bindings
  back.querySelectorAll('[data-f]').forEach((inp) => {
    inp.addEventListener('input', () => { s[inp.dataset.f] = inp.value; });
  });

  // Chips
  const chipsBox = back.querySelector('#chips');
  const chipsIn = back.querySelector('#chips-in');
  function tagChip(t) { return `<span class="chip-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}<button type="button" aria-label="Удалить">✕</button></span>`; }
  chipsBox.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const tag = e.target.parentElement.dataset.tag;
      s.tags = s.tags.filter((t) => t !== tag);
      e.target.parentElement.remove();
    }
  });
  chipsIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = chipsIn.value.trim().replace(/,$/, '');
      if (v && !s.tags.includes(v)) {
        s.tags.push(v);
        chipsBox.insertAdjacentHTML('beforeend', tagChip(v));
        // Move input to end
        chipsBox.appendChild(chipsIn);
      }
      chipsIn.value = '';
    }
  });

  // Script dropzone
  const dzScript = back.querySelector('#dz-script');
  const scriptPill = back.querySelector('#script-pill');
  setupDropzone(dzScript, '.user.js,.js', false, (files) => {
    const f = files[0]; if (!f) return;
    pendingFile = { file: f, name: f.name };
    scriptPill.innerHTML = `<span class="file-pill">📜 ${escapeHtml(f.name)} <button type="button" aria-label="Убрать">✕</button></span>`;
    scriptPill.querySelector('button').addEventListener('click', () => { pendingFile = null; scriptPill.innerHTML = ''; });
  });

  // Images dropzone
  const dzImg = back.querySelector('#dz-img');
  const thumbsBox = back.querySelector('#thumbs');
  function thumbExisting(src, i) {
    return `<div class="thumb" data-existing="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt=""><button type="button" aria-label="Удалить">✕</button></div>`;
  }
  thumbsBox.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const card = e.target.parentElement;
      if (card.dataset.existing) {
        removedImages.push(card.dataset.existing);
        s.images = s.images.filter((x) => x !== card.dataset.existing);
      } else if (card.dataset.pending) {
        const idx = parseInt(card.dataset.pending);
        pendingImages[idx] = null;
      }
      card.remove();
    }
  });
  setupDropzone(dzImg, 'image/*', true, (files) => {
    for (const f of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const idx = pendingImages.length;
        pendingImages.push({ file: f, name: f.name, dataUrl: reader.result });
        thumbsBox.insertAdjacentHTML('beforeend', `<div class="thumb" data-pending="${idx}"><img src="${reader.result}" alt=""><button type="button" aria-label="Удалить">✕</button></div>`);
      };
      reader.readAsDataURL(f);
    }
  });

  // Save
  back.querySelector('#save').addEventListener('click', async () => {
    if (!s.id || !s.name) { toast('Заполните ID и название', 'error'); return; }
    if (!editing && state.catalog.scripts.some((x) => x.id === s.id)) { toast('ID занят', 'error'); return; }
    const saveBtn = back.querySelector('#save');
    saveBtn.dataset.loading = '1'; saveBtn.textContent = 'Сохраняю…';
    try {
      // 1) Upload script file
      if (pendingFile) {
        const folder = s.category;
        s.file = `scripts/${folder}/${s.id}.user.js`;
        const b64 = await gh.fileToBase64(pendingFile.file);
        await gh.upsertBase64(s.file, b64, `upload script: ${s.id}`);
      } else if (!s.file) {
        s.file = `scripts/${s.category}/${s.id}.user.js`;
      }

      // 2) Upload images
      const newImgs = [...s.images];
      for (let i = 0; i < pendingImages.length; i++) {
        const it = pendingImages[i];
        if (!it) continue;
        const ext = (it.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const path = `images/scripts/${s.id}-${Date.now()}-${i}.${ext}`;
        const b64 = await gh.fileToBase64(it.file);
        await gh.upsertBase64(path, b64, `upload image: ${path}`);
        newImgs.push(path);
      }
      s.images = newImgs;

      // 3) Delete removed images
      for (const p of removedImages) {
        try { const sha = await gh.getSha(p); if (sha) await gh.deleteFile(p, sha, `delete image: ${p}`); } catch { /* */ }
      }

      // 4) Update catalog
      s.updatedAt = new Date().toISOString().slice(0, 10);
      const file = await gh.getFile(CATALOG_PATH);
      const cat = file ? JSON.parse(file.content) : { version: 1, scripts: [], categories: [] };
      const idx = cat.scripts.findIndex((x) => x.id === s.id);
      if (idx >= 0) cat.scripts[idx] = s; else cat.scripts.push(s);
      await gh.putFileText(CATALOG_PATH, JSON.stringify(cat, null, 2), `${editing ? 'update' : 'add'} script: ${s.id}`, file?.sha);
      state.catalog = cat;
      toast('Сохранено. Магазин обновится через ~30 сек.');
      close();
      renderTab();
    } catch (e) {
      toast('Ошибка: ' + e.message, 'error', 8000);
      saveBtn.dataset.loading = ''; saveBtn.textContent = '💾 Сохранить';
    }
  });
}

function setupDropzone(el, accept, multiple, onFiles) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept; inp.multiple = multiple; inp.style.display = 'none';
  el.appendChild(inp);
  el.addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => { onFiles(Array.from(inp.files)); inp.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.remove('over'); }));
  el.addEventListener('drop', (e) => { onFiles(Array.from(e.dataTransfer.files)); });
}

async function deleteScript(id) {
  const s = state.catalog.scripts.find((x) => x.id === id);
  if (!s) return;
  if (!confirm(`Удалить "${s.name}"? Это также удалит файл скрипта и изображения из репозитория.`)) return;
  try {
    // delete script file
    try { const sha = await gh.getSha(s.file); if (sha) await gh.deleteFile(s.file, sha, `delete script: ${s.id}`); } catch { /* */ }
    // delete images
    for (const p of (s.images || [])) {
      try { const sha = await gh.getSha(p); if (sha) await gh.deleteFile(p, sha, `delete image: ${p}`); } catch { /* */ }
    }
    // update catalog
    const file = await gh.getFile(CATALOG_PATH);
    const cat = file ? JSON.parse(file.content) : state.catalog;
    cat.scripts = cat.scripts.filter((x) => x.id !== id);
    await gh.putFileText(CATALOG_PATH, JSON.stringify(cat, null, 2), `delete script: ${id}`, file?.sha);
    state.catalog = cat;
    toast('Удалено');
    renderTab();
  } catch (e) { toast('Ошибка: ' + e.message, 'error', 8000); }
}

// ============ Categories tab ============
function renderCategories(el) {
  const cats = state.catalog.categories || [];
  el.innerHTML = `
    <h1>Категории</h1>
    <p class="subtitle">Категории видны на главной как пилюли фильтров.</p>
    <div class="toolbar">
      <button id="add-cat" class="btn btn-primary">+ Добавить категорию</button>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Иконка</th><th>Название</th><th>ID</th><th>Скриптов</th><th></th></tr></thead>
        <tbody>
          ${cats.length ? cats.map((c) => {
            const count = (state.catalog.scripts || []).filter((s) => s.category === c.id).length;
            return `<tr>
              <td style="font-size:20px">${escapeHtml(c.icon)}</td>
              <td><strong>${escapeHtml(c.name)}</strong></td>
              <td><code>${escapeHtml(c.id)}</code></td>
              <td>${count}</td>
              <td><div class="row-actions">
                <button class="icon-btn" data-cat-edit="${escapeHtml(c.id)}">✏️</button>
                <button class="icon-btn danger" data-cat-del="${escapeHtml(c.id)}" ${count ? 'disabled title="Сначала удалите/перенесите скрипты"' : ''}>🗑️</button>
              </div></td>
            </tr>`;
          }).join('') : `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">Категорий ещё нет</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('add-cat').addEventListener('click', () => openCategoryModal(null));
  el.querySelectorAll('[data-cat-edit]').forEach((b) => b.addEventListener('click', () => openCategoryModal(b.dataset.catEdit)));
  el.querySelectorAll('[data-cat-del]').forEach((b) => b.addEventListener('click', () => deleteCategory(b.dataset.catDel)));
}

function openCategoryModal(id) {
  const editing = !!id;
  const orig = editing ? state.catalog.categories.find((c) => c.id === id) : null;
  const c = orig ? { ...orig } : { id: '', name: '', icon: '📂' };
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h2>${editing ? 'Категория' : 'Новая категория'}</h2><button class="icon-btn" data-close>✕</button></div>
      <div class="modal-body">
        <div class="field"><label>ID (латиница)</label><input class="input" id="c-id" value="${escapeHtml(c.id)}" ${editing ? 'disabled' : ''}></div>
        <div class="field"><label>Название</label><input class="input" id="c-name" value="${escapeHtml(c.name)}"></div>
        <div class="field"><label>Иконка (эмодзи)</label><input class="input" id="c-icon" value="${escapeHtml(c.icon)}"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>Отмена</button>
        <button class="btn btn-primary" id="c-save">Сохранить</button>
      </div>
    </div>
  `;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  back.querySelector('#c-save').addEventListener('click', async () => {
    c.id = back.querySelector('#c-id').value.trim();
    c.name = back.querySelector('#c-name').value.trim();
    c.icon = back.querySelector('#c-icon').value.trim() || '📂';
    if (!c.id || !c.name) { toast('Заполните поля', 'error'); return; }
    const btn = back.querySelector('#c-save'); btn.dataset.loading = '1'; btn.textContent = 'Сохраняю…';
    try {
      const file = await gh.getFile(CATALOG_PATH);
      const cat = file ? JSON.parse(file.content) : state.catalog;
      cat.categories = cat.categories || [];
      const idx = cat.categories.findIndex((x) => x.id === c.id);
      if (idx >= 0) cat.categories[idx] = c; else cat.categories.push(c);
      await gh.putFileText(CATALOG_PATH, JSON.stringify(cat, null, 2), `${editing ? 'update' : 'add'} category: ${c.id}`, file?.sha);
      state.catalog = cat;
      toast('Сохранено');
      close();
      renderTab();
    } catch (e) { toast('Ошибка: ' + e.message, 'error'); btn.dataset.loading = ''; btn.textContent = 'Сохранить'; }
  });
}

async function deleteCategory(id) {
  if (!confirm('Удалить категорию?')) return;
  try {
    const file = await gh.getFile(CATALOG_PATH);
    const cat = file ? JSON.parse(file.content) : state.catalog;
    cat.categories = (cat.categories || []).filter((c) => c.id !== id);
    await gh.putFileText(CATALOG_PATH, JSON.stringify(cat, null, 2), `delete category: ${id}`, file?.sha);
    state.catalog = cat;
    toast('Удалено');
    renderTab();
  } catch (e) { toast('Ошибка: ' + e.message, 'error'); }
}

// ============ Stats tab ============
async function renderStats(el) {
  const scripts = state.catalog.scripts || [];
  el.innerHTML = `
    <h1>Статистика установок</h1>
    <p class="subtitle">Данные с jsDelivr CDN. Кешируются на 10 минут.</p>
    <div class="toolbar">
      <button id="refresh" class="btn btn-secondary">🔄 Обновить</button>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Скрипт</th><th>Всего</th><th>За месяц</th><th>За неделю</th></tr></thead>
        <tbody id="stats-body">
          ${scripts.map((s) => `<tr data-row="${escapeHtml(s.id)}">
            <td><span class="row-icon" style="background:${escapeHtml(s.color)}33">${escapeHtml(s.icon)}</span><strong>${escapeHtml(s.name)}</strong></td>
            <td>—</td><td>—</td><td>—</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('refresh').addEventListener('click', () => { clearStatsCache(); renderStats(el); });
  for (const s of scripts) {
    try {
      const st = await getInstallStats(s.file);
      const row = el.querySelector(`[data-row="${cssEscapeAttr(s.id)}"]`);
      if (row) {
        row.children[1].textContent = st.total;
        row.children[2].textContent = st.month;
        row.children[3].textContent = st.week;
      }
    } catch { /* */ }
  }
}
function cssEscapeAttr(s) { return String(s).replace(/["\\]/g, '\\$&'); }

// ============ Settings tab ============
function renderSettings(el) {
  const repo = gh.getRepo();
  el.innerHTML = `
    <h1>Настройки</h1>
    <p class="subtitle">Управление паролем приватки и подключением к GitHub.</p>

    <section class="section">
      <h3>🔒 Пароль приватного магазина</h3>
      <p class="section-desc">Пароль нигде не хранится в открытом виде. В коде сохраняется только его «хеш» — необратимая строка SHA-256.</p>
      <div class="field">
        <label>Новый пароль</label>
        <input id="new-pwd" class="input" type="text" placeholder="Введите новый пароль" />
      </div>
      <div id="hash-block" style="display:none">
        <label style="font-size:13px;font-weight:600">Хеш SHA-256:</label>
        <div class="hash-display" id="hash-out"></div>
        <div class="toolbar" style="margin-top:12px">
          <button class="btn btn-primary" id="pwd-auto">⚡ Записать в репозиторий автоматически</button>
          <button class="btn btn-secondary" id="pwd-copy">📋 Скопировать хеш</button>
        </div>
        <div class="callout">
          <strong>Если автозапись не сработала</strong> (нет прав, репозиторий приватный и т.п.) — вставьте хеш вручную:
          <ol>
            <li>Откройте файл <code>${escapeHtml(PRIVATE_JS_PATH)}</code> в вашем репозитории на GitHub.</li>
            <li>Нажмите карандашик «Edit» справа вверху.</li>
            <li>Найдите строку, начинающуюся с <code>const PRIVATE_PASSWORD_HASH = '...'</code>.</li>
            <li>Замените длинную строку в кавычках на хеш выше (нажмите «📋 Скопировать хеш»).</li>
            <li>Прокрутите вниз, нажмите зелёную кнопку <strong>Commit changes</strong>.</li>
            <li>Подождите ~1 минуту, пока GitHub Pages пересоберётся.</li>
          </ol>
        </div>
      </div>
    </section>

    <section class="section">
      <h3>🔑 GitHub-токен</h3>
      <p class="section-desc">Сейчас подключено: <code>${escapeHtml(repo.owner)}/${escapeHtml(repo.name)}</code></p>
      <button class="btn btn-danger" id="clear-pat">Очистить токен и выйти</button>
    </section>
  `;

  const pwdIn = el.querySelector('#new-pwd');
  const hashBlock = el.querySelector('#hash-block');
  const hashOut = el.querySelector('#hash-out');
  let currentHash = '';

  pwdIn.addEventListener('input', async () => {
    const v = pwdIn.value;
    if (!v) { hashBlock.style.display = 'none'; currentHash = ''; return; }
    currentHash = await sha256Hex(v);
    hashOut.textContent = currentHash;
    hashBlock.style.display = 'block';
  });

  el.querySelector('#pwd-copy').addEventListener('click', () => {
    if (!currentHash) return;
    navigator.clipboard.writeText(currentHash).then(() => toast('Скопировано'));
  });

  el.querySelector('#pwd-auto').addEventListener('click', async () => {
    if (!currentHash) return;
    const btn = el.querySelector('#pwd-auto'); btn.dataset.loading = '1'; btn.textContent = 'Записываю…';
    try {
      const file = await gh.getFile(PRIVATE_JS_PATH);
      if (!file) throw new Error(`Файл ${PRIVATE_JS_PATH} не найден в репозитории`);
      const updated = file.content.replace(
        /const PRIVATE_PASSWORD_HASH = '[0-9a-f]{64}'/,
        `const PRIVATE_PASSWORD_HASH = '${currentHash}'`
      );
      if (updated === file.content) throw new Error('Не удалось найти строку с хешем — обновите вручную');
      await gh.putFileText(PRIVATE_JS_PATH, updated, `update private password hash`, file.sha);
      toast('Пароль обновлён. Через ~1 минуту вступит в силу.');
      pwdIn.value = ''; hashBlock.style.display = 'none';
    } catch (e) {
      toast('Ошибка: ' + e.message, 'error', 8000);
    }
    btn.dataset.loading = ''; btn.textContent = '⚡ Записать в репозиторий автоматически';
  });

  el.querySelector('#clear-pat').addEventListener('click', () => {
    if (confirm('Очистить токен и выйти?')) { gh.clearAuth(); boot(); }
  });
}

// ============ Start ============
boot();
