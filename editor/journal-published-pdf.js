const cdn = 'https://cdn.jsdelivr.net/npm/pdfmake@0.3.14/build/';
const scripts = [
  ['pdfmake.min.js', 'cBs99oVmpAk4AiRofg7YMpyFITGSJaVZ9HzRYyTS8sqEEF56hKBVjp3s+VxXh8GD'],
  ['vfs_fonts.js', '9S7Ilxk6Bury0z1E97Cu5/6L5cbtrw+G107/510IFVp+yr3HL03mhYwvDqMVryit']
];
const serifFont = 'https://fonts.gstatic.com/s/dmserifdisplay/v17/-nFnOHM81r4j6k0gjAW3mujVU2B2K_c.ttf';
const manropeFont = 'https://fonts.gstatic.com/s/manrope/v23/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk79FO_F.ttf';
const manropeBold = 'https://fonts.gstatic.com/s/manrope/v23/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk4aE-_F.ttf';
let library;

function addScript([name, digest]) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = cdn + name;
    script.integrity = 'sha384-' + digest;
    script.crossOrigin = 'anonymous';
    const failed = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error('PDF library could not be loaded.'));
    };
    const timer = setTimeout(failed, 15000);
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = failed;
    document.head.append(script);
  });
}

async function fontFile(url) {
  const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Journal font could not be loaded.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}

function loadLibrary() {
  library ||= (async () => {
    if (!window.pdfMake) await addScript(scripts[0]);
    await addScript(scripts[1]);
    const pdfMake = window.pdfMake;
    try {
      const [serif, regular, bold] = await Promise.all([serifFont, manropeFont, manropeBold].map(fontFile));
      pdfMake.addVirtualFileSystem({
        'JournalSerif.ttf': serif,
        'JournalSans.ttf': regular,
        'JournalSansBold.ttf': bold
      });
      pdfMake.addFonts({
        JournalSerif: { normal: 'JournalSerif.ttf', bold: 'JournalSerif.ttf', italics: 'JournalSerif.ttf', bolditalics: 'JournalSerif.ttf' },
        JournalSans: { normal: 'JournalSans.ttf', bold: 'JournalSansBold.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' }
      });
      return { pdfMake, serif: 'JournalSerif', sans: 'JournalSans' };
    } catch (_) {
      return { pdfMake, serif: 'Roboto', sans: 'Roboto' };
    }
  })().catch(error => {
    library = null;
    throw error;
  });
  return library;
}

function inline(element, formatting = {}) {
  return Array.from(element.childNodes).flatMap(node => {
    if (node.nodeType === 3) return [{ text: node.nodeValue, ...formatting }];
    if (node.nodeType !== 1) return [];
    if (node.tagName === 'BR') return [{ text: '\n' }];
    if (node.tagName === 'A') {
      const url = new URL(node.href, 'https://moveandtry.com');
      if (url.protocol === 'https:') {
        return inline(node, { ...formatting, link: url.href, color: '#45594a', decoration: 'underline' });
      }
    }
    return inline(node, {
      ...formatting,
      ...(node.tagName === 'STRONG' ? { bold: true } : {}),
      ...(node.tagName === 'EM' ? { italics: true } : {})
    });
  });
}

async function preparePhoto(image, maxWidth, maxHeight, imageFiles) {
  const url = new URL(image.getAttribute('src') || '', 'https://moveandtry.com');
  const siteImage = url.origin === 'https://moveandtry.com' && url.pathname.startsWith('/images/');
  const publicUpload = url.origin === 'https://pdyngeaykfpybeafjtpw.supabase.co' &&
    url.pathname.startsWith('/storage/v1/object/public/journal-published/');
  if (!siteImage && !publicUpload) throw new Error('Unsupported photo address.');

  let file = imageFiles.get(url.href);
  if (!(file instanceof Blob)) {
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Photo could not be loaded.');
    file = await response.blob();
  }
  const photo = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1500 / Math.max(photo.width, photo.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(photo.width * ratio));
    canvas.height = Math.max(1, Math.round(photo.height * ratio));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo, 0, 0, canvas.width, canvas.height);
    return {
      image: canvas.toDataURL('image/jpeg', 0.9),
      fit: [maxWidth, maxHeight],
      alignment: 'center',
      margin: [0, 8, 0, 12]
    };
  } finally {
    photo.close();
  }
}

async function photoBlock(figure, image, width, height, imageFiles) {
  const photo = await preparePhoto(image, width, height, imageFiles);
  const caption = figure.querySelector('figcaption')?.textContent;
  return caption
    ? { stack: [photo, { text: caption, style: 'caption' }], unbreakable: true }
    : photo;
}

const divider = () => ({
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: 499, y2: 0, lineWidth: 0.6, lineColor: '#cfd3ca' }],
  margin: [0, 15, 0, 17]
});

