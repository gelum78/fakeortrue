// POST /api/waitlist  { email, lang?, source?, website? (honeypot) }
// Saves the email to the Supabase table "waitlist" through the REST API.
// Env vars (Vercel → Settings → Environment Variables):
//   SUPABASE_URL          e.g. https://abcd1234.supabase.co
//   SUPABASE_SECRET_KEY   the project's secret / service_role key (server only, never in the browser)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // Honeypot: bots fill the hidden "website" field. Pretend success.
  if (body.website) return res.status(200).json({ ok: true });

  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'not_configured' });

  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal,resolution=ignore-duplicates'
  };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys do not.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/waitlist?on_conflict=email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        lang: String(body.lang || '').slice(0, 10) || null,
        source: String(body.source || '').slice(0, 64) || null
      })
    });
    if (!r.ok && r.status !== 409) {
      return res.status(502).json({ error: 'storage_error' });
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'storage_unreachable' });
  }
}

module.exports = handler;
