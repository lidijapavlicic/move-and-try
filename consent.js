
/* ================================================
   MOVE&TRY — PRIVACY & COOKIE CONSENT
   HR / EN
   Analytics: opt-in only
================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'moveandtry_cookie_consent_v1';
  const CONSENT_VERSION = 1;
  const GA_ID = 'G-PREYRXPPN8';

  let language =
    document.documentElement.lang.toLowerCase().startsWith('hr')
      ? 'hr'
      : 'en';

  const translations = {
    hr: {
      title: 'TVOJA PRIVATNOST',
      description:
        'Koristimo nužnu pohranu za rad stranice, a uz tvoju privolu i analitiku kako bismo razumjeli što posjetitelje zanima. Izbor možeš promijeniti bilo kada.',
      accept: 'PRIHVATI SVE',
      reject: 'ODBIJ NEOBAVEZNE',
      settings: 'POSTAVKE',
      save: 'SPREMI POSTAVKE',
      necessary: 'Nužna pohrana',
      necessaryDescription:
        'Potrebna za osnovne funkcionalnosti i pamćenje tvojeg izbora privatnosti.',
      alwaysActive: 'UVIJEK AKTIVNO',
      analytics: 'Analitika',
      analyticsDescription:
        'Pomaže nam razumjeti posjećenost i korištenje platforme putem Google Analyticsa.',
      privacy: 'Politika privatnosti',
      cookies: 'Politika kolačića',
      change: 'Postavke privatnosti'
    },

    en: {
      title: 'YOUR PRIVACY',
      description:
        'We use essential storage for website functionality and, with your consent, analytics to understand what visitors find interesting. You can change your choice at any time.',
      accept: 'ACCEPT ALL',
      reject: 'REJECT OPTIONAL',
      settings: 'SETTINGS',
      save: 'SAVE SETTINGS',
      necessary: 'Essential storage',
      necessaryDescription:
        'Required for basic functionality and remembering your privacy choice.',
      alwaysActive: 'ALWAYS ACTIVE',
      analytics: 'Analytics',
      analyticsDescription:
        'Helps us understand website traffic and usage through Google Analytics.',
      privacy: 'Privacy Policy',
      cookies: 'Cookie Policy',
      change: 'Privacy settings'
    }
  };

  let t = translations[language];

  let paths = language === 'hr'
    ? {
        privacy: '/hr/privacy-policy.html',
        cookies: '/hr/cookie-policy.html'
      }
    : {
        privacy: '/privacy-policy.html',
        cookies: '/cookie-policy.html'
      };

  let consentPanel = null;
  let analyticsCheckbox = null;
  let analyticsLoaded = false;
  let lastSettingsTrigger = null;

  // Analytics is disabled unless consent is confirmed.
  window['ga-disable-' + GA_ID] = true;

  function readConsent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) return null;

      const stored = JSON.parse(raw);

      if (
        stored &&
        stored.version === CONSENT_VERSION &&
        typeof stored.analytics === 'boolean'
      ) {
        return stored;
      }
    } catch (error) {
      console.warn(
        'MOVE&TRY: consent storage unavailable.'
      );
    }

    return null;
  }

  function storeConsent(analytics) {
    const value = {
      version: CONSENT_VERSION,
      necessary: true,
      analytics: Boolean(analytics),
      updatedAt: new Date().toISOString()
    };

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(value)
      );

      return true;
    } catch (error) {
      console.warn(
        'MOVE&TRY: could not save consent.'
      );

      return false;
    }
  }

  function loadAnalytics() {
    if (analyticsLoaded) return;

    analyticsLoaded = true;

    window['ga-disable-' + GA_ID] = false;

    window.dataLayer = window.dataLayer || [];

    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };

    window.gtag('js', new Date());
    window.gtag('config', GA_ID);

    const script = document.createElement('script');

    script.async = true;

    script.src =
      'https://www.googletagmanager.com/gtag/js?id=' +
      encodeURIComponent(GA_ID);

    document.head.appendChild(script);
  }

  function removeAnalyticsCookies() {
    window['ga-disable-' + GA_ID] = true;

    const names = document.cookie
      .split(';')
      .map(item => item.trim().split('=')[0])
      .filter(name =>
        name === '_ga' ||
        name.startsWith('_ga_')
      );

    const host = window.location.hostname;

    const domains = [''];

    if (
      host === 'moveandtry.com' ||
      host.endsWith('.moveandtry.com')
    ) {
      domains.push('moveandtry.com');
      domains.push('.moveandtry.com');
    }

    names.forEach(name => {
      domains.forEach(domain => {
        const domainPart = domain
          ? '; domain=' + domain
          : '';

        document.cookie =
          name +
          '=; Max-Age=0; path=/' +
          domainPart +
          '; SameSite=Lax';
      });
    });
  }

  function applyConsent(analytics) {
    if (analytics) {
      loadAnalytics();
    } else {
      removeAnalyticsCookies();
    }
  }

  function closePanel() {
    if (consentPanel) {
      consentPanel.hidden = true;
    }

    if (
      lastSettingsTrigger &&
      lastSettingsTrigger.isConnected
    ) {
      lastSettingsTrigger.focus();
    }

    lastSettingsTrigger = null;
  }

  function saveChoice(analytics) {
    const saved = storeConsent(analytics);

    if (!saved) {
      /*
       * If consent cannot be stored, keep
       * analytics disabled.
       */
      removeAnalyticsCookies();

      closePanel();

      return;
    }

    if (!analytics) {
      removeAnalyticsCookies();
    }

    if (!analytics && analyticsLoaded) {
      /*
       * Reload to stop analytics execution
       * on the current page.
       */
      window.location.reload();

      return;
    }

    applyConsent(analytics);

    closePanel();
  }

  function showSettings() {
    if (!consentPanel) return;

    const settings = consentPanel.querySelector(
      '.mt-consent-settings'
    );

    if (analyticsCheckbox) {
      const saved = readConsent();

      analyticsCheckbox.checked =
        saved ? saved.analytics : false;
    }

    settings.hidden = false;

    const saveButton = settings.querySelector(
      '.mt-consent-save'
    );

    if (saveButton) {
      saveButton.focus();
    }
  }

  function openPanel(settingsMode, trigger) {
    if (!consentPanel) return;

    if (settingsMode) {
      lastSettingsTrigger =
        trigger || document.activeElement;
    }

    consentPanel.hidden = false;

    const settings = consentPanel.querySelector(
      '.mt-consent-settings'
    );

    settings.hidden = !settingsMode;

    if (settingsMode) {
      showSettings();
    }
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text) {
      element.textContent = text;
    }

    return element;
  }

  function createButton(text, className, handler) {
    const button = createElement(
      'button',
      'mt-consent-button ' + className,
      text
    );

    button.type = 'button';

    button.addEventListener(
      'click',
      handler
    );

    return button;
  }

  function buildPanel() {
    const panel = createElement(
      'section',
      'mt-consent'
    );

    panel.id = 'mt-cookie-consent';

    panel.setAttribute(
      'aria-label',
      t.title
    );

    panel.setAttribute(
      'role',
      'region'
    );

    const title = createElement(
      'h2',
      'mt-consent-title',
      t.title
    );

    const description = createElement(
      'p',
      'mt-consent-description',
      t.description
    );

    const actions = createElement(
      'div',
      'mt-consent-actions'
    );

    actions.append(
      createButton(
        t.reject,
        '',
        () => saveChoice(false)
      ),

      createButton(
        t.settings,
        '',
        showSettings
      ),

      createButton(
        t.accept,
        'mt-consent-button-primary',
        () => saveChoice(true)
      )
    );

    const settings = createElement(
      'div',
      'mt-consent-settings'
    );

    settings.hidden = true;

    const necessaryRow = createElement(
      'div',
      'mt-consent-setting'
    );

    const necessaryInfo = createElement('div');

    necessaryInfo.append(
      createElement(
        'strong',
        'mt-consent-setting-name',
        t.necessary
      ),

      createElement(
        'span',
        'mt-consent-setting-description',
        t.necessaryDescription
      )
    );

    necessaryRow.append(
      necessaryInfo,

      createElement(
        'span',
        'mt-consent-setting-status',
        t.alwaysActive
      )
    );

    const analyticsRow = createElement(
      'label',
      'mt-consent-setting'
    );

    const analyticsInfo = createElement('span');

    analyticsInfo.append(
      createElement(
        'strong',
        'mt-consent-setting-name',
        t.analytics
      ),

      createElement(
        'span',
        'mt-consent-setting-description',
        t.analyticsDescription
      )
    );

    analyticsCheckbox = createElement(
      'input',
      'mt-consent-toggle'
    );

    analyticsCheckbox.type = 'checkbox';

    analyticsCheckbox.setAttribute(
      'aria-label',
      t.analytics
    );

    analyticsRow.append(
      analyticsInfo,
      analyticsCheckbox
    );

    const settingsActions = createElement(
      'div',
      'mt-consent-settings-actions'
    );

    settingsActions.append(
      createButton(
        t.save,
        'mt-consent-button-primary mt-consent-save',
        () => saveChoice(analyticsCheckbox.checked)
      )
    );

    settings.append(
      necessaryRow,
      analyticsRow,
      settingsActions
    );

    const links = createElement(
      'div',
      'mt-consent-links'
    );

    const privacyLink = createElement(
      'a',
      'mt-consent-link',
      t.privacy
    );

    privacyLink.href = paths.privacy;

    const cookiesLink = createElement(
      'a',
      'mt-consent-link',
      t.cookies
    );

    cookiesLink.href = paths.cookies;

    links.append(
      privacyLink,
      cookiesLink
    );

    panel.append(
      title,
      description,
      actions,
      settings,
      links
    );

    return panel;
  }

  function addFooterSettings() {
    const footer = document.querySelector(
      '.site-footer'
    );

    if (!footer) return;

    if (
      footer.querySelector(
        '.mt-consent-footer-button'
      )
    ) {
      return;
    }

    const wrapper = createElement(
      'div',
      'mt-consent-footer-link'
    );

    const button = createElement(
      'button',
      'mt-consent-footer-button',
      t.change
    );

    button.type = 'button';

    button.addEventListener('click', () => {
      openPanel(true, button);
    });

    wrapper.appendChild(button);

    footer.appendChild(wrapper);
  }

  function addFooterCopyright() {
    const footer = document.querySelector(
      '.site-footer'
    );

    if (
      !footer ||
      footer.querySelector('.mt-footer-copyright')
    ) {
      return;
    }

    const year = new Date().getFullYear();

    const text = language === 'hr'
      ? `© ${year} MOVE&TRY. Sva prava pridržana.`
      : `© ${year} MOVE&TRY. All rights reserved.`;

    const copyright = createElement(
      'p',
      'mt-footer-copyright',
      text
    );

    footer.appendChild(copyright);
  }

  /*
   * Public API for website navigation
   * and the installed PWA settings panel.
   */

  window.MoveTryConsent = {
    openSettings(trigger) {
      openPanel(true, trigger);
    },

    setLanguage(nextLanguage) {
      if (
        nextLanguage !== 'hr' &&
        nextLanguage !== 'en'
      ) {
        return;
      }

      if (nextLanguage === language) {
        return;
      }

      language = nextLanguage;

      t = translations[language];

      paths = language === 'hr'
        ? {
            privacy: '/hr/privacy-policy.html',
            cookies: '/hr/cookie-policy.html'
          }
        : {
            privacy: '/privacy-policy.html',
            cookies: '/cookie-policy.html'
          };

      if (consentPanel) {
        const wasVisible = !consentPanel.hidden;

        const settingsOpen =
          !consentPanel.querySelector(
            '.mt-consent-settings'
          ).hidden;

        consentPanel.remove();

        consentPanel = buildPanel();

        document.body.appendChild(consentPanel);

        consentPanel.hidden = !wasVisible;

        consentPanel.querySelector(
          '.mt-consent-settings'
        ).hidden = !settingsOpen;

        if (analyticsCheckbox) {
          const saved = readConsent();

          analyticsCheckbox.checked =
            saved ? saved.analytics : false;
        }
      }
    }
  };

  function initialize() {
    const stored = readConsent();

    consentPanel = buildPanel();

    document.body.appendChild(consentPanel);

    addFooterSettings();

    addFooterCopyright();

    if (stored) {
      applyConsent(stored.analytics);

      closePanel();
    } else {
      removeAnalyticsCookies();

      openPanel(false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialize
    );
  } else {
    initialize();
  }

})();
