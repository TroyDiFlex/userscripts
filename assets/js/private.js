import { escapeHtml } from './common.js';
import * as gh from './github-api.js';

// ============================================================
// private.js — приватный раздел магазина
// Вход через GitHub-токен (тот же, что в админке).
// Скрипты загружаются из приватного репо через GitHub API.
// ============================================================

const root = document.getElementById('root');

function cssEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}

// ---- Экран входа ----
function renderGate(err = '') {
  const savedPrivRepo = gh.getPrivateRepoRaw();
  root.innerHTML = `
    <div class="gate">
      <div class="gate-card">
        <div style="font-size:48px;margin-bottom:12px">🔒</div>
        <h1>Приватный раздел</h1>
        <p>Введите GitHub-токен для доступа к закрытым скриптам.</p>
        ${err ? `<div class="callout" style="border-color:var(--danger);background:rgba(255,77,109,0.08);margin-bottom:16px"><strong>Ошибка:</strong> ${escapeHtml(err)}</div>` : ''}
        <form id="gate-form">
          <div class="field">
            <label for="g-pat">GitHub токен (PAT)</label>
            <input id="g-pat" class="input" type="password" placeholder="github_pat_..." required />
            <div class="hint">Тот же токен, что в админке — или отдельный токен только для чтения</div>
          </div>
          <div class="field">
            <label for="g-priv">Приватный репозиторий</label>
            <input id="g-priv" class="input" type="text" placeholder="TroyDiFlex/private-scripts" value="${escapeHtml(savedPrivRepo)}" required pattern="[^/\\s]+/[^/\\s]+" />
            <div class="hint">Например: <code>TroyDiFlex/private-scripts</code></div>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%">Войти</button>
        </form>
        <div style="margin-top:20px;text-align:center">
          <a href="index.html" style="color:var(--text-muted);font-size:13px">← Вернуться в публичный магазин</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('gate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pat = document.getElementById('g-pat').value.trim();
    const privRepo = document.getElementById('g-priv').value.trim();

    // Временно сохраняем для проверки
    const oldToken = gh.getToken();
    const oldPriv = gh.getPrivateRepoRaw();
    gh.setAuth(pat, gh.getRepo().owner ? `${gh.getRepo().owner}/${gh.getRepo().name}` : 'check/check');
    gh.setPrivateRepo(privRepo);

    const btn = document.querySelector('#gate-form button');
    btn.dataset.loading = '1'; btn.textContent = 'Проверяю…';

    try {
      await gh.checkPrivateAuth();
      // Сохраняем окончательно
      sessionStorage.setItem('private_unlocked', '1');
      sessionStorage.setItem('private_token', pat);
      sessionStorage.setItem('private_repo', privRepo);
      renderStore();
    } catch (err) {
      // Восстанавливаем старые данные
      if (oldToken) gh.setAuth(oldToken, `${gh.getRepo().owner}/${gh.getRepo().name}`);
      if (oldPriv) gh.setPrivateRepo(oldPriv); else localStorage.removeItem('gh_private_repo');
      btn.dataset.loading = ''; btn.textContent = 'Войти';
      renderGate(err.message + ' — проверьте токен и название репо');
    }
  });
}

// ---- Магазин ----
async function renderStore() {
  root.innerHTML = `
    <div class="store-wrap">
      <header class="header">
        <div class="header-inner">
          <a class="logo" href="./">
            <span class="logo-mark">🔒</span>
            <span>Script Store · Приватные</span>
          </a>
          <div class="search">
            <label for="search" class="sr-only">Поиск скриптов</label>
            <input id="search" type="search" placeholder="Найти скрипт…" autocomplete="off" />
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <a class="header-link" href="index.html">← К публичным</a>
            <button id="logout" class="btn-logout" style="font-size:13px">Выйти</button>
          </div>
        </div>
      </header>

      <main class="page">
        <section class="hero">
          <h1>Закрытые скрипты</h1>
          <p>Раздел доступен только вам. Установка через прямую ссылку из GitHub.</p>
        </section>
        <nav id="filters" class="filters" aria-label="Категории"></nav>
        <section id="grid" class="grid" aria-live="polite">
          <div class="empty"><div class="empty-icon">⏳</div><div>Загружаю каталог…</div></div>
        </section>
      </main>

      <footer class="footer">
        <p><a href="index.html">← Вернуться в публичный магазин</a></p>
      </footer>
    </div>
  `;

  document.getElementById('logout').addEventListener('click', () => {
    if (confirm('Выйти из приватного раздела?')) {
      sessionStorage.removeItem('private_unlocked');
      sessionStorage.removeItem('private_token');
      sessionStorage.removeItem('private_repo');
      renderGate();
    }
  });

  // Загружаем каталог
  let catalog;
  try {
    const token = sessionStorage.getItem('private_token');
    const repoRaw = sessionStorage.getItem('private_repo');
    const [owner, name] = (repoRaw || '').split('/');

    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/catalog.json`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) throw new Error(`Не удалось загрузить каталог (HTTP ${res.status})`);
    catalog = await res.json();
  } catch (e) {
    document.getElementById('grid').innerHTML = `<div class="empty"><div class="empty-icon">❌</div><div>Ошибка загрузки каталога: ${escapeHtml(e.message)}</div></div>`;
    return;
  }

  let activeCategory = 'all';
  let query = '';

  function visibleScripts() {
    return (catalog.scripts || []).filter(s => {
      if (activeCategory !== 'all' && s.category !== activeCategory) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = (s.name + ' ' + s.description + ' ' + (s.tags || []).join(' ')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderFilters() {
    const filtersEl = document.getElementById('filters');
    const cats = (catalog.categories || []).filter(c =>
      (catalog.scripts || []).some(s => s.category === c.id)
    );
    filtersEl.innerHTML =
      `<button class="chip ${activeCategory === 'all' ? 'active' : ''}" data-cat="all">Все</button>` +
      cats.map(c =>
        `<button class="chip ${activeCategory === c.id ? 'active' : ''}" data-cat="${escapeHtml(c.id)}"><span>${escapeHtml(c.icon)}</span>${escapeHtml(c.name)}</button>`
      ).join('');
    filtersEl.querySelectorAll('.chip').forEach(b => {
      b.addEventListener('click', () => { activeCategory = b.dataset.cat; renderFilters(); render(); });
    });
  }

  function render() {
    const grid = document.getElementById('grid');
    const list = visibleScripts();
    if (!list.length) {
      grid.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><div>Ничего не найдено</div></div>`;
      return;
    }
    grid.innerHTML = list.map(cardHtml).join('');
    grid.querySelectorAll('.carousel').forEach(initCarousel);
    grid.querySelectorAll('.btn-install-private').forEach(btn => {
      btn.addEventListener('click', () => installPrivateScript(btn.dataset.file, btn.dataset.name));
    });
  }

  function cardHtml(s) {
    const cat = (catalog.categories || []).find(c => c.id === s.category);
    const imgs = (s.images || []).filter(Boolean);
    return `
      <article class="card" style="--script-color: ${escapeHtml(s.color || '#6C63FF')}">
        <header class="card-head">
          <div class="card-icon" aria-hidden="true">${escapeHtml(s.icon || '📜')}</div>
          <div>
            <h3 class="card-title">${escapeHtml(s.name)}</h3>
            <div class="card-meta">
              <span>${escapeHtml(cat?.icon || '')} ${escapeHtml(cat?.name || s.category)}</span>
              <span>v${escapeHtml(s.version)}</span>
              <span>${escapeHtml(s.updatedAt || '')}</span>
            </div>
          </div>
        </header>
        ${imgs.length ? `
        <div class="carousel">
          <div class="carousel-track">
            ${imgs.map(src => `<img src="${escapeHtml(getPrivateImgUrl(src))}" alt="" loading="lazy">`).join('')}
          </div>
          ${imgs.length > 1 ? `<div class="carousel-dots">${imgs.map((_, i) => `<button class="carousel-dot ${i === 0 ? 'active' : ''}" data-i="${i}" aria-label="Слайд ${i + 1}"></button>`).join('')}</div>` : ''}
        </div>` : ''}
        <p class="card-desc">${escapeHtml(s.description)}</p>
        ${(s.tags && s.tags.length) ? `<div class="tags">${s.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="card-foot">
          <div class="install-stats">&nbsp;</div>
          <button class="btn-install btn-install-private" data-file="${escapeHtml(s.file)}" data-name="${escapeHtml(s.name)}">⬇️ Скачать</button>
        </div>
      </article>
    `;
  }

  function getPrivateImgUrl(path) {
    const token = sessionStorage.getItem('private_token');
    const repoRaw = sessionStorage.getItem('private_repo');
    const [owner, name] = (repoRaw || '').split('/');
    // Изображения из приватного репо не доступны напрямую — показываем placeholder
    // (браузер не пропустит Authorization в img src)
    return `https://api.github.com/repos/${owner}/${name}/contents/${path}`;
  }

  async function installPrivateScript(filePath, scriptName) {
    const btn = document.querySelector(`[data-file="${cssEscape(filePath)}"]`);
    if (btn) { btn.dataset.loading = '1'; btn.textContent = '⏳ Загружаю…'; }

    try {
      const token = sessionStorage.getItem('private_token');
      const repoRaw = sessionStorage.getItem('private_repo');
      const [owner, name] = (repoRaw || '').split('/');

      const res = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${filePath}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.raw+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      // Просто скачиваем файл — потом перетащить в Tampermonkey или через меню «Установить из файла»
      const fileName = filePath.split('/').pop() || 'script.user.js';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

      if (btn) { btn.dataset.loading = ''; btn.textContent = '⬇️ Скачать'; }
    } catch (e) {
      alert('Не удалось скачать скрипт: ' + e.message);
      if (btn) { btn.dataset.loading = ''; btn.textContent = '⬇️ Скачать'; }
    }
  }

  function initCarousel(el) {
    const track = el.querySelector('.carousel-track');
    const dots = el.querySelectorAll('.carousel-dot');
    if (!dots.length) return;
    let i = 0;
    function go(n) {
      i = (n + dots.length) % dots.length;
      track.style.transform = `translateX(-${i * 100}%)`;
      dots.forEach((d, k) => d.classList.toggle('active', k === i));
    }
    dots.forEach(d => d.addEventListener('click', () => go(parseInt(d.dataset.i))));
    let sx = 0;
    el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
    });
  }

  document.getElementById('search').addEventListener('input', (e) => {
    query = e.target.value.trim();
    render();
  });

  renderFilters();
  render();
}

// ---- Старт ----
if (sessionStorage.getItem('private_unlocked') === '1') {
  // Восстанавливаем токен в gh-модуле для работы API
  const savedToken = sessionStorage.getItem('private_token');
  const savedPrivRepo = sessionStorage.getItem('private_repo');
  if (savedToken) {
    const pubRepo = gh.getRepo();
    gh.setAuth(savedToken, pubRepo.owner ? `${pubRepo.owner}/${pubRepo.name}` : 'x/x');
    if (savedPrivRepo) gh.setPrivateRepo(savedPrivRepo);
  }
  renderStore();
} else {
  renderGate();
}
