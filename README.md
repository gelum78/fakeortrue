# fakeortrue.app — launch site

Static landing page + one serverless function (waitlist). No build step, no dependencies.

```
index.html          landing page (animated logo, waitlist form)
privacy.html        privacy notice for the waitlist
favicon.svg
api/waitlist.js     POST /api/waitlist → Supabase table "waitlist"
supabase/schema.sql run once in Supabase → SQL Editor
vercel.json         clean URLs + security headers
```

## Setup

1. **Supabase** (region: Central EU / Frankfurt): SQL Editor → run `supabase/schema.sql`.
2. **Vercel** → Project → Settings → Environment Variables:
   - `SUPABASE_URL` = Project URL (Supabase → Project Settings → API / Data API)
   - `SUPABASE_SECRET_KEY` = the **secret** key (or legacy `service_role` key). Never put it in the HTML.
   Redeploy after adding them.
3. **Domain**: Vercel → Settings → Domains → add `fakeortrue.app` and copy the DNS records it shows into Namecheap → Advanced DNS.
4. Before going public: fill `[CUI]` and `[registered address]` in `privacy.html`, and create the mailbox `contact@fakeortrue.app`.

Read the list: Supabase → Table Editor → `waitlist` (or export CSV).
