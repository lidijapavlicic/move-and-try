(() => {
  'use strict';

  const DATA_URL = '/data/where-to-try.json';
  const language = document.documentElement.lang === 'en' ? 'en' : 'hr';

  const copy = language === 'en'
    ? {
        emptyCategory: "There are no published places to try in this category yet. We'll keep expanding the list as MOVE&TRY adds new activities and verified opportunities.",
        findWhereToTry: 'FIND WHERE TO TRY →',
        seeWhereToTry: 'SEE WHERE TO TRY →',
        noMatches: 'No published places match your search.'
      }
    : {
        emptyCategory: 'Ovdje još nema objavljenih mjesta za probati. Popis ćemo širiti kako na MOVE&TRY dodajemo nove aktivnosti i provjerene mogućnosti.',
        findWhereToTry: 'PRONAĐI GDJE PROBATI →',
        seeWhereToTry: 'POGLEDAJ GDJE PROBATI →',
        noMatches: 'Nema objavljenih mjesta za odabranu pretragu.'
      };

  const categoryButtons = document.querySelectorAll('.where-category');
  const categoryResults = document.getElementById('category-results');
  const selectedCategory = document.getElementById('selected-category');
  const activityGrid = document.getElementById('where-activity-grid');
  const providerResults = document.getElementById('provider-results');
  const providerActivityTitle = document.getElementById('provider-activity-title');
  const providerList = document.getElementById('where-provider-list');
  const providerBack = document.getElementById('provider-back');
  const whereSearch = document.getElementById('where-search-input');
  const whereSearchClear = document.getElementById('where-search-clear');
  const wherePublishedList = document.getElementById('where-published-list');

  let providers = [];
  let activitiesByCategory = {
    move: [],
    learn: [],
    create: [],
    explore: [],
    dare: [],
    care: []
  };
  let activeWhereCategory = '';

  function normalizeProvider(provider) {
    return {
      id: provider.id || '',
      category: String(provider.category || '').toLowerCase(),
      activity: provider.activity?.[language] || '',
      name: provider.name || '',
      city: provider.city || '',
      area: provider.area || '',
      address: provider.address || '',
      postalCode: provider.postalCode || '',
      image: provider.image || '',
      imageFit: provider.imageFit || 'cover',
      description: provider.description?.[language] || '',
      tags: Array.isArray(provider.tags?.[language]) ? provider.tags[language] : [],
      href: provider.url?.[language] || '#',
      publishedAt: provider.publishedAt || ''
    };
  }

  function buildActivityIndex() {
    activitiesByCategory = {
      move: [],
      learn: [],
      create: [],
      explore: [],
      dare: [],
      care: []
    };

    providers.forEach(provider => {
      const category = provider.category;
      if (!activitiesByCategory[category]) return;

      let activity = activitiesByCategory[category]
        .find(item => item.title === provider.activity);

      if (!activity) {
        activity = {
          title: provider.activity,
          providers: []
        };
        activitiesByCategory[category].push(activity);
      }

      activity.providers.push(provider);
    });
  }

  function renderCategory(category) {
    if (!categoryResults || !selectedCategory || !activityGrid) return;

    const activities = activitiesByCategory[category] || [];

    if (providerResults) providerResults.hidden = true;
    categoryResults.hidden = false;
    selectedCategory.textContent = category.toUpperCase();
    activityGrid.innerHTML = '';

    if (!activities.length) {
      const empty = document.createElement('p');
      empty.className = 'where-empty-category';
      empty.textContent = copy.emptyCategory;
      activityGrid.appendChild(empty);
      return;
    }

    activities.forEach(activity => {
      const card = document.createElement('a');
      card.className = 'where-activity-card';
      card.href = '#';

      const title = document.createElement('h3');
      title.textContent = activity.title;

      const action = document.createElement('span');
      action.className = 'where-activity-card-action';
      action.textContent = copy.findWhereToTry;

      card.append(title, action);

      card.addEventListener('click', event => {
        event.preventDefault();
        renderProviders(activity);
      });

      activityGrid.appendChild(card);
    });
  }

  function renderProviders(activity) {
    if (!providerResults || !providerActivityTitle || !providerList) return;

    if (categoryResults) categoryResults.hidden = true;

    providerResults.hidden = false;
    providerActivityTitle.textContent = activity.title;
    providerList.innerHTML = '';

    activity.providers.forEach(provider => {
      const card = document.createElement('article');
      card.className = 'where-provider-card';
      card.dataset.imageFit = provider.imageFit || 'cover';

      const visual = document.createElement('div');
      visual.className = 'where-provider-visual';

      const image = document.createElement('img');
      image.src = provider.image;
      image.alt = provider.name;
      image.className = 'where-provider-image';
      image.loading = 'lazy';

      visual.appendChild(image);

      const content = document.createElement('div');
      content.className = 'where-provider-content';

      const location = document.createElement('p');
      location.className = 'where-provider-location';
      location.textContent = [provider.city, provider.area]
        .filter(Boolean)
        .join(' · ');

      const title = document.createElement('h3');
      title.textContent = provider.name;

      const address = document.createElement('p');
      address.className = 'where-provider-address';
      address.innerHTML = [provider.address, provider.postalCode]
        .filter(Boolean)
        .join('<br>');

      const description = document.createElement('p');
      description.className = 'where-provider-description';
      description.textContent = provider.description;

      const tags = document.createElement('div');
      tags.className = 'where-provider-tags';

      provider.tags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.textContent = tag;
        tags.appendChild(tagElement);
      });

      const link = document.createElement('a');
      link.href = provider.href;
      link.className = 'where-provider-link';
      link.textContent = copy.seeWhereToTry;

      content.append(
        location,
        title,
        address,
        description,
        tags,
        link
      );

      card.append(visual, content);
      providerList.appendChild(card);
    });

    providerResults.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  function renderPublished() {
    if (!wherePublishedList) return;

    const query = (whereSearch?.value || '')
      .trim()
      .toLocaleLowerCase();

    if (whereSearchClear) {
      whereSearchClear.hidden =
        !query &&
        !activeWhereCategory;
    }

    const matches = providers.filter(provider => {
      if (
        activeWhereCategory &&
        provider.category !== activeWhereCategory
      ) {
        return false;
      }

      if (!query) return true;

      const searchable = [
        provider.category,
        provider.activity,
        provider.name,
        provider.city,
        provider.area,
        provider.address,
        provider.postalCode,
        provider.description,
        ...provider.tags
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();

      return searchable.includes(query);
    });

    wherePublishedList.innerHTML = '';

    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'where-published-empty';
      empty.textContent = copy.noMatches;
      wherePublishedList.appendChild(empty);
      return;
    }

    matches.forEach(provider => {
      const link = document.createElement('a');
      link.className = 'where-published-item';
      link.href = provider.href;
      link.dataset.imageFit = provider.imageFit || 'cover';

      const visual = document.createElement('div');
      visual.className = 'where-published-visual';

      const image = document.createElement('img');
      image.src = provider.image;
      image.alt = provider.name;
      image.loading = 'lazy';

      visual.appendChild(image);

      const info = document.createElement('div');
      info.className = 'where-published-info';

      const meta = document.createElement('span');
      meta.className = 'where-published-meta';
      meta.textContent =
        provider.category.toUpperCase() +
        ' · ' +
        provider.activity;

      const title = document.createElement('h3');
      title.textContent = provider.name;

      const description = document.createElement('p');
      description.textContent = provider.description;

      const action = document.createElement('span');
      action.className = 'where-published-action';
      action.textContent = copy.seeWhereToTry;

      info.append(
        meta,
        title,
        description,
        action
      );

      link.append(visual, info);
      wherePublishedList.appendChild(link);
    });
  }

  function bindEvents() {
    if (whereSearch) {
      whereSearch.addEventListener('input', () => {
        activeWhereCategory = '';

        categoryButtons.forEach(
          button =>
            button.classList.remove('active')
        );

        if (categoryResults) {
          categoryResults.hidden = true;
        }

        if (providerResults) {
          providerResults.hidden = true;
        }

        renderPublished();
      });
    }

    if (whereSearchClear) {
      whereSearchClear.addEventListener('click', () => {
        if (whereSearch) {
          whereSearch.value = '';
        }

        activeWhereCategory = '';

        categoryButtons.forEach(
          button =>
            button.classList.remove('active')
        );

        if (categoryResults) {
          categoryResults.hidden = true;
        }

        if (providerResults) {
          providerResults.hidden = true;
        }

        renderPublished();
        whereSearch?.focus();
      });
    }

    categoryButtons.forEach(button => {
      button.addEventListener(
        'click',
        event => {
          event.preventDefault();
          event.stopImmediatePropagation();

          const category =
            button.dataset.category;

          const wasSelected =
            activeWhereCategory === category;

          activeWhereCategory =
            wasSelected
              ? ''
              : category;

          renderPublished();

          categoryButtons.forEach(
            item =>
              item.classList.remove('active')
          );

          if (activeWhereCategory) {
            button.classList.add('active');
            renderCategory(category);
          } else {
            if (categoryResults) {
              categoryResults.hidden = true;
            }

            if (providerResults) {
              providerResults.hidden = true;
            }
          }
        },
        true
      );
    });

    if (providerBack) {
      providerBack.addEventListener(
        'click',
        event => {
          event.preventDefault();
          event.stopImmediatePropagation();

          providerResults.hidden = true;
          categoryResults.hidden = false;

          categoryResults.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        },
        true
      );
    }
  }

  async function loadData() {
    try {
      const response =
        await fetch(DATA_URL, {
          cache: 'no-cache'
        });

      if (!response.ok) {
        throw new Error(
          'Where to Try HTTP ' +
          response.status
        );
      }

      const data = await response.json();

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
          .map(normalizeProvider)
          .filter(provider =>
            provider.activity &&
            provider.href !== '#'
          )
          .sort(
            (a, b) =>
              String(b.publishedAt)
                .localeCompare(
                  String(a.publishedAt)
                )
          );

      buildActivityIndex();
    } catch (error) {
      console.warn(
        'MOVE&TRY Where to Try:',
        error
      );

      providers = [];
      buildActivityIndex();
    }

    renderPublished();
  }

  bindEvents();
  loadData();
})();
