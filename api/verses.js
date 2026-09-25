// Vercel serverless function.
// Receives { topic, count } from the frontend, asks Gemini which verses fit
// best, then fetches the exact NLT verse text so the wording is guaranteed
// accurate (never AI-paraphrased scripture).

const { fetchNltText } = require('./_lib/bible');

// "-latest" aliases always point at Google's current recommended model in
// that tier, so these won't break as dated model versions get retired.
// Two tiers are tried in turn: a 503 "model overloaded" usually means one
// model's shared capacity is briefly saturated, and the lite tier is a
// separate capacity pool, so it often succeeds when the main one is busy.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

// How many times to retry one model on a temporary (503/429) error before
// moving on to the next model.
const RETRIES_PER_MODEL = 2;

// The slider in the app allows 1-10 verses; 5 if nothing is sent.
const MIN_VERSES = 1;
const MAX_VERSES = 10;
const DEFAULT_VERSES = 5;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { topic, count } = req.body || {};
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    res.status(400).json({ error: 'Please enter a topic.' });
    return;
  }
  const cleanTopic = topic.trim().slice(0, 200);
  // Never trust a number from the browser blindly: round it and keep it in range.
  const n = Number.isFinite(Number(count))
    ? Math.min(MAX_VERSES, Math.max(MIN_VERSES, Math.round(Number(count))))
    : DEFAULT_VERSES;

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const NLT_API_KEY = process.env.NLT_API_KEY || 'TEST';

  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: 'Server is missing GEMINI_API_KEY. Set it in your environment variables.' });
    return;
  }

  try {
    const picks = await getVersePicks(cleanTopic, n, GEMINI_API_KEY);

    const verses = await Promise.all(
      picks.slice(0, n).map(async (pick) => {
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

// Calls one Gemini model once. Throws an Error with `.status` set to the HTTP
// status Gemini returned, so the caller can decide whether to retry.
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

async function getVersePicks(topic, n, apiKey) {
  const prompt = `You are a knowledgeable Bible study assistant. A user wants Bible verses about this topic: "${topic}".

Return the ${n} single Bible ${n === 1 ? 'verse' : 'verses'} (not passages or ranges — one verse each) most directly applicable to this topic, ordered from most to least relevant. Only include verses that genuinely fit; never repeat a verse. For each, give a one-sentence, plain-English explanation of why it fits.

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
        if (!isTransient) throw err; // real errors (bad key, bad request) aren't worth retrying
        if (attempt < RETRIES_PER_MODEL) {
          // Short backoff with a little randomness: ~300ms, then ~700ms.
          await sleep(300 * Math.pow(2, attempt) + Math.random() * 150);
        }
      }
    }
  }

  lastErr.isGeminiOverload = true;
  throw lastErr;
}
