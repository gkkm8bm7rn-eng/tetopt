(() => {
  'use strict';

  const CONTENT_URL = '../data/site-content.json';

  document.addEventListener('DOMContentLoaded', async () => {
    const hero = document.querySelector('.hero');
    if (!hero) return;

    try {
      const response = await fetch(CONTENT_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const content = await response.json();
      if (!content || content.schemaVersion !== 1 || !content.hero) throw new Error('invalid site-content schema');

      setText('[data-content="hero.eyebrow"]', content.hero.eyebrow);
      setText('[data-content="hero.title"]', content.hero.title);
      setText('[data-content="hero.body"]', content.hero.body);

      const cta = document.querySelector('[data-content="hero.primaryCta"]');
      if (cta) {
        cta.textContent = content.hero.primaryCta || '';
        cta.href = content.hero.primaryTarget || '#catalog';
        cta.hidden = !content.hero.primaryCta;
      }

      hero.setAttribute('aria-busy', 'false');
      hero.dataset.contentReady = 'true';
    } catch (error) {
      console.error('[site-content]', error);
      hero.setAttribute('aria-busy', 'false');
      hero.dataset.contentError = 'true';
      const title = document.querySelector('[data-content="hero.title"]');
      if (title) title.textContent = 'Контент баннера временно недоступен';
    }
  });

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = String(value || '');
  }
})();
