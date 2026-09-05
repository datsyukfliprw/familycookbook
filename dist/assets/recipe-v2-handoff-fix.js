(() => {
  'use strict';

  const markEnhancedDetail = () => {
    const app = document.getElementById('root');
    if (!app) return;
    const enhanced = app.querySelector('.rx-detail');
    if (enhanced && !enhanced.classList.contains('upload-detail')) {
      enhanced.classList.add('upload-detail');
    }
  };

  const boot = () => {
    const app = document.getElementById('root');
    if (!app) return;
    markEnhancedDetail();
    const observer = new MutationObserver(markEnhancedDetail);
    observer.observe(app, { childList: true, subtree: false });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
