// ==UserScript==
// @name         Avito Wordstat — DEBUGGER
// @namespace    https://avito.ru/
// @version      2.7.debug
// @description  Автоматически перебирает артикулы и собирает статистику спроса с Авито Wordstat
// @author       TroyDiFlex
// @match        https://www.avito.ru/analytics/wordstat*
// @updateURL    https://raw.githubusercontent.com/TroyDiFlex/userscripts/main/dist/wordstat.user.js
// @downloadURL  https://raw.githubusercontent.com/TroyDiFlex/userscripts/main/dist/wordstat.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ─── НАСТРОЙКИ (localStorage) ───
    const SETTINGS_KEY = 'avito_wordstat_settings';
    function loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            return {
                sortEnabled: s.sortEnabled !== false, // по умолчанию включена
                copyFrequency: s.copyFrequency !== false, // по умолчанию включена
            };
        } catch (_) {
            return { sortEnabled: true, copyFrequency: true };
        }
    }
    function saveSettings(s) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    }
    let settings = loadSettings();

    // ─── СОСТОЯНИЕ ───
    let articles = [];
    let queries = [];
    let currentIndex = 0;
    let results = [];
    let isRunning = false;
    let isPaused = false;

    // ─── РАНДОМНАЯ ЗАДЕРЖКА ───
    function randomDelay(minSec = 0.4, maxSec = 1.9) {
        const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
        return new Promise(r => setTimeout(r, ms));
    }

    let sleep = ms => new Promise(r => setTimeout(r, ms));

    // ─── ТОЧНЫЙ ТАЙМЕР ЧЕРЕЗ ВОРКЕР (без троттлинга в фоне) ───
    try {
        const _w = new Worker(URL.createObjectURL(new Blob([
            'onmessage=function(e){setTimeout(function(){postMessage(e.data)},e.data.ms)}'
        ], { type: 'text/javascript' })));
        const _cb = new Map();
        let _tid = 0;
        _w.onmessage = e => { const fn = _cb.get(e.data.id); if (fn) { _cb.delete(e.data.id); fn(); } };
        sleep = ms => new Promise(r => { const id = ++_tid; _cb.set(id, r); _w.postMessage({ ms, id }); });
        console.log('[Wordstat Debugger] Worker-таймер активирован — троттлинг устранён.');
    } catch (e) {
        console.warn('[Wordstat Debugger] Worker недоступен, используем обычный setTimeout:', e);
    }

    // ─── УБИРАЕМ VRN С КОНЦА ───
    function stripVRN(art) {
        art = art.trim();
        if (art.toUpperCase().endsWith('VRN')) return art.slice(0, -3).trim();
        return art;
    }

    // ─── РЕАКТ-СОВМЕСТИМЫЙ ВВОД ЗНАЧЕНИЯ ───
    function setNativeInputValue(input, value) {
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ─── ЖДЁМ ПОЯВЛЕНИЯ ЭЛЕМЕНТА (один селектор) ───
    async function waitForSelector(selector, timeout = 15000) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(200);
        }
        return null;
    }

    // ─── ЖДЁМ ПЕРВОГО СОВПАДЕНИЯ ИЗ НАБОРА СЕЛЕКТОРОВ ───
    async function waitForAny(selectors, timeout = 15000) {
        if (typeof selectors === 'string') selectors = [selectors];
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            for (const sel of selectors) {
                try {
                    const el = document.querySelector(sel);
                    if (el) {
                        console.log('[Wordstat Parser] Найдено по селектору:', sel);
                        return el;
                    }
                } catch (_) { /* невалидный css-селектор — пропускаем */ }
            }
            await sleep(200);
        }
        console.warn('[Wordstat Parser] Ни один из селекторов не сработал:', selectors);
        return null;
    }

    // ─── ОЧИСТКА ПРЕДЫДУЩИХ ЗАПРОСОВ (ЧИПОВ) ───
    async function clearPreviousQueries() {
        // Возможные маркеры крестиков удаления чипа
        const closeSelectors = [
            '[data-marker="close-button"]',
            '[data-marker*="close"]',
            'button[aria-label*="удал"]',
            'button[aria-label*="Удал"]',
            'button[aria-label*="закрыть"]',
            'button[aria-label*="Закрыть"]',
        ];
        // Возможные маркеры самих чипов
        const chipSelectors = [
            '[data-marker^="query/"]',
            '[data-marker="query/0"]',
            '[data-marker*="chip"]',
        ];

        // Кликаем все крестики, которые найдём
        for (const sel of closeSelectors) {
            const btns = document.querySelectorAll(sel);
            for (const btn of btns) {
                btn.click();
                await sleep(150);
            }
        }

        // Ждём, пока чипы исчезнут (макс. 3 сек)
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
            let hasChips = false;
            for (const sel of chipSelectors) {
                try {
                    if (document.querySelectorAll(sel).length > 0) { hasChips = true; break; }
                } catch (_) {}
            }
            if (!hasChips) break;

            // Ещё раз кликаем крестики
            for (const sel of closeSelectors) {
                try { document.querySelectorAll(sel).forEach(b => b.click()); } catch (_) {}
            }
            await sleep(100);
        }
    }

    // ─── ИЗВЛЕЧЕНИЕ ЧИСЛА ЗАПРОСОВ ───
    async function extractCount(query, timeout = 20000) {
        const deadline = Date.now() + timeout;
        let lastValue = null;
        let stableSince = Date.now();

        const isFaded = (el) => {
            let current = el;
            while (current && current !== document.body) {
                const style = window.getComputedStyle(current);
                if (parseFloat(style.opacity) < 0.95 || (style.filter && style.filter !== 'none')) return true;
                if (typeof current.className === 'string') {
                    const cls = current.className.toLowerCase();
                    if (cls.includes('skeleton') || cls.includes('loading') || cls.includes('spinner')) return true;
                }
                current = current.parentElement;
            }
            return false;
        };

        // Возможные селекторы чипа с нашим запросом
        const chipSelectors = [
            '[data-marker="query/0"]',
            '[data-marker^="query/"]',
            '[data-marker*="chip"]',
        ];

        while (Date.now() < deadline) {
            let currentValue = null;

            // 1. Проверяем, что чип с нашим запросом уже на странице
            let chipText = '';
            for (const sel of chipSelectors) {
                try {
                    const chip = document.querySelector(sel);
                    if (chip) { chipText = chip.textContent.trim(); break; }
                } catch (_) {}
            }

            if (!chipText || chipText.toLowerCase() !== query.toLowerCase()) {
                lastValue = null;
                stableSince = Date.now();
                await sleep(200);
                continue;
            }

            // 2. Ищем элемент «Всего запросов»
            // Приоритет: ищем h3 внутри конкретного контейнера (самый точный)
            const directText = (el) => [...el.childNodes]
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent)
                .join('')
                .trim();

            const candidates = [
                // Точный селектор: h3 внутри блока аналитики
                ...(document.querySelectorAll('[data-marker="analytics-non-zero"] h3') || []),
                // Запасной: любой h3/h2/h1 с нужным текстом
                ...(document.querySelectorAll('h1, h2, h3') || []),
            ];

            for (const el of candidates) {
                // Читаем только прямые текстовые ноды — без дочерних элементов!
                const txt = directText(el);
                if (txt.includes('Всего запросов') && /\d/.test(txt)) {
                    if (!isFaded(el)) {
                        const match = txt.match(/Всего запросов[^\d]*([\d\u00a0 ]+)/i);
                        if (match && match[1]) {
                            const cleanNum = match[1].replace(/[^\d]/g, '');
                            if (cleanNum) {
                                currentValue = parseInt(cleanNum, 10);
                                break;
                            }
                        }
                    }
                }
            }

            if (currentValue !== null) {
                if (currentValue !== lastValue) {
                    lastValue = currentValue;
                    stableSince = Date.now();
                } else if (Date.now() - stableSince >= 400) {
                    return currentValue;
                }
            } else {
                lastValue = null;
                stableSince = Date.now();
            }

            await sleep(200);
        }
        return lastValue;
    }

    // ─── ПРОВЕРКА КАПЧИ ───
    async function waitIfCaptcha() {
        const isCaptcha = () => {
            for (const f of document.querySelectorAll('iframe')) {
                if (f.src && (f.src.includes('captcha') || f.src.includes('recaptcha') ||
                    (f.src.includes('yandex') && f.src.includes('check')))) return true;
            }
            if (document.querySelector('[class*="captcha"], [id*="captcha"]')) return true;
            return false;
        };
        if (isCaptcha()) {
            captchaWarn.style.display = 'block';
            statusEl.textContent = '⚠️ Капча! Решите её, скрипт подождёт...';
            while (isCaptcha()) await sleep(1000);
            captchaWarn.style.display = 'none';
            await randomDelay(1, 2);
        }
    }

    // ─── ОБРАБОТКА ОДНОГО АРТИКУЛА ───
    async function processOne(article, query) {
        // Очищаем предыдущие чипы
        await clearPreviousQueries();

        statusEl.textContent = `🔍 Ввожу: ${query}`;

        // Ищем поле ввода по нескольким известным и резервным селекторам
        const inputSelectors = [
            '[data-marker="query-suggest/search-input"]',
            '[data-marker*="search-input"]',
            '[data-marker*="query-suggest"] input',
            '[data-marker*="wordstat"] input',
            'input[placeholder*="запрос"]',
            'input[placeholder*="Запрос"]',
            'input[placeholder*="Введите"]',
            'input[type="text"]:not([readonly]):not([disabled])',
        ];

        const input = await waitForAny(inputSelectors, 12000);
        if (!input) {
            console.error('[Wordstat Parser] Поле ввода не найдено. Проверьте селекторы.');
            throw new Error('Поле ввода не найдено — возможно, Авито обновил интерфейс');
        }

        // Очищаем поле через крестик (если есть)
        const clearBtn = document.querySelector(
            '[data-marker="query-suggest/clearButton"], [data-marker*="clearButton"], [data-marker*="clear"]'
        );
        if (clearBtn && clearBtn.offsetParent !== null) {
            clearBtn.click();
            await randomDelay(0.2, 0.4);
        }

        // Кликаем и вводим значение
        input.focus();
        input.click();
        await randomDelay(0.1, 0.3);
        setNativeInputValue(input, query);

        // Имитация раздумий (защита от бана)
        await randomDelay(0.4, 1.9);

        // Закрываем выпадающий список (Escape)
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await randomDelay(0.2, 0.5);

        // Ищем и нажимаем кнопку «Смотреть аналитику»
        statusEl.textContent = `⏳ Жду кнопку...`;
        let clicked = false;
        const btnDeadline = Date.now() + 10000;

        while (Date.now() < btnDeadline) {
            // Первая попытка — по data-marker
            let btn = document.querySelector('[data-marker="query-submit"]');

            // Вторая попытка — по тексту кнопки
            if (!btn) {
                const allBtns = [...document.querySelectorAll('button:not(:disabled)')];
                btn = allBtns.find(b =>
                    b.textContent.includes('аналитику') ||
                    b.textContent.includes('Смотреть') ||
                    b.textContent.includes('Найти')
                ) || null;
            }

            if (btn && !btn.disabled) {
                btn.click();
                clicked = true;
                console.log('[Wordstat Parser] Кнопка нажата:', btn.textContent.trim());
                break;
            }

            // Запасной вариант — Enter в поле ввода (за 2 сек до дедлайна)
            if (!clicked && Date.now() > btnDeadline - 2000) {
                console.warn('[Wordstat Parser] Кнопка не найдена — пробуем Enter в поле ввода');
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                clicked = true;
                break;
            }

            await sleep(150);
        }

        if (!clicked) throw new Error('Не удалось отправить запрос (кнопка не стала активной)');

        statusEl.textContent = `⏳ Загрузка данных: ${query}`;

        // Проверяем капчу
        await waitIfCaptcha();

        // Парсим число
        const count = await extractCount(query, 18000);
        return count !== null ? String(count) : 'н/д';
    }

    // ─── ОСНОВНОЙ ЦИКЛ ───
    async function runParser() {
        isRunning = true;
        isPaused = false;
        btnStart.textContent = '⏹ Стоп';
        btnPause.disabled = false;
        btnSave.disabled = true;
        updateProgress();

        while (currentIndex < articles.length && isRunning) {
            while (isPaused && isRunning) await sleep(500);
            if (!isRunning) break;

            const article = articles[currentIndex];
            const query = queries[currentIndex];

            try {
                const count = await processOne(article, query);
                results.push({ article, query, count });
                renderPreview();
                statusEl.textContent = `✅ ${article}: ${count}`;
            } catch (e) {
                results.push({ article, query, count: 'ошибка' });
                renderPreview();
                statusEl.textContent = `❌ ${article}: ${e.message}`;
                console.error('[Wordstat Parser]', e);
            }

            currentIndex++;
            updateProgress();

            if (currentIndex < articles.length && isRunning) {
                statusEl.textContent = `⏱ Пауза перед следующим...`;
                await randomDelay(0.4, 1.9);
            }
        }

        if (currentIndex >= articles.length) {
            statusEl.textContent = `🎉 Готово! ${articles.length} шт.`;
        } else {
            statusEl.textContent = `⏹ Остановлено на ${currentIndex}/${articles.length}`;
        }
        isRunning = false;
        btnStart.textContent = '▶ Заново';
        btnPause.disabled = true;
        btnSave.disabled = results.length === 0;
    }

    // ─── ПОЛУЧИТЬ ОТСОРТИРОВАННЫЕ РЕЗУЛЬТАТЫ ───
    function getSortedResults() {
        if (!settings.sortEnabled) return [...results];
        return [...results].sort((a, b) => {
            const na = parseInt(a.count, 10) || 0;
            const nb = parseInt(b.count, 10) || 0;
            return nb - na; // по убыванию
        });
    }

    // ─── РЕНДЕР ПРЕВЬЮ (с учётом сортировки) ───
    function renderPreview() {
        if (results.length === 0) {
            preview.style.display = 'none';
            preview.innerHTML = '';
            return;
        }
        preview.style.display = 'block';
        preview.innerHTML = '';
        const sorted = getSortedResults();
        for (const r of sorted) {
            const d = document.createElement('div');
            const isErr = r.count === 'ошибка';
            d.className = 'rr' + (isErr ? ' re' : '');
            d.textContent = isErr ? `✗ ${r.article} — ошибка` : `✓ ${r.article} — ${r.count}`;
            preview.appendChild(d);
        }
    }

    // ─── КОПИРОВАНИЕ В БУФЕР ОБМЕНА ───
    function copyToClipboard() {
        if (!results.length) return;
        const sorted = getSortedResults();
        let text;
        if (settings.copyFrequency) {
            // Два столбца: артикул\tчастотность (TSV для Google Sheets)
            text = sorted.map(r => `${r.article}\t${r.count}`).join('\n');
        } else {
            // Только артикулы
            text = sorted.map(r => r.article).join('\n');
        }
        navigator.clipboard.writeText(text).then(() => {
            const orig = btnCopy.textContent;
            btnCopy.textContent = '✅';
            setTimeout(() => { btnCopy.textContent = orig; }, 1500);
        }).catch(() => {
            // Фоллбэк для старых браузеров
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            const orig = btnCopy.textContent;
            btnCopy.textContent = '✅';
            setTimeout(() => { btnCopy.textContent = orig; }, 1500);
        });
    }

    // ─── CSV СКАЧИВАНИЕ ───
    function downloadCSV() {
        const BOM = '\uFEFF';
        const hdr = 'Артикул;Запрос;Количество запросов\n';
        const rows = results.map(r => `${r.article};${r.query};${r.count}`).join('\n');
        const blob = new Blob([BOM + hdr + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `avito_wordstat_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ─── UI ХЕЛПЕРЫ ───
    function updateProgress() {
        const pct = articles.length > 0 ? (currentIndex / articles.length) * 100 : 0;
        progressBar.style.width = pct + '%';
        counterEl.textContent = `${currentIndex} / ${articles.length}`;
    }

    // ─── СОЗДАЁМ ПАНЕЛЬ ───
    const panel = document.createElement('div');
    panel.id = 'ap';
    panel.innerHTML = `
    <style>
        #ap {
            position: fixed; top: 80px; right: 20px; width: 320px;
            background: rgba(28, 28, 30, 0.95);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 16px; z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 13px; color: #f5f5f7;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        #ap h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #ffffff; display: flex; align-items: center; gap: 6px; cursor: move; }
        #ap textarea {
            width: 100%; height: 100px; background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px;
            color: #ffffff; padding: 10px; font-size: 12px; resize: vertical;
            box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; outline: none;
            transition: border-color 0.2s, background 0.2s;
        }
        #ap textarea:focus { border-color: #0a84ff; background: rgba(0, 0, 0, 0.3); }
        #ap textarea::placeholder { color: #86868b; }

        /* Стилизация скроллбара для textarea и превью */
        #ap textarea::-webkit-scrollbar, #pv::-webkit-scrollbar { width: 6px; }
        #ap textarea::-webkit-scrollbar-track, #pv::-webkit-scrollbar-track { background: transparent; }
        #ap textarea::-webkit-scrollbar-thumb, #pv::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 3px; }
        #ap textarea::-webkit-scrollbar-thumb:hover, #pv::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }

        #ap .lbl { font-size: 11px; color: #86868b; margin-bottom: 6px; font-weight: 500; }
        #ap .br { display: flex; gap: 8px; margin-top: 12px; }
        #ap button {
            flex: 1; padding: 8px 10px; border: none; border-radius: 8px; cursor: pointer;
            font-size: 12px; font-weight: 500; transition: background 0.2s, opacity 0.2s;
        }
        #bs { background: #0a84ff; color: #fff; }
        #bs:hover:not(:disabled) { background: #0071e3; }
        #bs:disabled { opacity: 0.5; cursor: not-allowed; }

        #bp { background: #3a3a3c; color: #fff; }
        #bp:hover:not(:disabled) { background: #4a4a4c; }
        #bp:disabled { opacity: 0.5; cursor: not-allowed; }

        #bv { background: #30d158; color: #fff; }
        #bv:hover:not(:disabled) { background: #28b84d; }
        #bv:disabled { opacity: 0.5; cursor: not-allowed; }

        .pw { margin-top: 12px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; height: 4px; overflow: hidden; }
        #pb { height: 100%; width: 0%; background: #0a84ff; border-radius: 4px; transition: width 0.3s ease; }

        .sr { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
        #st { font-size: 11px; color: #86868b; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #ct { font-size: 11px; font-weight: 500; color: #f5f5f7; margin-left: 8px; font-variant-numeric: tabular-nums; }

        #pv {
            margin-top: 12px; max-height: 120px; overflow-y: auto;
            background: rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 10px;
            font-size: 11px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; color: #d1d1d6;
            display: none; border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .rr { padding: 4px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
        .rr:last-child { border-bottom: none; }
        .re { color: #ff453a; }

        #cw {
            background: rgba(255, 69, 58, 0.1); border: 1px solid rgba(255, 69, 58, 0.3);
            border-radius: 8px; padding: 10px; font-size: 11px; color: #ff453a;
            margin-top: 12px; display: none; text-align: center; font-weight: 500;
        }

        /* Кнопка свернуть */
        #cb { position: absolute; top: 12px; right: 12px; background: none; border: none; color: #86868b; cursor: pointer; font-size: 14px; padding: 4px; flex: none!important; line-height: 1; border-radius: 4px; transition: background 0.2s, color 0.2s; }
        #cb:hover { color: #f5f5f7; background: rgba(255, 255, 255, 0.1); }

        /* Панель нижних кнопок (копировать + настройки) */
        .ab { display: flex; gap: 6px; margin-top: 10px; justify-content: flex-end; }
        .ab button {
            flex: none; padding: 5px 10px; border: 1px solid rgba(255,255,255,0.15);
            border-radius: 7px; background: rgba(255,255,255,0.06);
            color: #d1d1d6; cursor: pointer; font-size: 13px;
            transition: background 0.2s, color 0.2s, border-color 0.2s;
            line-height: 1;
        }
        .ab button:hover { background: rgba(255,255,255,0.12); color: #fff; border-color: rgba(255,255,255,0.25); }

        /* Попап настроек */
        #sp {
            display: none; position: absolute; bottom: calc(100% + 8px); right: 0;
            background: rgba(36, 36, 40, 0.98); border: 1px solid rgba(255,255,255,0.12);
            border-radius: 10px; padding: 14px 16px; width: 230px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            font-size: 12px; color: #d1d1d6; z-index: 10;
        }
        #sp.open { display: block; }
        #sp .sp-title { font-size: 11px; font-weight: 600; color: #86868b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
        #sp label { display: flex; align-items: center; gap: 9px; cursor: pointer; padding: 5px 0; user-select: none; }
        #sp label + label { border-top: 1px solid rgba(255,255,255,0.06); }
        #sp input[type=checkbox] { width: 15px; height: 15px; accent-color: #0a84ff; cursor: pointer; flex-shrink: 0; }
        .sp-wrap { position: relative; }
    </style>
    <h3 id="hdr">📊 Парсер Wordstat <button id="cb" title="Свернуть">▲</button></h3>
    <div id="bd">
        <div class="lbl">Артикулы:</div>
        <textarea id="ta" placeholder="Вставьте артикулы...&#10;ПРИМЕР123VRN&#10;ДРУГОЙ456"></textarea>
        <div class="br">
            <button id="bs">▶ Старт</button>
            <button id="bp" disabled>⏸ Пауза</button>
            <button id="bv" disabled>💾 CSV</button>
        </div>
        <div id="cw">⚠️ Капча! Решите её, скрипт подождёт</div>
        <div class="pw"><div id="pb"></div></div>
        <div class="sr">
            <div id="st">Готов к работе</div>
            <div id="ct">0 / 0</div>
        </div>
        <div id="pv"></div>
        <div class="ab">
            <button id="bcopy" title="Скопировать данные в буфер обмена">📋</button>
            <div class="sp-wrap">
                <button id="bgear" title="Настройки">⚙️</button>
                <div id="sp">
                    <div class="sp-title">Настройки</div>
                    <label><input type="checkbox" id="chkSort"> Сортировать по частотности</label>
                    <label><input type="checkbox" id="chkFreq"> Копировать частотность</label>
                </div>
            </div>
        </div>
    </div>`;
    document.body.appendChild(panel);

    // Элементы
    const btnStart = document.getElementById('bs');
    const btnPause = document.getElementById('bp');
    const btnSave = document.getElementById('bv');
    const btnCopy = document.getElementById('bcopy');
    const btnGear = document.getElementById('bgear');
    const settingsPopup = document.getElementById('sp');
    const chkSort = document.getElementById('chkSort');
    const chkFreq = document.getElementById('chkFreq');
    const progressBar = document.getElementById('pb');
    const statusEl = document.getElementById('st');
    const counterEl = document.getElementById('ct');
    const preview = document.getElementById('pv');
    const captchaWarn = document.getElementById('cw');
    const textareaEl = document.getElementById('ta');
    const collapseBtn = document.getElementById('cb');
    const bodyEl = document.getElementById('bd');

    // Применяем начальные значения чекбоксов
    chkSort.checked = settings.sortEnabled;
    chkFreq.checked = settings.copyFrequency;

    // ─── ОБРАБОТЧИКИ НАСТРОЕК ───
    chkSort.addEventListener('change', () => {
        settings.sortEnabled = chkSort.checked;
        saveSettings(settings);
        renderPreview(); // перерисовать с новой сортировкой
    });
    chkFreq.addEventListener('change', () => {
        settings.copyFrequency = chkFreq.checked;
        saveSettings(settings);
    });

    // Попап шестерёнки — открыть/закрыть
    btnGear.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPopup.classList.toggle('open');
    });
    // Закрыть попап при клике вне
    document.addEventListener('click', (e) => {
        if (!settingsPopup.contains(e.target) && e.target !== btnGear) {
            settingsPopup.classList.remove('open');
        }
    });

    // Кнопка копирования
    btnCopy.addEventListener('click', copyToClipboard);

    // Свернуть
    let collapsed = false;
    collapseBtn.addEventListener('click', () => {
        collapsed = !collapsed;
        bodyEl.style.display = collapsed ? 'none' : '';
        collapseBtn.textContent = collapsed ? '▼' : '▲';
    });

    // Перетаскивание
    (function drag(el) {
        let sx, sy, ox, oy;
        const h = document.getElementById('hdr');
        h.addEventListener('mousedown', e => {
            if (e.target.id === 'cb') return;
            e.preventDefault();

            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;

            const originalUserSelect = document.body.style.userSelect;
            document.body.style.userSelect = 'none';

            const mv = v => {
                el.style.left = (ox + v.clientX - sx) + 'px';
                el.style.top = (oy + v.clientY - sy) + 'px';
                el.style.right = 'auto';
            };
            const up = () => {
                document.body.style.userSelect = originalUserSelect;
                document.removeEventListener('mousemove', mv);
                document.removeEventListener('mouseup', up);
            };

            document.addEventListener('mousemove', mv, { passive: true });
            document.addEventListener('mouseup', up);
        });
    })(panel);

    // ─── ХАК ДЛЯ ФОНОВОЙ РАБОТЫ (Silent Audio) ───
    let audioTrickEnabled = false;
    function enableAudioTrick() {
        if (audioTrickEnabled) return;
        try {
            // Крошечный base64-wav файл с абсолютной тишиной
            const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
            audio.loop = true;
            audio.play().then(() => {
                audioTrickEnabled = true;
                console.log('[Wordstat Parser] Аудио-хак (пустой звук) для фоновой работы активирован.');
            }).catch(e => console.warn('[Wordstat Parser] Не удалось запустить аудио-хак:', e));
        } catch (e) {
            console.warn('[Wordstat Parser] Ошибка аудио-хака:', e);
        }
    }

    // ─── ОТЛАДЧИК ТРОТТЛИНГА ───
    let lastTick = performance.now();
    let debugIntervalId = null;
    
    function startDebugger() {
        if (debugIntervalId) return;
        lastTick = performance.now();
        console.log('%c[Wordstat Debugger]%c Запущен. Ожидаемый интервал: 200мс', 'background: #0a84ff; color: white; padding: 2px 4px; border-radius: 3px;', 'color: inherit;');
        
        debugIntervalId = setInterval(() => {
            const now = performance.now();
            const delta = now - lastTick;
            lastTick = now;
            
            // Если дельта > 300мс, значит браузер нас троттлит
            if (delta > 300) {
                console.warn(`%c[Wordstat Debugger]%c ТРОТТЛИНГ! Прошло ${Math.round(delta)}мс вместо 200мс`, 'background: red; color: white; padding: 2px 4px; border-radius: 3px;', 'color: inherit;');
            } else {
                console.log(`%c[Wordstat Debugger]%c ОК: ${Math.round(delta)}мс`, 'background: green; color: white; padding: 2px 4px; border-radius: 3px;', 'color: inherit;');
            }
        }, 200);
    }
    
    function stopDebugger() {
        if (debugIntervalId) {
            clearInterval(debugIntervalId);
            debugIntervalId = null;
            console.log('%c[Wordstat Debugger]%c Остановлен.', 'background: gray; color: white; padding: 2px 4px; border-radius: 3px;', 'color: inherit;');
        }
    }

    // ─── КНОПКИ ───
    btnStart.addEventListener('click', () => {
        enableAudioTrick();
        
        if (isRunning) {
            isRunning = false; isPaused = false;
            stopDebugger();
            btnStart.textContent = '▶ Старт';
            btnPause.textContent = '⏸ Пауза'; btnPause.disabled = true;
            btnSave.disabled = results.length === 0;
            statusEl.textContent = 'Остановлено';
            return;
        }
        const raw = textareaEl.value.trim();
        if (!raw) { statusEl.textContent = '⚠️ Введите артикулы!'; return; }
        const lines = raw.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
        if (!lines.length) { statusEl.textContent = '⚠️ Нет артикулов!'; return; }
        articles = lines;
        queries = lines.map(stripVRN);
        currentIndex = 0;
        results = [];
        preview.innerHTML = '';
        preview.style.display = 'none';
        captchaWarn.style.display = 'none';
        runParser();
        startDebugger();
    });

    btnPause.addEventListener('click', () => {
        if (!isRunning) return;
        isPaused = !isPaused;
        btnPause.textContent = isPaused ? '▶ Дальше' : '⏸ Пауза';
        statusEl.textContent = isPaused ? '⏸ Пауза...' : '▶ Продолжаем...';
    });

    btnSave.addEventListener('click', () => { if (results.length) downloadCSV(); });

    console.log('[Avito Wordstat Parser] ✅ Скрипт версии 2.6 загружен!');
})();
