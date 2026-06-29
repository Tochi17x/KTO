/* KTO Resells - Store + Admin Worker (Cloudflare)
   Bindings: KV namespace as KV, R2 bucket as BUCKET
   Secrets: STRIPE_SECRET_KEY, ADMIN_PASSWORD, AUTH_SECRET,
            STRIPE_WEBHOOK_SECRET, SHIPPO_TOKEN
   Data model: each product has sizes:[{size, stock}] */

const ALLOWED_ORIGINS = [
  "https://ktoresell.shop",
  "https://www.ktoresell.shop",
  "https://tochi17x.github.io",
];

const DEFAULT_CATALOG = [
  { id:"af1-air-10",       brand:"Nike",           name:'Air Force 1 Low CPFM AIR',      desc:"Cactus Plant Flea Market AF1 with oversized AIR detailing.", cond:"Deadstock",    price:420, was:null, img:"photos/IMG_6990.jpeg", active:true, sizes:[{size:"US 10",stock:1}] },
  { id:"aj11-gamma-9",     brand:"Air Jordan",     name:'Jordan 11 Retro Gamma Blue',    desc:"Classic patent leather 11 with gamma blue accents.",         cond:"Deadstock",    price:300, was:null, img:"photos/IMG_6994.jpeg", active:true, sizes:[{size:"US 9",stock:1},{size:"US 10",stock:1}] },
  { id:"aj5-unc-8",        brand:"Air Jordan",     name:'Jordan 5 Retro University Blue', desc:"Black suede upper with university blue detailing.",          cond:"Deadstock",    price:265, was:null, img:"photos/IMG_7002.jpeg", active:true, sizes:[{size:"US 8",stock:1}] },
  { id:"bv-orbit-burg-95", brand:"Bottega Veneta", name:"Orbit Sneaker - Burgundy",      desc:"Burgundy mesh and silver chrome runner.",                    cond:"Deadstock",    price:690, was:1150, img:"photos/IMG_7005.jpeg", active:true, sizes:[{size:"US 8.5",stock:1},{size:"US 9.5",stock:1}] },
  { id:"af1-flea-11",      brand:"Nike",           name:'Air Force 1 Low CPFM FLEA',     desc:"CPFM AF1, FLEA/AIR puffy lettering. Lightly worn, clean.",    cond:"Worn - Clean", price:380, was:null, img:"photos/IMG_7011.jpeg", active:true, sizes:[{size:"US 11",stock:1}] },
  { id:"aj5-unc-9",        brand:"Air Jordan",     name:'Jordan 5 Retro University Blue', desc:"Black suede upper with university blue detailing.",          cond:"Deadstock",    price:270, was:null, img:"photos/IMG_7001.jpeg", active:true, sizes:[{size:"US 9",stock:1}] },
  { id:"bv-orbit-black-10",brand:"Bottega Veneta", name:"Orbit Sneaker - Black Suede",   desc:"Blacked-out suede and mesh Orbit runner.",                   cond:"Deadstock",    price:640, was:1050, img:"photos/IMG_7009.jpeg", active:true, sizes:[{size:"US 10",stock:1}] },
];

const SUCCESS_URL = "https://ktoresell.shop/?checkout=success";
const CANCEL_URL  = "https://ktoresell.shop/?checkout=cancelled";
const SHIP_TO = ["US","CA","GB","IE","AU","DE","FR","NL","NG"];
const TOKEN_TTL_SECONDS = 60 * 60 * 8;
const MAX_LOGIN_FAILS = 8;
const LOGIN_WINDOW_SECS = 900;
const DEFAULT_WEIGHT = "2";
const MAX_ORDERS_KEPT = 1000;

function cors(origin){
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Vary": "Origin" };
}
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers:{ "Content-Type":"application/json", ...cors(origin) } });

