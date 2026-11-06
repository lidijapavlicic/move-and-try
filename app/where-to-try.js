(() => {
  'use strict';

  const DATA_URL = '/data/where-to-try.json';

  let providers = [];
  let loaded = false;
  let loadingPromise = null;

  function normalizeLanguage(language) {
    return language === 'en'
      ? 'en'
      : 'hr';
  }

  function normalizeProvider(provider, language) {
    const lang =
      normalizeLanguage(language);

    return {
      id:
        provider.id || '',

      category:
        provider.category || '',

      activity:
        provider.activity?.[lang] || '',

      name:
        provider.name || '',

      city:
        provider.city || '',

      area:
        provider.area || '',

      address:
        provider.address || '',

      postalCode:
        provider.postalCode || '',

      image:
        provider.image || '',

      imageFit:
        provider.imageFit || 'cover',

      description:
        provider.description?.[lang] || '',

      tags:
        Array.isArray(
          provider.tags?.[lang]
        )
          ? provider.tags[lang]
          : [],

      url:
        provider.url?.[lang] || '#',

      publishedAt:
        provider.publishedAt || ''
    };
  }

  async function load() {
    if (loaded) {
      return providers;
    }

    if (loadingPromise) {
      return loadingPromise;
    }

    loadingPromise = fetch(
      DATA_URL,
      {
        cache: 'no-cache'
      }
    )
      .then(response => {
        if (!response.ok) {
          throw new Error(
            'Where to Try HTTP ' +
            response.status
          );
        }

        return response.json();
      })
      .then(data => {
        if (
          !data ||
          !Array.isArray(data.providers)
        ) {
          throw new Error(
            'Invalid Where to Try data'
          );
        }

        providers =
          data.providers
            .filter(provider =>
              provider &&
              provider.published === true &&
              provider.id &&
              provider.category &&
              provider.activity &&
              provider.name &&
              provider.url &&
              provider.publishedAt
            )
            .sort(
              (a, b) =>
                String(
                  b.publishedAt
                )
                  .localeCompare(
                    String(
                      a.publishedAt
                    )
                  )
            );

        loaded = true;

        return providers;
      })
      .catch(error => {
        console.warn(
          'MOVE&TRY Where to Try:',
          error
        );

        providers = [];
        loaded = false;

        throw error;
      })
      .finally(() => {
        loadingPromise = null;
      });

    return loadingPromise;
  }

  function getProviders(language = 'hr') {
    const lang =
      normalizeLanguage(language);

    return providers.map(
      provider =>
        normalizeProvider(
          provider,
          lang
        )
    );
  }

  function isLoaded() {
    return loaded;
  }

  window.MoveTryWhereToTry = {
    load,
    getProviders,
    isLoaded
  };

})();
