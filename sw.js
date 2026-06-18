/* Service Worker — временное хранилище для установки приватных скриптов через Tampermonkey.
 *
 * Tampermonkey перехватывает навигацию только на HTTPS URL, оканчивающийся на .user.js.
 * blob: URL не перехватываются из-за ограничений Chrome MV3.
 *
 * Схема работы:
 *   1. private.js получает текст скрипта через GitHub API
 *   2. Сохраняет его сюда через postMessage с { type: 'STORE_SCRIPT', id, content }
 *   3. Открывает /userscripts/install/<id>/scriptname.user.js
 *   4. SW перехватывает этот fetch и отвечает сохранённым текстом
 *   5. Tampermonkey видит .user.js → показывает диалог установки
 */

'use strict';

const scriptStore = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Получаем контент скрипта от страницы
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'STORE_SCRIPT') {
    scriptStore.set(event.data.id, event.data.content);
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ ok: true });
    }
  }
});

// Перехватываем запрос к /userscripts/install/<id>/<name>.user.js
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const m = url.pathname.match(/\/userscripts\/install\/([^/]+)\/.+\.user\.js$/);
  if (!m) return; // не наш запрос — пропускаем

  const id = m[1];
  if (!scriptStore.has(id)) return; // нет такого скрипта

  const content = scriptStore.get(id);
  scriptStore.delete(id); // одноразовое использование

  event.respondWith(
    new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-userscript; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  );
});
