// ==UserScript==
// @name         Avito Wordstat — Автопарсер
// @namespace    https://avito.ru/
// @version      1.9
// @description  Автоматически перебирает артикулы и собирает статистику спроса с Авито Wordstat
// @author       TroyDiFlex
// @match        https://www.avito.ru/analytics/wordstat*
// @updateURL    https://raw.githubusercontent.com/TroyDiFlex/userscripts/main/scripts/avito/wordstat.user.js
// @downloadURL  https://raw.githubusercontent.com/TroyDiFlex/userscripts/main/scripts/avito/wordstat.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

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

    const sleep = ms => new Promise(r => setTimeout(r, ms));

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

    // ─── ЖДЁМ ПОЯВЛЕНИЯ ЭЛЕМЕНТА ───
    async function waitForSelector(selector, timeout = 15000) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(200);
        }
        return null;
    }

    // ─── ОЧИСТКА ПРЕДЫДУЩИХ ЗАПРОСОВ (ЧИПОВ) ───
    async function clearPreviousQueries() {
        // Ищем все крестики у добавленных запросов
        let closeBtns = document.querySelectorAll('[data-marker="close-button"]');
        for (const btn of closeBtns) {
            btn.click();
            await sleep(150);
        }

        // Ждем, пока старые чипы исчезнут (макс 3 сек)
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
            const chips = document.querySelectorAll('[data-marker^="query/"]');
            if (chips.length === 0) break; // Ура, старые данные исчезли

            // Если крестики еще остались, нажмем еще раз (защита от глюков Авито)
            closeBtns = document.querySelectorAll('[data-marker="close-button"]');
            for (const btn of closeBtns) btn.click();

            await sleep(100);
        }
    }

    // ─── ИЗВЛЕЧЕНИЕ ЧИСЛА ЗАПРОСОВ ───
    async function extractCount(query, timeout = 20000) {
        const deadline = Date.now() + timeout;
        let lastValue = null;
        let stableSince = Date.now();

        // Вспомогательная функция для проверки загрузочного стейта (полупрозрачность)
        const isFaded = (el) => {
            let current = el;
            while (current && current !== document.body) {
                const style = window.getComputedStyle(current);
                if (parseFloat(style.opacity) < 0.95 || (style.filter && style.filter !== 'none')) {
                    return true;
                }
                if (typeof current.className === 'string') {
                    const cls = current.className.toLowerCase();
                    if (cls.includes('skeleton') || cls.includes('loading') || cls.includes('spinner')) {
                        return true;
                    }
                }
                current = current.parentElement;
            }
            return false;
        };

        while (Date.now() < deadline) {
            let currentValue = null;

            // 1. Проверяем, что чип с нужным запросом уже появился
            const queryChip = document.querySelector('[data-marker="query/0"]');
            const chipText = queryChip ? queryChip.textContent.trim() : '';
            // Если чип еще не обновился на наш запрос — ждём
            if (!queryChip || chipText.toLowerCase() !== query.toLowerCase()) {
                lastValue = null;
                stableSince = Date.now();
                await sleep(200);
                continue;
            }

            // 2. Ищем элементы с текстом "Всего запросов"
            const allEls = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, strong, b');
            for (const el of allEls) {
                const txt = el.textContent.trim();
                // Проверяем, начинается ли текст с "Всего запросов"
                if (txt.startsWith('Всего запросов') && /\d/.test(txt)) {
                    // 3. Убеждаемся, что элемент НЕ перекрыт фильтром/opacity (состояние загрузки Авито)
                    if (!isFaded(el)) {
                        // Извлекаем цифры, включая возможные пробелы: "Всего запросов: 4 640"
                        const match = txt.match(/Всего запросов[^\d]*([\d\s\u00a0]+)/i);
                        if (match && match[1]) {
                            // Удаляем все нецифровые символы
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
                    // Значение появилось или изменилось — сбрасываем таймер
                    lastValue = currentValue;
                    stableSince = Date.now();
                } else if (Date.now() - stableSince >= 400) {
                    // Значение держится неизменным уже 0.4 секунды — значит оно финальное
                    return currentValue;
                }
            } else {
                // Если значения вообще нет (крутится лоадер или полупрозрачно), сбрасываем таймер
                lastValue = null;
                stableSince = Date.now();
            }

            await sleep(200);
        }
        return lastValue; // На крайний случай возвращаем то, что успели увидеть
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
        // Очищаем предыдущие чипы, если есть
        await clearPreviousQueries();

        statusEl.textContent = `🔍 Ввожу: ${query}`;

        // Находим поле ввода
        const input = await waitForSelector('[data-marker="query-suggest/search-input"]', 10000);
        if (!input) throw new Error('Поле ввода не найдено');

        // Очищаем поле (через крестик в инпуте, если он есть)
        const clearBtn = document.querySelector('[data-marker="query-suggest/clearButton"]');
        if (clearBtn && clearBtn.offsetParent !== null) {
            clearBtn.click();
            await randomDelay(0.2, 0.4);
        }

        // Кликаем, вводим текст
        input.focus();
        input.click();
        await randomDelay(0.1, 0.3);
        setNativeInputValue(input, query);

        // Рандомная задержка (имитация печати/раздумий)
        await randomDelay(0.4, 1.9);

        // Закрываем выпадающую подсказку (Escape)
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await randomDelay(0.2, 0.5);

        // Жмём «Смотреть аналитику»
        statusEl.textContent = `⏳ Жду кнопку...`;
        let clicked = false;
        const btnDeadline = Date.now() + 8000;
        while (Date.now() < btnDeadline) {
            const btn = document.querySelector('[data-marker="query-submit"]');
            if (btn && !btn.disabled) {
                btn.click();
                clicked = true;
                break;
            }
            await sleep(100);
        }
        if (!clicked) throw new Error('Кнопка "Смотреть аналитику" не стала активной');

        statusEl.textContent = `⏳ Загрузка данных: ${query}`;

        // Проверяем капчу
        await waitIfCaptcha();

        // Парсим число (ожидая стабилизации значения и отсутствия серого фильтра)
        const count = await extractCount(query, 15000);
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
                addRow(article, count);
                statusEl.textContent = `✅ ${article}: ${count}`;
            } catch (e) {
                results.push({ article, query, count: 'ошибка' });
                addRow(article, 'ошибка', true);
                statusEl.textContent = `❌ ${article}: ошибка`;
                console.error('[Avito Parser]', e);
            }

            currentIndex++;
            updateProgress();

            if (currentIndex < articles.length && isRunning) {
                statusEl.textContent = `⏱ Пауза перед следующим...`;
                // Пауза перед следующим запросом
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

    function addRow(article, count, err = false) {
        preview.style.display = 'block';
        const d = document.createElement('div');
        d.className = 'rr' + (err ? ' re' : '');
        d.textContent = err ? `✗ ${article} — ошибка` : `✓ ${article} — ${count}`;
        preview.insertBefore(d, preview.firstChild);
    }

    // ─── СОЗДАЁМ ПАНЕЛЬ (MINIMALIST UI) ───
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
        #cb { position: absolute; top: 12px; right: 12px; background: none; border: none; color: #86868b; cursor: pointer; font-size: 14px; padding: 4px; flex: none!important; line-height: 1; border-radius: 4px; transition: background 0.2s, color 0.2s; }
        #cb:hover { color: #f5f5f7; background: rgba(255, 255, 255, 0.1); }
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
    </div>`;
    document.body.appendChild(panel);

    // Элементы
    const btnStart = document.getElementById('bs');
    const btnPause = document.getElementById('bp');
    const btnSave = document.getElementById('bv');
    const progressBar = document.getElementById('pb');
    const statusEl = document.getElementById('st');
    const counterEl = document.getElementById('ct');
    const preview = document.getElementById('pv');
    const captchaWarn = document.getElementById('cw');
    const textareaEl = document.getElementById('ta');
    const collapseBtn = document.getElementById('cb');
    const bodyEl = document.getElementById('bd');

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
            e.preventDefault(); // Запрещаем браузеру начинать выделение текста

            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;

            // Временно отключаем выделение текста на всей странице для надежности
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

            // Используем passive: true для более плавного скролла/движения, если поддерживается
            document.addEventListener('mousemove', mv, { passive: true });
            document.addEventListener('mouseup', up);
        });
    })(panel);

    // ─── КНОПКИ ───
    btnStart.addEventListener('click', () => {
        if (isRunning) {
            isRunning = false; isPaused = false;
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
        captchaWarn.style.display = 'none';
        runParser();
    });

    btnPause.addEventListener('click', () => {
        if (!isRunning) return;
        isPaused = !isPaused;
        btnPause.textContent = isPaused ? '▶ Дальше' : '⏸ Пауза';
        statusEl.textContent = isPaused ? '⏸ Пауза...' : '▶ Продолжаем...';
    });

    btnSave.addEventListener('click', () => { if (results.length) downloadCSV(); });

    console.log('[Avito Wordstat Parser] ✅ Скрипт версии 1.5 загружен!');
})();