const enc = new TextEncoder();
function b64url(bytes){ let s = btoa(String.fromCharCode(...new Uint8Array(bytes))); return s.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function b64urlToStr(s){ s = s.replace(/-/g,"+").replace(/_/g,"/"); return atob(s); }
function safeEqual(a, b){ if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length) return false; let r=0; for(let i=0;i<a.length;i++) r|=a.charCodeAt(i)^b.charCodeAt(i); return r===0; }
async function hmacKey(secret){ return crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]); }
async function hmacB64(secret, data){ const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data)); return b64url(sig); }
async function hmacHex(secret, data){ const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data)); return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join(""); }
async function makeToken(secret){ const payload = b64url(enc.encode(JSON.stringify({ exp: Math.floor(Date.now()/1000)+TOKEN_TTL_SECONDS }))); return payload+"."+await hmacB64(secret,payload); }
async function verifyToken(secret, token){ if(!token||token.indexOf(".")<0) return false; const p=token.split("."); if(!safeEqual(p[1], await hmacB64(secret,p[0]))) return false; try{ const d=JSON.parse(b64urlToStr(p[0])); return d.exp && d.exp>Math.floor(Date.now()/1000);}catch(e){return false;} }
function bearer(request){ const h=request.headers.get("Authorization")||""; return h.startsWith("Bearer ")?h.slice(7):""; }

/* normalize/migrate a product to the sizes[] model */
function migrate(p){
  let sizes = Array.isArray(p.sizes) ? p.sizes : null;
  if(!sizes) sizes = [{ size: p.size||"", stock: Number(p.stock)||0 }];   // old single-size format
  sizes = sizes
    .map(s => ({ size:String(s.size||"").trim(), stock:Math.max(0,Math.round(Number(s.stock)||0)) }))
    .filter(s => s.size);
  return {
    id: String(p.id||"").trim(),
    brand: String(p.brand||"").trim(),
    name: String(p.name||"").trim(),
    desc: String(p.desc||"").trim(),
    cond: String(p.cond||"").trim(),
    price: Math.max(0, Math.round(Number(p.price)||0)),
    was: p.was ? Math.max(0, Math.round(Number(p.was))) : null,
    img: String(p.img||"").trim(),
    active: p.active !== false,
    sizes,
  };
}
async function getCatalog(env){
  const raw = await env.KV.get("catalog");
  let arr = DEFAULT_CATALOG;
  if(raw){ try{ const j=JSON.parse(raw); if(Array.isArray(j)) arr=j; }catch(e){} }
  return arr.map(migrate);
}
async function getOrders(env){ const raw=await env.KV.get("orders"); if(raw){try{return JSON.parse(raw);}catch(e){}} return []; }

