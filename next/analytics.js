(() => {
  'use strict';

  const config = Object.freeze({
    enabled: false,
    yandexMetrikaId: '',
    dataLayerName: 'dataLayer',
    consentVersion: '2026-08-11',
    ...(window.FORMA_ANALYTICS_CONFIG || {}),
  });
  const sessionId = randomId();
  const consentKey = `formaAnalyticsConsent:${config.consentVersion}`;
  let active = false;
  let searchTimer = 0;

  prepareConsent();

  function track(event, payload = {}) {
    if (!config.enabled || !active) return false;
    const detail = clean({
      event,
      timestamp: new Date().toISOString(),
      path: `${location.pathname}${location.hash || ''}`,
      sessionId,
      ...payload,
    });
    const layerName = String(config.dataLayerName || 'dataLayer');
    window[layerName] = window[layerName] || [];
    window[layerName].push(detail);
    if (config.yandexMetrikaId && typeof window.ym === 'function') {
      window.ym(Number(config.yandexMetrikaId), 'reachGoal', event, detail);
    }
    window.dispatchEvent(new CustomEvent('forma:analytics', { detail }));
    return true;
  }

  function trackSearch(query, resultCount) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const safeQuery = privacySafeQuery(query);
      track(resultCount ? 'search_results' : 'search_zero', {
        query: safeQuery,
        queryLength: String(query || '').trim().length,
        resultCount: Number(resultCount) || 0,
      });
    }, 450);
  }

  function privacySafeQuery(value) {
    const query = String(value || '').trim().slice(0, 80);
    if (!query) return '';
    if (/@/.test(query) || /(?:\+?\d[\s().-]*){7,}/.test(query)) return '[скрыто: возможные персональные данные]';
    return query;
  }

  function clean(value) {
    if (Array.isArray(value)) return value.slice(0, 30).map(clean);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .filter(([, item]) => item !== undefined && item !== null && item !== '')
        .slice(0, 40)
        .map(([key, item]) => [key, clean(item)]));
    }
    return typeof value === 'string' ? value.slice(0, 180) : value;
  }

  function randomId() {
    try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
  }

  function prepareConsent() {
    if (!config.enabled) return;
    let choice = '';
    try { choice = localStorage.getItem(consentKey) || ''; } catch {}
    if (choice === 'accepted') { activate(); return; }
    if (choice === 'rejected') return;
    const ready = () => showConsentBanner();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
  }

  function activate() {
    if (active) return;
    active = true;
    const id = String(config.yandexMetrikaId || '').trim();
    if (/^\d+$/.test(id)) loadMetrika(Number(id));
  }

  function showConsentBanner() {
    if (document.querySelector('.analytics-consent')) return;
    const banner = document.createElement('section');
    banner.className = 'analytics-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Настройка аналитики');
    banner.innerHTML = '<p>Мы используем обезличенную аналитику, чтобы улучшать каталог и поиск. Имя, телефон и текст заказа в аналитику не передаются. <a href="privacy.html">Подробнее</a></p><div><button type="button" data-analytics-consent="reject">Только необходимое</button><button type="button" data-analytics-consent="accept">Разрешить аналитику</button></div>';
    banner.addEventListener('click', (event) => {
      const button = event.target.closest('[data-analytics-consent]');
      if (!button) return;
      const accepted = button.dataset.analyticsConsent === 'accept';
      try { localStorage.setItem(consentKey, accepted ? 'accepted' : 'rejected'); } catch {}
      banner.remove();
      if (accepted) activate();
    });
    document.body.append(banner);
  }

  function loadMetrika(id) {
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    window.ym(id, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
    if (document.querySelector('script[data-forma-metrika]')) return;
    const script = document.createElement('script');
    script.async = true;
    script.dataset.formaMetrika = 'true';
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.append(script);
  }

  window.FormaAnalytics = Object.freeze({ track, trackSearch, config });
})();
