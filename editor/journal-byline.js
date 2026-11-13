(() => {
  'use strict';

  function isMoveTrySignature(signature) {
    return /\|\s*MOVE\s*&\s*TRY$/i.test(signature);
  }

  function columnAuthor(byline) {
    const signature = byline?.trim() || 'MOVE&TRY Editorial';
    // Keep branded signatures such as "Lidija | MOVE&TRY" intact.
    if (isMoveTrySignature(signature)) return signature;

    // Older column signatures can already include "| column title".
    return signature.split('|', 1)[0].trim() || signature;
  }

  function columnCard(byline, columnTitle) {
    const author = columnAuthor(byline);
    const title = columnTitle?.trim();
    return title && !isMoveTrySignature(author) ? author + ' | ' + title : author;
  }

  function formatPublicationDate(publishedAt, lang) {
    if (!publishedAt) return '';
    const date = new Date(publishedAt);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(lang === 'hr' ? 'hr-HR' : 'en-GB', {
      timeZone: 'Europe/Zagreb'
    });
  }

  window.MoveTryJournalByline = { columnAuthor, columnCard, formatPublicationDate };
})();
