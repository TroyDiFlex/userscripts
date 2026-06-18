// ==UserScript==
// @name         TecAlliance — Скопировать применимость
// @namespace    https://www.tecalliance.cn/
// @version      1.4
// @description  Плавающая кнопка, собирающая применимость (автомобили) и копирующая их в 5 столбцов для Google Таблиц
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

    // Не добавлять кнопку повторно при навигации (SPA)
    if (document.getElementById('tec-copy-app-btn')) return;

    /* ── Кнопка ── */
    var btn = document.createElement('button');
    btn.id = 'tec-copy-app-btn';
    btn.textContent = '🚗 Скопировать применимость';
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

    /* ── Логика сбора применимости ── */
    btn.onclick = function () {
        var rows = document.querySelectorAll('table.v-table tbody tr');

        // 5 столбцов: Марка, Модель, Платформа, Модификация, Код двигателя
        // Для каждого столбца собираем уникальные значения (с сохранением порядка)
        var columns = [[], [], [], [], []];
        var seenPerCol = [{}, {}, {}, {}, {}];

        // Добавляет значение в столбец, если его там ещё нет
        function addUnique(colIndex, value) {
            if (!value) return;
            // Разбиваем по «;» — каждая часть как отдельное значение
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

            // --- Очистка модификации ---
            var modClean = vTypeText
                .replace(/\b\d[\.,]\d\b/gi, '')
                .replace(/\b(AWD|FWD|RWD|Hybrid|MHEV|4WD|EV|xDrive|sDrive|4x4|quattro|4motion|4MATIC)\b/gi, '')
                .replace(/(All-wheel Drive|Front-Wheel Drive|Rear-Wheel Drive)/gi, '')
                .replace(/\s+-\s*$/g, '')
                .replace(/^\s*-\s+/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            // --- Извлечение Engine Code ---
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

        // Находим максимальную длину среди столбцов
        var maxRows = Math.max.apply(null, columns.map(function (col) { return col.length; }));

        if (maxRows === 0) {
            alert('❌ Применимость не найдена!\nУбедитесь, что таблица с автомобилями ("Compatible Vehicles") загружена на странице.');
            return;
        }

        // Собираем строки: каждая строка — значения из 5 столбцов через табуляцию
        var outputLines = [];
        for (var i = 0; i < maxRows; i++) {
            var row = [];
            for (var c = 0; c < 5; c++) {
                row.push(columns[c][i] || '');
            }
            outputLines.push(row.join('\t'));
        }

        var text = outputLines.join('\n');

        /* ── Логика копирования в буфер ── */
        function onSuccess(n) {
            btn.textContent = '✅ ' + n + ' авто!';
            setTimeout(function () { btn.textContent = '🚗 Скопировать применимость'; }, 3000);
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
                prompt('Не удалось скопировать автоматически. Скопируйте вручную (Ctrl+A → Ctrl+C):', t);
            }
            document.body.removeChild(ta);
        }

        // Пытаемся скопировать самыми надежными способами
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
