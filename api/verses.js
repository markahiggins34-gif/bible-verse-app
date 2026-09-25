// Vercel serverless function.
// Receives { topic } from the frontend, asks Gemini which 5 verses fit best,
// then fetches the exact NLT verse text so the wording is guaranteed accurate
// (never AI-paraphrased scripture).

const { fetchNltText } = require('./_lib/bible');

// "gemini-flash-latest" is an alias that always points at Google's current
// recommended fast model, so this won't break again as specific model
// versions get retired.
const GEMINI_MODEL = 'gemini-flash-latest';

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
    res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
};

async function getVersePicks(topic, apiKey) {
  const prompt = `You are a knowledgeable Bible study assistant. A user wants Bible verses about this topic: "${topic}".

Return the 5 single Bible verses (not passages or ranges — one verse each) most directly applicable to this topic, ordered from most to least relevant. For each, give a one-sentence, plain-English explanation of why it fits.

Respond with ONLY valid JSON, no markdown formatting, matching exactly this shape:
[{"reference": "Book Chapter:Verse", "reason": "one sentence"}]

Use standard English book names (e.g. "John", "1 Corinthians", "Psalm").`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
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
    throw new Error(`Gemini API error (${resp.status}): ${errText.slice(0, 300)}`);
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
