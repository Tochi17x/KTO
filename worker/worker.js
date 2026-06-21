/* KTO Resells - Store + Admin Worker (Cloudflare)
   Bindings: KV namespace as KV, R2 bucket as BUCKET
   Secrets: STRIPE_SECRET_KEY, ADMIN_PASSWORD, AUTH_SECRET */

const ALLOWED_ORIGINS = [
  "https://ktoresell.shop",
  "https://www.ktoresell.shop",
  "https://tochi17x.github.io",
];

const DEFAULT_CATALOG = [
  { id:"af1-air-10",       brand:"Nike",           name:'Air Force 1 Low CPFM AIR',      desc:"Cactus Plant Flea Market AF1 with oversized AIR detailing.", size:"US 10",  cond:"Deadstock",    price:420, was:null, img:"photos/IMG_6990.jpeg", stock:1, active:true },
  { id:"aj11-gamma-9",     brand:"Air Jordan",     name:'Jordan 11 Retro Gamma Blue',    desc:"Classic patent leather 11 with gamma blue accents.",         size:"US 9",   cond:"Deadstock",    price:300, was:null, img:"photos/IMG_6994.jpeg", stock:1, active:true },
  { id:"aj5-unc-8",        brand:"Air Jordan",     name:'Jordan 5 Retro University Blue', desc:"Black suede upper with university blue detailing.",          size:"US 8",   cond:"Deadstock",    price:265, was:null, img:"photos/IMG_7002.jpeg", stock:1, active:true },
  { id:"bv-orbit-burg-95", brand:"Bottega Veneta", name:"Orbit Sneaker - Burgundy",      desc:"Burgundy mesh and silver chrome runner.",                    size:"US 9.5", cond:"Deadstock",    price:690, was:1150, img:"photos/IMG_7005.jpeg", stock:1, active:true },
  { id:"af1-flea-11",      brand:"Nike",           name:'Air Force 1 Low CPFM FLEA',     desc:"CPFM AF1, FLEA/AIR puffy lettering. Lightly worn, clean.",    size:"US 11",  cond:"Worn - Clean", price:380, was:null, img:"photos/IMG_7011.jpeg", stock:1, active:true },
  { id:"aj11-gamma-10",    brand:"Air Jordan",     name:'Jordan 11 Retro Gamma Blue',    desc:"Classic patent leather 11 with gamma blue accents.",         size:"US 10",  cond:"Deadstock",    price:310, was:null, img:"photos/IMG_6995.jpeg", stock:1, active:true },
  { id:"bv-orbit-black-10",brand:"Bottega Veneta", name:"Orbit Sneaker - Black Suede",   desc:"Blacked-out suede and mesh Orbit runner.",                   size:"US 10",  cond:"Deadstock",    price:640, was:1050, img:"photos/IMG_7009.jpeg", stock:1, active:true },
  { id:"bv-orbit-burg-85", brand:"Bottega Veneta", name:"Orbit Sneaker - Burgundy",      desc:"Burgundy mesh and silver chrome runner. Lightly worn.",      size:"US 8.5", cond:"Worn - Clean", price:560, was:1150, img:"photos/IMG_7008.jpeg", stock:1, active:true },
];

const SUCCESS_URL = "https://ktoresell.shop/?checkout=success";
const CANCEL_URL  = "https://ktoresell.shop/?checkout=cancelled";
const SHIP_TO = ["US","CA","GB","IE","AU","DE","FR","NL","NG"];
const TOKEN_TTL_SECONDS = 60 * 60 * 8;
const MAX_LOGIN_FAILS = 8;
const LOGIN_WINDOW_SECS = 900;

function cors(origin){
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}
const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), { status, headers:{ "Content-Type":"application/json", ...cors(origin) } });

