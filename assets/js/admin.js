// Админка Script Store. Версия: 1.2 (2026-07-08)
import { loadCatalog, loadPrivateCatalog, escapeHtml, loadScriptVersion } from './common.js';
import * as gh from './github-api.js';
import { getInstallStats, clearStatsCache } from './stats.js';

const root = document.getElementById('root');
const toasts = document.getElementById('toasts');

const CATALOG_PATH = 'catalog.json';

// Надёжно загружает catalog.json: sha берётся через directory listing,
// content — через getFile.
// БЕЗОПАСНОСТЬ: если SHA получен, но контент недоступен — кидаем ошибку (не пишем пустышку).
// Только если файл реально не существует (sha=null И getFile=null) — возвращаем пустой каталог.
async function loadCatalogFile(usePrivate = false) {
  const empty = { version: 1, scripts: [], categories: [] };

  // Шаг 1: пробуем получить SHA через directory listing
  const sha = await gh.getSha(CATALOG_PATH, usePrivate);

  // Шаг 2: если SHA не получен — пробуем getFile напрямую (fallback)
  if (!sha) {
    const file = await gh.getFile(CATALOG_PATH, usePrivate);
    if (!file) {
      // Файл реально не существует — это новый репо, возвращаем пустой каталог
      return { sha: null, cat: { ...empty } };
    }
    // Файл существует но SHA не удалось получить через listing — используем SHA из getFile
    if (!file.content) throw new Error('Не удалось загрузить содержимое catalog.json (файл есть, контент недоступен)');
    const cat = JSON.parse(file.content);
    return { sha: file.sha, cat };
  }

  // Шаг 3: SHA получен, загружаем контент
  const file = await gh.getFile(CATALOG_PATH, usePrivate);
  // Если файл существует (sha есть), но контент не загрузился — НЕ подменяем на пустой каталог.
  // Иначе saveCatalogWithRetry перезапишет реальные данные пустышкой.
  if (!file || !file.content) throw new Error('Не удалось загрузить содержимое catalog.json (sha=' + sha + ')');
  const cat = JSON.parse(file.content);
  return { sha, cat };
}

// Сохраняет catalog.json с автоповтором при 409 (SHA-конфликт).
// changeFn получает cat и должна его изменить. Возвращает итоговый каталог.
async function saveCatalogWithRetry(usePrivate, changeFn, commitMsg, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { sha, cat } = await loadCatalogFile(usePrivate);
    changeFn(cat);
    sanitizeCatalogScriptVersions(cat);
    try {
      await gh.putFileText(CATALOG_PATH, JSON.stringify(cat, null, 2), commitMsg, sha, usePrivate);
      return;
    } catch (e) {
      if (e.status === 409 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * attempt));
        continue;
      }
      throw e;
    }
  }
}

