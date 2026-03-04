// i18n.js — Lightweight translation system
// Requires translations.js to be loaded first

(function() {
  'use strict';

  const DEFAULT_LANG = 'en';
  const STORAGE_KEY = 'trails-coffee-lang';

  function getLang() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
  }

  function t(key) {
    const lang = getLang();
    const dict = TRANSLATIONS[lang] || TRANSLATIONS[DEFAULT_LANG];
    return dict[key] || (TRANSLATIONS[DEFAULT_LANG] && TRANSLATIONS[DEFAULT_LANG][key]) || key;
  }

  function applyTranslations() {
    // Translate elements with data-i18n attribute (innerHTML)
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (val !== key) {
        el.innerHTML = val;
      }
    });

    // Translate placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = t(key);
      if (val !== key) {
        el.placeholder = val;
      }
    });

    // Translate title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const val = t(key);
      if (val !== key) {
        el.title = val;
      }
    });

    // Update toggle button state
    updateToggleState();
  }

  function updateToggleState() {
    const lang = getLang();
    document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
      const btnLang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', btnLang === lang);
    });
  }

  function switchLang(lang) {
    setLang(lang);
    applyTranslations();
    // Update nav labels if initNav was used
    if (typeof _i18nUpdateNav === 'function') {
      _i18nUpdateNav();
    }
  }

  // Expose globally
  window.i18n = {
    t: t,
    getLang: getLang,
    setLang: setLang,
    switchLang: switchLang,
    apply: applyTranslations
  };

  // Auto-apply on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTranslations);
  } else {
    applyTranslations();
  }
})();
