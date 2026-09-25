// Vercel serverless function.
// Given a single verse reference, returns its text in NLT, ESV, NIV, and
// The Message. NLT always works (via the NLT API). ESV/NIV/MSG require their
// own free API keys, set as Vercel environment variables:
//   ESV_API_KEY   — from api.esv.org (free, requires quick app approval)
//   BIBLE_API_KEY — from scripture.api.bible (free Starter plan, pick NIV + MSG
//                   as your 2 of 3 allowed copyrighted translations)
// Until those are set, this returns a friendly "not configured" message
// instead of failing the whole request.
//
// NIV/MSG results also carry a `fumsToken` and `copyright` string. api.bible's
// terms require any web page displaying their text to "report" that the text
// was actually shown, using that token (see the FUMS tracker in index.html) —
// this is how they account for usage back to the publishers (Biblica, NavPress)
// in exchange for offering the translations for free on a personal-use plan.

const { fetchNltText, fetchEsvText, fetchApiBibleText } = require('./_lib/bible');

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
  const ref = reference.trim().slice(0, 100);

  const NLT_API_KEY = process.env.NLT_API_KEY || 'TEST';
  const ESV_API_KEY = process.env.ESV_API_KEY;
  const BIBLE_API_KEY = process.env.BIBLE_API_KEY;

  try {
    const [nlt, esv, niv, msg] = await Promise.all([
      fetchNltText(ref, NLT_API_KEY),
      fetchEsvText(ref, ESV_API_KEY),
      fetchApiBibleText(ref, BIBLE_API_KEY, { abbreviation: 'NIV', nameIncludes: 'New International' }),
      fetchApiBibleText(ref, BIBLE_API_KEY, { abbreviation: 'MSG', nameIncludes: 'Message' })
    ]);

    const translations = [
      {
        code: 'NLT',
        name: 'New Living Translation',
        text: nlt,
        message: nlt ? null : 'Could not load this verse right now.'
      },
      {
        code: 'ESV',
        name: 'English Standard Version',
        text: esv,
        message: ESV_API_KEY
          ? (esv ? null : 'Could not load this verse right now.')
          : 'Add a free ESV_API_KEY (from api.esv.org) in Vercel to enable this translation.'
      },
      {
        code: 'NIV',
        name: 'New International Version',
        text: niv ? niv.text : null,
        copyright: niv ? niv.copyright : null,
        fumsToken: niv ? niv.fumsToken : null,
        message: BIBLE_API_KEY
          ? (niv ? null : 'Could not load this verse right now.')
          : 'Add a free BIBLE_API_KEY (from scripture.api.bible) in Vercel to enable this translation.'
      },
      {
        code: 'MSG',
        name: 'The Message',
        text: msg ? msg.text : null,
        copyright: msg ? msg.copyright : null,
        fumsToken: msg ? msg.fumsToken : null,
        message: BIBLE_API_KEY
          ? (msg ? null : 'Could not load this verse right now.')
          : 'Add a free BIBLE_API_KEY (from scripture.api.bible) in Vercel to enable this translation.'
      }
    ];

    res.status(200).json({ reference: ref, translations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
};