let state = {
  tab: 'scripts',
  catalog: null,         // объединённый каталог (public + private)
  publicCatalog: null,   // raw публичный catalog.json
  privateCatalog: null,  // raw приватный catalog.json
  loading: false,
  orderDirty: { public: false, private: false },
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

function sanitizeCatalogScriptVersions(cat) {
  if (!cat || !Array.isArray(cat.scripts)) return cat;
  cat.scripts = cat.scripts.map((script) => {
    const clean = { ...script };
    delete clean.version;
    return clean;
  });
  return cat;
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
  await loadAllCatalogs();
  renderApp();
}

async function loadAllCatalogs() {
  // Публичный каталог
  let pubCat = { version: 1, scripts: [], categories: [] };
  try {
    pubCat = await loadCatalog();
  } catch { /* */ }

  // Приватный каталог (если репо настроен)
  let privCat = { version: 1, scripts: [], categories: [] };
  if (gh.hasPrivateRepo()) {
    try {
      privCat = await loadPrivateCatalog();
    } catch { /* */ }
  }

  state.publicCatalog = pubCat;
  state.privateCatalog = privCat;

  // Объединяем с пометкой visibility
  const pubScripts = (pubCat.scripts || []).map(s => ({ ...s, visibility: 'public' }));
  const privScripts = (privCat.scripts || []).map(s => ({ ...s, visibility: 'private' }));

  // Категории объединяем уникально
  const cats = [...(pubCat.categories || [])];
  for (const c of (privCat.categories || [])) {
    if (!cats.some(x => x.id === c.id)) cats.push(c);
  }

  state.catalog = {
    version: pubCat.version || 1,
    scripts: [...pubScripts, ...privScripts],
    categories: cats,
  };
  state.orderDirty = { public: false, private: false };
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
            <label for="g-repo">Публичный репозиторий</label>
            <input id="g-repo" class="input" type="text" placeholder="ваш-логин/название-репо" required pattern="[^/\\s]+/[^/\\s]+" />
            <div class="hint">Например: <code>TroyDiFlex/userscripts</code></div>
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
  const hasPrivate = gh.hasPrivateRepo();
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
            ${hasPrivate ? `<span style="margin-left:8px;opacity:.6;font-size:12px">+ приватный</span>` : ''}
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
  const orderChanged = state.orderDirty.public || state.orderDirty.private;
  el.innerHTML = `
    <h1>Скрипты</h1>
    <p class="subtitle">Всего ${scripts.length}. Изменения сохраняются прямо в репозиторий.</p>
    <div class="toolbar">
      <button id="add" class="btn btn-primary">+ Добавить скрипт</button>
      <button id="save-order" class="btn btn-secondary" ${orderChanged ? '' : 'disabled'}>↕ Сохранить порядок</button>
      <div class="spacer"></div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th>Порядок</th><th>Название</th><th>Категория</th><th>Версия</th><th>Видимость</th><th></th>
        </tr></thead>
        <tbody>
          ${scripts.length ? scripts.map((s) => rowHtml(s, scripts)).join('') : `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">Пока нет скриптов</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('add').addEventListener('click', () => openScriptModal(null));
  document.getElementById('save-order').addEventListener('click', saveScriptOrder);
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openScriptModal(b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteScript(b.dataset.del)));
  el.querySelectorAll('[data-order-id]').forEach((b) => {
    b.addEventListener('click', () => moveScriptOrder(b.dataset.orderId, Number(b.dataset.orderDir)));
  });
  loadAdminVersions(el, scripts);
}

async function loadAdminVersions(el, scripts) {
  for (const s of scripts) {
    try {
      const isPrivate = s.visibility === 'private';
      const version = await loadScriptVersion(s.file, { visibility: isPrivate ? 'private' : 'public' });
      if (version) {
        const target = el.querySelector(`[data-script-version="${cssEscapeAttr(s.id)}"]`);
        if (target) target.textContent = `v${version}`;
      }
    } catch { /* */ }
  }
}

function rowHtml(s, scripts) {
  const cat = (state.catalog.categories || []).find((c) => c.id === s.category);
  const isPrivate = s.visibility === 'private';
  const sameVisibility = scripts.filter((x) => (x.visibility || 'public') === (s.visibility || 'public'));
  const orderIndex = sameVisibility.findIndex((x) => x.id === s.id);
  return `
    <tr>
      <td>
        <div class="order-controls">
          <button class="icon-btn" data-order-id="${escapeHtml(s.id)}" data-order-dir="-1" title="Выше" ${orderIndex <= 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-order-id="${escapeHtml(s.id)}" data-order-dir="1" title="Ниже" ${orderIndex >= sameVisibility.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
      </td>
      <td>
        <span class="row-icon" style="background:${escapeHtml(s.color || '#6C63FF')}33;border:1px solid ${escapeHtml(s.color || '#6C63FF')}66">${escapeHtml(s.icon || '📜')}</span>
        <strong>${escapeHtml(s.name)}</strong>
      </td>
      <td>${escapeHtml(cat?.name || s.category)}</td>
      <td><span data-script-version="${escapeHtml(s.id)}">&mdash;</span></td>
      <td><span class="badge ${isPrivate ? 'badge-private' : 'badge-public'}">${isPrivate ? '🔒 Приватный' : '🌐 Публичный'}</span></td>
      <td><div class="row-actions">
        <button class="icon-btn" data-edit="${escapeHtml(s.id)}" title="Редактировать">✏️</button>
        <button class="icon-btn danger" data-del="${escapeHtml(s.id)}" title="Удалить">🗑️</button>
      </div></td>
    </tr>
  `;
}

