# KTO Resells

A clean, static sneaker resale storefront. One `index.html`, your photos in `photos/`,
real card checkout via Stripe. No build step, no server.

---

## 1. Edit your shop
Open `index.html` and find the `PRODUCTS` array near the bottom (inside `<script>`).
Each entry is one product card — change name, size, condition, price, image, etc.
Images live in `photos/`; reference them like `photos/IMG_6994.jpeg`.

## 2. Take real payments (Stripe — no server needed)
1. Create a free account at https://dashboard.stripe.com
2. **Product catalog → Payment Links → + New**
3. Add the pair (name, price, **quantity 1**, photo). Under *After payment*,
   turn on **Collect customers' addresses → Shipping** so you get the delivery address.
4. **Create link**, copy the `https://buy.stripe.com/...` URL.
5. Paste it into that product's `buy:` field in `index.html`.

Until a pair has a `buy:` link, its **Buy Now** button falls back to your Instagram DM.
Set `sold: true` on any pair to mark it Sold (one-of-one inventory).

> Start in Stripe **Test mode** to try the flow with test card `4242 4242 4242 4242`,
> then flip to Live mode and re-create the links when you're ready to sell for real.

## 3. Deploy on GitHub Pages
```bash
# from inside this folder, after creating an EMPTY repo named "ktoresells" on github.com
git remote add origin https://github.com/<your-username>/ktoresells.git
git branch -M main
git push -u origin main
```
Then on GitHub: **Settings → Pages → Build and deployment →
Source: Deploy from a branch → Branch: `main` / `(root)` → Save.**

Your store goes live at `https://<your-username>.github.io/ktoresells/` within a minute.

### Custom domain (optional)
Add a `CNAME` file containing your domain (e.g. `ktoresells.com`), point your
domain's DNS at GitHub Pages, then set the custom domain under Settings → Pages.
