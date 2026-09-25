// Vercel serverless function.
// Given a verse reference like "Psalm 1:3", returns the whole chapter
// (Psalm 1) in the NLT, split into numbered verses plus section headings.
// Uses the same NLT API as the rest of the app, so no new keys are needed.

const { fetchNltChapter } = require('./_lib/bible');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { reference } = req.body || {};
  if (!reference || typeof reference !== 'string' || !reference.trim()) {
    res.status(400).json({ error: 'Missing verse reference.' });
    return;
  }

  const NLT_API_KEY = process.env.NLT_API_KEY || 'TEST';

  try {
    const chapter = await fetchNltChapter(reference.trim().slice(0, 100), NLT_API_KEY);
    if (!chapter) {
      res.status(404).json({ error: 'Could not load this chapter right now.' });
      return;
    }
    res.status(200).json(chapter);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
};
