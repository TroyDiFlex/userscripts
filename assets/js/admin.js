// Админка Script Store. Версия: 1.5 (2026-07-08)
import { loadCatalog, loadPrivateCatalog, escapeHtml, loadScriptVersion } from './common.js';
import * as gh from './github-api.js';
import { getInstallStats, clearStatsCache } from './stats.js';

const root = document.getElementById('root');
const toasts = document.getElementById('toasts');

const CATALOG_PATH = 'catalog.json';

// ============================================================
// DRAFT STATE
// Все изменения накапливаются здесь до нажатия «Опубликовать».
// В GitHub ничего не уходит до publishDraft().
// ============================================================

// Инициализирует чистый черновик на основе загруженных каталогов
function initDraft() {
  state.draft = {
    publicCatalog:  deepClone(state.publicCatalog),
    privateCatalog: deepClone(state.privateCatalog),
    // Файлы для загрузки: [{path, base64, usePrivate}]
    pendingFiles:  [],
    // Файлы для удаления: [{path, usePrivate}]
    filesToDelete: [],
    // Счётчик логических изменений (для индикатора)
    changeCount: 0,
  };
}

function isDraftDirty() {
  return state.draft && state.draft.changeCount > 0;
}

// Применить изменение к черновому каталогу в памяти
function applyDraft(changeFn, usePrivate) {
  const cat = usePrivate ? state.draft.privateCatalog : state.draft.publicCatalog;
  changeFn(cat);
  sanitizeCatalogScriptVersions(cat);
  state.draft.changeCount++;
  updatePublishButton();
}

// Добавить файл в очередь загрузки
function queueFile(path, base64, usePrivate) {
  // Если файл с таким путём уже в очереди — перезаписать
  const idx = state.draft.pendingFiles.findIndex(f => f.path === path);
  if (idx >= 0) state.draft.pendingFiles[idx] = { path, base64, usePrivate };
  else state.draft.pendingFiles.push({ path, base64, usePrivate });
}

// Добавить файл в очередь удаления
function queueDelete(path, usePrivate) {
  // Если был в очереди загрузки — убрать оттуда (передумали)
  state.draft.pendingFiles = state.draft.pendingFiles.filter(f => f.path !== path);
  // Добавить в очередь удаления только реально существующих файлов
  if (!state.draft.filesToDelete.some(f => f.path === path)) {
    state.draft.filesToDelete.push({ path, usePrivate });
  }
}

// Публикация черновика: загружаем файлы + пишем каталоги
async function publishDraft() {
  const btn = document.getElementById('publish-btn');
  if (btn) { btn.dataset.loading = '1'; btn.textContent = 'Публикую…'; }

  try {
    // 1) Удалить файлы из очереди удаления
    for (const { path, usePrivate } of state.draft.filesToDelete) {
      try {
        const sha = await gh.getSha(path, usePrivate);
        if (sha) await gh.deleteFile(path, sha, `delete: ${path}`, usePrivate);
      } catch { /* файла нет — не страшно */ }
    }

    // 2) Загрузить новые/обновлённые файлы
    for (const { path, base64, usePrivate } of state.draft.pendingFiles) {
      await gh.upsertBase64(path, base64, `upload: ${path}`, usePrivate);
    }

    // 3) Сохранить публичный каталог
    const pubChanged = state.draft.changeCount > 0;
    if (pubChanged) {
      const { sha } = await loadCatalogFile(false);
      await gh.putFileText(
        CATALOG_PATH,
        JSON.stringify(state.draft.publicCatalog, null, 2),
        `admin: batch update (${state.draft.changeCount} changes)`,
        sha,
        false,
      );
    }

    // 4) Сохранить приватный каталог (если он отличается от исходного)
    if (gh.hasPrivateRepo()) {
      const privOrigStr = JSON.stringify(state.privateCatalog);
      const privDraftStr = JSON.stringify(state.draft.privateCatalog);
      if (privOrigStr !== privDraftStr) {
        const { sha } = await loadCatalogFile(true);
        await gh.putFileText(
          CATALOG_PATH,
          JSON.stringify(state.draft.privateCatalog, null, 2),
          `admin: batch update private`,
          sha,
          true,
        );
      }
    }

    // 5) Принять опубликованный черновик как новую базу (без re-fetch из GitHub —
    //    CDN может вернуть стейл ещё несколько секунд после коммита)
    state.publicCatalog  = deepClone(state.draft.publicCatalog);
    state.privateCatalog = deepClone(state.draft.privateCatalog);
    initDraft();
    rebuildCatalogFromDraft();
    toast(`Опубликовано! Магазин обновится через ~30 сек.`);
    renderApp();
  } catch (e) {
    toast('Ошибка публикации: ' + e.message, 'error', 8000);
    if (btn) { btn.dataset.loading = ''; btn.textContent = publishBtnLabel(); }
  }
}

