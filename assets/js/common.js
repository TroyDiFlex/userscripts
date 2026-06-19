// ============================================================
// НАСТРОЙКА — поменяйте на свой репозиторий после деплоя
// ============================================================
// owner — ваш логин на GitHub (например, 'ivanov')
// name  — название репозитория (например, 'scripts')
// После замены: commit -> GitHub Pages пересоберётся за ~1 минуту.
export const REPO = { owner: 'TroyDiFlex', name: 'userscripts' };
// ============================================================

export function rawGithubUrl(filePath) {
  return `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/main/${filePath}`;
}

export async function loadCatalog() {
  const res = await fetch('catalog.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить catalog.json');
  return await res.json();
}

// Загрузить catalog.json из приватного репозитория через GitHub API
export async function loadPrivateCatalog() {
  const token = localStorage.getItem('gh_pat') || '';
  const repoRaw = localStorage.getItem('gh_private_repo') || '';
  const [owner, name] = repoRaw.split('/');
  if (!token || !owner || !name) throw new Error('Приватный репо не настроен');
  const url = `https://api.github.com/repos/${owner}/${name}/contents/catalog.json`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) return { version: 1, scripts: [], categories: [] };
  if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
  return await res.json();
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function cssEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}

export function initStore({ visibility, mountEl, searchEl, filtersEl, emptyMsg = 'Скриптов пока нет' }) {
  let catalog = null;
  let activeCategory = 'all';
  let query = '';

  async function start() {
    try {
      catalog = await loadCatalog();
    } catch (e) {
      mountEl.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><div>Не удалось загрузить каталог: ${escapeHtml(e.message)}</div></div>`;
      return;
    }
    renderFilters();
    render();
  }

  function visibleScripts() {
    const list = (catalog?.scripts || []).filter((s) => (s.visibility || 'public') === visibility);
    return list.filter((s) => {
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
    if (!filtersEl) return;
    const cats = (catalog?.categories || []);
    const visibleCats = cats.filter((c) =>
      (catalog?.scripts || []).some((s) => (s.visibility || 'public') === visibility && s.category === c.id)
    );
    filtersEl.innerHTML =
      `<button class="chip ${activeCategory === 'all' ? 'active' : ''}" data-cat="all">Все</button>` +
      visibleCats.map((c) =>
        `<button class="chip ${activeCategory === c.id ? 'active' : ''}" data-cat="${escapeHtml(c.id)}"><span>${escapeHtml(c.icon)}</span>${escapeHtml(c.name)}</button>`
      ).join('');
    filtersEl.querySelectorAll('.chip').forEach((b) => {
      b.addEventListener('click', () => {
        activeCategory = b.dataset.cat;
        renderFilters();
        render();
      });
    });
  }

  function render() {
    const list = visibleScripts();
    if (!list.length) {
      mountEl.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><div>${escapeHtml(emptyMsg)}</div></div>`;
      return;
    }
    mountEl.innerHTML = list.map(cardHtml).join('');
    mountEl.querySelectorAll('.carousel').forEach(initCarousel);
    initInstallTracking(list);
    loadInstallStats(list);
    loadVersions(list);
  }

  function initInstallTracking(list) {
    mountEl.querySelectorAll('.btn-install').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        // Записываем установку в фоне
        const scriptId = btn.dataset.id;
        if (scriptId) {
          try {
            const { recordInstall } = await import('./stats.js');
            recordInstall(scriptId);
          } catch(err) { console.error(err); }
        }
      });
    });
  }

  function cardHtml(s) {
    const cat = (catalog.categories || []).find((c) => c.id === s.category);
    const imgs = (s.images || []).filter(Boolean);
    return `
      <article class="card" style="--script-color: ${escapeHtml(s.color || '#6C63FF')}">
        <header class="card-head">
          <div class="card-icon" aria-hidden="true">${escapeHtml(s.icon || '📜')}</div>
          <div>
            <h3 class="card-title">${escapeHtml(s.name)}</h3>
            <div class="card-meta">
              <span>${escapeHtml(cat?.icon || '')} ${escapeHtml(cat?.name || s.category)}</span>
              <span data-version="${escapeHtml(s.file)}"></span>
              <span>${escapeHtml(s.updatedAt || '')}</span>
            </div>
          </div>
        </header>
        ${imgs.length ? `
        <div class="carousel">
          <div class="carousel-track">
            ${imgs.map((src) => `<img src="${escapeHtml(src)}" alt="" loading="lazy">`).join('')}
          </div>
          ${imgs.length > 1 ? `
            <button class="carousel-btn carousel-btn-prev" aria-label="Предыдущий слайд"><span>❮</span></button>
            <button class="carousel-btn carousel-btn-next" aria-label="Следующий слайд"><span>❯</span></button>
            <div class="carousel-dots">${imgs.map((_, i) => `<button class="carousel-dot ${i === 0 ? 'active' : ''}" data-i="${i}" aria-label="Слайд ${i + 1}"></button>`).join('')}</div>
          ` : ''}
        </div>` : ''}
        <p class="card-desc">${escapeHtml(s.description)}</p>
        ${(s.tags && s.tags.length) ? `<div class="tags">${s.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="card-foot">
          <div class="install-stats" data-stats="${escapeHtml(s.id)}">&nbsp;</div>
          <a class="btn-install" data-id="${escapeHtml(s.id)}" target="_blank" rel="noopener" href="${escapeHtml(rawGithubUrl(s.file))}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline><line x1="5" y1="21" x2="19" y2="21"></line></svg>
            Установить
          </a>
        </div>
      </article>
    `;
  }

  function initCarousel(el) {
    const track = el.querySelector('.carousel-track');
    const dots = el.querySelectorAll('.carousel-dot');
    const btnPrev = el.querySelector('.carousel-btn-prev');
    const btnNext = el.querySelector('.carousel-btn-next');
    if (!track) return;
    const imgCount = track.querySelectorAll('img').length;
    if (imgCount <= 1) return;
    let i = 0;
    function go(n) {
      i = (n + imgCount) % imgCount;
      track.style.transform = `translateX(-${i * 100}%)`;
      if (dots.length) {
        dots.forEach((d, k) => d.classList.toggle('active', k === i));
      }
    }
    if (dots.length) {
      dots.forEach((d) => d.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); go(parseInt(d.dataset.i)); }));
    }
    if (btnPrev) {
      btnPrev.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); go(i - 1); });
    }
    if (btnNext) {
      btnNext.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); go(i + 1); });
    }
    let sx = 0;
    el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
    });
  }

  async function loadInstallStats(list) {
    try {
      const { getInstallStats } = await import('./stats.js');
      for (const s of list) {
        try {
          const stats = await getInstallStats(s.id);
          const el = mountEl.querySelector(`[data-stats="${cssEscape(s.id)}"]`);
          if (el && stats.month > 0) {
            el.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px;margin-top:-2px"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline><line x1="5" y1="21" x2="19" y2="21"></line></svg>${stats.month} за месяц`;
          }
        } catch { /* */ }
      }
    } catch { /* */ }
  }

  async function loadVersions(list) {
    if (REPO.owner === 'GITHUB_USER') return;
    for (const s of list) {
      try {
        let version = '';
        if ((s.visibility || 'public') === 'public') {
          const res = await fetch(`https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/main/${s.file}`, { cache: 'no-store' });
          if (res.ok) {
            const text = await res.text();
            const m = text.match(/\/\/\s*@version\s+([^\r\n]+)/);
            if (m) version = m[1].trim();
          }
        } else {
          const token = localStorage.getItem('gh_pat') || '';
          const repoRaw = localStorage.getItem('gh_private_repo') || '';
          const [owner, name] = repoRaw.split('/');
          if (token && owner && name) {
            const url = `https://api.github.com/repos/${owner}/${name}/contents/${s.file}`;
            const res = await fetch(url, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.raw+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
            });
            if (res.ok) {
              const data = await res.json();
              if (data.content) {
                const text = atob(data.content);
                const m = text.match(/\/\/\s*@version\s+([^\r\n]+)/);
                if (m) version = m[1].trim();
              }
            }
          }
        }
        if (version) {
          const el = mountEl.querySelector(`[data-version="${cssEscape(s.file)}"]`);
          if (el) el.textContent = `v${version}`;
        }
      } catch { /* */ }
    }
  }

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      query = searchEl.value.trim();
      render();
    });
  }

  start();
}
