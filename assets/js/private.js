import { initStore } from './common.js';

// SHA-256 от пароля. По умолчанию — хеш от строки "changeme".
// Меняется в админке (Настройки → Пароль приватного магазина).
const PRIVATE_PASSWORD_HASH = 'c0067d4af4e87f00dbac63b6156828237059172d0a16c4f6c8bdc7de7f3ab7d2';

const overlay = document.getElementById('lock');
const form = document.getElementById('lock-form');
const input = document.getElementById('lock-input');
const errorEl = document.getElementById('lock-error');
const storeWrap = document.getElementById('store');

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function unlock() {
  overlay.classList.add('hidden');
  storeWrap.classList.remove('hidden');
  initStore({
    visibility: 'private',
    mountEl: document.getElementById('grid'),
    searchEl: document.getElementById('search'),
    filtersEl: document.getElementById('filters'),
    emptyMsg: 'Ничего не найдено',
  });
}

if (sessionStorage.getItem('private_unlocked') === '1') {
  unlock();
} else {
  setTimeout(() => input?.focus(), 50);
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  input.classList.remove('error');
  const hash = await sha256Hex(input.value);
  if (hash === PRIVATE_PASSWORD_HASH) {
    sessionStorage.setItem('private_unlocked', '1');
    unlock();
  } else {
    input.classList.add('error');
    errorEl.textContent = 'Неверный пароль';
    input.select();
  }
});
