// ==UserScript==
// @name         TecAlliance вЂ” РЎРєРѕРїРёСЂРѕРІР°С‚СЊ РЅРѕРјРµСЂР°
// @namespace    https://www.tecalliance.cn/
// @version      1.2
// @description  РџР»Р°РІР°СЋС‰Р°СЏ РєРЅРѕРїРєР°, СЃРѕР±РёСЂР°СЋС‰Р°СЏ РІСЃРµ OE-РЅРѕРјРµСЂР° Рё РЅРѕРјРµСЂР° Р°РЅР°Р»РѕРіРѕРІ (Basic Info) РЅР° СЃС‚СЂР°РЅРёС†Рµ Рё РєРѕРїРёСЂСѓСЋС‰Р°СЏ РёС… РІ Р±СѓС„РµСЂ РѕР±РјРµРЅР°
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

    // РќРµ РґРѕР±Р°РІР»СЏС‚СЊ РєРЅРѕРїРєСѓ РїРѕРІС‚РѕСЂРЅРѕ РїСЂРё SPA-РЅР°РІРёРіР°С†РёРё
    if (document.getElementById('tec-copy-btn')) return;

    /* в”Ђв”Ђ РљРЅРѕРїРєР° в”Ђв”Ђ */
    var btn = document.createElement('button');
    btn.id = 'tec-copy-btn';
    btn.textContent = 'рџ“‹ РЎРєРѕРїРёСЂРѕРІР°С‚СЊ РЅРѕРјРµСЂР°';
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

    /* в”Ђв”Ђ Р›РѕРіРёРєР° СЃР±РѕСЂР° РЅРѕРјРµСЂРѕРІ в”Ђв”Ђ */
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

        // 1. OE Numbers вЂ” СЃСЃС‹Р»РєРё РІРЅСѓС‚СЂРё .oens СЃ match_type=oe
        var oeLinks = document.querySelectorAll('.oens a[href*="match_type=oe"]');
        oeLinks.forEach(function (a) { add(a.textContent); });

        // Р—Р°РїР°СЃРЅРѕР№ РІР°СЂРёР°РЅС‚: Р»СЋР±Р°СЏ СЃСЃС‹Р»РєР° СЃ match_type=oe РЅР° СЃС‚СЂР°РЅРёС†Рµ
        if (oeLinks.length === 0) {
            document.querySelectorAll('a[href*="match_type=oe"]')
                    .forEach(function (a) { add(a.textContent); });
        }

        // 2. РђРЅР°Р»РѕРіРё вЂ” Р°СЂС‚РёРєСѓР»С‹ РІ Basic Info (tr.m-basic-info)
        document.querySelectorAll('tr.m-basic-info .basic-info h2.article-number a')
                .forEach(function (a) { add(a.textContent); });

        // Р—Р°РїР°СЃРЅРѕР№ РІР°СЂРёР°РЅС‚: Р»СЋР±РѕР№ h2.article-number a РЅР° СЃС‚СЂР°РЅРёС†Рµ
        if (numbers.length === 0) {
            document.querySelectorAll('h2.article-number a')
                    .forEach(function (a) { add(a.textContent); });
        }

        if (numbers.length === 0) {
            alert('вќЊ РќРѕРјРµСЂР° РЅРµ РЅР°Р№РґРµРЅС‹!\nР’РѕР·РјРѕР¶РЅРѕ, СЃС‚СЂР°РЅРёС†Р° РµС‰С‘ РЅРµ Р·Р°РіСЂСѓР·РёР»Р°СЃСЊ РёР»Рё СЃР°Р№С‚ РѕР±РЅРѕРІРёР»СЃСЏ.');
            return;
        }

        var text = numbers.join('\n');

        /* в”Ђв”Ђ РљРѕРїРёСЂРѕРІР°РЅРёРµ в”Ђв”Ђ */
        function onSuccess(n) {
            btn.textContent = 'вњ… ' + n + ' РЅРѕРјРµСЂРѕРІ!';
            setTimeout(function () { btn.textContent = 'рџ“‹ РЎРєРѕРїРёСЂРѕРІР°С‚СЊ РЅРѕРјРµСЂР°'; }, 3000);
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
                prompt('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё. РЎРєРѕРїРёСЂСѓР№С‚Рµ РІСЂСѓС‡РЅСѓСЋ (Ctrl+A в†’ Ctrl+C):', t);
            }
            document.body.removeChild(ta);
        }

        // GM_setClipboard вЂ” СЃР°РјС‹Р№ РЅР°РґС‘Р¶РЅС‹Р№ СЃРїРѕСЃРѕР± РІ Tampermonkey
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
