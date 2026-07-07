// ==UserScript==
// @name         eBay + Avito — скачивание фото
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Компактный виджет для выбора и скачивания фотографий со страниц товаров eBay и объявлений Авито.
// @author       TroyDiFlex
// @match        *://www.ebay.com/*
// @match        *://www.avito.ru/*/zapchasti_i_aksessuary/*
// @match        file:///*
// @updateURL    https://raw.githubusercontent.com/TroyDiFlex/userscripts/main/scripts/avito/image-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/TroyDiFlex/userscripts/main/scripts/avito/image-downloader.user.js
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SITE = detectSite();
  if (!SITE) {
    return;
  }

  const STATE = {
    images: [],
    selected: new Set(),
    panelOpen: false,
    alwaysOpen: Boolean(Number(GM_getValue('alwaysOpen', 0))),
    themeDark: window.matchMedia('(prefers-color-scheme: dark)').matches
  };

  const IDS = {
    root: 'tm-imgdl-root',
    toggle: 'tm-imgdl-toggle',
    panel: 'tm-imgdl-panel',
    grid: 'tm-imgdl-grid',
    actions: 'tm-imgdl-actions',
    counter: 'tm-imgdl-counter'
  };

  const ICONS = {
    gallery: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5zM3 3v18h18V3zm4 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 10H7l3.1-4 2.2 2.7 1.7-2.2z"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.17l3.59-3.58L17 11l-5 5-5-5 1.41-1.41L11 13.17V3zM5 19h14v2H5z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.7 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.55 16.6-3.9-3.9-1.4 1.4 5.3 5.3L20 8.95l-1.4-1.4z"/></svg>',
    selectAll: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2zm0 2v14h14V5H5zm11.6 4.4L11 15l-3.1-3.1 1.4-1.4 1.7 1.7 4.2-4.2 1.4 1.4z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4V1L7 6l5 5V7a5 5 0 1 1-4.9 6.02H5.02A7 7 0 1 0 17.65 6.35z"/></svg>'
  };

  injectStyles();
  mountUI();
  if (STATE.alwaysOpen) {
    STATE.panelOpen = true;
  }
  refreshImages();

  const mutationObserver = new MutationObserver(debounce(() => {
    if (STATE.panelOpen) {
      refreshImages();
    }
  }, 600));

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'style', 'content']
  });

  function detectSite() {
    const host = location.hostname;
    if (/ebay\./i.test(host)) {
      return 'ebay';
    }
    if (/avito\.ru$/i.test(host)) {
      return 'avito';
    }
    if (location.protocol === 'file:') {
      const html = document.documentElement.innerHTML.slice(0, 20000);
      if (/ebay/i.test(host) || /i\.ebayimg\.com|ebay\.com/i.test(html)) {
        return 'ebay';
      }
      if (/avito/i.test(host) || /avito\.ru|img\.avito\.st/i.test(html)) {
        return 'avito';
      }
    }
    return '';
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #${IDS.root} {
        --tm-bg: rgba(12, 12, 14, 0.94);
        --tm-bg-strong: rgba(18, 18, 22, 0.98);
        --tm-bg-soft: rgba(28, 28, 34, 0.94);
        --tm-fg: #f4f4f5;
        --tm-fg-soft: #a1a1aa;
        --tm-border: rgba(255, 255, 255, 0.1);
        --tm-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
        --tm-accent: #a855f7;
        --tm-accent-strong: #9333ea;
        --tm-accent-soft: rgba(168, 85, 247, 0.18);
        --tm-danger: #fb7185;
        position: fixed;
        right: 16px;
        bottom: 16px;
        width: 44px;
        height: 44px;
        z-index: 2147483647;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1;
        color: var(--tm-fg);
      }

      #${IDS.root}.tm-dark {
        --tm-bg: rgba(8, 8, 10, 0.94);
        --tm-bg-strong: rgba(14, 14, 18, 0.98);
        --tm-bg-soft: rgba(24, 24, 30, 0.94);
        --tm-border: rgba(255, 255, 255, 0.11);
        --tm-shadow: 0 18px 54px rgba(0, 0, 0, 0.5);
      }

      #${IDS.root} * {
        box-sizing: border-box;
      }

      #${IDS.root} button {
        appearance: none;
        -webkit-appearance: none;
        margin: 0;
        padding: 0;
        font: inherit;
        line-height: 0;
      }

      #${IDS.toggle} {
        position: relative;
        width: 44px;
        height: 44px;
        border: 1px solid var(--tm-border);
        border-radius: 12px;
        background: var(--tm-bg);
        color: var(--tm-fg);
        backdrop-filter: blur(18px);
        box-shadow: var(--tm-shadow);
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
      }

      #${IDS.toggle}:hover {
        transform: translateY(-1px);
        background: var(--tm-bg-strong);
        border-color: rgba(168, 85, 247, 0.42);
        color: #fff;
      }

      #${IDS.toggle} svg,
      #${IDS.panel} svg {
        width: 18px;
        height: 18px;
        display: block;
        fill: currentColor;
        pointer-events: none;
      }

      #${IDS.counter} {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 999px;
        background: var(--tm-accent);
        color: #fff;
        font-size: 11px;
        line-height: 18px;
        text-align: center;
        font-weight: 700;
        box-shadow: 0 6px 16px rgba(168, 85, 247, 0.38);
      }

      #${IDS.panel} {
        position: absolute;
        right: 0;
        bottom: calc(100% + 10px);
        width: min(360px, calc(100vw - 32px));
        max-height: min(72vh, calc(100vh - 88px));
        padding: 10px;
        border: 1px solid var(--tm-border);
        border-radius: 14px;
        background: var(--tm-bg);
        backdrop-filter: blur(22px);
        box-shadow: var(--tm-shadow);
        display: none;
        overflow: hidden;
      }

      #${IDS.panel}.tm-open {
        display: block;
      }

      .tm-switch {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 12px;
        color: var(--tm-fg-soft);
        user-select: none;
        margin-bottom: 10px;
        padding: 0 2px;
      }
      .tm-switch input {
        display: none;
      }
      .tm-switch-track {
        width: 38px;
        height: 22px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        transition: background 0.18s ease;
        position: relative;
        flex-shrink: 0;
      }
      .tm-switch-track::after {
        content: '';
        position: absolute;
        top: 3px;
        left: 3px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.18s ease;
      }
      .tm-switch input:checked + .tm-switch-track {
        background: var(--tm-accent);
      }
      .tm-switch input:checked + .tm-switch-track::after {
        transform: translateX(16px);
      }

      .tm-toolbar {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }

      .tm-toolbar-left,
      .tm-toolbar-right,
      #${IDS.actions} {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .tm-btn {
        width: 34px;
        height: 34px;
        border: 1px solid var(--tm-border);
        border-radius: 10px;
        background: var(--tm-bg-soft);
        color: var(--tm-fg);
        display: inline-grid;
        place-items: center;
        cursor: pointer;
        transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
      }

      .tm-btn:hover {
        transform: translateY(-1px);
        border-color: rgba(168, 85, 247, 0.44);
        background: var(--tm-bg-strong);
        color: #fff;
      }

      .tm-btn.tm-accent {
        border-color: rgba(168, 85, 247, 0.48);
        background: var(--tm-accent);
        color: #fff;
        box-shadow: 0 8px 20px rgba(168, 85, 247, 0.24);
      }

      .tm-btn.tm-accent:hover {
        background: var(--tm-accent-strong);
      }

      .tm-btn.tm-danger {
        color: var(--tm-danger);
      }

      #${IDS.root} button:focus-visible {
        outline: 2px solid rgba(168, 85, 247, 0.78);
        outline-offset: 2px;
      }

      #${IDS.grid} {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        max-height: min(56vh, 560px);
        overflow: auto;
        padding-right: 4px;
        scrollbar-width: thin;
        scrollbar-color: rgba(168, 85, 247, 0.62) rgba(255, 255, 255, 0.04);
      }

      #${IDS.grid}::-webkit-scrollbar {
        width: 8px;
      }

      #${IDS.grid}::-webkit-scrollbar-track {
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
      }

      #${IDS.grid}::-webkit-scrollbar-thumb {
        border: 2px solid rgba(12, 12, 14, 0.94);
        border-radius: 999px;
        background: rgba(168, 85, 247, 0.74);
      }

      #${IDS.grid}::-webkit-scrollbar-thumb:hover {
        background: rgba(192, 132, 252, 0.9);
      }

      .tm-tile {
        position: relative;
        aspect-ratio: 1 / 1;
        border: 1px solid var(--tm-border);
        border-radius: 10px;
        background: var(--tm-bg-soft);
        overflow: hidden;
      }

      .tm-tile img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .tm-check,
      .tm-download {
        position: absolute;
        width: 28px;
        height: 28px;
        display: inline-grid;
        place-items: center;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 8px;
        backdrop-filter: blur(12px);
        background: rgba(8, 8, 10, 0.62);
        color: #fff;
        cursor: pointer;
      }

      .tm-check {
        top: 6px;
        left: 6px;
      }

      .tm-download {
        top: 6px;
        right: 6px;
      }

      .tm-check.tm-active {
        border-color: rgba(168, 85, 247, 0.72);
        background: rgba(168, 85, 247, 0.92);
      }

      #${IDS.actions} {
        margin-top: 10px;
        justify-content: space-between;
      }

      #${IDS.actions} .tm-btn {
        width: 42px;
        height: 42px;
        border-radius: 12px;
      }

      .tm-empty {
        padding: 24px 0;
        color: var(--tm-fg-soft);
        text-align: center;
        font-size: 12px;
      }
    `;
    document.head.appendChild(style);
  }

  function mountUI() {
    if (document.getElementById(IDS.root)) {
      return;
    }

    const root = document.createElement('div');
    root.id = IDS.root;
    root.className = STATE.themeDark ? 'tm-dark' : '';

    root.innerHTML = `
      <button id="${IDS.toggle}" type="button" title="Открыть загрузчик" aria-label="Открыть загрузчик">
        ${ICONS.gallery}
        <span id="${IDS.counter}">0</span>
      </button>
      <div id="${IDS.panel}" aria-hidden="true">
        <label class="tm-switch" title="Всегда развёрнуто" aria-label="Всегда развёрнуто">
          <input type="checkbox" data-action="toggle-always-open" ${STATE.alwaysOpen ? 'checked' : ''}>
          <span class="tm-switch-track"></span>
          Всегда открыто
        </label>
        <div class="tm-toolbar">
          <div class="tm-toolbar-left">
            <button class="tm-btn" type="button" data-action="refresh" title="Обновить" aria-label="Обновить">${ICONS.refresh}</button>
          </div>
          <div class="tm-toolbar-right">
            <button class="tm-btn tm-danger" type="button" data-action="close" title="Закрыть" aria-label="Закрыть">${ICONS.close}</button>
          </div>
        </div>
        <div id="${IDS.grid}"></div>
        <div id="${IDS.actions}">
          <button class="tm-btn" type="button" data-action="toggle-all" title="Выделение" aria-label="Выделение">${ICONS.selectAll}</button>
          <button class="tm-btn tm-accent" type="button" data-action="download-selected" title="Скачать выделенное" aria-label="Скачать выделенное">${ICONS.download}</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    root.querySelector(`#${IDS.toggle}`).addEventListener('click', () => {
      STATE.panelOpen = !STATE.panelOpen;
      render();
      if (STATE.panelOpen) {
        refreshImages();
      }
    });

    root.addEventListener('click', (event) => {
      const actionTarget = event.target.closest('[data-action]');
      if (!actionTarget) {
        return;
      }

      const action = actionTarget.getAttribute('data-action');
      if (action === 'refresh') {
        refreshImages(true);
      } else if (action === 'close') {
        STATE.panelOpen = false;
        render();
      } else if (action === 'toggle-all') {
        toggleAllSelection();
      } else if (action === 'download-selected') {
        downloadSelected();
      } else if (action === 'toggle-one') {
        if (event.target.closest('.tm-download')) {
          return;
        }
        toggleOne(actionTarget.getAttribute('data-id'));
      } else if (action === 'download-one') {
        downloadOne(actionTarget.getAttribute('data-id'));
      } else if (action === 'toggle-always-open') {
        STATE.alwaysOpen = actionTarget.checked;
        GM_setValue('alwaysOpen', STATE.alwaysOpen ? '1' : '0');
        STATE.panelOpen = STATE.alwaysOpen;
        if (STATE.alwaysOpen) {
          refreshImages();
        }
        render();
      }
    });
  }

  function render() {
    const root = document.getElementById(IDS.root);
    const panel = document.getElementById(IDS.panel);
    const grid = document.getElementById(IDS.grid);
    const counter = document.getElementById(IDS.counter);
    if (!root || !panel || !grid || !counter) {
      return;
    }

    root.className = STATE.themeDark ? 'tm-dark' : '';
    panel.className = STATE.panelOpen ? 'tm-open' : '';
    panel.setAttribute('aria-hidden', String(!STATE.panelOpen));
    counter.textContent = String(STATE.selected.size || 0);

    if (!STATE.panelOpen) {
      return;
    }

    if (!STATE.images.length) {
      grid.innerHTML = '<div class="tm-empty"></div>';
      return;
    }

    grid.innerHTML = STATE.images.map((image) => `
      <div class="tm-tile" data-action="toggle-one" data-id="${escapeHtml(image.id)}" title="Выбрать" aria-label="Выбрать">
        <img src="${escapeHtml(image.preview || image.url)}" alt="">
        <button
          class="tm-check ${STATE.selected.has(image.id) ? 'tm-active' : ''}"
          type="button"
          title="Выбрать"
          aria-label="Выбрать"
        >${ICONS.check}</button>
        <button
          class="tm-download"
          type="button"
          data-action="download-one"
          data-id="${escapeHtml(image.id)}"
          title="Скачать"
          aria-label="Скачать"
        >${ICONS.download}</button>
      </div>
    `).join('');
  }

  function refreshImages(forceRender) {
    const nextImages = extractImages();
    const currentIds = new Set(STATE.images.map((item) => item.id));
    const nextIds = new Set(nextImages.map((item) => item.id));

    STATE.images = nextImages;

    if (!currentIds.size || !isSameSet(currentIds, nextIds)) {
      STATE.selected = new Set(nextImages.map((item) => item.id));
    } else {
      STATE.selected = new Set([...STATE.selected].filter((id) => nextIds.has(id)));
    }

    if (forceRender || STATE.panelOpen) {
      render();
    } else {
      const counter = document.getElementById(IDS.counter);
      if (counter) {
        counter.textContent = String(STATE.selected.size || 0);
      }
    }
  }

  function extractImages() {
    const rawCandidates = SITE === 'ebay' ? collectEbayCandidates() : collectAvitoCandidates();
    const normalized = new Map();

    for (const candidate of rawCandidates) {
      if (!candidate || !candidate.url) {
        continue;
      }

      const key = candidate.url;
      const existing = normalized.get(key);
      if (!existing || candidate.score > existing.score) {
        normalized.set(key, candidate);
      }
    }

    return [...normalized.values()]
      .sort((a, b) => b.score - a.score)
      .map((item, index) => ({
        id: `${SITE}-${index + 1}-${hashCode(item.url)}`,
        url: item.url,
        preview: item.preview || item.url,
        ext: detectExtension(item.url),
        index: index + 1
      }));
  }

  function collectEbayCandidates() {
    const candidates = [];
    const galleryKeys = collectLogicalKeysFromDom(
      'img, source',
      normalizeEbayUrl,
      getEbayLogicalKey,
      isLikelyEbayGalleryNode
    );
    const heroUrl = normalizeEbayUrl(String(window.heroImg || ''));

    if (heroUrl) {
      galleryKeys.add(getEbayLogicalKey(heroUrl));
      candidates.push({
        url: heroUrl,
        preview: heroUrl,
        score: 1200
      });
    }

    pushFromDom(candidates, {
      selector: 'img, source',
      normalize: normalizeEbayUrl,
      preview: normalizeUrl,
      filter: isLikelyEbayGalleryNode
    });

    const filtered = galleryKeys.size
      ? candidates.filter((item) => galleryKeys.has(getEbayLogicalKey(item.url)))
      : candidates;

    return pickLogicalCandidates(filtered, getEbayLogicalKey, galleryKeys.size || 0);
  }

  function collectAvitoCandidates() {
    const candidates = [];
    const shareUrls = getAvitoShareUrls();
    const allGalleryKeys = new Set();
    const galleryKeyOrder = new Map();
    const previewByKey = new Map();

    const rememberGalleryUrl = (rawUrl) => {
      const normalized = normalizeAvitoUrl(rawUrl);
      const key = normalized && getAvitoLogicalKey(normalized);
      if (!key || /www\.avito\.ru\/img\/share\//i.test(normalized)) {
        return '';
      }

      if (!allGalleryKeys.has(key)) {
        galleryKeyOrder.set(key, galleryKeyOrder.size);
      }
      allGalleryKeys.add(key);
      if (!previewByKey.has(key)) {
        previewByKey.set(key, normalized);
      }
      return key;
    };

    for (const node of document.querySelectorAll('[data-marker="image-preview/preview-image"], [data-marker="image-preview/preview-image"] img')) {
      if (isAvitoVideoNode(node)) {
        continue;
      }
      for (const rawUrl of extractUrlsFromNode(node)) {
        rememberGalleryUrl(rawUrl);
      }
    }

    for (const node of document.querySelectorAll('[data-marker="image-frame/image-wrapper"], [data-marker="image-frame/image"]')) {
      if (isAvitoVideoNode(node)) {
        continue;
      }
      for (const rawUrl of extractUrlsFromNode(node)) {
        rememberGalleryUrl(rawUrl);
      }
    }

    const gallerySelector = [
      '#bx_item-gallery img',
      '#bx_item-gallery source',
      '#bx_item-gallery [data-url]',
      '#bx_item-gallery [style*="background-image"]',
      '[data-marker="item-view/gallery"] img',
      '[data-marker="item-view/gallery"] source',
      '[data-marker="item-view/gallery"] [data-url]',
      '[data-marker="image-frame/image-wrapper"]',
      '[data-marker="image-frame/image"]',
      '[data-marker="image-preview/preview-image"]'
    ].join(', ');

    pushFromDom(candidates, {
      selector: gallerySelector,
      normalize: normalizeAvitoUrl,
      preview: normalizeUrl,
      filter: isLikelyAvitoGalleryNode
    });

    pushAvitoUrlsFromPageText(candidates, allGalleryKeys);

    const filtered = allGalleryKeys.size
      ? candidates.filter((item) => allGalleryKeys.has(getAvitoLogicalKey(item.url)))
      : candidates;

    let picked = pickLogicalCandidates(filtered, getAvitoLogicalKey, allGalleryKeys.size || 0)
      .filter((item) => !/\/icons\/|\/touch-icon|bmw_80x80|avatar/i.test(item.url));

    picked = picked
      .map((item) => {
        const key = getAvitoLogicalKey(item.url);
        return {
          ...item,
          preview: item.url || previewByKey.get(key) || item.preview
        };
      })
      .sort((a, b) => {
        const aOrder = galleryKeyOrder.has(getAvitoLogicalKey(a.url)) ? galleryKeyOrder.get(getAvitoLogicalKey(a.url)) : Number.MAX_SAFE_INTEGER;
        const bOrder = galleryKeyOrder.has(getAvitoLogicalKey(b.url)) ? galleryKeyOrder.get(getAvitoLogicalKey(b.url)) : Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder || b.score - a.score;
      });

    if (!picked.length && shareUrls.length) {
      const urls = new Set(picked.map((item) => item.url));
      for (const shareUrl of shareUrls) {
        if (urls.has(shareUrl)) {
          continue;
        }
        picked.push({
          url: shareUrl,
          preview: shareUrl,
          score: -10
        });
        urls.add(shareUrl);
      }
    }

    return picked;
  }

  function pushFromDom(target, options) {
    const { selector, normalize, preview, filter } = options;
    const nodes = document.querySelectorAll(selector);

    for (const node of nodes) {
      if (filter && !filter(node)) {
        continue;
      }

      const urls = extractUrlsFromNode(node);
      for (const rawUrl of urls) {
        const normalized = normalize(rawUrl, node);
        if (!normalized) {
          continue;
        }
        target.push({
          url: normalized,
          preview: preview(rawUrl),
          score: SITE === 'ebay' ? scoreEbay(normalized, node) : scoreAvito(normalized, node)
        });
      }
    }
  }

  function extractUrlsFromNode(node) {
    const values = [];

    if (node.tagName === 'META') {
      values.push(node.getAttribute('content') || '');
    } else if (node.tagName === 'LINK') {
      values.push(node.getAttribute('href') || '');
    } else {
      values.push(node.currentSrc || '', node.src || '');
      for (const attr of ['data-src', 'data-url', 'data-image', 'data-zoom-src', 'data-lazy', 'data-original', 'data-full', 'data-full-src', 'href', 'content']) {
        values.push(node.getAttribute(attr) || '');
      }
      const srcset = node.getAttribute('srcset') || '';
      values.push(...parseSrcset(srcset));
      values.push(...extractCssUrls(node.getAttribute('style') || ''));
    }

    return values
      .map((value) => normalizeUrl(value))
      .filter(Boolean);
  }

  function extractCssUrls(value) {
    const urls = [];
    if (!value) {
      return urls;
    }

    const pattern = /url\((['"]?)(.*?)\1\)/gi;
    let match;
    while ((match = pattern.exec(String(value))) !== null) {
      urls.push(match[2]);
    }
    return urls;
  }

  function normalizeEbayUrl(url) {
    const clean = normalizeUrl(url);
    if (!clean || !/i\.ebayimg\.com\/images\//i.test(clean)) {
      return '';
    }

    return clean.replace(/\/s-l\d+([^.\/]*\.[a-z0-9]+)(?:\?.*)?$/i, '/s-l1600$1');
  }

  function normalizeAvitoUrl(url) {
    const clean = normalizeUrl(url);
    if (!clean) {
      return '';
    }

    if (/www\.avito\.ru\/img\/share\//i.test(clean)) {
      return clean;
    }

    if (!/img\.avito\.st\/image\//i.test(clean)) {
      return '';
    }

    return clean.replace(/\?.*$/, '');
  }

  function normalizeUrl(url) {
    if (!url) {
      return '';
    }

    let value = String(url).trim();
    if (!value || /^data:/i.test(value) || /^blob:/i.test(value)) {
      return '';
    }

    value = value
      .replace(/^url\((['"]?)(.*?)\1\)$/i, '$2')
      .replace(/&amp;/g, '&')
      .replace(/&quot;\);?$/i, '')
      .replace(/\\u002F/g, '/')
      .replace(/\\\//g, '/')
      .replace(/\\$/g, '')
      .replace(/^["']|["']$/g, '');

    try {
      return new URL(value, location.href).href;
    } catch (_) {
      return '';
    }
  }

  function parseSrcset(srcset) {
    if (!srcset) {
      return [];
    }
    return srcset
      .split(',')
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  function scoreEbay(url, source) {
    let score = 0;
    if (/s-l1600/i.test(url)) score += 300;
    if (/s-l\d+/i.test(url)) score += 120;
    if (/\.webp$/i.test(url)) score += 10;
    if (typeof source === 'string') score += 40;
    if (source && source.tagName === 'IMG') score += 60;
    if (source && isLikelyEbayGalleryNode(source)) score += 180;
    return score;
  }

  function scoreAvito(url, source, fromScript) {
    let score = 0;
    if (/img\.avito\.st\/image\//i.test(url)) score += 180;
    if (/www\.avito\.ru\/img\/share\//i.test(url)) score -= 80;
    score += getAvitoVariantScore(url);
    if (fromScript) score += 25;
    if (source && source.tagName === 'IMG') score += 70;

    if (source && (source.closest('[data-marker="image-frame/image-wrapper"]') || source.closest('[data-marker="image-frame/image"]'))) score += 1200;
    if (source && source.closest('#bx_item-gallery')) score += 300;
    if (source && source.closest('[data-marker="image-preview/preview-image"]')) score -= 100;
    if (source && isAvitoVideoNode(source)) score -= 2000;
    if (source && Number(source.naturalWidth || source.width || 0) >= 300) score += 50;
    return score;
  }

  function getAvitoVariantScore(url) {
    const match = url.match(/\/image\/1\/1\.[A-Za-z0-9_-]{7}(\d)/);
    const variant = match ? Number(match[1]) : 0;
    if (variant === 4) return 700;
    if (variant === 5 || variant === 6) return 520;
    if (variant === 3) return 180;
    if (variant === 2) return 120;
    if (variant === 1) return 40;
    return 0;
  }

  function isLikelyGalleryNode(node) {
    const marker = [
      node.getAttribute && node.getAttribute('data-marker'),
      node.closest && node.closest('[data-marker]') && node.closest('[data-marker]').getAttribute('data-marker'),
      node.className || '',
      node.closest && node.closest('[class]') && node.closest('[class]').className
    ].join(' ');

    return /image|gallery|carousel|slider|photo|viewer/i.test(marker);
  }

  function isLikelyEbayGalleryNode(node) {
    if (!node || isEbayVideoNode(node)) {
      return false;
    }

    const hasEbayImageUrl = extractUrlsFromNode(node)
      .some((rawUrl) => /i\.ebayimg\.com\/images\//i.test(normalizeUrl(rawUrl)));
    if (!hasEbayImageUrl) {
      return false;
    }

    // Проверяем, находится ли изображение внутри контейнеров галереи eBay
    const isInGallery =
      node.closest('.ux-image-carousel') ||
      node.closest('.ux-image-grid') ||
      node.closest('.x-photos-min-view') ||
      node.closest('.filmstrip') ||
      node.closest('[data-testid="x-photos-min-view"]') ||
      node.closest('[data-testid="ux-image-carousel-container"]');

    return !!isInGallery;
  }

  function isEbayVideoNode(node) {
    return !!(node && node.closest && (
      closestAttrMatches(node, 'aria-label', /video|видео/i) ||
      closestAttrMatches(node, 'data-testid', /video/i) ||
      closestContainerHas(node, '[data-icon-type="video"], [data-icon-name*="play"], [data-icon-name*="Play"]')
    ));
  }

  function isLikelyAvitoGalleryNode(node) {
    if (!node || isAvitoVideoNode(node)) {
      return false;
    }

    const isInGallery =
      node.closest('#bx_item-gallery') ||
      node.closest('[data-marker="item-view/gallery"]') ||
      node.closest('[data-marker="image-frame/image-wrapper"]') ||
      node.closest('[data-marker="image-frame/image"]') ||
      node.closest('[data-marker="image-preview/preview-image"]');

    if (!isInGallery) {
      return false;
    }

    return extractUrlsFromNode(node).some((rawUrl) => /img\.avito\.st\/image\//i.test(normalizeAvitoUrl(rawUrl)));
  }

  function isAvitoVideoNode(node) {
    return !!(node && node.closest && (
      node.closest('[data-marker="player/preview-image"]') ||
      node.closest('[data-marker^="player/"]') ||
      node.closest('[data-type="video"]') ||
      closestAttrMatches(node, 'aria-label', /video|видео/i) ||
      closestAttrMatches(node, 'data-type', /video/i) ||
      closestContainerHas(node, '[data-marker^="player/"], [data-icon-type="video"], [data-icon-name*="play"], [data-icon-name*="Play"]')
    ));
  }

  function closestAttrMatches(node, attr, pattern) {
    for (let current = node; current && current !== document.documentElement; current = current.parentElement) {
      const value = current.getAttribute && current.getAttribute(attr);
      if (value && pattern.test(value)) {
        return true;
      }
    }
    return false;
  }

  function closestContainerHas(node, selector) {
    const container = node.closest('button, [role="button"], li, [data-marker="image-preview/item"], [data-marker="image-frame/image-wrapper"]');
    return !!(container && container.querySelector && container.querySelector(selector));
  }

  function isNearPrimaryMedia(node) {
    if (!node || typeof node.getBoundingClientRect !== 'function') {
      return false;
    }

    const rect = node.getBoundingClientRect();
    if (!rect || rect.width < 36 || rect.height < 36) {
      return false;
    }

    return rect.left < window.innerWidth * 0.62 && rect.top < window.innerHeight * 1.6;
  }

  function collectLogicalKeysFromDom(selector, normalize, keyGetter, filter) {
    const keys = new Set();

    for (const node of document.querySelectorAll(selector)) {
      if (filter && !filter(node)) {
        continue;
      }

      for (const rawUrl of extractUrlsFromNode(node)) {
        const normalized = normalize(rawUrl, node);
        if (!normalized) {
          continue;
        }
        keys.add(keyGetter(normalized));
      }
    }

    return new Set([...keys].filter(Boolean));
  }

  function pickLogicalCandidates(candidates, keyGetter, limit) {
    const grouped = new Map();

    for (const candidate of candidates) {
      if (!candidate || !candidate.url) {
        continue;
      }

      const key = keyGetter(candidate.url);
      if (!key) {
        continue;
      }

      const existing = grouped.get(key);
      if (!existing || candidate.score > existing.score) {
        grouped.set(key, candidate);
      }
    }

    const picked = [...grouped.values()].sort((a, b) => b.score - a.score);
    return limit ? picked.slice(0, limit) : picked;
  }

  function getEbayLogicalKey(url) {
    const match = url.match(/\/images\/g\/([^/]+)\//i);
    return match ? match[1] : url;
  }

  function getAvitoLogicalKey(url) {
    const match = url.match(/\/image\/1\/1\.([A-Za-z0-9_-]{7})/);
    return match ? match[1] : url;
  }

  function pushAvitoUrlsFromPageText(target, galleryKeys) {
    if (!galleryKeys || !galleryKeys.size) {
      return;
    }

    const html = document.documentElement.innerHTML
      .replace(/\\u002F/g, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
    const seen = new Set();
    const pattern = /https?:\/\/(?:\d+\.)?img\.avito\.st\/image\/1\/1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\?[^"'<>\\\s]*)?/gi;
    let match;

    while ((match = pattern.exec(html)) !== null) {
      const normalized = normalizeAvitoUrl(match[0]);
      const key = normalized && getAvitoLogicalKey(normalized);
      if (!key || !galleryKeys.has(key) || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      target.push({
        url: normalized,
        preview: normalized,
        score: scoreAvito(normalized, null, true)
      });
    }
  }

  function getAvitoShareUrls() {
    const shareUrls = [];
    const nodes = document.querySelectorAll('meta[property="og:image"], link[rel="image_src"]');

    for (const node of nodes) {
      const rawValue = node.tagName === 'META'
        ? node.getAttribute('content')
        : node.getAttribute('href');
      const normalized = normalizeAvitoUrl(rawValue || '');
      if (!normalized || !/www\.avito\.ru\/img\/share\//i.test(normalized)) {
        continue;
      }
      shareUrls.push(normalized);
    }

    return [...new Set(shareUrls)];
  }

  function toggleAllSelection() {
    if (STATE.selected.size === STATE.images.length) {
      STATE.selected.clear();
    } else {
      STATE.selected = new Set(STATE.images.map((item) => item.id));
    }
    render();
  }

  function toggleOne(id) {
    if (!id) {
      return;
    }
    if (STATE.selected.has(id)) {
      STATE.selected.delete(id);
    } else {
      STATE.selected.add(id);
    }
    render();
  }

  async function downloadOne(id) {
    const image = STATE.images.find((item) => item.id === id);
    if (!image) {
      return;
    }
    await triggerDownload(image);
  }

  async function downloadSelected() {
    const selectedImages = STATE.images.filter((item) => STATE.selected.has(item.id));
    for (let index = 0; index < selectedImages.length; index += 1) {
      await triggerDownload(selectedImages[index]);
      await sleep(180);
    }
  }

  async function triggerDownload(image) {
    const filename = buildFilename(image);

    if (typeof GM_download === 'function') {
      await new Promise((resolve) => {
        GM_download({
          url: image.url,
          name: filename,
          saveAs: false,
          onload: resolve,
          onerror: resolve,
          ontimeout: resolve
        });
      });
      return;
    }

    const link = document.createElement('a');
    link.href = image.url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function buildFilename(image) {
    const title = sanitizeFileName(
      document.title
        .replace(/\s*\|\s*eBay.*$/i, '')
        .replace(/\s*\|\s*Авито.*$/i, '')
        .trim()
    ) || SITE;

    return `${title}_${String(image.index).padStart(2, '0')}.${image.ext}`;
  }

  function detectExtension(url) {
    const match = url.match(/\.([a-z0-9]{3,4})(?:\?|$)/i);
    return match ? match[1].toLowerCase() : 'jpg';
  }

  function sanitizeFileName(value) {
    return value
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  function isSameSet(a, b) {
    if (a.size !== b.size) {
      return false;
    }
    for (const item of a) {
      if (!b.has(item)) {
        return false;
      }
    }
    return true;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function hashCode(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function debounce(fn, delay) {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
