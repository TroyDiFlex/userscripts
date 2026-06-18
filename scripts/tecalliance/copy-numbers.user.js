// ==UserScript==
// @name         TecAlliance — Скопировать номера
// @namespace    https://www.tecalliance.cn/
// @version      1.3
// @description  Плавающая кнопка, собирающая все OE-номера и номера аналогов (Basic Info) на странице и копирующая их в буфер обмена
// @author       TroyDiFlex
// @match        https://www.tecalliance.cn/*/search/*
// @match        https://*.tecalliance.cn/*/search/*
// @match        https://tecalliance.net/*/search/*
// @match        https://*.tecalliance.net/*/search/*
// @updateURL    https://cdn.jsdelivr.net/gh/troydiflex/userscripts@main/scripts/tecalliance/copy-numbers.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/troydiflex/userscripts@main/scripts/tecalliance/copy-numbers.user.js
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // Не добавлять кнопку повторно при SPA-навигации
    if (document.getElementById('tec-copy-btn')) return;

    /* ── Кнопка ── */
    var btn = document.createElement('button');
    btn.id = 'tec-copy-btn';
    btn.textContent = '📋 Скопировать номера';
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
        btn.style.transform   = 'scale(1.06)';
        btn.style.boxShadow   = '0 6px 28px rgba(0,0,0,0.45)';
    };
    btn.onmouseleave = function () {
        btn.style.transform   = 'scale(1)';
        btn.style.boxShadow   = '0 4px 20px rgba(0,0,0,0.35)';
    };

    /* ── Логика сбора номеров ── */
    btn.onclick = function () {
        var numbers = [];
        var seen    = {};

        function add(s) {
            s = s.trim();
            if (s && !seen[s]) {
                seen[s] = true;
                numbers.push(s);
            }
        }

        // 1. OE Numbers — ссылки внутри .oens с match_type=oe
        var oeLinks = document.querySelectorAll('.oens a[href*="match_type=oe"]');
        oeLinks.forEach(function (a) { add(a.textContent); });

        // Запасной вариант: любая ссылка с match_type=oe на странице
        if (oeLinks.length === 0) {
            document.querySelectorAll('a[href*="match_type=oe"]')
                    .forEach(function (a) { add(a.textContent); });
        }

        // 2. Аналоги — артикулы в Basic Info (tr.m-basic-info)
        document.querySelectorAll('tr.m-basic-info .basic-info h2.article-number a')
                .forEach(function (a) { add(a.textContent); });

        // Запасной вариант: любой h2.article-number a на странице
        if (numbers.length === 0) {
            document.querySelectorAll('h2.article-number a')
                    .forEach(function (a) { add(a.textContent); });
        }

        if (numbers.length === 0) {
            alert('❌ Номера не найдены!\nВозможно, страница ещё не загрузилась или сайт обновился.');
            return;
        }

        var text = numbers.join('\n');

        /* ── Копирование ── */
        function onSuccess(n) {
            btn.textContent = '✅ ' + n + ' номеров!';
            setTimeout(function () { btn.textContent = '📋 Скопировать номера'; }, 3000);
        }

        function fallbackCopy(t, n) {
            var ta = document.createElement('textarea');
            ta.value = t;
            ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand('copy');
                onSuccess(n);
            } catch (e) {
                prompt('Не удалось скопировать автоматически. Скопируйте вручную (Ctrl+A → Ctrl+C):', t);
            }
            document.body.removeChild(ta);
        }

        // GM_setClipboard — самый надёжный способ в Tampermonkey
        if (typeof GM_setClipboard !== 'undefined') {
            GM_setClipboard(text, 'text');
            onSuccess(numbers.length);
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                function () { onSuccess(numbers.length); },
                function () { fallbackCopy(text, numbers.length); }
            );
        } else {
            fallbackCopy(text, numbers.length);
        }
    };

    document.body.appendChild(btn);

})();
