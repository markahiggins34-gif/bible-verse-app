// Shared Bible-reference helpers used by /api/verses and /api/translations.
// The underscore-prefixed folder tells Vercel this is NOT a route on its own.

function parseReference(reference) {
  const match = String(reference).trim().match(/^(\d?\s?[A-Za-z][A-Za-z .]*?)\s+(\d+):(\d+)$/);
  if (!match) return null;
  const [, book, chapter, verse] = match;
  return { book: book.trim(), chapter: Number(chapter), verse: Number(verse) };
}

// Standard USFM/USX 3-letter book codes, used by api.bible (ESV/NIV/MSG lookups).
const BOOK_CODES = {
  genesis: 'GEN', exodus: 'EXO', leviticus: 'LEV', numbers: 'NUM', deuteronomy: 'DEU',
  joshua: 'JOS', judges: 'JDG', ruth: 'RUT',
  '1 samuel': '1SA', '2 samuel': '2SA', '1 kings': '1KI', '2 kings': '2KI',
  '1 chronicles': '1CH', '2 chronicles': '2CH', ezra: 'EZR', nehemiah: 'NEH', esther: 'EST',
  job: 'JOB', psalm: 'PSA', psalms: 'PSA', proverbs: 'PRO', ecclesiastes: 'ECC',
  'song of solomon': 'SNG', 'song of songs': 'SNG',
  isaiah: 'ISA', jeremiah: 'JER', lamentations: 'LAM', ezekiel: 'EZK', daniel: 'DAN',
  hosea: 'HOS', joel: 'JOL', amos: 'AMO', obadiah: 'OBA', jonah: 'JON', micah: 'MIC',
  nahum: 'NAM', habakkuk: 'HAB', zephaniah: 'ZEP', haggai: 'HAG', zechariah: 'ZEC', malachi: 'MAL',
  matthew: 'MAT', mark: 'MRK', luke: 'LUK', john: 'JHN', acts: 'ACT', romans: 'ROM',
  '1 corinthians': '1CO', '2 corinthians': '2CO', galatians: 'GAL', ephesians: 'EPH',
  philippians: 'PHP', colossians: 'COL', '1 thessalonians': '1TH', '2 thessalonians': '2TH',
  '1 timothy': '1TI', '2 timothy': '2TI', titus: 'TIT', philemon: 'PHM', hebrews: 'HEB',
  james: 'JAS', '1 peter': '1PE', '2 peter': '2PE', '1 john': '1JN', '2 john': '2JN',
  '3 john': '3JN', jude: 'JUD', revelation: 'REV'
};

function bookCode(book) {
  const key = book.toLowerCase().replace(/\s+/g, ' ').trim();
  return BOOK_CODES[key] || null;
}

// The NLT API wants "Book.Chapter.Verse" — book names get joined differently
// depending on the book, so we try a few reasonable formats.
function nltRefCandidates(reference) {
  const parsed = parseReference(reference);
  if (!parsed) return [String(reference).trim()];
  const { book, chapter, verse } = parsed;
  const noSpace = book.replace(/\s+/g, '');
  const dashed = book.replace(/\s+/g, '-');
  return [...new Set([
    `${noSpace}.${chapter}.${verse}`,
    `${dashed}.${chapter}.${verse}`,
    `${book}.${chapter}.${verse}`
  ])];
}

function cleanNltHtml(html) {
  return html
    // The <head> contains <title>NLT API</title> — strip the whole block first,
    // otherwise that title text leaks into the verse text.
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<h\d[^>]*>[\s\S]*?<\/h\d>/gi, '')
    // Footnote apparatus: a "*" marker link, then a nested note span. Strip the
    // inner span first so the outer span's lazy match closes correctly.
    .replace(/<a[^>]*class="a-tn"[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<span[^>]*class="tn-ref"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<span[^>]*class="tn"[^>]*>[\s\S]*?<\/span>/gi, '')
    // Verse number, e.g. <span class="vn">13</span>
    .replace(/<span[^>]*class="vn"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&ldquo;/g, '“')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&amp;/g, '&')
    .replace(/NLT\s*API\s*#?\s*\d*\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchNltText(reference, apiKey) {
  for (const ref of nltRefCandidates(reference)) {
    try {
      const url = `https://api.nlt.to/api/passages?ref=${encodeURIComponent(ref)}&version=NLT&key=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const html = await resp.text();
      const text = cleanNltHtml(html);
      if (text && text.length > 3) return text;
    } catch {
      // try next candidate
    }
  }
  return null;
}

// ESV: Crossway's own API (api.esv.org). Requires a free key with app approval.
async function fetchEsvText(reference, apiKey) {
  if (!apiKey) return null;
  try {
    const url = `https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(reference)}&include-headings=false&include-footnotes=false&include-verse-numbers=false&include-short-copyright=false&include-passage-references=false&include-selahs=false`;
    const resp = await fetch(url, { headers: { Authorization: `Token ${apiKey}` } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data.passages && data.passages[0] ? data.passages[0].replace(/\s+/g, ' ').trim() : null;
    return text || null;
  } catch {
    return null;
  }
}

// NIV / MSG: American Bible Society's api.bible. Requires a free key, and the
// account owner picks up to 3 copyrighted translations on the free Starter plan.
const bibleIdCache = {};

async function findBibleId(apiKey, { abbreviation, nameIncludes }) {
  const cacheKey = abbreviation || nameIncludes;
  if (bibleIdCache[cacheKey]) return bibleIdCache[cacheKey];
  try {
    const resp = await fetch('https://rest.api.bible/v1/bibles?language=eng', {
      headers: { 'api-key': apiKey }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const list = data.data || [];
    let match = null;
    if (abbreviation) {
      match = list.find(b =>
        (b.abbreviation || '').toUpperCase() === abbreviation.toUpperCase() ||
        (b.abbreviationLocal || '').toUpperCase() === abbreviation.toUpperCase()
      );
    }
    if (!match && nameIncludes) {
      match = list.find(b =>
        (b.name || '').toLowerCase().includes(nameIncludes.toLowerCase()) ||
        (b.nameLocal || '').toLowerCase().includes(nameIncludes.toLowerCase())
      );
    }
    if (match) bibleIdCache[cacheKey] = match.id;
    return match ? match.id : null;
  } catch {
    return null;
  }
}

// Returns { text, copyright, fumsToken } or null. The fumsToken is required by
// api.bible's terms: any web page that displays their (licensed, copyrighted)
// text has to "report" that view back using this token — see FUMS below.
async function fetchApiBibleText(reference, apiKey, opts) {
  if (!apiKey) return null;
  const parsed = parseReference(reference);
  if (!parsed) return null;
  const code = bookCode(parsed.book);
  if (!code) return null;
  try {
    const bibleId = await findBibleId(apiKey, opts);
    if (!bibleId) return null;
    const verseId = `${code}.${parsed.chapter}.${parsed.verse}`;
    const url = `https://rest.api.bible/v1/bibles/${bibleId}/verses/${verseId}?content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=false&fums-version=3`;
    const resp = await fetch(url, { headers: { 'api-key': apiKey } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data.data && data.data.content ? data.data.content.replace(/\s+/g, ' ').trim() : null;
    if (!text) return null;
    return {
      text,
      copyright: (data.data && data.data.copyright) || null,
      fumsToken: (data.meta && data.meta.fumsToken) || null
    };
  } catch {
    return null;
  }
}

module.exports = {
  parseReference,
  bookCode,
  fetchNltText,
  fetchEsvText,
  fetchApiBibleText
};
