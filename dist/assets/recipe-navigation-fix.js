(() => {
  'use strict';

  const isHubPage = () => location.pathname === '/my-recipes' || location.pathname === '/add-recipe';

  const syncHomeLinks = () => {
    if (!isHubPage()) return;

    // Only touch newly rendered legacy back buttons once. The previous version
    // rewrote textContent on every mutation, which could trigger the observer
    // again and create a render loop on iPhone Safari.
    document.querySelectorAll('.upload-back:not([data-cookbook-home])').forEach(button => {
      button.setAttribute('data-cookbook-home', '');
      button.setAttribute('aria-label', 'Back to cookbook home');
      button.textContent = '← Home';
    });
  };

  // Capture at window level so this runs before the legacy document click handler.
  window.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-cookbook-home]')
      : null;
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    window.location.assign('/');
  }, true);

  window.addEventListener('popstate', () => window.setTimeout(syncHomeLinks, 0));

  const boot = () => {
    syncHomeLinks();
    const observer = new MutationObserver(() => syncHomeLinks());
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