function publishBtnLabel() {
  const n = state.draft?.changeCount || 0;
  return n > 0 ? `🚀 Опубликовать (${n})` : '🚀 Опубликовать';
}

function updatePublishButton() {
  const btn = document.getElementById('publish-btn');
  if (!btn) return;
  const dirty = isDraftDirty();
  const n = state.draft?.changeCount || 0;
  btn.disabled = !dirty;
  btn.dataset.dirty = dirty ? '1' : '';
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>${dirty ? `Опубликовать (${n})` : 'Опубликовать'}`;
}

// Предупреждение при закрытии вкладки с несохранёнными изменениями
window.addEventListener('beforeunload', (e) => {
  if (isDraftDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ============================================================

async function loadCatalogFile(usePrivate = false) {
  const empty = { version: 1, scripts: [], categories: [] };
  const file = await gh.getFile(CATALOG_PATH, usePrivate);
  if (!file) return { sha: null, cat: { ...empty } };
  if (!file.content) throw new Error('Не удалось загрузить содержимое catalog.json (файл слишком большой?)');
  const cat = JSON.parse(file.content);
  return { sha: file.sha, cat };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj ?? { version: 1, scripts: [], categories: [] }));
}

let state = {
  tab: 'scripts',
  catalog: null,
  publicCatalog: null,
  privateCatalog: null,
  loading: false,
  orderDirty: { public: false, private: false },
  draft: null,
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

// Объединяет черновые каталоги в state.catalog для отображения в UI
function rebuildCatalogFromDraft() {
  const pubCat  = state.draft.publicCatalog;
  const privCat = state.draft.privateCatalog;
  const pubScripts  = (pubCat.scripts  || []).map(s => ({ ...s, visibility: 'public'  }));
  const privScripts = (privCat.scripts || []).map(s => ({ ...s, visibility: 'private' }));
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
  let pubCat = { version: 1, scripts: [], categories: [] };
  try { pubCat = await loadCatalog(); } catch { /* */ }

  let privCat = { version: 1, scripts: [], categories: [] };
  if (gh.hasPrivateRepo()) {
    try { privCat = await loadPrivateCatalog(); } catch { /* */ }
  }

  state.publicCatalog  = pubCat;
  state.privateCatalog = privCat;

  // Инициализируем черновик из свежих данных
  initDraft();
  rebuildCatalogFromDraft();
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
    const pat  = document.getElementById('g-pat').value.trim();
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
  const dirty = isDraftDirty();
  root.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="sidebar-logo"><span class="sidebar-logo-mark">⚡</span><span>Script Store</span></div>
        <nav class="nav">
          ${navItem('scripts',    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', 'Скрипты')}
          ${navItem('categories', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>', 'Категории')}
          ${navItem('stats',      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', 'Статистика')}
          ${navItem('settings',   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', 'Настройки')}
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
          <div class="topbar-actions">
            <button id="publish-btn" class="btn-publish" ${dirty ? 'data-dirty="1"' : ''} ${dirty ? '' : 'disabled'}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
              ${dirty ? `Опубликовать (${state.draft.changeCount})` : 'Опубликовать'}
            </button>
            <button id="logout" class="btn-logout">Выйти</button>
          </div>
        </div>
        <div id="content" class="content"></div>
      </main>
    </div>
  `;
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.addEventListener('click', () => { state.tab = b.dataset.tab; renderApp(); });
  });
  document.getElementById('logout').addEventListener('click', () => {
    if (isDraftDirty() && !confirm('Есть несохранённые изменения. Выйти и потерять их?')) return;
    if (confirm('Выйти и очистить токен?')) { gh.clearAuth(); boot(); }
  });
  document.getElementById('publish-btn').addEventListener('click', publishDraft);
  renderTab();
}

