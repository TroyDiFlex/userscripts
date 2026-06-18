// ==UserScript==
// @name         TecAlliance вЂ” РЎРєРѕРїРёСЂРѕРІР°С‚СЊ РїСЂРёРјРµРЅРёРјРѕСЃС‚СЊ
// @namespace    https://www.tecalliance.cn/
// @version      1.5
// @description  РџР»Р°РІР°СЋС‰Р°СЏ РєРЅРѕРїРєР°, СЃРѕР±РёСЂР°СЋС‰Р°СЏ РїСЂРёРјРµРЅРёРјРѕСЃС‚СЊ (Р°РІС‚РѕРјРѕР±РёР»Рё) Рё РєРѕРїРёСЂСѓСЋС‰Р°СЏ РёС… РІ 5 СЃС‚РѕР»Р±С†РѕРІ РґР»СЏ Google РўР°Р±Р»РёС†
// @author       TroyDiFlex
// @match        https://www.tecalliance.cn/*/part/*
// @match        https://*.tecalliance.cn/*/part/*
// @match        https://tecalliance.net/*/part/*
// @match        https://*.tecalliance.net/*/part/*
// @updateURL    https://cdn.jsdelivr.net/gh/troydiflex/userscripts@main/scripts/tecalliance/copy-applicability.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/troydiflex/userscripts@main/scripts/tecalliance/copy-applicability.user.js
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // РќРµ РґРѕР±Р°РІР»СЏС‚СЊ РєРЅРѕРїРєСѓ РїРѕРІС‚РѕСЂРЅРѕ РїСЂРё РЅР°РІРёРіР°С†РёРё (SPA)
    if (document.getElementById('tec-copy-app-btn')) return;

    /* в”Ђв”Ђ РљРЅРѕРїРєР° в”Ђв”Ђ */
    var btn = document.createElement('button');
    btn.id = 'tec-copy-app-btn';
    btn.textContent = 'рџљ— РЎРєРѕРїРёСЂРѕРІР°С‚СЊ РїСЂРёРјРµРЅРёРјРѕСЃС‚СЊ';
    btn.style.cssText = [
        'position:fixed',
        'bottom:24px',
        'right:24px',
        'z-index:999999',
        'background:linear-gradient(135deg,#1a73e8,#0d47a1)',
        'color:#fff',
        'border:none',
        'border-radius:12px',
        'padding:14px 22px',
        'font-size:15px',
        'font-weight:700',
        'cursor:pointer',
        'box-shadow:0 4px 20px rgba(0,0,0,0.35)',
        'letter-spacing:.3px',
        'transition:transform .15s,box-shadow .15s',
        'font-family:system-ui,sans-serif',
    ].join(';');

    btn.onmouseenter = function () {
        btn.style.transform = 'scale(1.06)';
        btn.style.boxShadow = '0 6px 28px rgba(0,0,0,0.45)';
    };
    btn.onmouseleave = function () {
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = '0 4px 20px rgba(0,0,0,0.35)';
    };

    /* в”Ђв”Ђ Р›РѕРіРёРєР° СЃР±РѕСЂР° РїСЂРёРјРµРЅРёРјРѕСЃС‚Рё в”Ђв”Ђ */
    btn.onclick = function () {
        var rows = document.querySelectorAll('table.v-table tbody tr');

        // 5 СЃС‚РѕР»Р±С†РѕРІ: РњР°СЂРєР°, РњРѕРґРµР»СЊ, РџР»Р°С‚С„РѕСЂРјР°, РњРѕРґРёС„РёРєР°С†РёСЏ, РљРѕРґ РґРІРёРіР°С‚РµР»СЏ
        // Р”Р»СЏ РєР°Р¶РґРѕРіРѕ СЃС‚РѕР»Р±С†Р° СЃРѕР±РёСЂР°РµРј СѓРЅРёРєР°Р»СЊРЅС‹Рµ Р·РЅР°С‡РµРЅРёСЏ (СЃ СЃРѕС…СЂР°РЅРµРЅРёРµРј РїРѕСЂСЏРґРєР°)
        var columns = [[], [], [], [], []];
        var seenPerCol = [{}, {}, {}, {}, {}];

        // Р”РѕР±Р°РІР»СЏРµС‚ Р·РЅР°С‡РµРЅРёРµ РІ СЃС‚РѕР»Р±РµС†, РµСЃР»Рё РµРіРѕ С‚Р°Рј РµС‰С‘ РЅРµС‚
        function addUnique(colIndex, value) {
            if (!value) return;
            // Р Р°Р·Р±РёРІР°РµРј РїРѕ В«;В» вЂ” РєР°Р¶РґР°СЏ С‡Р°СЃС‚СЊ РєР°Рє РѕС‚РґРµР»СЊРЅРѕРµ Р·РЅР°С‡РµРЅРёРµ
            value.split(';').forEach(function (part) {
                var v = part.trim();
                if (v && !seenPerCol[colIndex][v]) {
                    seenPerCol[colIndex][v] = true;
                    columns[colIndex].push(v);
                }
            });
        }

        rows.forEach(function (tr) {
            var tds = tr.querySelectorAll('td');
            if (tds.length < 7) return;

            var brandText = tds[0] ? tds[0].textContent.trim() : "";
            var modelText = tds[1] ? tds[1].textContent.trim() : "";
            var platformText = tds[2] ? tds[2].textContent.trim() : "";
            var vTypeText = tds[3] ? tds[3].textContent.trim() : "";

            // --- РћС‡РёСЃС‚РєР° РјРѕРґРёС„РёРєР°С†РёРё ---
            var modClean = vTypeText
                .replace(/\b\d[\.,]\d\b/gi, '')
                .replace(/\b(AWD|FWD|RWD|Hybrid|MHEV|4WD|EV|xDrive|sDrive|4x4|quattro|4motion|4MATIC)\b/gi, '')
                .replace(/(All-wheel Drive|Front-Wheel Drive|Rear-Wheel Drive)/gi, '')
                .replace(/\s+-\s*$/g, '')
                .replace(/^\s*-\s+/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            // --- РР·РІР»РµС‡РµРЅРёРµ Engine Code ---
            var engineRaw = tds[6] ? tds[6].textContent.trim() : "";
            var engineParts = engineRaw.split('/');
            var engineCode = "";
            if (engineParts.length >= 5) {
                engineCode = engineParts.slice(4).join('/').trim();
            }

            addUnique(0, brandText);
            addUnique(1, modelText);
            addUnique(2, platformText);
            addUnique(3, modClean);
            addUnique(4, engineCode);
        });

        // РќР°С…РѕРґРёРј РјР°РєСЃРёРјР°Р»СЊРЅСѓСЋ РґР»РёРЅСѓ СЃСЂРµРґРё СЃС‚РѕР»Р±С†РѕРІ
        var maxRows = Math.max.apply(null, columns.map(function (col) { return col.length; }));

        if (maxRows === 0) {
            alert('вќЊ РџСЂРёРјРµРЅРёРјРѕСЃС‚СЊ РЅРµ РЅР°Р№РґРµРЅР°!\nРЈР±РµРґРёС‚РµСЃСЊ, С‡С‚Рѕ С‚Р°Р±Р»РёС†Р° СЃ Р°РІС‚РѕРјРѕР±РёР»СЏРјРё ("Compatible Vehicles") Р·Р°РіСЂСѓР¶РµРЅР° РЅР° СЃС‚СЂР°РЅРёС†Рµ.');
            return;
        }

        // РЎРѕР±РёСЂР°РµРј СЃС‚СЂРѕРєРё: РєР°Р¶РґР°СЏ СЃС‚СЂРѕРєР° вЂ” Р·РЅР°С‡РµРЅРёСЏ РёР· 5 СЃС‚РѕР»Р±С†РѕРІ С‡РµСЂРµР· С‚Р°Р±СѓР»СЏС†РёСЋ
        var outputLines = [];
        for (var i = 0; i < maxRows; i++) {
            var row = [];
            for (var c = 0; c < 5; c++) {
                row.push(columns[c][i] || '');
            }
            outputLines.push(row.join('\t'));
        }

        var text = outputLines.join('\n');

        /* в”Ђв”Ђ Р›РѕРіРёРєР° РєРѕРїРёСЂРѕРІР°РЅРёСЏ РІ Р±СѓС„РµСЂ в”Ђв”Ђ */
        function onSuccess(n) {
            btn.textContent = 'вњ… ' + n + ' Р°РІС‚Рѕ!';
            setTimeout(function () { btn.textContent = 'рџљ— РЎРєРѕРїРёСЂРѕРІР°С‚СЊ РїСЂРёРјРµРЅРёРјРѕСЃС‚СЊ'; }, 3000);
        }

        function fallbackCopy(t, n) {
            var ta = document.createElement('textarea');
            ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
            ta.value = t;
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand('copy');
                onSuccess(n);
            } catch (e) {
                prompt('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё. РЎРєРѕРїРёСЂСѓР№С‚Рµ РІСЂСѓС‡РЅСѓСЋ (Ctrl+A в†’ Ctrl+C):', t);
            }
            document.body.removeChild(ta);
        }

        // РџС‹С‚Р°РµРјСЃСЏ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ СЃР°РјС‹РјРё РЅР°РґРµР¶РЅС‹РјРё СЃРїРѕСЃРѕР±Р°РјРё
        if (typeof GM_setClipboard !== 'undefined') {
            GM_setClipboard(text, 'text');
            onSuccess(outputLines.length);
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                function () { onSuccess(outputLines.length); },
                function () { fallbackCopy(text, outputLines.length); }
            );
        } else {
            fallbackCopy(text, outputLines.length);
        }
    };

    document.body.appendChild(btn);

})();
