// POST /api/waitlist  { email, lang?, source?, website? (honeypot) }
// Calls the Supabase database function public.join_waitlist (see supabase/schema.sql).
// The publishable key below is public by design: Row Level Security blocks every read
// and write on the table; the key can only call join_waitlist, which only inserts.
// Optional overrides (Vercel → Settings → Environment Variables): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://txtyojzboembjwledmwr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_57y2WGhEwGTEAf7Q8BqvZw_mP-dbA0y';
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

  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;

  try {
    const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/join_waitlist`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_email: email,
        p_lang: String(body.lang || '').slice(0, 10) || null,
        p_source: String(body.source || '').slice(0, 64) || null
      })
    });
    if (!r.ok) return res.status(502).json({ error: 'storage_error' });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'storage_unreachable' });
  }
}

module.exports = handler;