const enc = new TextEncoder();
function b64url(bytes){
  let s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function b64urlToStr(s){
  s = s.replace(/-/g,"+").replace(/_/g,"/");
  return atob(s);
}
function safeEqual(a, b){
  if(typeof a!=="string" || typeof b!=="string" || a.length!==b.length) return false;
  let r = 0;
  for(let i=0;i<a.length;i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hmac(secret, data){
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(sig);
}
async function makeToken(secret){
  const payload = b64url(enc.encode(JSON.stringify({ exp: Math.floor(Date.now()/1000) + TOKEN_TTL_SECONDS })));
  const sig = await hmac(secret, payload);
  return payload + "." + sig;
}
async function verifyToken(secret, token){
  if(!token || token.indexOf(".")<0) return false;
  const parts = token.split(".");
  const expect = await hmac(secret, parts[0]);
  if(!safeEqual(parts[1], expect)) return false;
  try{
    const data = JSON.parse(b64urlToStr(parts[0]));
    return data.exp && data.exp > Math.floor(Date.now()/1000);
  }catch(e){ return false; }
}
function bearer(request){
  const h = request.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}
async function getCatalog(env){
  const raw = await env.KV.get("catalog");
  if(raw){ try{ return JSON.parse(raw); }catch(e){} }
  return DEFAULT_CATALOG;
}

export default {
  async fetch(request, env){
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);
    const path = url.pathname;

    if(request.method === "OPTIONS")
      return new Response(null, { status:204, headers:cors(origin) });

    if(request.method==="GET" && path==="/products"){
      const cat = await getCatalog(env);
      const pub = cat.filter(p => p.active !== false).map(p => ({
        id:p.id, brand:p.brand, name:p.name, desc:p.desc, size:p.size,
        cond:p.cond, price:p.price, was:p.was||null, img:p.img,
        sold: (Number(p.stock)||0) <= 0
      }));
      return json({ products: pub }, 200, origin);
    }

    if(request.method==="GET" && path.startsWith("/img/")){
      const key = decodeURIComponent(path.slice(5));
      const obj = await env.BUCKET.get(key);
      if(!obj) return new Response("Not found", {status:404});
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set("Cache-Control","public, max-age=31536000, immutable");
      return new Response(obj.body, { headers });
    }

    if(request.method==="POST" && path==="/checkout"){
      if(!env.STRIPE_SECRET_KEY) return json({error:"Server not configured"},500,origin);
      let body; try{ body = await request.json(); }catch(e){ return json({error:"Bad request"},400,origin); }
      const cat = await getCatalog(env);
      const item = cat.find(p => p.id === (body && body.id));
      if(!item) return json({error:"Unknown product"},400,origin);
      if(item.active===false || (Number(item.stock)||0) <= 0)
        return json({error:"This pair is sold out"},409,origin);

      const form = new URLSearchParams();
      form.set("mode","payment");
      form.set("success_url",SUCCESS_URL);
      form.set("cancel_url",CANCEL_URL);
      form.set("line_items[0][quantity]","1");
      form.set("line_items[0][price_data][currency]","usd");
      form.set("line_items[0][price_data][unit_amount]", String(Math.round(Number(item.price)*100)));
      form.set("line_items[0][price_data][product_data][name]", item.name + " - " + item.size);
      form.set("client_reference_id", item.id);
      form.set("phone_number_collection[enabled]","true");
      SHIP_TO.forEach((c,i)=> form.set("shipping_address_collection[allowed_countries]["+i+"]", c));

      const resp = await fetch("https://api.stripe.com/v1/checkout/sessions",{
        method:"POST",
        headers:{ Authorization:"Bearer "+env.STRIPE_SECRET_KEY, "Content-Type":"application/x-www-form-urlencoded" },
        body: form,
      });
      const session = await resp.json();
      if(!resp.ok) return json({error:(session.error&&session.error.message)||"Stripe error"},502,origin);
      return json({ url: session.url }, 200, origin);
    }

    if(request.method==="POST" && path==="/admin/login"){
      if(!env.ADMIN_PASSWORD || !env.AUTH_SECRET) return json({error:"Admin not configured"},500,origin);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const rlKey = "rl:" + ip;
      const fails = Number(await env.KV.get(rlKey)) || 0;
      if(fails >= MAX_LOGIN_FAILS) return json({error:"Too many attempts. Try again later."},429,origin);

      let body; try{ body = await request.json(); }catch(e){ return json({error:"Bad request"},400,origin); }
      if(!safeEqual(String((body && body.password) || ""), env.ADMIN_PASSWORD)){
        await env.KV.put(rlKey, String(fails+1), { expirationTtl: LOGIN_WINDOW_SECS });
        return json({error:"Wrong password"},401,origin);
      }
      await env.KV.delete(rlKey);
      return json({ token: await makeToken(env.AUTH_SECRET) }, 200, origin);
    }

    if(path.startsWith("/admin/")){
      const ok = await verifyToken(env.AUTH_SECRET, bearer(request));
      if(!ok) return json({error:"Unauthorized"},401,origin);
    }

    if(request.method==="GET" && path==="/admin/products"){
      return json({ products: await getCatalog(env) }, 200, origin);
    }

    if(request.method==="POST" && path==="/admin/save"){
      let body; try{ body = await request.json(); }catch(e){ return json({error:"Bad request"},400,origin); }
      if(!Array.isArray(body && body.products)) return json({error:"Bad data"},400,origin);
      const clean = body.products.map(p => ({
        id:    String(p.id||"").trim() || ("p-"+Math.random().toString(36).slice(2,8)),
        brand: String(p.brand||"").trim(),
        name:  String(p.name||"").trim(),
        desc:  String(p.desc||"").trim(),
        size:  String(p.size||"").trim(),
        cond:  String(p.cond||"").trim(),
        price: Math.max(0, Math.round(Number(p.price)||0)),
        was:   p.was ? Math.max(0, Math.round(Number(p.was))) : null,
        img:   String(p.img||"").trim(),
        stock: Math.max(0, Math.round(Number(p.stock)||0)),
        active: p.active !== false,
      }));
      await env.KV.put("catalog", JSON.stringify(clean));
      return json({ ok:true, count: clean.length }, 200, origin);
    }

    if(request.method==="POST" && path==="/admin/upload"){
      const ct = request.headers.get("Content-Type") || "";
      if(!ct.includes("multipart/form-data")) return json({error:"Expected a file"},400,origin);
      const fd = await request.formData();
      const file = fd.get("file");
      if(!file || typeof file === "string") return json({error:"No file"},400,origin);
      if(!String(file.type).startsWith("image/")) return json({error:"Images only"},400,origin);
      const buf = await file.arrayBuffer();
      if(buf.byteLength > 6*1024*1024) return json({error:"Max 6MB"},400,origin);
      const ext = (file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,5) || "jpg";
      const key = Date.now() + "-" + Math.random().toString(36).slice(2,8) + "." + ext;
      await env.BUCKET.put(key, buf, { httpMetadata:{ contentType:file.type } });
      return json({ url: url.origin + "/img/" + key }, 200, origin);
    }

    return json({ error:"Not found" }, 404, origin);
  },
};
