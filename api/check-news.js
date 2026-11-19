// POST /api/check-news
// Body (JSON): { "text": "<claim or short news text>", "lang": "en" }
// Looks the claim up in published fact-checks (Google Fact Check Tools API).
// Returns: { verdict: "fake"|"unclear"|"true", confidence, reasons: [...], sources: [{publisher,title,url,rating}] }

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 10;
}

const FAKE_RE = /(false|fake|hoax|incorrect|misleading|pants on fire|fabricated|satire|not true|no evidence|manipulated|altered|scam|fals|inexact|neadevarat|înșelător|insel)/i;
const TRUE_RE = /(^|\b)(true|correct|accurate|mostly true|real|authentic|adevarat|adevărat|corect)(\b|$)/i;

function classify(rating) {
  const r = String(rating || '');
  if (FAKE_RE.test(r)) return 'fake';
  if (TRUE_RE.test(r)) return 'true';
  return 'unclear';
}

function summarize(claims) {
  const sources = [];
  const tally = { fake: 0, true: 0, unclear: 0 };
  for (const c of claims || []) {
    for (const rv of c.claimReview || []) {
      const cls = classify(rv.textualRating);
      tally[cls]++;
      if (sources.length < 6) {
        sources.push({
          publisher: (rv.publisher && rv.publisher.name) || '',
          title: rv.title || c.text || '',
          url: rv.url || '',
          rating: rv.textualRating || '',
        });
      }
    }
  }
  const total = tally.fake + tally.true + tally.unclear;
  if (total === 0) {
    return {
      verdict: 'unclear',
      confidence: 0,
      reasons: ['No published fact-check found for this claim. That does not mean it is true or false.'],
      sources: [],
    };
  }
  let verdict = 'unclear';
  if (tally.fake > 0 && tally.true === 0 && tally.fake >= tally.unclear) verdict = 'fake';
  else if (tally.true > 0 && tally.fake === 0 && tally.true >= tally.unclear) verdict = 'true';
  const top = verdict === 'unclear' ? Math.max(tally.unclear, tally.fake, tally.true) : tally[verdict];
  const confidence = verdict === 'unclear' ? 50 : Math.round((top / total) * 100);
  const reasons = [];
  if (verdict === 'fake') reasons.push(`${tally.fake} fact-checking publication(s) rated this claim false or misleading`);
  else if (verdict === 'true') reasons.push(`${tally.true} fact-checking publication(s) rated this claim true`);
  else reasons.push('Fact-checkers disagree or their ratings are not clear-cut');
  return { verdict, confidence, reasons, sources };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });

  const key = process.env.GOOGLE_FACTCHECK_KEY;
  if (!key) return res.status(503).json({ error: 'not_configured' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < 8) return res.status(400).json({ error: 'text_too_short' });

  const query = text.slice(0, 250);
  const lang = body && typeof body.lang === 'string' ? body.lang.slice(0, 5) : '';
  const url =
    'https://factchecktools.googleapis.com/v1alpha1/claims:search?pageSize=10&query=' +
    encodeURIComponent(query) +
    (lang ? '&languageCode=' + encodeURIComponent(lang) : '') +
    '&key=' + encodeURIComponent(key);

  try {
    const r = await fetch(url);
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) return res.status(502).json({ error: 'factcheck_error' });
    return res.status(200).json(summarize(data.claims));
  } catch (e) {
    return res.status(502).json({ error: 'factcheck_unreachable' });
  }
}

module.exports = handler;
module.exports.summarize = summarize;
module.exports.classify = classify;
