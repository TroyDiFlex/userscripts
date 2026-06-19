export const STATS_API_URL = "https://script.google.com/macros/s/AKfycbzBA_q0-c9Lp3vAblhlys65DkTia1Z4Cbqu442GfbmP2ximJ4l2AhQW22X7AlkthIdN/exec";
const TTL_MS = 5 * 60 * 1000; // 5 минут кэширования для запросов статистики

function getClientId() {
  let id = localStorage.getItem('stats_client_id');
  if (!id) {
    id = 'user_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('stats_client_id', id);
  }
  return id;
}

export async function recordInstall(scriptId) {
  try {
    let userId = getClientId();
    
    // Если сохранен логин GitHub (для приватных скриптов), используем его
    const ghLogin = localStorage.getItem('gh_login');
    if (ghLogin) {
      userId = 'github:' + ghLogin;
    }
    
    // Отправляем POST запрос в Google Sheets. 
    // Используем text/plain чтобы не было проблем с CORS preflight
    await fetch(STATS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ scriptId, userId }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
  } catch (e) {
    console.error('Ошибка при записи статистики:', e);
  }
}

export async function fetchAllStats() {
  const cacheKey = 'stats_cache_v2';
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { t, v } = JSON.parse(cached);
      if (Date.now() - t < TTL_MS) return v;
    }
  } catch { /* ignore */ }

  let stats = {};
  try {
    const res = await fetch(STATS_API_URL);
    if (res.ok) {
      stats = await res.json();
    }
  } catch (e) {
    console.error('Ошибка загрузки статистики:', e);
  }

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: stats }));
  } catch { /* ignore */ }
  
  return stats;
}

export async function getInstallStats(scriptId) {
  const allStats = await fetchAllStats();
  return allStats[scriptId] || { total: 0, month: 0, week: 0 };
}

export function clearStatsCache() {
  sessionStorage.removeItem('stats_cache_v2');
}
