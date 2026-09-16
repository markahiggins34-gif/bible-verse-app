// Vercel serverless function.
// Receives { topic } from the frontend, asks Gemini which 5 verses fit best,
// then fetches the exact NLT verse text from the NLT API so the wording is
// guaranteed accurate (never AI-paraphrased scripture).

// "-latest" aliases always point at Google's current recommended model in
// that tier, so these won't break as specific dated model versions get
// retired. Two different tiers (flash, then flash-lite) are tried in turn:
// a 503 "model overloaded" usually means Google's shared capacity for one
// specific model is briefly saturated, and the lite tier is a separate
// capacity pool, so it often succeeds even when the main flash pool is busy.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

// How many times to retry a single model on a transient (503/429) error
// before moving on to the next model in GEMINI_MODELS.
const RETRIES_PER_MODEL = 2;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { topic } = req.body || {};
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    res.status(400).json({ error: 'Please enter a topic.' });
    return;
  }
  const cleanTopic = topic.trim().slice(0, 200);

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const NLT_API_KEY = process.env.NLT_API_KEY || 'TEST';

  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: 'Server is missing GEMINI_API_KEY. Set it in your environment variables.' });
    return;
  }

  try {
    const picks = await getVersePicks(cleanTopic, GEMINI_API_KEY);

    const verses = await Promise.all(
      picks.slice(0, 5).map(async (pick) => {
        const text = await fetchNltText(pick.reference, NLT_API_KEY);
        return {
          reference: pick.reference,
          reason: pick.reason,
          text: text || 'Verse text unavailable right now — the reference may not have matched the Bible text lookup.'
        };
      })
    );

    res.status(200).json({ topic: cleanTopic, verses });
  } catch (err) {
    console.error(err);
    if (err.isGeminiOverload) {
      res.status(503).json({ error: "Google's AI service is unusually busy right now. Please wait a few seconds and try again." });
      return;
    }
    res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Calls one Gemini model once. Throws an Error with a numeric `.status`
// property set to the HTTP status Gemini returned, so the caller can decide
// whether it's worth retrying.
async function callGemini(model, prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4
      }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    const error = new Error(`Gemini API error (${resp.status}): ${errText.slice(0, 300)}`);
    error.status = resp.status;
    throw error;
  }

  const data = await resp.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini returned no content.');

  let picks;
  try {
    picks = JSON.parse(rawText);
  } catch {
    throw new Error('Could not parse Gemini response as JSON.');
  }

  if (!Array.isArray(picks) || picks.length === 0) {
    throw new Error('Gemini did not return any verse picks.');
  }
  return picks;
}

async function getVersePicks(topic, apiKey) {
  const prompt = `You are a knowledgeable Bible study assistant. A user wants Bible verses about this topic: "${topic}".

Return the 5 single Bible verses (not passages or ranges — one verse each) most directly applicable to this topic, ordered from most to least relevant. For each, give a one-sentence, plain-English explanation of why it fits.

Respond with ONLY valid JSON, no markdown formatting, matching exactly this shape:
[{"reference": "Book Chapter:Verse", "reason": "one sentence"}]

Use standard English book names (e.g. "John", "1 Corinthians", "Psalm").`;

  let lastErr;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt <= RETRIES_PER_MODEL; attempt++) {
      try {
        return await callGemini(model, prompt, apiKey);
      } catch (err) {
        lastErr = err;
        const isTransient = err.status === 503 || err.status === 429;
        if (!isTransient) throw err; // real errors (bad key, bad request) shouldn't be retried
        if (attempt < RETRIES_PER_MODEL) {
          // Short exponential backoff with jitter: ~300ms, then ~700ms.
          await sleep(300 * Math.pow(2, attempt) + Math.random() * 150);
        }
        // otherwise fall through to the next model, if any
      }
    }
  }

  lastErr.isGeminiOverload = true;
  throw lastErr;
}

// The NLT API wants references like "John.3.16" (Book.Chapter.Verse, no spaces).
// Book names vary in how they're joined (e.g. "1 Corinthians" -> "1Corinthians"),
// so we try a couple of reasonable formats until one returns real text.
function buildRefCandidates(reference) {
  const match = String(reference).trim().match(/^(\d?\s?[A-Za-z][A-Za-z .]*?)\s+(\d+):(\d+)$/);
  if (!match) return [String(reference).trim()];
  const [, book, chapter, verse] = match;
  const trimmedBook = book.trim();
  const noSpace = trimmedBook.replace(/\s+/g, '');
  const dashed = trimmedBook.replace(/\s+/g, '-');
  const candidates = new Set([
    `${noSpace}.${chapter}.${verse}`,
    `${dashed}.${chapter}.${verse}`,
    `${trimmedBook}.${chapter}.${verse}`
  ]);
  return [...candidates];
}

async function fetchNltText(reference, apiKey) {
  const candidates = buildRefCandidates(reference);
  for (const ref of candidates) {
    try {
      const url = `https://api.nlt.to/api/passages?ref=${encodeURIComponent(ref)}&version=NLT&key=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const html = await resp.text();
      const text = cleanVerseHtml(html);
      if (text && text.length > 3) return text;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function cleanVerseHtml(html) {
  return html
    .replace(/<h\d[^>]*>[\s\S]*?<\/h\d>/gi, '')
    .replace(/<sup[^>]*class="vn"[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&ldquo;/g, '“')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&amp;/g, '&')
    // The unregistered/"TEST" key tier stamps a watermark like "NLT API #123456"
    // into the response — strip it so it never shows up in the app.
    .replace(/NLT\s*API\s*#\s*\d+\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