function moveScriptOrder(id, dir) {
  const scripts = state.catalog.scripts || [];
  const from = scripts.findIndex((s) => s.id === id);
  if (from < 0 || !dir) return;

  const visibility = scripts[from].visibility || 'public';
  const sameVisibilityIndexes = scripts
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => (s.visibility || 'public') === visibility)
    .map(({ i }) => i);
  const fromPos = sameVisibilityIndexes.indexOf(from);
  const to = sameVisibilityIndexes[fromPos + dir];
  if (to === undefined) return;

  [scripts[from], scripts[to]] = [scripts[to], scripts[from]];
  state.orderDirty[visibility] = true;
  renderTab();
}

async function saveScriptOrder() {
  const btn = document.getElementById('save-order');
  if (!btn || btn.disabled) return;
  btn.dataset.loading = '1';
  btn.textContent = 'Сохраняю…';

  try {
    for (const usePrivate of [false, true]) {
      const visibility = usePrivate ? 'private' : 'public';
      if (!state.orderDirty[visibility]) continue;
      if (usePrivate && !gh.hasPrivateRepo()) continue;

      const orderedIds = (state.catalog.scripts || [])
        .filter((s) => (s.visibility || 'public') === visibility)
        .map((s) => s.id);
      const order = new Map(orderedIds.map((id, index) => [id, index]));
      await saveCatalogWithRetry(usePrivate, (cat) => {
        cat.scripts = (cat.scripts || []).slice().sort((a, b) => {
          const ai = order.has(a.id) ? order.get(a.id) : Number.MAX_SAFE_INTEGER;
          const bi = order.has(b.id) ? order.get(b.id) : Number.MAX_SAFE_INTEGER;
          return ai - bi;
        });
      }, `reorder ${visibility} scripts`);
    }

    await loadAllCatalogs();
    toast('Порядок сохранён');
    renderTab();
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error', 8000);
    btn.dataset.loading = '';
    btn.textContent = '↕ Сохранить порядок';
  }
}

