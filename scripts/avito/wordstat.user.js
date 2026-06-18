// ==UserScript==
// @name         Avito Wordstat вЂ” РђРІС‚РѕРїР°СЂСЃРµСЂ
// @namespace    https://avito.ru/
// @version      1.7
// @description  РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїРµСЂРµР±РёСЂР°РµС‚ Р°СЂС‚РёРєСѓР»С‹ Рё СЃРѕР±РёСЂР°РµС‚ СЃС‚Р°С‚РёСЃС‚РёРєСѓ СЃРїСЂРѕСЃР° СЃ РђРІРёС‚Рѕ Wordstat
// @author       TroyDiFlex
// @match        https://www.avito.ru/analytics/wordstat*
// @updateURL    https://cdn.jsdelivr.net/gh/troydiflex/userscripts@main/scripts/avito/wordstat.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/troydiflex/userscripts@main/scripts/avito/wordstat.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // в”Ђв”Ђв”Ђ РЎРћРЎРўРћРЇРќРР• в”Ђв”Ђв”Ђ
    let articles = [];
    let queries = [];
    let currentIndex = 0;
    let results = [];
    let isRunning = false;
    let isPaused = false;

    // в”Ђв”Ђв”Ђ Р РђРќР”РћРњРќРђРЇ Р—РђР”Р•Р Р–РљРђ в”Ђв”Ђв”Ђ
    function randomDelay(minSec = 0.4, maxSec = 1.9) {
        const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
        return new Promise(r => setTimeout(r, ms));
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // в”Ђв”Ђв”Ђ РЈР‘РР РђР•Рњ VRN РЎ РљРћРќР¦Рђ в”Ђв”Ђв”Ђ
    function stripVRN(art) {
        art = art.trim();
        if (art.toUpperCase().endsWith('VRN')) return art.slice(0, -3).trim();
        return art;
    }

    // в”Ђв”Ђв”Ђ Р Р•РђРљРў-РЎРћР’РњР•РЎРўРРњР«Р™ Р’Р’РћР” Р—РќРђР§Р•РќРРЇ в”Ђв”Ђв”Ђ
    function setNativeInputValue(input, value) {
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // в”Ђв”Ђв”Ђ Р–Р”РЃРњ РџРћРЇР’Р›Р•РќРРЇ Р­Р›Р•РњР•РќРўРђ в”Ђв”Ђв”Ђ
    async function waitForSelector(selector, timeout = 15000) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(200);
        }
        return null;
    }

    // в”Ђв”Ђв”Ђ РћР§РРЎРўРљРђ РџР Р•Р”Р«Р”РЈР©РРҐ Р—РђРџР РћРЎРћР’ (Р§РРџРћР’) в”Ђв”Ђв”Ђ
    async function clearPreviousQueries() {
        // РС‰РµРј РІСЃРµ РєСЂРµСЃС‚РёРєРё Сѓ РґРѕР±Р°РІР»РµРЅРЅС‹С… Р·Р°РїСЂРѕСЃРѕРІ
        let closeBtns = document.querySelectorAll('[data-marker="close-button"]');
        for (const btn of closeBtns) {
            btn.click();
            await sleep(150);
        }

        // Р–РґРµРј, РїРѕРєР° СЃС‚Р°СЂС‹Рµ С‡РёРїС‹ РёСЃС‡РµР·РЅСѓС‚ (РјР°РєСЃ 3 СЃРµРє)
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
            const chips = document.querySelectorAll('[data-marker^="query/"]');
            if (chips.length === 0) break; // РЈСЂР°, СЃС‚Р°СЂС‹Рµ РґР°РЅРЅС‹Рµ РёСЃС‡РµР·Р»Рё

            // Р•СЃР»Рё РєСЂРµСЃС‚РёРєРё РµС‰Рµ РѕСЃС‚Р°Р»РёСЃСЊ, РЅР°Р¶РјРµРј РµС‰Рµ СЂР°Р· (Р·Р°С‰РёС‚Р° РѕС‚ РіР»СЋРєРѕРІ РђРІРёС‚Рѕ)
            closeBtns = document.querySelectorAll('[data-marker="close-button"]');
            for (const btn of closeBtns) btn.click();

            await sleep(100);
        }
    }

    // в”Ђв”Ђв”Ђ РР—Р’Р›Р•Р§Р•РќРР• Р§РРЎР›Рђ Р—РђРџР РћРЎРћР’ в”Ђв”Ђв”Ђ
    async function extractCount(query, timeout = 20000) {
        const deadline = Date.now() + timeout;
        let lastValue = null;
        let stableSince = Date.now();

        // Р’СЃРїРѕРјРѕРіР°С‚РµР»СЊРЅР°СЏ С„СѓРЅРєС†РёСЏ РґР»СЏ РїСЂРѕРІРµСЂРєРё Р·Р°РіСЂСѓР·РѕС‡РЅРѕРіРѕ СЃС‚РµР№С‚Р° (РїРѕР»СѓРїСЂРѕР·СЂР°С‡РЅРѕСЃС‚СЊ)
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

            // 1. РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ С‡РёРї СЃ РЅСѓР¶РЅС‹Рј Р·Р°РїСЂРѕСЃРѕРј СѓР¶Рµ РїРѕСЏРІРёР»СЃСЏ
            const queryChip = document.querySelector('[data-marker="query/0"]');
            const chipText = queryChip ? queryChip.textContent.trim() : '';
            // Р•СЃР»Рё С‡РёРї РµС‰Рµ РЅРµ РѕР±РЅРѕРІРёР»СЃСЏ РЅР° РЅР°С€ Р·Р°РїСЂРѕСЃ вЂ” Р¶РґС‘Рј
            if (!queryChip || chipText.toLowerCase() !== query.toLowerCase()) {
                lastValue = null;
                stableSince = Date.now();
                await sleep(200);
                continue;
            }

            // 2. РС‰РµРј СЌР»РµРјРµРЅС‚С‹ СЃ С‚РµРєСЃС‚РѕРј "Р’СЃРµРіРѕ Р·Р°РїСЂРѕСЃРѕРІ"
            const allEls = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, strong, b');
            for (const el of allEls) {
                const txt = el.textContent.trim();
                // РџСЂРѕРІРµСЂСЏРµРј, РЅР°С‡РёРЅР°РµС‚СЃСЏ Р»Рё С‚РµРєСЃС‚ СЃ "Р’СЃРµРіРѕ Р·Р°РїСЂРѕСЃРѕРІ"
                if (txt.startsWith('Р’СЃРµРіРѕ Р·Р°РїСЂРѕСЃРѕРІ') && /\d/.test(txt)) {
                    // 3. РЈР±РµР¶РґР°РµРјСЃСЏ, С‡С‚Рѕ СЌР»РµРјРµРЅС‚ РќР• РїРµСЂРµРєСЂС‹С‚ С„РёР»СЊС‚СЂРѕРј/opacity (СЃРѕСЃС‚РѕСЏРЅРёРµ Р·Р°РіСЂСѓР·РєРё РђРІРёС‚Рѕ)
                    if (!isFaded(el)) {
                        // РР·РІР»РµРєР°РµРј С†РёС„СЂС‹, РІРєР»СЋС‡Р°СЏ РІРѕР·РјРѕР¶РЅС‹Рµ РїСЂРѕР±РµР»С‹: "Р’СЃРµРіРѕ Р·Р°РїСЂРѕСЃРѕРІ: 4 640"
                        const match = txt.match(/Р’СЃРµРіРѕ Р·Р°РїСЂРѕСЃРѕРІ[^\d]*([\d\s\u00a0]+)/i);
                        if (match && match[1]) {
                            // РЈРґР°Р»СЏРµРј РІСЃРµ РЅРµС†РёС„СЂРѕРІС‹Рµ СЃРёРјРІРѕР»С‹
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
                    // Р—РЅР°С‡РµРЅРёРµ РїРѕСЏРІРёР»РѕСЃСЊ РёР»Рё РёР·РјРµРЅРёР»РѕСЃСЊ вЂ” СЃР±СЂР°СЃС‹РІР°РµРј С‚Р°Р№РјРµСЂ
                    lastValue = currentValue;
                    stableSince = Date.now();
                } else if (Date.now() - stableSince >= 400) {
                    // Р—РЅР°С‡РµРЅРёРµ РґРµСЂР¶РёС‚СЃСЏ РЅРµРёР·РјРµРЅРЅС‹Рј СѓР¶Рµ 0.4 СЃРµРєСѓРЅРґС‹ вЂ” Р·РЅР°С‡РёС‚ РѕРЅРѕ С„РёРЅР°Р»СЊРЅРѕРµ
                    return currentValue;
                }
            } else {
                // Р•СЃР»Рё Р·РЅР°С‡РµРЅРёСЏ РІРѕРѕР±С‰Рµ РЅРµС‚ (РєСЂСѓС‚РёС‚СЃСЏ Р»РѕР°РґРµСЂ РёР»Рё РїРѕР»СѓРїСЂРѕР·СЂР°С‡РЅРѕ), СЃР±СЂР°СЃС‹РІР°РµРј С‚Р°Р№РјРµСЂ
                lastValue = null;
                stableSince = Date.now();
            }

            await sleep(200);
        }
        return lastValue; // РќР° РєСЂР°Р№РЅРёР№ СЃР»СѓС‡Р°Р№ РІРѕР·РІСЂР°С‰Р°РµРј С‚Рѕ, С‡С‚Рѕ СѓСЃРїРµР»Рё СѓРІРёРґРµС‚СЊ
    }

    // в”Ђв”Ђв”Ђ РџР РћР’Р•Р РљРђ РљРђРџР§Р в”Ђв”Ђв”Ђ
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
            statusEl.textContent = 'вљ пёЏ РљР°РїС‡Р°! Р РµС€РёС‚Рµ РµС‘, СЃРєСЂРёРїС‚ РїРѕРґРѕР¶РґС‘С‚...';
            while (isCaptcha()) await sleep(1000);
            captchaWarn.style.display = 'none';
            await randomDelay(1, 2);
        }
    }

    // в”Ђв”Ђв”Ђ РћР‘Р РђР‘РћРўРљРђ РћР”РќРћР“Рћ РђР РўРРљРЈР›Рђ в”Ђв”Ђв”Ђ
    async function processOne(article, query) {
        // РћС‡РёС‰Р°РµРј РїСЂРµРґС‹РґСѓС‰РёРµ С‡РёРїС‹, РµСЃР»Рё РµСЃС‚СЊ
        await clearPreviousQueries();

        statusEl.textContent = `рџ”Ќ Р’РІРѕР¶Сѓ: ${query}`;

        // РќР°С…РѕРґРёРј РїРѕР»Рµ РІРІРѕРґР°
        const input = await waitForSelector('[data-marker="query-suggest/search-input"]', 10000);
        if (!input) throw new Error('РџРѕР»Рµ РІРІРѕРґР° РЅРµ РЅР°Р№РґРµРЅРѕ');

        // РћС‡РёС‰Р°РµРј РїРѕР»Рµ (С‡РµСЂРµР· РєСЂРµСЃС‚РёРє РІ РёРЅРїСѓС‚Рµ, РµСЃР»Рё РѕРЅ РµСЃС‚СЊ)
        const clearBtn = document.querySelector('[data-marker="query-suggest/clearButton"]');
        if (clearBtn && clearBtn.offsetParent !== null) {
            clearBtn.click();
            await randomDelay(0.2, 0.4);
        }

        // РљР»РёРєР°РµРј, РІРІРѕРґРёРј С‚РµРєСЃС‚
        input.focus();
        input.click();
        await randomDelay(0.1, 0.3);
        setNativeInputValue(input, query);

        // Р Р°РЅРґРѕРјРЅР°СЏ Р·Р°РґРµСЂР¶РєР° (РёРјРёС‚Р°С†РёСЏ РїРµС‡Р°С‚Рё/СЂР°Р·РґСѓРјРёР№)
        await randomDelay(0.4, 1.9);

        // Р—Р°РєСЂС‹РІР°РµРј РІС‹РїР°РґР°СЋС‰СѓСЋ РїРѕРґСЃРєР°Р·РєСѓ (Escape)
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await randomDelay(0.2, 0.5);

        // Р–РјС‘Рј В«РЎРјРѕС‚СЂРµС‚СЊ Р°РЅР°Р»РёС‚РёРєСѓВ»
        statusEl.textContent = `вЏі Р–РґСѓ РєРЅРѕРїРєСѓ...`;
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
        if (!clicked) throw new Error('РљРЅРѕРїРєР° "РЎРјРѕС‚СЂРµС‚СЊ Р°РЅР°Р»РёС‚РёРєСѓ" РЅРµ СЃС‚Р°Р»Р° Р°РєС‚РёРІРЅРѕР№');

        statusEl.textContent = `вЏі Р—Р°РіСЂСѓР·РєР° РґР°РЅРЅС‹С…: ${query}`;

        // РџСЂРѕРІРµСЂСЏРµРј РєР°РїС‡Сѓ
        await waitIfCaptcha();

        // РџР°СЂСЃРёРј С‡РёСЃР»Рѕ (РѕР¶РёРґР°СЏ СЃС‚Р°Р±РёР»РёР·Р°С†РёРё Р·РЅР°С‡РµРЅРёСЏ Рё РѕС‚СЃСѓС‚СЃС‚РІРёСЏ СЃРµСЂРѕРіРѕ С„РёР»СЊС‚СЂР°)
        const count = await extractCount(query, 15000);
        return count !== null ? String(count) : 'РЅ/Рґ';
    }

    // в”Ђв”Ђв”Ђ РћРЎРќРћР’РќРћР™ Р¦РРљР› в”Ђв”Ђв”Ђ
    async function runParser() {
        isRunning = true;
        isPaused = false;
        btnStart.textContent = 'вЏ№ РЎС‚РѕРї';
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
                statusEl.textContent = `вњ… ${article}: ${count}`;
            } catch (e) {
                results.push({ article, query, count: 'РѕС€РёР±РєР°' });
                addRow(article, 'РѕС€РёР±РєР°', true);
                statusEl.textContent = `вќЊ ${article}: РѕС€РёР±РєР°`;
                console.error('[Avito Parser]', e);
            }

            currentIndex++;
            updateProgress();

            if (currentIndex < articles.length && isRunning) {
                statusEl.textContent = `вЏ± РџР°СѓР·Р° РїРµСЂРµРґ СЃР»РµРґСѓСЋС‰РёРј...`;
                // РџР°СѓР·Р° РїРµСЂРµРґ СЃР»РµРґСѓСЋС‰РёРј Р·Р°РїСЂРѕСЃРѕРј
                await randomDelay(0.4, 1.9);
            }
        }

        if (currentIndex >= articles.length) {
            statusEl.textContent = `рџЋ‰ Р“РѕС‚РѕРІРѕ! ${articles.length} С€С‚.`;
        } else {
            statusEl.textContent = `вЏ№ РћСЃС‚Р°РЅРѕРІР»РµРЅРѕ РЅР° ${currentIndex}/${articles.length}`;
        }
        isRunning = false;
        btnStart.textContent = 'в–¶ Р—Р°РЅРѕРІРѕ';
        btnPause.disabled = true;
        btnSave.disabled = results.length === 0;
    }

    // в”Ђв”Ђв”Ђ CSV РЎРљРђР§РР’РђРќРР• в”Ђв”Ђв”Ђ
    function downloadCSV() {
        const BOM = '\uFEFF';
        const hdr = 'РђСЂС‚РёРєСѓР»;Р—Р°РїСЂРѕСЃ;РљРѕР»РёС‡РµСЃС‚РІРѕ Р·Р°РїСЂРѕСЃРѕРІ\n';
        const rows = results.map(r => `${r.article};${r.query};${r.count}`).join('\n');
        const blob = new Blob([BOM + hdr + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `avito_wordstat_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // в”Ђв”Ђв”Ђ UI РҐР•Р›РџР•Р Р« в”Ђв”Ђв”Ђ
    function updateProgress() {
        const pct = articles.length > 0 ? (currentIndex / articles.length) * 100 : 0;
        progressBar.style.width = pct + '%';
        counterEl.textContent = `${currentIndex} / ${articles.length}`;
    }

    function addRow(article, count, err = false) {
        preview.style.display = 'block';
        const d = document.createElement('div');
        d.className = 'rr' + (err ? ' re' : '');
        d.textContent = err ? `вњ— ${article} вЂ” РѕС€РёР±РєР°` : `вњ“ ${article} вЂ” ${count}`;
        preview.insertBefore(d, preview.firstChild);
    }

    // в”Ђв”Ђв”Ђ РЎРћР—Р”РђРЃРњ РџРђРќР•Р›Р¬ (MINIMALIST UI) в”Ђв”Ђв”Ђ
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

        /* РЎС‚РёР»РёР·Р°С†РёСЏ СЃРєСЂРѕР»Р»Р±Р°СЂР° РґР»СЏ textarea Рё РїСЂРµРІСЊСЋ */
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
    <h3 id="hdr">рџ“Љ РџР°СЂСЃРµСЂ Wordstat <button id="cb" title="РЎРІРµСЂРЅСѓС‚СЊ">в–І</button></h3>
    <div id="bd">
        <div class="lbl">РђСЂС‚РёРєСѓР»С‹:</div>
        <textarea id="ta" placeholder="Р’СЃС‚Р°РІСЊС‚Рµ Р°СЂС‚РёРєСѓР»С‹...&#10;РџР РРњР•Р 123VRN&#10;Р”Р РЈР“РћР™456"></textarea>
        <div class="br">
            <button id="bs">в–¶ РЎС‚Р°СЂС‚</button>
            <button id="bp" disabled>вЏё РџР°СѓР·Р°</button>
            <button id="bv" disabled>рџ’ѕ CSV</button>
        </div>
        <div id="cw">вљ пёЏ РљР°РїС‡Р°! Р РµС€РёС‚Рµ РµС‘, СЃРєСЂРёРїС‚ РїРѕРґРѕР¶РґС‘С‚</div>
        <div class="pw"><div id="pb"></div></div>
        <div class="sr">
            <div id="st">Р“РѕС‚РѕРІ Рє СЂР°Р±РѕС‚Рµ</div>
            <div id="ct">0 / 0</div>
        </div>
        <div id="pv"></div>
    </div>`;
    document.body.appendChild(panel);

    // Р­Р»РµРјРµРЅС‚С‹
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

    // РЎРІРµСЂРЅСѓС‚СЊ
    let collapsed = false;
    collapseBtn.addEventListener('click', () => {
        collapsed = !collapsed;
        bodyEl.style.display = collapsed ? 'none' : '';
        collapseBtn.textContent = collapsed ? 'в–ј' : 'в–І';
    });

    // РџРµСЂРµС‚Р°СЃРєРёРІР°РЅРёРµ
    (function drag(el) {
        let sx, sy, ox, oy;
        const h = document.getElementById('hdr');
        h.addEventListener('mousedown', e => {
            if (e.target.id === 'cb') return;
            e.preventDefault(); // Р—Р°РїСЂРµС‰Р°РµРј Р±СЂР°СѓР·РµСЂСѓ РЅР°С‡РёРЅР°С‚СЊ РІС‹РґРµР»РµРЅРёРµ С‚РµРєСЃС‚Р°

            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;

            // Р’СЂРµРјРµРЅРЅРѕ РѕС‚РєР»СЋС‡Р°РµРј РІС‹РґРµР»РµРЅРёРµ С‚РµРєСЃС‚Р° РЅР° РІСЃРµР№ СЃС‚СЂР°РЅРёС†Рµ РґР»СЏ РЅР°РґРµР¶РЅРѕСЃС‚Рё
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

            // РСЃРїРѕР»СЊР·СѓРµРј passive: true РґР»СЏ Р±РѕР»РµРµ РїР»Р°РІРЅРѕРіРѕ СЃРєСЂРѕР»Р»Р°/РґРІРёР¶РµРЅРёСЏ, РµСЃР»Рё РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ
            document.addEventListener('mousemove', mv, { passive: true });
            document.addEventListener('mouseup', up);
        });
    })(panel);

    // в”Ђв”Ђв”Ђ РљРќРћРџРљР в”Ђв”Ђв”Ђ
    btnStart.addEventListener('click', () => {
        if (isRunning) {
            isRunning = false; isPaused = false;
            btnStart.textContent = 'в–¶ РЎС‚Р°СЂС‚';
            btnPause.textContent = 'вЏё РџР°СѓР·Р°'; btnPause.disabled = true;
            btnSave.disabled = results.length === 0;
            statusEl.textContent = 'РћСЃС‚Р°РЅРѕРІР»РµРЅРѕ';
            return;
        }
        const raw = textareaEl.value.trim();
        if (!raw) { statusEl.textContent = 'вљ пёЏ Р’РІРµРґРёС‚Рµ Р°СЂС‚РёРєСѓР»С‹!'; return; }
        const lines = raw.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
        if (!lines.length) { statusEl.textContent = 'вљ пёЏ РќРµС‚ Р°СЂС‚РёРєСѓР»РѕРІ!'; return; }
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
        btnPause.textContent = isPaused ? 'в–¶ Р”Р°Р»СЊС€Рµ' : 'вЏё РџР°СѓР·Р°';
        statusEl.textContent = isPaused ? 'вЏё РџР°СѓР·Р°...' : 'в–¶ РџСЂРѕРґРѕР»Р¶Р°РµРј...';
    });

    btnSave.addEventListener('click', () => { if (results.length) downloadCSV(); });

    console.log('[Avito Wordstat Parser] вњ… РЎРєСЂРёРїС‚ РІРµСЂСЃРёРё 1.5 Р·Р°РіСЂСѓР¶РµРЅ!');
})();