async function stripeSigOK(secret, sigHeader, rawBody){
  if(!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map(kv => kv.split("=")));
  if(!parts.t || !parts.v1) return false;
  if(!safeEqual(parts.v1, await hmacHex(secret, parts.t+"."+rawBody))) return false;
  return Math.abs(Math.floor(Date.now()/1000) - Number(parts.t)) < 600;
}
async function pushToShippo(token, order){
  const a = order.address || {};
  const body = {
    order_number: order.id, order_status: "PAID", placed_at: order.date,
    to_address: { name: order.customer_name||"", street1: a.line1||"", street2: a.line2||"", city: a.city||"", state: a.state||"", zip: a.postal_code||"", country: a.country||"US", phone: order.phone||"", email: order.email||"" },
    line_items: [{ title: order.item_name||"Sneakers", quantity:1, total_price: String(order.amount||"0"), currency:(order.currency||"USD").toUpperCase(), weight: DEFAULT_WEIGHT, weight_unit:"lb" }],
    weight: DEFAULT_WEIGHT, weight_unit:"lb", total_price: String(order.amount||"0"), currency:(order.currency||"USD").toUpperCase(),
  };
  const r = await fetch("https://api.goshippo.com/orders/", { method:"POST", headers:{ "Authorization":"ShippoToken "+token, "Content-Type":"application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(()=>({}));
  if(!r.ok) return { ok:false, msg:(d.detail||("HTTP "+r.status)) };
  return { ok:true, id:d.object_id };
}

export default {
  async fetch(request, env){
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);
    const path = url.pathname;
    if(request.method === "OPTIONS") return new Response(null, { status:204, headers:cors(origin) });

    /* ---- Stripe webhook ---- */
    if(request.method==="POST" && path==="/stripe/webhook"){
      if(!env.STRIPE_WEBHOOK_SECRET) return new Response("not configured",{status:500});
      const raw = await request.text();
      if(!(await stripeSigOK(env.STRIPE_WEBHOOK_SECRET, request.headers.get("Stripe-Signature"), raw))) return new Response("bad signature",{status:400});
      let event; try{ event = JSON.parse(raw); }catch(e){ return new Response("bad json",{status:400}); }
      if(event.type === "checkout.session.completed"){
        const s = event.data.object || {};
        const cust = s.customer_details || {};
        const ship = s.shipping_details || s.shipping || (s.collected_information && s.collected_information.shipping_details) || {};
        const addr = ship.address || cust.address || {};
        const pid = s.client_reference_id || "";
        const chosenSize = (s.metadata && s.metadata.size) || "";
        const cat = await getCatalog(env);
        const item = cat.find(p => p.id === pid);
        const order = {
          id: s.id, date: new Date().toISOString(), product_id: pid, size: chosenSize,
          item_name: item ? (item.name + (chosenSize?(" - "+chosenSize):"")) : ((s.metadata&&s.metadata.name)||"Order"),
          amount: (s.amount_total!=null ? s.amount_total/100 : null), currency: s.currency||"usd",
          customer_name: ship.name||cust.name||"", email: cust.email||"", phone: cust.phone||ship.phone||"",
          address: { line1:addr.line1||"", line2:addr.line2||"", city:addr.city||"", state:addr.state||"", postal_code:addr.postal_code||"", country:addr.country||"" },
          shippo: "pending",
        };
        if(item){
          const v = item.sizes.find(x => x.size === chosenSize) || item.sizes[0];
          if(v){ v.stock = Math.max(0,(Number(v.stock)||0)-1); await env.KV.put("catalog", JSON.stringify(cat)); }
        }
        if(env.SHIPPO_TOKEN){ try{ const r=await pushToShippo(env.SHIPPO_TOKEN, order); order.shippo = r.ok?("created:"+r.id):("error:"+r.msg);}catch(e){ order.shippo="error:"+e.message; } } else { order.shippo="no-token"; }
        const orders = await getOrders(env);
        orders.unshift(order);
        if(orders.length>MAX_ORDERS_KEPT) orders.length=MAX_ORDERS_KEPT;
        await env.KV.put("orders", JSON.stringify(orders));
      }
      return new Response("ok",{status:200});
    }

    /* ---- public catalog ---- */
    if(request.method==="GET" && path==="/products"){
      const cat = await getCatalog(env);
      const pub = cat.filter(p=>p.active!==false && p.sizes.length).map(p=>({
        id:p.id, brand:p.brand, name:p.name, desc:p.desc, cond:p.cond, price:p.price, was:p.was||null, img:p.img,
        sizes: p.sizes.map(s=>({ size:s.size, sold:(Number(s.stock)||0)<=0 })),
        sold: p.sizes.every(s=>(Number(s.stock)||0)<=0)
      }));
      return json({ products: pub }, 200, origin);
    }

    if(request.method==="GET" && path.startsWith("/img/")){
      const key = decodeURIComponent(path.slice(5));
      const obj = await env.BUCKET.get(key);
      if(!obj) return new Response("Not found",{status:404});
      const headers = new Headers(); obj.writeHttpMetadata(headers); headers.set("Cache-Control","public, max-age=31536000, immutable");
      return new Response(obj.body, { headers });
    }

    /* ---- checkout (needs id + size) ---- */
    if(request.method==="POST" && path==="/checkout"){
      if(!env.STRIPE_SECRET_KEY) return json({error:"Server not configured"},500,origin);
      let body; try{ body=await request.json(); }catch(e){ return json({error:"Bad request"},400,origin); }
      const cat = await getCatalog(env);
      const item = cat.find(p=>p.id===(body&&body.id));
      if(!item || item.active===false) return json({error:"Unknown product"},400,origin);
      const wantSize = String((body&&body.size)||"").trim();
      const v = item.sizes.find(x => x.size === wantSize);
      if(!v) return json({error:"Please choose a size"},400,origin);
      if((Number(v.stock)||0)<=0) return json({error:"That size is sold out"},409,origin);
      const label = item.name + " - " + v.size;
      const form = new URLSearchParams();
      form.set("mode","payment"); form.set("success_url",SUCCESS_URL); form.set("cancel_url",CANCEL_URL);
      form.set("line_items[0][quantity]","1"); form.set("line_items[0][price_data][currency]","usd");
      form.set("line_items[0][price_data][unit_amount]", String(Math.round(Number(item.price)*100)));
      form.set("line_items[0][price_data][product_data][name]", label);
      form.set("client_reference_id", item.id);
      form.set("metadata[name]", label);
      form.set("metadata[size]", v.size);
      form.set("phone_number_collection[enabled]","true");
      SHIP_TO.forEach((c,i)=> form.set("shipping_address_collection[allowed_countries]["+i+"]", c));
      const resp = await fetch("https://api.stripe.com/v1/checkout/sessions",{ method:"POST", headers:{ Authorization:"Bearer "+env.STRIPE_SECRET_KEY, "Content-Type":"application/x-www-form-urlencoded" }, body: form });
      const session = await resp.json();
      if(!resp.ok) return json({error:(session.error&&session.error.message)||"Stripe error"},502,origin);
      return json({ url: session.url }, 200, origin);
    }

    if(request.method==="POST" && path==="/admin/login"){
      if(!env.ADMIN_PASSWORD||!env.AUTH_SECRET) return json({error:"Admin not configured"},500,origin);
      const ip = request.headers.get("CF-Connecting-IP")||"unknown";
      const rlKey = "rl:"+ip;
      const fails = Number(await env.KV.get(rlKey))||0;
      if(fails>=MAX_LOGIN_FAILS) return json({error:"Too many attempts. Try again later."},429,origin);
      let body; try{ body=await request.json(); }catch(e){ return json({error:"Bad request"},400,origin); }
      if(!safeEqual(String((body&&body.password)||""), env.ADMIN_PASSWORD)){ await env.KV.put(rlKey,String(fails+1),{expirationTtl:LOGIN_WINDOW_SECS}); return json({error:"Wrong password"},401,origin); }
      await env.KV.delete(rlKey);
      return json({ token: await makeToken(env.AUTH_SECRET) }, 200, origin);
    }

    if(path.startsWith("/admin/")){ if(!(await verifyToken(env.AUTH_SECRET, bearer(request)))) return json({error:"Unauthorized"},401,origin); }
    if(request.method==="GET" && path==="/admin/products"){ return json({ products: await getCatalog(env) }, 200, origin); }
    if(request.method==="GET" && path==="/admin/orders"){ return json({ orders: await getOrders(env) }, 200, origin); }

    if(request.method==="POST" && path==="/admin/save"){
      let body; try{ body=await request.json(); }catch(e){ return json({error:"Bad request"},400,origin); }
      if(!Array.isArray(body&&body.products)) return json({error:"Bad data"},400,origin);
      const clean = body.products.map(p => {
        const m = migrate(p);
        if(!m.id) m.id = "p-"+Math.random().toString(36).slice(2,8);
        return m;
      });
      await env.KV.put("catalog", JSON.stringify(clean));
      return json({ ok:true, count: clean.length }, 200, origin);
    }

    if(request.method==="POST" && path==="/admin/upload"){
      const ct = request.headers.get("Content-Type")||"";
      if(!ct.includes("multipart/form-data")) return json({error:"Expected a file"},400,origin);
      const fd = await request.formData();
      const file = fd.get("file");
      if(!file||typeof file==="string") return json({error:"No file"},400,origin);
      if(!String(file.type).startsWith("image/")) return json({error:"Images only"},400,origin);
      const buf = await file.arrayBuffer();
      if(buf.byteLength>6*1024*1024) return json({error:"Max 6MB"},400,origin);
      const ext = (file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,5)||"jpg";
      const key = Date.now()+"-"+Math.random().toString(36).slice(2,8)+"."+ext;
      await env.BUCKET.put(key, buf, { httpMetadata:{ contentType:file.type } });
      return json({ url: url.origin+"/img/"+key }, 200, origin);
    }

    return json({ error:"Not found" }, 404, origin);
  },
};