async function pdfBlock(node, media) {
  switch (node.tagName) {
    case 'P':
      return { text: inline(node), style: 'paragraph' };
    case 'H2':
    case 'H3':
      return { text: inline(node), style: node.tagName === 'H2' ? 'heading' : 'subheading' };
    case 'BLOCKQUOTE':
      return {
        table: { widths: ['*'], body: [[{ text: inline(node), style: 'quote' }]] },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: i => i === 0 ? 1.5 : 0,
          vLineColor: () => '#6f7967',
          paddingLeft: () => 15,
          paddingTop: () => 4,
          paddingBottom: () => 4
        },
        margin: [0, 13, 0, 15]
      };
    case 'HR':
      return divider();
    case 'OL':
    case 'UL': {
      const key = node.tagName.toLowerCase();
      return { [key]: Array.from(node.children, child => ({ text: inline(child) })), style: 'paragraph' };
    }
    case 'FIGURE': {
      if (node.hidden) return null;
      const image = node.querySelector('img[src]');
      if (!image) return null;
      const percent = parseFloat(image.style.width);
      const width = percent > 0 && percent <= 100 ? 499 * percent / 100 : 499;
      try {
        return await photoBlock(node, image, width, 400, media.images);
      } catch (error) {
        media.skipped++;
        return null;
      }
    }
    case 'A':
      return { text: inline({ childNodes: [node] }), style: 'paragraph' };
    case 'SECTION':
    case 'DIV':
      return { stack: (await Promise.all(Array.from(node.children, child => pdfBlock(child, media)))).filter(Boolean) };
    default:
      return null;
  }
}

export async function makePublishedPdf(html, language, articleUrl, imageFiles = []) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = doc.getElementById('journal-public-heading')?.textContent;
  const body = doc.getElementById('journal-public-content');
  if (!title || !body) throw new Error('Missing article content.');

  const media = { images: new Map(imageFiles), skipped: 0 };
  const meta = doc.getElementById('journal-public-meta').textContent;
  const excerpt = doc.getElementById('journal-public-intro').textContent;
  const byline = doc.getElementById('journal-public-byline').textContent;
  const cover = doc.querySelector('.journal-article-image-wrap');
  const [{ pdfMake, serif, sans }, blocks] = await Promise.all([
    loadLibrary(),
    Promise.all(Array.from(body.children, node => pdfBlock(node, media)))
  ]);
  const coverBlock = cover ? await pdfBlock(cover, media) : null;
  const content = [
    { text: meta, style: 'kicker' },
    { text: title, style: 'title' },
    excerpt && { text: excerpt, style: 'intro' },
    byline && { text: byline, style: 'byline' },
    coverBlock,
    ...blocks,
    { text: language === 'hr' ? 'Pročitaj na MOVE&TRY' : 'Read on MOVE&TRY',
      link: articleUrl, style: 'sourceLink' }
  ].filter(Boolean);
  const definition = {
    pageSize: 'A4',
    pageMargins: [48, 48, 48, 54],
    info: { title, author: byline, subject: 'The Journal · MOVE&TRY' },
    defaultStyle: { font: sans, fontSize: 11, lineHeight: 1.45, color: '#343832' },
    styles: {
      kicker: { fontSize: 9, bold: true, color: '#6f7967', margin: [0, 0, 0, 12] },
      title: { font: serif, fontSize: 36, color: '#17251e', margin: [0, 0, 0, 14] },
      intro: { fontSize: 13, margin: [0, 0, 0, 16] },
      byline: { fontSize: 10, bold: true, color: '#17251e', margin: [0, 0, 0, 17] },
      paragraph: { margin: [0, 0, 0, 13] },
      heading: { font: serif, fontSize: 24, margin: [0, 12, 0, 8] },
      subheading: { font: serif, fontSize: 18, margin: [0, 8, 0, 7] },
      quote: { font: serif, fontSize: 18, lineHeight: 1.35, color: '#282f27' },
      caption: { fontSize: 9, alignment: 'center', color: '#6a6e67', margin: [0, 0, 0, 12] },
      sourceLink: { fontSize: 9, color: '#45594a', decoration: 'underline', margin: [0, 12, 0, 0] }
    },
    footer: (page, pages) => ({
      text: 'THE JOURNAL · MOVE&TRY                                  ' + page + ' / ' + pages,
      alignment: 'center', fontSize: 8, color: '#6f7967'
    }),
    content
  };
  const fallbackFonts = {
    ...definition,
    defaultStyle: { ...definition.defaultStyle, font: 'Roboto' },
    styles: Object.fromEntries(Object.entries(definition.styles)
      .map(([name, style]) => [name, style.font ? { ...style, font: 'Roboto' } : style]))
  };

  let blob;
  try {
    blob = await pdfMake.createPdf(definition).getBlob();
  } catch (_) {
    blob = await pdfMake.createPdf(fallbackFonts).getBlob();
  }
  const fileName = title.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  return { blob, fileName: (fileName || 'the-journal') + '-' + language + '.pdf', skippedPhotos: media.skipped };
}

export function downloadPdf({ blob, fileName }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

