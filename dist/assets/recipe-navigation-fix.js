(() => {
  'use strict';

  const isHubPage = () => location.pathname === '/my-recipes' || location.pathname === '/add-recipe';

  const syncHomeLinks = () => {
    document.querySelectorAll('.upload-back').forEach(button => {
      if (!isHubPage()) {
        button.removeAttribute('data-cookbook-home');
        return;
      }
      button.setAttribute('data-cookbook-home', '');
      button.setAttribute('aria-label', 'Back to cookbook home');
      button.textContent = '← Home';
    });
  };

  // Capture at window level so this runs before the legacy document click handler.
  // The legacy handler owns /my-recipes and /add-recipe, but does not hand control
  // back to the main app when its back button points outside those custom routes.
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
    const observer = new MutationObserver(syncHomeLinks);
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
