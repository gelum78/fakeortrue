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

## Setup (done)

- Supabase project `txtyojzboembjwledmwr` (eu-west-1): table `waitlist` + function `join_waitlist` from `supabase/schema.sql`.
- `api/waitlist.js` calls `join_waitlist` with the publishable key (safe to be public: RLS blocks direct table access). No Vercel env vars needed.
- Domain `fakeortrue.app` on the Vercel project; DNS at Namecheap.
- Before going public: fill `[CUI]` and `[registered address]` in `privacy.html`, create mailbox `contact@fakeortrue.app`.

Read the list: Supabase → Table Editor → `waitlist` (or export CSV).
