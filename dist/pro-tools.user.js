// ==UserScript==
// @name         Avito Pro Tools — Продвижение + Стоимость просмотра
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Подсвечивает карточки без продвижения + считает стоимость просмотра
// @author       TroyDiFlex
// @match        https://www.avito.ru/*
// @updateURL    https://raw.githubusercontent.com/TroyDiFlex/userscripts/main/dist/pro-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/TroyDiFlex/userscripts/main/dist/pro-tools.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const MAX_COST_PER_VIEW = 25;

    const style = document.createElement('style');
    style.textContent = `
        [role-marker="offer"].unpromoted-card {
            border-left: 4px solid #EF4444 !important;
            position: relative;
        }
        [role-marker="offer"].unpromoted-card::after {
            content: 'Без продвижения';
            position: absolute;
            top: 0px;
            right: 8px;
            background: linear-gradient(135deg, #EF4444, #DC2626);
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            padding: 4px 10px;
            border-radius: 6px;
            letter-spacing: 0.3px;
            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35);
            z-index: 10;
            pointer-events: none;
        }
        .cpv-badge {
            display: inline-flex;
            align-items: center;
            margin-left: 10px;
            padding: 4px 8px;
            border-radius: 8px;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-weight: 700;
            line-height: 1;
            letter-spacing: 0.3px;
            white-space: nowrap;
        }
        .cpv-badge.good {
            background: #10B981;
            color: #fff;
            box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
        }
        .cpv-badge.bad {
            background: #EF4444;
            color: #fff;
            box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3);
        }
        .cpv-parent {
            display: flex !important;
            align-items: center !important;
        }
    `;
    document.head.appendChild(style);

    function parseValue(str) {
        if (!str) return 0;
        return parseFloat(str.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    }

    function processAllCards() {
        // Работаем только на нужной странице
        if (!location.pathname.startsWith('/profile/pro/items')) return;

        document.querySelectorAll('[role-marker="offer"]').forEach(card => {
            // --- Продвижение ---
            const hasPromo = card.querySelector('[data-marker="service-icon/CPX_PROMO_V1"]');
            card.classList.toggle('unpromoted-card', !hasPromo);

            // --- Стоимость просмотра ---
            if (card.querySelector('.cpv-badge')) return;

            const viewsEl = card.querySelector('[role-marker="views"] span');
            const spendingEl = card.querySelector('[role-marker="spending"] span');
            if (!viewsEl || !spendingEl) return;

            const views = parseValue(viewsEl.textContent);
            const spending = parseValue(spendingEl.textContent);
            if (views <= 0 || spending <= 0) return;

            const cpv = spending / views;
            const badge = document.createElement('span');
            badge.className = cpv > MAX_COST_PER_VIEW ? 'cpv-badge bad' : 'cpv-badge good';
            badge.title = `Расходы (${spending}) / Просмотры (${views}) = ${cpv.toFixed(2)} ₽`;
            badge.textContent = `${cpv.toFixed(1)} ₽/пр.`;

            spendingEl.parentNode.classList.add('cpv-parent');
            spendingEl.parentNode.appendChild(badge);
        });
    }

    // Перехватываем SPA-навигации React
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    history.pushState = function() {
        origPushState.apply(this, arguments);
        setTimeout(processAllCards, 500);
    };
    history.replaceState = function() {
        origReplaceState.apply(this, arguments);
        setTimeout(processAllCards, 500);
    };
    window.addEventListener('popstate', () => setTimeout(processAllCards, 500));

    // Основной цикл — страховка
    setInterval(processAllCards, 2000);
    setTimeout(processAllCards, 500);
})();