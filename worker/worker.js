/* ============================================================
   KTO Resells — Stripe Checkout Worker (Cloudflare)
   ------------------------------------------------------------
   Holds the Stripe SECRET key (as the env var STRIPE_SECRET_KEY)
   and the authoritative price for every pair. The website only
   sends a product `id`; the price is decided HERE so it can't be
   tampered with from the browser.

   Deploy: see worker/README.md (dashboard, no CLI needed).
   ============================================================ */

// Who is allowed to call this Worker (your storefront origins).
const ALLOWED_ORIGINS = [
  "https://ktoresell.shop",
  "https://www.ktoresell.shop",
  "https://tochi17x.github.io", // GitHub Pages preview
];

// Authoritative catalog. id MUST match the PRODUCTS array in index.html.
// price is in whole US dollars; converted to cents below.
const CATALOG = {
  "af1-air-10":        { name: 'Nike Air Force 1 Low CPFM "AIR" — US 10',          price: 420 },
  "aj11-gamma-9":      { name: 'Air Jordan 11 Retro "Gamma Blue" — US 9',          price: 300 },
  "aj5-unc-8":         { name: 'Air Jordan 5 Retro "University Blue" — US 8',       price: 265 },
  "bv-orbit-burg-95":  { name: "Bottega Veneta Orbit — Burgundy — US 9.5",         price: 690 },
  "af1-flea-11":       { name: 'Nike Air Force 1 Low CPFM "FLEA" — US 11',          price: 380 },
  "aj11-gamma-10":     { name: 'Air Jordan 11 Retro "Gamma Blue" — US 10',         price: 310 },
  "bv-orbit-black-10": { name: "Bottega Veneta Orbit — Black Suede — US 10",       price: 640 },
  "bv-orbit-burg-85":  { name: "Bottega Veneta Orbit — Burgundy — US 8.5",         price: 560 },
};

// Where Stripe sends the customer after paying / cancelling.
const SUCCESS_URL = "https://ktoresell.shop/?checkout=success";
const CANCEL_URL  = "https://ktoresell.shop/?checkout=cancelled";

// Countries you'll ship to.
const SHIP_TO = ["US", "CA", "GB", "IE", "AU", "DE", "FR", "NL", "NG"];

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    // Simple health check
    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, service: "kto-checkout" }, 200, origin);
    }

    if (request.method !== "POST" || url.pathname !== "/checkout") {
      return json({ error: "Not found" }, 404, origin);
    }

    if (!env.STRIPE_SECRET_KEY) {
      return json({ error: "Server not configured" }, 500, origin);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Bad request" }, 400, origin); }

    const item = CATALOG[body && body.id];
    if (!item) return json({ error: "Unknown product" }, 400, origin);

    // Build the Stripe Checkout Session (form-encoded REST call).
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", SUCCESS_URL);
    form.set("cancel_url", CANCEL_URL);
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", "usd");
    form.set("line_items[0][price_data][unit_amount]", String(item.price * 100));
    form.set("line_items[0][price_data][product_data][name]", item.name);
    form.set("client_reference_id", body.id);
    form.set("phone_number_collection[enabled]", "true");
    SHIP_TO.forEach((c, i) =>
      form.set(`shipping_address_collection[allowed_countries][${i}]`, c)
    );

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });

    const session = await resp.json();
    if (!resp.ok) {
      return json(
        { error: (session.error && session.error.message) || "Stripe error" },
        502, origin
      );
    }
    return json({ url: session.url }, 200, origin);
  },
};