// ============ Script modal ============
function openScriptModal(id) {
  const editing = !!id;
  const orig = editing ? state.catalog.scripts.find((s) => s.id === id) : null;
  const s = orig ? { ...orig, tags: [...(orig.tags || [])], images: [...(orig.images || [])] } : {
    id: '', name: '', description: '', category: state.catalog.categories[0]?.id || '',
    visibility: 'public', file: '', icon: '📜', color: '#6C63FF',
    images: [], tags: [],
  };

  const origVisibility = orig?.visibility || null;  // запомним исходную видимость

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
              <button type="button" data-v="public" class="${s.visibility === 'public' ? 'active' : ''}">🌐 Публичный</button>
              <button type="button" data-v="private" class="${s.visibility === 'private' ? 'active' : ''}">🔒 Приватный</button>
            </div>
            ${!gh.hasPrivateRepo() ? `<div class="hint" style="color:var(--warning)">⚠️ Настройте приватный репо в Настройках</div>` : ''}
          </div>
        </div>
        <div class="field-row">

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

  // Toggle visibility
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
    return `<div class="thumb" data-existing="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt=""><div class="thumb-actions"><button type="button" data-move="-1" aria-label="Раньше" title="Раньше" ${i <= 0 ? 'disabled' : ''}>&larr;</button><button type="button" data-move="1" aria-label="Позже" title="Позже" ${i >= s.images.length - 1 ? 'disabled' : ''}>&rarr;</button><button type="button" class="thumb-remove" data-remove aria-label="Удалить">✕</button></div></div>`;
  }
  function thumbPending(it, idx) {
    return `<div class="thumb" data-pending="${idx}"><img src="${escapeHtml(it.dataUrl)}" alt=""><div class="thumb-actions"><button type="button" class="thumb-remove" data-remove aria-label="Удалить">✕</button></div></div>`;
  }
  function renderThumbs() {
    thumbsBox.innerHTML = s.images.map((src, i) => thumbExisting(src, i)).join('')
      + pendingImages.map((it, idx) => it ? thumbPending(it, idx) : '').join('');
  }
  thumbsBox.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !thumbsBox.contains(btn)) return;
    const card = btn.closest('.thumb');
    if (!card) return;

    if (btn.dataset.move && card.dataset.existing) {
      const from = s.images.indexOf(card.dataset.existing);
      const to = from + Number(btn.dataset.move);
      if (from < 0 || to < 0 || to >= s.images.length) return;
      [s.images[from], s.images[to]] = [s.images[to], s.images[from]];
      renderThumbs();
      return;
    }

    if (btn.dataset.remove !== undefined) {
      if (card.dataset.existing) {
        removedImages.push(card.dataset.existing);
        s.images = s.images.filter((x) => x !== card.dataset.existing);
      } else if (card.dataset.pending) {
        const idx = parseInt(card.dataset.pending);
        pendingImages[idx] = null;
      }
      renderThumbs();
    }
  });
  setupDropzone(dzImg, 'image/*', true, (files) => {
    for (const f of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const idx = pendingImages.length;
        pendingImages.push({ file: f, name: f.name, dataUrl: reader.result });
        renderThumbs();
      };
      reader.readAsDataURL(f);
    }
  });

  // Save
  back.querySelector('#save').addEventListener('click', async () => {
    if (!s.id || !s.name) { toast('Заполните ID и название', 'error'); return; }
    if (!editing && state.catalog.scripts.some((x) => x.id === s.id)) { toast('ID занят', 'error'); return; }
    if (s.visibility === 'private' && !gh.hasPrivateRepo()) {
      toast('Сначала настройте приватный репозиторий в Настройках!', 'error', 6000);
      return;
    }

    const saveBtn = back.querySelector('#save');
    saveBtn.dataset.loading = '1'; saveBtn.textContent = 'Сохраняю…';

    const isPrivate = s.visibility === 'private';
    const visibilityChanged = editing && origVisibility !== null && origVisibility !== s.visibility;
    const wasPrivate = origVisibility === 'private';

    try {
      // 1) Если скрипт МЕНЯЛ видимость — удалить из старого репо
      if (visibilityChanged && orig.file) {
        const oldPrivate = wasPrivate;
        try {
          const oldSha = await gh.getSha(orig.file, oldPrivate);
          if (oldSha) await gh.deleteFile(orig.file, oldSha, `move script to ${s.visibility}: ${s.id}`, oldPrivate);
        } catch { /* файла нет — не страшно */ }
        // Удалить старые картинки из старого репо
        for (const p of (orig.images || [])) {
          try { const sha = await gh.getSha(p, oldPrivate); if (sha) await gh.deleteFile(p, sha, `move image: ${p}`, oldPrivate); } catch { /* */ }
        }
      }

      // 2) Загрузить файл скрипта в НУЖНЫЙ репо
      if (pendingFile) {
        s.file = `dist/${s.id}.user.js`;
        const b64 = await gh.fileToBase64(pendingFile.file);
        await gh.upsertBase64(s.file, b64, `upload script: ${s.id}`, isPrivate);
      } else if (!s.file) {
        s.file = `dist/${s.id}.user.js`;
      }

      // 3) Загрузить картинки в НУЖНЫЙ репо
      const newImgs = visibilityChanged ? [] : [...s.images];
      for (let i = 0; i < pendingImages.length; i++) {
        const it = pendingImages[i];
        if (!it) continue;
        const ext = (it.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const path = `images/scripts/${s.id}-${Date.now()}-${i}.${ext}`;
        const b64 = await gh.fileToBase64(it.file);
        await gh.upsertBase64(path, b64, `upload image: ${path}`, isPrivate);
        newImgs.push(path);
      }
      // Если видимость не менялась — удалить удалённые картинки
      if (!visibilityChanged) {
        for (const p of removedImages) {
          try { const sha = await gh.getSha(p, isPrivate); if (sha) await gh.deleteFile(p, sha, `delete image: ${p}`, isPrivate); } catch { /* */ }
        }
      }
      s.images = newImgs;

      // 4) Обновить catalog.json НУЖНОГО репо
      s.updatedAt = new Date().toISOString().slice(0, 10);
      const scriptForCatalog = { ...s };
      delete scriptForCatalog.visibility; // visibility не хранится в catalog.json
      delete scriptForCatalog.version;

      await saveCatalogWithRetry(isPrivate, (cat) => {
        const idx = cat.scripts.findIndex((x) => x.id === s.id);
        if (idx >= 0) cat.scripts[idx] = scriptForCatalog; else cat.scripts.push(scriptForCatalog);
        // Не трогаем cat.categories — каждый каталог управляет своими категориями независимо
      }, `${editing ? 'update' : 'add'} script: ${s.id}`);

      // 5) Если менялась видимость — удалить из старого catalog.json
      if (visibilityChanged) {
        const oldPrivate = wasPrivate;
        await saveCatalogWithRetry(oldPrivate, (oldCat) => {
          oldCat.scripts = (oldCat.scripts || []).filter((x) => x.id !== s.id);
        }, `remove script (moved): ${s.id}`);
      }

      // 6) Обновить локальный state
      await loadAllCatalogs();
      toast('Сохранено! Магазин обновится через ~30 сек.');
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
  const isPrivate = s.visibility === 'private';
  try {
    // Удалить файл скрипта
    try { const sha = await gh.getSha(s.file, isPrivate); if (sha) await gh.deleteFile(s.file, sha, `delete script: ${s.id}`, isPrivate); } catch { /* */ }
    // Удалить картинки
    for (const p of (s.images || [])) {
      try { const sha = await gh.getSha(p, isPrivate); if (sha) await gh.deleteFile(p, sha, `delete image: ${p}`, isPrivate); } catch { /* */ }
    }
    // Обновить catalog.json
    await saveCatalogWithRetry(isPrivate, (cat) => {
      cat.scripts = (cat.scripts || []).filter((x) => x.id !== id);
    }, `delete script: ${id}`);
    await loadAllCatalogs();
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
      // Сохраняем категорию в ОБА каталога
      for (const usePrivate of [false, true]) {
        if (usePrivate && !gh.hasPrivateRepo()) continue;
        await saveCatalogWithRetry(usePrivate, (cat) => {
          cat.categories = cat.categories || [];
          const idx = cat.categories.findIndex((x) => x.id === c.id);
          if (idx >= 0) cat.categories[idx] = c; else cat.categories.push(c);
        }, `${editing ? 'update' : 'add'} category: ${c.id}`);
      }
      await loadAllCatalogs();
      toast('Сохранено');
      close();
      renderTab();
    } catch (e) { toast('Ошибка: ' + e.message, 'error'); btn.dataset.loading = ''; btn.textContent = 'Сохранить'; }
  });
}

async function deleteCategory(id) {
  if (!confirm('Удалить категорию?')) return;
  try {
    for (const usePrivate of [false, true]) {
      if (usePrivate && !gh.hasPrivateRepo()) continue;
      await saveCatalogWithRetry(usePrivate, (cat) => {
        cat.categories = (cat.categories || []).filter((c) => c.id !== id);
      }, `delete category: ${id}`);
    }
    await loadAllCatalogs();
    toast('Удалено');
    renderTab();
  } catch (e) { toast('Ошибка: ' + e.message, 'error'); }
}

// ============ Stats tab ============
async function renderStats(el) {
  const scripts = state.catalog.scripts || [];
  el.innerHTML = `
    <h1>Статистика установок</h1>
    <p class="subtitle">Данные из Google Sheets. Кешируются на 5 минут.</p>
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
      const st = await getInstallStats(s.id);
      const row = el.querySelector(`[data-row="${cssEscapeAttr(s.id)}"]`);
      if (row) {
        row.children[1].textContent = st.total || 0;
        row.children[2].textContent = st.month || 0;
        row.children[3].textContent = st.week || 0;
      }
    } catch { /* */ }
  }
}
function cssEscapeAttr(s) { return String(s).replace(/["\\]/g, '\\$&'); }

// ============ Settings tab ============
function renderSettings(el) {
  const repo = gh.getRepo();
  const privateRepoRaw = gh.getPrivateRepoRaw();
  el.innerHTML = `
    <h1>Настройки</h1>
    <p class="subtitle">Управление репозиториями и подключением к GitHub.</p>

    <section class="section">
      <h3>🔒 Приватный репозиторий</h3>
      <p class="section-desc">Укажите название вашего приватного репозитория на GitHub. Туда будут сохраняться все скрипты с видимостью «Приватный».</p>
      <div class="field">
        <label for="priv-repo">Приватный репозиторий</label>
        <input id="priv-repo" class="input" type="text" placeholder="TroyDiFlex/private-scripts" value="${escapeHtml(privateRepoRaw)}" />
        <div class="hint">Формат: <code>логин/название-репо</code>. Например: <code>TroyDiFlex/private-scripts</code></div>
      </div>
      <div class="toolbar" style="margin-top:12px">
        <button class="btn btn-primary" id="save-priv-repo">💾 Сохранить</button>
        <button class="btn btn-secondary" id="check-priv-repo" ${!privateRepoRaw ? 'disabled' : ''}>🔍 Проверить подключение</button>
      </div>
      <div id="priv-status" style="margin-top:12px"></div>
    </section>

    <section class="section">
      <h3>🔑 GitHub-токен (публичный репо)</h3>
      <p class="section-desc">Сейчас подключено: <code>${escapeHtml(repo.owner)}/${escapeHtml(repo.name)}</code></p>
      <p class="section-desc" style="opacity:.7;font-size:13px">Используйте тот же токен для обоих репозиториев — он подходит, если у него есть права на оба.</p>
      <button class="btn btn-danger" id="clear-pat">Очистить токен и выйти</button>
    </section>
  `;

  const privRepoInput = el.querySelector('#priv-repo');
  const privStatus = el.querySelector('#priv-status');

  el.querySelector('#save-priv-repo').addEventListener('click', () => {
    const val = privRepoInput.value.trim();
    gh.setPrivateRepo(val);
    toast(val ? `Приватный репо сохранён: ${val}` : 'Приватный репо очищен');
    el.querySelector('#check-priv-repo').disabled = !val;
    renderApp();
  });

  el.querySelector('#check-priv-repo').addEventListener('click', async () => {
    const btn = el.querySelector('#check-priv-repo');
    btn.dataset.loading = '1'; btn.textContent = 'Проверяю…';
    privStatus.innerHTML = '';
    try {
      await gh.checkPrivateAuth();
      privStatus.innerHTML = `<div class="callout" style="border-color:var(--success)">✅ Подключено! Репозиторий найден и доступен.</div>`;
    } catch (e) {
      privStatus.innerHTML = `<div class="callout" style="border-color:var(--danger)">❌ Ошибка: ${escapeHtml(e.message)}<br><small>Убедитесь, что токен имеет права на этот репозиторий и название написано правильно.</small></div>`;
    }
    btn.dataset.loading = ''; btn.textContent = '🔍 Проверить подключение';
  });

  el.querySelector('#clear-pat').addEventListener('click', () => {
    if (confirm('Очистить токен и выйти?')) { gh.clearAuth(); boot(); }
  });
}

// ============ Start ============
boot();
