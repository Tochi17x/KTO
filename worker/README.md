# KTO Resells — Stripe Checkout Worker

A tiny Cloudflare Worker that creates Stripe Checkout Sessions. It holds your
Stripe **secret key** safely on Cloudflare's servers (never in the website).

## What you need
- A free Cloudflare account: https://dash.cloudflare.com/sign-up
- Your Stripe **secret key** (Stripe dashboard → Developers → API keys).
  Use the **test** key (`sk_test_...`) first; switch to live (`sk_live_...`) later.

## Deploy (dashboard, no command line)
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it `kto-checkout` → **Deploy** (a placeholder deploys first).
3. Click **Edit code**. Delete everything in the editor.
4. Paste the entire contents of `worker.js` from this folder. Click **Deploy**.
5. Add your secret key:
   **Worker → Settings → Variables and Secrets → Add**
   - Type: **Secret**
   - Name: `STRIPE_SECRET_KEY`
   - Value: your `sk_test_...` (or `sk_live_...`) key
   - **Save and deploy**.
6. Copy the Worker URL shown at the top — it looks like
   `https://kto-checkout.<your-subdomain>.workers.dev`

## Connect it to the site
Open `index.html`, find `CHECKOUT_ENDPOINT`, and paste your Worker URL:
```js
const CHECKOUT_ENDPOINT = "https://kto-checkout.<your-subdomain>.workers.dev";
```
Commit + push. "Buy Now" now opens real Stripe checkout.

## Keeping prices safe
The **price lives in `worker.js`** (the `CATALOG`), not in the browser, so no one
can change it from the page. When you edit a price or add a pair:
1. Update `CATALOG` here (same `id` as in `index.html`'s `PRODUCTS`).
2. Re-paste `worker.js` into the Worker editor → **Deploy**.

## Going live
- Swap the secret to your `sk_live_...` key and Save.
- In Stripe, finish **Activate account** (business + bank details) to get paid.
- Test mode card: `4242 4242 4242 4242`, any future expiry, any CVC.