function navItem(id, icon, label) {
  return `<button class="nav-item ${state.tab === id ? 'active' : ''}" data-tab="${id}"><span class="icon">${icon}</span>${label}</button>`;
}

function renderTab() {
  const el = document.getElementById('content');
  if (state.tab === 'scripts')    return renderScripts(el);
  if (state.tab === 'categories') return renderCategories(el);
  if (state.tab === 'stats')      return renderStats(el);
  if (state.tab === 'settings')   return renderSettings(el);
}

// ============ Scripts tab ============
function renderScripts(el) {
  const scripts = state.catalog.scripts || [];
  const orderChanged = state.orderDirty.public || state.orderDirty.private;
  el.innerHTML = `
    <h1>Скрипты</h1>
    <p class="subtitle">Всего ${scripts.length}. Изменения накапливаются в черновике — нажмите «Опубликовать» в шапке, чтобы сохранить всё разом.</p>
    <div class="toolbar">
      <button id="add" class="btn btn-primary">+ Добавить скрипт</button>
      <button id="save-order" class="btn btn-secondary" ${orderChanged ? '' : 'disabled'}>↕ Применить порядок</button>
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
  document.getElementById('save-order').addEventListener('click', applyScriptOrder);
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openScriptModal(b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach((b)  => b.addEventListener('click', () => deleteScript(b.dataset.del)));
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
  // Показываем метку черновика если скрипт ещё не в GitHub (только в draft)
  const inGithub = (isPrivate ? state.privateCatalog : state.publicCatalog)?.scripts?.some(x => x.id === s.id);
  const draftBadge = !inGithub ? ' <span style="font-size:11px;opacity:.6;font-weight:400">(черновик)</span>' : '';
  return `
    <tr>
      <td>
        <div class="order-controls">
          <button class="icon-btn" data-order-id="${escapeHtml(s.id)}" data-order-dir="-1" title="Выше" ${orderIndex <= 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-order-id="${escapeHtml(s.id)}" data-order-dir="1"  title="Ниже" ${orderIndex >= sameVisibility.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
      </td>
      <td>
        <span class="row-icon" style="background:${escapeHtml(s.color || '#6C63FF')}33;border:1px solid ${escapeHtml(s.color || '#6C63FF')}66">${escapeHtml(s.icon || '📜')}</span>
        <strong>${escapeHtml(s.name)}</strong>${draftBadge}
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

// Применить текущий порядок в черновик (без пуша в GitHub)
function applyScriptOrder() {
  const btn = document.getElementById('save-order');
  if (!btn || btn.disabled) return;

  for (const usePrivate of [false, true]) {
    const visibility = usePrivate ? 'private' : 'public';
    if (!state.orderDirty[visibility]) continue;
    if (usePrivate && !gh.hasPrivateRepo()) continue;

    const orderedIds = (state.catalog.scripts || [])
      .filter((s) => (s.visibility || 'public') === visibility)
      .map((s) => s.id);
    const order = new Map(orderedIds.map((id, index) => [id, index]));

    applyDraft((cat) => {
      cat.scripts = (cat.scripts || []).slice().sort((a, b) => {
        const ai = order.has(a.id) ? order.get(a.id) : Number.MAX_SAFE_INTEGER;
        const bi = order.has(b.id) ? order.get(b.id) : Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });
    }, usePrivate);
  }

  rebuildCatalogFromDraft();
  toast('Порядок применён в черновик', 'info');
  renderTab();
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

  const origVisibility = orig?.visibility || null;

  // Файлы хранятся как {file, name, base64, dataUrl} — не загружаются сразу
  let pendingScriptFile = null;       // {file, name, base64}
  const pendingImages   = [];         // [{file, name, base64, dataUrl}]
  const removedImages   = [];         // пути существующих картинок на удаление

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
            <div class="cselect" id="cat-drop">
              <input type="hidden" data-f="category" value="${escapeHtml(s.category || '')}">
              <button type="button" class="cselect-trigger" id="cat-trigger">
                <span id="cat-label">${s.category ? (() => { const c = (state.catalog.categories||[]).find(x=>x.id===s.category); return c ? escapeHtml(c.icon)+' '+escapeHtml(c.name) : escapeHtml(s.category); })() : '— Без категории —'}</span>
                <svg width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
              <div class="cselect-menu" id="cat-menu" hidden>
                <div class="cselect-option" data-val="">— Без категории —</div>
                ${(state.catalog.categories||[]).map(c=>`<div class="cselect-option" data-val="${escapeHtml(c.id)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</div>`).join('')}
              </div>
            </div>
          </div>
          <div class="field">
            <label>Видимость</label>
            <div class="toggle" data-toggle="visibility">
              <button type="button" data-v="public"  class="${s.visibility === 'public'  ? 'active' : ''}">🌐 Публичный</button>
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
            <div class="hint" style="margin-top:6px">${editing && s.file ? `Сейчас: <code>${escapeHtml(s.file)}</code>` : 'Файл будет добавлен в черновик'}</div>
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
        <button class="btn btn-primary" id="save">💾 В черновик</button>
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

  // Кастомный dropdown для категории
  const catDrop    = back.querySelector('#cat-drop');
  const catTrigger = back.querySelector('#cat-trigger');
  const catMenu    = back.querySelector('#cat-menu');
  const catLabel   = back.querySelector('#cat-label');
  const catInput   = back.querySelector('input[data-f="category"]');
  if (catDrop && catTrigger) {
    // Пометить текущую опцию
    catMenu.querySelectorAll('.cselect-option').forEach(o => o.classList.toggle('selected', o.dataset.val === (s.category || '')));
    catTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = catDrop.classList.toggle('open');
      catMenu.hidden = !open;
    });
    catMenu.querySelectorAll('.cselect-option').forEach(o => o.addEventListener('click', () => {
      const val = o.dataset.val;
      catInput.value = val;
      s.category = val;
      catLabel.textContent = o.textContent;
      catMenu.querySelectorAll('.cselect-option').forEach(x => x.classList.toggle('selected', x === o));
      catDrop.classList.remove('open');
      catMenu.hidden = true;
    }));
    document.addEventListener('click', function closeOnOut(e) {
      if (!catDrop.contains(e.target)) { catDrop.classList.remove('open'); catMenu.hidden = true; document.removeEventListener('click', closeOnOut); }
    });
  }

  // Chips
  const chipsBox = back.querySelector('#chips');
  const chipsIn  = back.querySelector('#chips-in');
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

  // Script dropzone — конвертируем в base64 сразу, но НЕ загружаем
  const dzScript  = back.querySelector('#dz-script');
  const scriptPill = back.querySelector('#script-pill');
  setupDropzone(dzScript, '.user.js,.js', false, async (files) => {
    const f = files[0]; if (!f) return;
    const base64 = await gh.fileToBase64(f);
    pendingScriptFile = { file: f, name: f.name, base64 };
    scriptPill.innerHTML = `<span class="file-pill">📜 ${escapeHtml(f.name)} <button type="button" aria-label="Убрать">✕</button></span>`;
    scriptPill.querySelector('button').addEventListener('click', () => { pendingScriptFile = null; scriptPill.innerHTML = ''; });
  });

  // Images dropzone — конвертируем в base64 сразу, но НЕ загружаем
  const dzImg    = back.querySelector('#dz-img');
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
  setupDropzone(dzImg, 'image/*', true, async (files) => {
    for (const f of files) {
      const dataUrl = await readFileAsDataUrl(f);
      const base64  = await gh.fileToBase64(f);
      const idx = pendingImages.length;
      pendingImages.push({ file: f, name: f.name, base64, dataUrl });
      renderThumbs();
    }
  });

  // Save → в черновик (без GitHub API)
  back.querySelector('#save').addEventListener('click', async () => {
    if (!s.id || !s.name) { toast('Заполните ID и название', 'error'); return; }
    if (!editing && state.catalog.scripts.some((x) => x.id === s.id)) { toast('ID занят', 'error'); return; }
    if (s.visibility === 'private' && !gh.hasPrivateRepo()) {
      toast('Сначала настройте приватный репозиторий в Настройках!', 'error', 6000);
      return;
    }

    const saveBtn = back.querySelector('#save');
    saveBtn.dataset.loading = '1'; saveBtn.textContent = 'Применяю…';

    const isPrivate = s.visibility === 'private';
    const visibilityChanged = editing && origVisibility !== null && origVisibility !== s.visibility;
    const wasPrivate = origVisibility === 'private';

    try {
      // Файл скрипта
      if (pendingScriptFile) {
        s.file = `dist/${s.id}.user.js`;
        queueFile(s.file, pendingScriptFile.base64, isPrivate);
      } else if (!s.file) {
        s.file = `dist/${s.id}.user.js`;
      }

      // Если смена видимости — старый файл скрипта на удаление, старые картинки тоже
      if (visibilityChanged && orig.file) {
        queueDelete(orig.file, wasPrivate);
        for (const p of (orig.images || [])) queueDelete(p, wasPrivate);
      }

      // Картинки: новые в очередь загрузки
      const newImgs = visibilityChanged ? [] : [...s.images];
      for (let i = 0; i < pendingImages.length; i++) {
        const it = pendingImages[i];
        if (!it) continue;
        const ext = (it.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const path = `images/scripts/${s.id}-${Date.now()}-${i}.${ext}`;
        queueFile(path, it.base64, isPrivate);
        newImgs.push(path);
      }
      // Удалённые картинки
      if (!visibilityChanged) {
        for (const p of removedImages) queueDelete(p, isPrivate);
      }
      s.images = newImgs;

      // Обновить черновой каталог
      s.updatedAt = new Date().toISOString().slice(0, 10);
      const scriptForCatalog = { ...s };
      delete scriptForCatalog.visibility;
      delete scriptForCatalog.version;

      applyDraft((cat) => {
        const idx = cat.scripts.findIndex((x) => x.id === s.id);
        if (idx >= 0) cat.scripts[idx] = scriptForCatalog; else cat.scripts.push(scriptForCatalog);
      }, isPrivate);

      // Если сменилась видимость — убрать из старого каталога
      if (visibilityChanged) {
        applyDraft((cat) => {
          cat.scripts = (cat.scripts || []).filter((x) => x.id !== s.id);
        }, wasPrivate);
      }

      rebuildCatalogFromDraft();
      toast('Добавлено в черновик. Нажмите «Опубликовать» чтобы сохранить в GitHub.', 'info', 5000);
      close();
      renderTab();
    } catch (e) {
      toast('Ошибка: ' + e.message, 'error', 8000);
      saveBtn.dataset.loading = ''; saveBtn.textContent = '💾 В черновик';
    }
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
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

function deleteScript(id) {
  const s = state.catalog.scripts.find((x) => x.id === id);
  if (!s) return;
  if (!confirm(`Удалить «${s.name}»?\nФайлы будут удалены из репозитория при публикации.`)) return;

  const isPrivate = s.visibility === 'private';

  // Файл скрипта на удаление
  if (s.file) queueDelete(s.file, isPrivate);
  // Картинки на удаление
  for (const p of (s.images || [])) queueDelete(p, isPrivate);

  // Убрать из чернового каталога
  applyDraft((cat) => {
    cat.scripts = (cat.scripts || []).filter((x) => x.id !== id);
  }, isPrivate);

  rebuildCatalogFromDraft();
  toast('Удалено из черновика. Нажмите «Опубликовать» чтобы применить в GitHub.', 'info', 5000);
  renderTab();
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
            const pubCount  = (state.draft.publicCatalog.scripts  || []).filter(s => s.category === c.id).length;
            const privCount = (state.draft.privateCatalog.scripts || []).filter(s => s.category === c.id).length;
            const count = pubCount + privCount;
            const disabledReason = count > 0 ? 'Сначала удалите или перенесите скрипты из этой категории.' : '';
            const inGithub = state.publicCatalog?.categories?.some(x => x.id === c.id)
                          || state.privateCatalog?.categories?.some(x => x.id === c.id);
            const draftBadge = !inGithub ? ' <span style="font-size:11px;opacity:.6">(черновик)</span>' : '';
            return `<tr>
              <td style="font-size:20px">${escapeHtml(c.icon)}</td>
              <td><strong>${escapeHtml(c.name)}</strong>${draftBadge}</td>
              <td><code>${escapeHtml(c.id)}</code></td>
              <td>${count}</td>
              <td><div class="row-actions">
                <button class="icon-btn" data-cat-edit="${escapeHtml(c.id)}">✏️</button>
                <button class="icon-btn danger" data-cat-del="${escapeHtml(c.id)}" ${count ? `disabled title="${escapeHtml(disabledReason)}"` : ''}>🗑️</button>
              </div></td>
            </tr>`;
          }).join('') : `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">Категорий ещё нет</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('add-cat').addEventListener('click', () => openCategoryModal(null));
  el.querySelectorAll('[data-cat-edit]').forEach((b) => b.addEventListener('click', () => openCategoryModal(b.dataset.catEdit)));
  el.querySelectorAll('[data-cat-del]').forEach((b)  => b.addEventListener('click', () => deleteCategory(b.dataset.catDel)));
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
        <button class="btn btn-primary" id="c-save">💾 В черновик</button>
      </div>
    </div>
  `;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  back.querySelector('#c-save').addEventListener('click', () => {
    c.id   = back.querySelector('#c-id').value.trim();
    c.name = back.querySelector('#c-name').value.trim();
    c.icon = back.querySelector('#c-icon').value.trim() || '📂';
    if (!c.id || !c.name) { toast('Заполните поля', 'error'); return; }

    // Категории хранятся только в публичном каталоге
    applyDraft((cat) => {
      cat.categories = cat.categories || [];
      const idx = cat.categories.findIndex((x) => x.id === c.id);
      if (idx >= 0) cat.categories[idx] = { ...c }; else cat.categories.push({ ...c });
    }, false);

    rebuildCatalogFromDraft();
    toast('Категория добавлена в черновик', 'info');
    close();
    renderTab();
  });
}

function deleteCategory(id) {
  if (!confirm('Удалить категорию?')) return;

  const inPub  = (state.draft.publicCatalog.categories  || []).some(c => c.id === id);
  const inPriv = (state.draft.privateCatalog.categories || []).some(c => c.id === id);

  if (inPub)  applyDraft(cat => { cat.categories = cat.categories.filter(c => c.id !== id); }, false);
  if (inPriv) applyDraft(cat => { cat.categories = cat.categories.filter(c => c.id !== id); }, true);
  if (!inPub && !inPriv) return;

  rebuildCatalogFromDraft();
  toast('Удалено из черновика', 'info');
  renderTab();
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
      const st  = await getInstallStats(s.id);
      const row = el.querySelector(`[data-row="${cssEscapeAttr(s.id)}"]`);
      if (row) {
        row.children[1].textContent = st.total || 0;
        row.children[2].textContent = st.month || 0;
        row.children[3].textContent = st.week  || 0;
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
  const privStatus    = el.querySelector('#priv-status');

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
    if (isDraftDirty() && !confirm('Есть несохранённые изменения. Выйти и потерять их?')) return;
    if (confirm('Очистить токен и выйти?')) { gh.clearAuth(); boot(); }
  });
}

// ============ Start ============
boot();
