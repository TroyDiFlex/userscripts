// ==UserScript==
// @name         Помощник актуализации цен
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Анализирует первые N объявлений конкурентов, подсвечивает по цене и считает рекомендуемую цену с наценкой
// @author       TroyDiFlex
// @match        https://www.avito.ru/*
// @updateURL    https://troydiflex.github.io/userscripts/scripts/avito/price-helper.user.js
// @downloadURL  https://troydiflex.github.io/userscripts/scripts/avito/price-helper.user.js
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';



    // ╔══════════════════════════════════════════════════════════════╗
    // ║                    ⚙️  НАСТРОЙКИ                            ║
    // ╚══════════════════════════════════════════════════════════════╝

    const CONFIG = {

        // Сколько первых объявлений анализировать (по умолчанию 8)
        КОЛИЧЕСТВО_ОБЪЯВЛЕНИЙ: 8,

        // Процент наценки (по умолчанию 10)
        ПРОЦЕНТ_НАЦЕНКИ: 10,

        // Минимальная цена, которую учитываем (всё что ниже — игнорируется).
        // «Бесплатно» и «Цена не указана» игнорируются всегда.
        МИНИМАЛЬНАЯ_ЦЕНА: 100,

        // Задержка первого запуска (мс).
        // Если страница загружается долго, скрипт может не сработать —
        // попробуйте увеличить это значение (например, до 3000).
        ЗАДЕРЖКА_ПЕРВОГО_ЗАПУСКА: 10,

        // Задержка повторного пересчёта после навигации по сайту (мс).
        ЗАДЕРЖКА_ПЕРЕСЧЁТА: 10,
    };

    // ========== СТИЛИ ==========
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

    // ========== ЛОГИКА ==========

    /**
     * Вычисляет: цена × 1.1, округление вверх до сотен, минус 1
     */
    function calcMarkup(price) {
        const multiplier = 1 + CONFIG.ПРОЦЕНТ_НАЦЕНКИ / 100;
        const multiplied = price * multiplier;
        const roundedUp = Math.ceil(multiplied / 100) * 100;
        return roundedUp - 1;
    }

    /**
     * Извлекает числовую цену из элемента item-price контейнера.
     * Возвращает число или null, если цена не подходит.
     */
    function extractPrice(itemEl) {
        // Пробуем meta itemprop="price" (самый надёжный)
        const priceMeta = itemEl.querySelector('[data-marker="item-price"] meta[itemprop="price"]');
        if (priceMeta) {
            const val = parseInt(priceMeta.getAttribute('content'), 10);
            if (!isNaN(val) && val >= CONFIG.МИНИМАЛЬНАЯ_ЦЕНА) return val;
            return null;
        }

        // Фолбэк: текст из item-price-value
        const priceValueEl = itemEl.querySelector('[data-marker="item-price-value"]');
        if (!priceValueEl) return null;
        const text = priceValueEl.textContent.replace(/\s/g, '').replace(/₽/g, '').replace(/\u00a0/g, '');
        const val = parseInt(text, 10);
        if (!isNaN(val) && val >= CONFIG.МИНИМАЛЬНАЯ_ЦЕНА) return val;
        return null;
    }

    /**
     * Форматирует число в русский формат с пробелами: 8 399
     */
    function formatPrice(n) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    }

    /**
     * Основная функция — вызывается при загрузке и при навигации (SPA)
     */
    function run() {
        // Удалим предыдущие пометки если скрипт отрабатывал ранее
        document.querySelectorAll('.tm-calc-price').forEach(el => el.remove());
        document.querySelectorAll('.tm-highlight-green, .tm-highlight-yellow, .tm-highlight-red, .tm-highlight-grey').forEach(el => {
            el.classList.remove('tm-highlight-green', 'tm-highlight-yellow', 'tm-highlight-red', 'tm-highlight-grey');
        });

        // Получаем все объявления
        const allItems = document.querySelectorAll('[data-marker="item"]');
        if (allItems.length === 0) return;
        observer.disconnect();


        // Берём первые N объявлений
        const items = Array.from(allItems).slice(0, CONFIG.КОЛИЧЕСТВО_ОБЪЯВЛЕНИЙ);

        // Собираем массив {element, price}
        const itemsWithPrices = [];
        for (const item of items) {
            const price = extractPrice(item);
            itemsWithPrices.push({ el: item, price });
        }

        // --- Добавляем вычисленную цену ко всем, у кого есть цена ---
        for (const { el, price } of itemsWithPrices) {
            if (price === null) continue;

            const priceValueEl = el.querySelector('[data-marker="item-price-value"]');
            if (!priceValueEl) continue;

            // Проверяем, не добавлено ли уже
            if (priceValueEl.parentElement.querySelector('.tm-calc-price')) continue;

            const markup = calcMarkup(price);
            const badge = document.createElement('span');
            badge.className = 'tm-calc-price';
            const mult = 1 + CONFIG.ПРОЦЕНТ_НАЦЕНКИ / 100;
            badge.textContent = `→ ${formatPrice(markup)} ₽`;
            badge.title = `${formatPrice(price)} × ${mult} = ${formatPrice(Math.round(price * mult))}, ↑100 = ${formatPrice(Math.ceil(price * mult / 100) * 100)}, −1 = ${formatPrice(markup)}`;

            // Вставляем после <strong>, который содержит цену
            const strong = priceValueEl.closest('strong') || priceValueEl.parentElement;
            strong.parentElement.insertBefore(badge, strong.nextSibling);
        }

        // --- Находим 4 самых дешёвых уникальных цены ---
        const validPrices = itemsWithPrices
            .filter(x => x.price !== null)
            .map(x => x.price);

        const uniqueSorted = [...new Set(validPrices)].sort((a, b) => a - b);

        const cheapest = uniqueSorted[0] ?? null;
        const second = uniqueSorted[1] ?? null;
        const third = uniqueSorted[2] ?? null;
        const fourth = uniqueSorted[3] ?? null;

        // --- Подсвечиваем ---
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

        console.log('[Авито Price Highlighter]', {
            items: items.length,
            withPrices: itemsWithPrices.filter(x => x.price !== null).length,
            cheapest, second, third, fourth
        });
observer.observe(document.body, { childList: true, subtree: true });
}

    // ========== ЗАПУСК ==========

    // Первый запуск с задержкой (дожидаемся рендера)
    setTimeout(run, CONFIG.ЗАДЕРЖКА_ПЕРВОГО_ЗАПУСКА);

    // Наблюдаем за изменениями DOM (SPA-навигация Авито)
    const observer = new MutationObserver(() => {
        // Debounce
        clearTimeout(observer._timeout);
        observer._timeout = setTimeout(run, CONFIG.ЗАДЕРЖКА_ПЕРЕСЧЁТА);
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
