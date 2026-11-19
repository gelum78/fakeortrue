// POST /api/check-image
// Body (JSON): { "image": "<base64 or data URL>" }   (max ~3.3 MB of image data)
// Returns: { verdict: "fake"|"unclear"|"true", confidence: 0-100, ai_score: 0-1, reasons: [...], signals: {...} }

const MAX_BYTES = 3.3 * 1024 * 1024; // keeps the JSON body under Vercel's 4.5 MB limit
const hits = new Map(); // best-effort per-instance rate limit

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 10;
}

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return { type: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 7 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: 'image/png', ext: 'png' };
  if (buf.length > 11 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}

// Presence of metadata only. This does NOT validate signatures.
function metadataSignals(buf) {
  const head = buf.slice(0, Math.min(buf.length, 2 * 1024 * 1024)).toString('latin1');
  return {
    c2pa_present: head.includes('c2pa') || head.includes('jumb'),
    exif_present: head.includes('Exif\u0000\u0000'),
    ai_tool_tag: /(midjourney|dall[-· ]?e|stable ?diffusion|firefly|imagen|gemini)/i.test(head),
  };
}

function buildVerdict(score, sig) {
  const reasons = [];
  let verdict;
  if (score >= 0.8) verdict = 'fake';
  else if (score <= 0.2) verdict = 'true';
  else verdict = 'unclear';

  const pct = Math.round(score * 100);
  if (verdict === 'fake') reasons.push(`Strong signs of an AI image generator (${pct}% likelihood)`);
  else if (verdict === 'true') reasons.push(`No signs of AI generation found (${pct}% likelihood)`);
  else reasons.push(`Mixed signals (${pct}% likelihood of AI generation). Not enough to decide`);

  if (sig.ai_tool_tag) reasons.push('The file metadata mentions an AI image tool');
  if (sig.c2pa_present) reasons.push('Content Credentials (C2PA) data found in the file. Signature not verified yet');
  else reasons.push('No Content Credentials (C2PA) origin data in the file');
  if (!sig.exif_present) reasons.push('No camera data (EXIF). Common for AI images, but also for photos re-saved by apps');

  const confidence = Math.round(Math.max(score, 1 - score) * 100);
  return { verdict, confidence, reasons };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });

  const user = process.env.SIGHTENGINE_USER;
  const secret = process.env.SIGHTENGINE_SECRET;
  if (!user || !secret) return res.status(500).json({ error: 'not_configured' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body.image !== 'string') return res.status(400).json({ error: 'missing_image' });

  const b64 = body.image.replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 100) return res.status(400).json({ error: 'invalid_image' });
  if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'image_too_large' });
  const kind = sniff(buf);
  if (!kind) return res.status(415).json({ error: 'unsupported_type' });

  const signals = metadataSignals(buf);

  let score;
  try {
    const form = new FormData();
    form.append('media', new Blob([buf], { type: kind.type }), `upload.${kind.ext}`);
    form.append('models', 'genai');
    form.append('api_user', user);
    form.append('api_secret', secret);
    const r = await fetch('https://api.sightengine.com/1.0/check.json', { method: 'POST', body: form });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || data.status !== 'success' || !data.type || typeof data.type.ai_generated !== 'number') {
      return res.status(502).json({ error: 'detector_error' });
    }
    score = data.type.ai_generated;
  } catch (e) {
    return res.status(502).json({ error: 'detector_unreachable' });
  }

  const v = buildVerdict(score, signals);
  return res.status(200).json({ ...v, ai_score: Math.round(score * 1000) / 1000, signals });
}

module.exports = handler;
module.exports.buildVerdict = buildVerdict;
module.exports.metadataSignals = metadataSignals;
