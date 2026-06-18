// ==UserScript==
// @name         РџРѕРјРѕС‰РЅРёРє Р°РєС‚СѓР°Р»РёР·Р°С†РёРё С†РµРЅ
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  РђРЅР°Р»РёР·РёСЂСѓРµС‚ РїРµСЂРІС‹Рµ N РѕР±СЉСЏРІР»РµРЅРёР№ РєРѕРЅРєСѓСЂРµРЅС‚РѕРІ, РїРѕРґСЃРІРµС‡РёРІР°РµС‚ РїРѕ С†РµРЅРµ Рё СЃС‡РёС‚Р°РµС‚ СЂРµРєРѕРјРµРЅРґСѓРµРјСѓСЋ С†РµРЅСѓ СЃ РЅР°С†РµРЅРєРѕР№
// @author       TroyDiFlex
// @match        https://www.avito.ru/*
// @updateURL    https://cdn.jsdelivr.net/gh/troydiflex/userscripts@main/scripts/avito/price-helper.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/troydiflex/userscripts@main/scripts/avito/price-helper.user.js
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';



    // в•”в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•—
    // в•‘                    вљ™пёЏ  РќРђРЎРўР РћР™РљР                            в•‘
    // в•љв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ќ

    const CONFIG = {

        // РЎРєРѕР»СЊРєРѕ РїРµСЂРІС‹С… РѕР±СЉСЏРІР»РµРЅРёР№ Р°РЅР°Р»РёР·РёСЂРѕРІР°С‚СЊ (РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ 8)
        РљРћР›РР§Р•РЎРўР’Рћ_РћР‘РЄРЇР’Р›Р•РќРР™: 8,

        // РџСЂРѕС†РµРЅС‚ РЅР°С†РµРЅРєРё (РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ 10)
        РџР РћР¦Р•РќРў_РќРђР¦Р•РќРљР: 10,

        // РњРёРЅРёРјР°Р»СЊРЅР°СЏ С†РµРЅР°, РєРѕС‚РѕСЂСѓСЋ СѓС‡РёС‚С‹РІР°РµРј (РІСЃС‘ С‡С‚Рѕ РЅРёР¶Рµ вЂ” РёРіРЅРѕСЂРёСЂСѓРµС‚СЃСЏ).
        // В«Р‘РµСЃРїР»Р°С‚РЅРѕВ» Рё В«Р¦РµРЅР° РЅРµ СѓРєР°Р·Р°РЅР°В» РёРіРЅРѕСЂРёСЂСѓСЋС‚СЃСЏ РІСЃРµРіРґР°.
        РњРРќРРњРђР›Р¬РќРђРЇ_Р¦Р•РќРђ: 100,

        // Р—Р°РґРµСЂР¶РєР° РїРµСЂРІРѕРіРѕ Р·Р°РїСѓСЃРєР° (РјСЃ).
        // Р•СЃР»Рё СЃС‚СЂР°РЅРёС†Р° Р·Р°РіСЂСѓР¶Р°РµС‚СЃСЏ РґРѕР»РіРѕ, СЃРєСЂРёРїС‚ РјРѕР¶РµС‚ РЅРµ СЃСЂР°Р±РѕС‚Р°С‚СЊ вЂ”
        // РїРѕРїСЂРѕР±СѓР№С‚Рµ СѓРІРµР»РёС‡РёС‚СЊ СЌС‚Рѕ Р·РЅР°С‡РµРЅРёРµ (РЅР°РїСЂРёРјРµСЂ, РґРѕ 3000).
        Р—РђР”Р•Р Р–РљРђ_РџР•Р Р’РћР“Рћ_Р—РђРџРЈРЎРљРђ: 10,

        // Р—Р°РґРµСЂР¶РєР° РїРѕРІС‚РѕСЂРЅРѕРіРѕ РїРµСЂРµСЃС‡С‘С‚Р° РїРѕСЃР»Рµ РЅР°РІРёРіР°С†РёРё РїРѕ СЃР°Р№С‚Сѓ (РјСЃ).
        Р—РђР”Р•Р Р–РљРђ_РџР•Р Р•РЎР§РЃРўРђ: 10,
    };

    // ========== РЎРўРР›Р ==========
    GM_addStyle(`
        .tm-calc-price {
            display: inline-block;
            margin-left: 8px;
            padding: 2px 7px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 700;
            color: #1a1a1a;
            background: rgba(255,255,255,0.75);
            backdrop-filter: blur(4px);
            border: 1px solid rgba(0,0,0,0.12);
            vertical-align: middle;
            letter-spacing: 0.3px;
            white-space: nowrap;
        }

        .tm-highlight-green [data-marker="item-price-value"] {
            background: #2ecc40 !important;
            color: #fff !important;
            padding: 2px 8px !important;
            border-radius: 6px !important;
            text-shadow: 0 1px 2px rgba(0,0,0,0.25);
        }
        .tm-highlight-yellow [data-marker="item-price-value"] {
            background: #f1c40f !important;
            color: #1a1a1a !important;
            padding: 2px 8px !important;
            border-radius: 6px !important;
        }
        .tm-highlight-red [data-marker="item-price-value"] {
            background: #e74c3c !important;
            color: #fff !important;
            padding: 2px 8px !important;
            border-radius: 6px !important;
            text-shadow: 0 1px 2px rgba(0,0,0,0.25);
        }
        .tm-highlight-grey [data-marker="item-price-value"] {
            background: #95a5a6 !important;
            color: #fff !important;
            padding: 2px 8px !important;
            border-radius: 6px !important;
            text-shadow: 0 1px 2px rgba(0,0,0,0.25);
        }
    `);

    // ========== Р›РћР“РРљРђ ==========

    /**
     * Р’С‹С‡РёСЃР»СЏРµС‚: С†РµРЅР° Г— 1.1, РѕРєСЂСѓРіР»РµРЅРёРµ РІРІРµСЂС… РґРѕ СЃРѕС‚РµРЅ, РјРёРЅСѓСЃ 1
     */
    function calcMarkup(price) {
        const multiplier = 1 + CONFIG.РџР РћР¦Р•РќРў_РќРђР¦Р•РќРљР / 100;
        const multiplied = price * multiplier;
        const roundedUp = Math.ceil(multiplied / 100) * 100;
        return roundedUp - 1;
    }

    /**
     * РР·РІР»РµРєР°РµС‚ С‡РёСЃР»РѕРІСѓСЋ С†РµРЅСѓ РёР· СЌР»РµРјРµРЅС‚Р° item-price РєРѕРЅС‚РµР№РЅРµСЂР°.
     * Р’РѕР·РІСЂР°С‰Р°РµС‚ С‡РёСЃР»Рѕ РёР»Рё null, РµСЃР»Рё С†РµРЅР° РЅРµ РїРѕРґС…РѕРґРёС‚.
     */
    function extractPrice(itemEl) {
        // РџСЂРѕР±СѓРµРј meta itemprop="price" (СЃР°РјС‹Р№ РЅР°РґС‘Р¶РЅС‹Р№)
        const priceMeta = itemEl.querySelector('[data-marker="item-price"] meta[itemprop="price"]');
        if (priceMeta) {
            const val = parseInt(priceMeta.getAttribute('content'), 10);
            if (!isNaN(val) && val >= CONFIG.РњРРќРРњРђР›Р¬РќРђРЇ_Р¦Р•РќРђ) return val;
            return null;
        }

        // Р¤РѕР»Р±СЌРє: С‚РµРєСЃС‚ РёР· item-price-value
        const priceValueEl = itemEl.querySelector('[data-marker="item-price-value"]');
        if (!priceValueEl) return null;
        const text = priceValueEl.textContent.replace(/\s/g, '').replace(/в‚Ѕ/g, '').replace(/\u00a0/g, '');
        const val = parseInt(text, 10);
        if (!isNaN(val) && val >= CONFIG.РњРРќРРњРђР›Р¬РќРђРЇ_Р¦Р•РќРђ) return val;
        return null;
    }

    /**
     * Р¤РѕСЂРјР°С‚РёСЂСѓРµС‚ С‡РёСЃР»Рѕ РІ СЂСѓСЃСЃРєРёР№ С„РѕСЂРјР°С‚ СЃ РїСЂРѕР±РµР»Р°РјРё: 8 399
     */
    function formatPrice(n) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    }

    /**
     * РћСЃРЅРѕРІРЅР°СЏ С„СѓРЅРєС†РёСЏ вЂ” РІС‹Р·С‹РІР°РµС‚СЃСЏ РїСЂРё Р·Р°РіСЂСѓР·РєРµ Рё РїСЂРё РЅР°РІРёРіР°С†РёРё (SPA)
     */
    function run() {
        // РЈРґР°Р»РёРј РїСЂРµРґС‹РґСѓС‰РёРµ РїРѕРјРµС‚РєРё РµСЃР»Рё СЃРєСЂРёРїС‚ РѕС‚СЂР°Р±Р°С‚С‹РІР°Р» СЂР°РЅРµРµ
        document.querySelectorAll('.tm-calc-price').forEach(el => el.remove());
        document.querySelectorAll('.tm-highlight-green, .tm-highlight-yellow, .tm-highlight-red, .tm-highlight-grey').forEach(el => {
            el.classList.remove('tm-highlight-green', 'tm-highlight-yellow', 'tm-highlight-red', 'tm-highlight-grey');
        });

        // РџРѕР»СѓС‡Р°РµРј РІСЃРµ РѕР±СЉСЏРІР»РµРЅРёСЏ
        const allItems = document.querySelectorAll('[data-marker="item"]');
        if (allItems.length === 0) return;
        observer.disconnect();


        // Р‘РµСЂС‘Рј РїРµСЂРІС‹Рµ N РѕР±СЉСЏРІР»РµРЅРёР№
        const items = Array.from(allItems).slice(0, CONFIG.РљРћР›РР§Р•РЎРўР’Рћ_РћР‘РЄРЇР’Р›Р•РќРР™);

        // РЎРѕР±РёСЂР°РµРј РјР°СЃСЃРёРІ {element, price}
        const itemsWithPrices = [];
        for (const item of items) {
            const price = extractPrice(item);
            itemsWithPrices.push({ el: item, price });
        }

        // --- Р”РѕР±Р°РІР»СЏРµРј РІС‹С‡РёСЃР»РµРЅРЅСѓСЋ С†РµРЅСѓ РєРѕ РІСЃРµРј, Сѓ РєРѕРіРѕ РµСЃС‚СЊ С†РµРЅР° ---
        for (const { el, price } of itemsWithPrices) {
            if (price === null) continue;

            const priceValueEl = el.querySelector('[data-marker="item-price-value"]');
            if (!priceValueEl) continue;

            // РџСЂРѕРІРµСЂСЏРµРј, РЅРµ РґРѕР±Р°РІР»РµРЅРѕ Р»Рё СѓР¶Рµ
            if (priceValueEl.parentElement.querySelector('.tm-calc-price')) continue;

            const markup = calcMarkup(price);
            const badge = document.createElement('span');
            badge.className = 'tm-calc-price';
            const mult = 1 + CONFIG.РџР РћР¦Р•РќРў_РќРђР¦Р•РќРљР / 100;
            badge.textContent = `в†’ ${formatPrice(markup)} в‚Ѕ`;
            badge.title = `${formatPrice(price)} Г— ${mult} = ${formatPrice(Math.round(price * mult))}, в†‘100 = ${formatPrice(Math.ceil(price * mult / 100) * 100)}, в€’1 = ${formatPrice(markup)}`;

            // Р’СЃС‚Р°РІР»СЏРµРј РїРѕСЃР»Рµ <strong>, РєРѕС‚РѕСЂС‹Р№ СЃРѕРґРµСЂР¶РёС‚ С†РµРЅСѓ
            const strong = priceValueEl.closest('strong') || priceValueEl.parentElement;
            strong.parentElement.insertBefore(badge, strong.nextSibling);
        }

        // --- РќР°С…РѕРґРёРј 4 СЃР°РјС‹С… РґРµС€С‘РІС‹С… СѓРЅРёРєР°Р»СЊРЅС‹С… С†РµРЅС‹ ---
        const validPrices = itemsWithPrices
            .filter(x => x.price !== null)
            .map(x => x.price);

        const uniqueSorted = [...new Set(validPrices)].sort((a, b) => a - b);

        const cheapest = uniqueSorted[0] ?? null;
        const second = uniqueSorted[1] ?? null;
        const third = uniqueSorted[2] ?? null;
        const fourth = uniqueSorted[3] ?? null;

        // --- РџРѕРґСЃРІРµС‡РёРІР°РµРј ---
        for (const { el, price } of itemsWithPrices) {
            if (price === null) continue;

            if (price === cheapest) {
                el.classList.add('tm-highlight-green');
            } else if (price === second) {
                el.classList.add('tm-highlight-yellow');
            } else if (price === third) {
                el.classList.add('tm-highlight-red');
            } else if (price === fourth) {
                el.classList.add('tm-highlight-grey');
            }
        }

        console.log('[РђРІРёС‚Рѕ Price Highlighter]', {
            items: items.length,
            withPrices: itemsWithPrices.filter(x => x.price !== null).length,
            cheapest, second, third, fourth
        });
observer.observe(document.body, { childList: true, subtree: true });
}

    // ========== Р—РђРџРЈРЎРљ ==========

    // РџРµСЂРІС‹Р№ Р·Р°РїСѓСЃРє СЃ Р·Р°РґРµСЂР¶РєРѕР№ (РґРѕР¶РёРґР°РµРјСЃСЏ СЂРµРЅРґРµСЂР°)
    setTimeout(run, CONFIG.Р—РђР”Р•Р Р–РљРђ_РџР•Р Р’РћР“Рћ_Р—РђРџРЈРЎРљРђ);

    // РќР°Р±Р»СЋРґР°РµРј Р·Р° РёР·РјРµРЅРµРЅРёСЏРјРё DOM (SPA-РЅР°РІРёРіР°С†РёСЏ РђРІРёС‚Рѕ)
    const observer = new MutationObserver(() => {
        // Debounce
        clearTimeout(observer._timeout);
        observer._timeout = setTimeout(run, CONFIG.Р—РђР”Р•Р Р–РљРђ_РџР•Р Р•РЎР§РЃРўРђ);
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
