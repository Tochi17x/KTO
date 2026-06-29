/* ============================================================
   KTO Resells — shared store logic (home + catalog)
   Configure via window.KTO_CONFIG before this script loads:
     endpoint : Worker base URL
     ig       : Instagram fallback URL
     grid     : selector for the grid container (default #grid)
     search   : selector for a search <input> (optional)
     limit    : max cards to show when not searching (0 = all)
     termsUrl : link to the Terms page (for the consent line)
   ============================================================ */
(function(){
  const C = window.KTO_CONFIG || {};
  const ENDPOINT = C.endpoint || "";
  const IG = C.ig || "#";
  const LIMIT = C.limit || 0;
  const TERMS = C.termsUrl || "terms.html";
  const grid = document.querySelector(C.grid || "#grid");
  if(!grid) return;
  const searchInput = C.search ? document.querySelector(C.search) : null;

  const FALLBACK = [
    { id:"aj11-gamma-9", brand:"Air Jordan", name:'Jordan 11 Retro "Gamma Blue"', cond:"Deadstock", price:300, was:null, images:["photos/IMG_6994.jpeg"], desc:"Classic patent leather 11 with gamma blue accents.", sizes:[{size:"US 9",sold:false},{size:"US 10",sold:false}], sold:false },
    { id:"af1-air-10", brand:"Nike", name:'Air Force 1 Low CPFM "AIR"', cond:"Deadstock", price:420, was:null, images:["photos/IMG_6990.jpeg"], desc:"Cactus Plant Flea Market AF1.", sizes:[{size:"US 10",sold:false}], sold:false },
  ];

  let ALL = [];

  /* ---- inject modal once ---- */
  const modal = document.createElement("div");
  modal.className = "modal"; modal.id = "ktoModal"; modal.setAttribute("aria-hidden","true");
  modal.innerHTML = `
    <div class="modal-bg" data-close></div>
    <div class="modal-card">
      <button class="modal-close" data-close aria-label="Close">×</button>
      <div class="gallery">
        <div class="main"><img id="ktoMain" src="" alt=""></div>
        <div class="thumbs" id="ktoThumbs"></div>
      </div>
      <div class="modal-body">
        <span class="brand" id="ktoBrand"></span>
        <h2 id="ktoName"></h2>
        <div class="modal-price" id="ktoPrice"></div>
        <span class="modal-cond" id="ktoCond"></span>
        <p class="modal-desc" id="ktoDesc"></p>
        <div class="sizes-label">Select size</div>
        <div class="sizes" id="ktoSizes"></div>
        <label class="consent"><input type="checkbox" id="ktoAgree">
          <span>I agree to the <a href="${TERMS}" target="_blank" rel="noopener">Terms of Service</a> — all sales are final. No refunds; exchanges only.</span></label>
        <button class="modal-buy" id="ktoBuy" disabled>Select a size</button>
        <div class="modal-note">Secure checkout by Stripe · Verified authentic · Ships in 1–2 days</div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const $ = s => modal.querySelector(s);
  let cur = null, curSize = null;

  /* ---- load ---- */
  (async function load(){
    grid.innerHTML = `<p class="empty">Loading sneakers…</p>`;
    try{
      const r = await fetch(ENDPOINT + "/products", { cache:"no-store" });
      const d = await r.json();
      ALL = (d.products && d.products.length) ? d.products : FALLBACK;
    }catch(e){ ALL = FALLBACK; }
    apply();
  })();

  function imagesOf(p){ return (p.images && p.images.length) ? p.images : (p.img ? [p.img] : []); }

  function apply(){
    const q = (searchInput && searchInput.value || "").trim().toLowerCase();
    let view = ALL;
    if(q){
      view = ALL.filter(p => {
        const hay = [p.name, p.brand, p.cond, ...(p.sizes||[]).map(s=>s.size)].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    const list = (LIMIT && !q) ? view.slice(0, LIMIT) : view;
    render(list, q);
  }
  if(searchInput) searchInput.addEventListener("input", apply);

  function render(list, q){
    if(!list.length){ grid.innerHTML = `<p class="empty">No sneakers match “${escapeHtml(q||"")}”.</p>`; return; }
    grid.innerHTML = list.map(p => {
      const cover = imagesOf(p)[0] || "";
      const n = (p.sizes||[]).filter(s=>!s.sold).length;
      const info = p.sold ? "Sold out" : (n>1 ? n+" sizes" : ((p.sizes&&p.sizes[0])?("Size "+p.sizes[0].size):""));
      return `
      <article class="card${p.sold?' is-sold':''}" data-id="${escapeAttr(p.id)}">
        <div class="card-img">
          ${p.sold?`<span class="badge sold-badge">Sold</span>`:`<span class="badge verified">Verified</span>`}
          <img src="${escapeAttr(cover)}" alt="${escapeAttr(p.name)}" loading="lazy">
        </div>
        <div class="card-body">
          <span class="card-brand">${escapeHtml(p.brand)}</span>
          <h3 class="card-name">${escapeHtml(p.name)}</h3>
          <div class="card-specs"><span class="chip">${escapeHtml(p.cond)}</span><span class="chip">${escapeHtml(info)}</span></div>
          <div class="card-foot" style="margin-bottom:12px"><span class="price">$${p.price}${p.was?` <small>$${p.was}</small>`:``}</span></div>
          <div class="card-cta">${p.sold?'View':'View &amp; buy'}</div>
        </div>
      </article>`;
    }).join("");
  }

  grid.addEventListener("click", e => {
    const card = e.target.closest(".card");
    if(card) openModal(card.dataset.id);
  });

  /* ---- modal ---- */
  function openModal(id){
    const p = ALL.find(x => x.id === id); if(!p) return;
    cur = p; curSize = null;
    const imgs = imagesOf(p);
    $("#ktoMain").src = imgs[0] || ""; $("#ktoMain").alt = p.name;
    $("#ktoThumbs").innerHTML = imgs.length>1 ? imgs.map((u,idx)=>`<img src="${escapeAttr(u)}" class="${idx===0?'active':''}" data-src="${escapeAttr(u)}">`).join("") : "";
    $("#ktoBrand").textContent = p.brand;
    $("#ktoName").textContent = p.name;
    $("#ktoPrice").innerHTML = `$${p.price}${p.was?` <small>$${p.was}</small>`:``}`;
    $("#ktoCond").textContent = p.cond;
    $("#ktoDesc").textContent = p.desc || "";
    const sizes = p.sizes || [];
    const avail = sizes.filter(s=>!s.sold);
    $("#ktoSizes").innerHTML = sizes.map(s=>`<button type="button" class="sz${s.sold?' out':''}" data-size="${escapeAttr(s.size)}" ${s.sold?'disabled':''}>${escapeHtml(s.size)}</button>`).join("") || `<span style="color:var(--ink-soft);font-size:13px">No sizes listed</span>`;
    if(avail.length===1){ curSize = avail[0].size; const b=[...$("#ktoSizes").querySelectorAll(".sz")].find(x=>x.dataset.size===curSize); if(b) b.classList.add("sel"); }
    $("#ktoAgree").checked = false;
    updateBuy();
    modal.classList.add("open"); modal.setAttribute("aria-hidden","false"); document.body.style.overflow="hidden";
  }
  function closeModal(){ modal.classList.remove("open"); modal.setAttribute("aria-hidden","true"); document.body.style.overflow=""; }
  function updateBuy(){
    const btn = $("#ktoBuy");
    if(cur && cur.sold){ btn.textContent="Sold out"; btn.disabled=true; return; }
    if(!curSize){ btn.textContent="Select a size"; btn.disabled=true; return; }
    if(!$("#ktoAgree").checked){ btn.textContent="Agree to terms to continue"; btn.disabled=true; return; }
    btn.textContent = `Buy Now — ${curSize}`; btn.disabled=false;
  }
  $("#ktoSizes").addEventListener("click", e => {
    const sz = e.target.closest(".sz"); if(!sz || sz.classList.contains("out")) return;
    curSize = sz.dataset.size;
    $("#ktoSizes").querySelectorAll(".sz").forEach(b=>b.classList.remove("sel"));
    sz.classList.add("sel"); updateBuy();
  });
  $("#ktoThumbs").addEventListener("click", e => {
    const t = e.target.closest("img"); if(!t) return;
    $("#ktoMain").src = t.dataset.src;
    $("#ktoThumbs").querySelectorAll("img").forEach(i=>i.classList.remove("active"));
    t.classList.add("active");
  });
  $("#ktoAgree").addEventListener("change", updateBuy);
  modal.addEventListener("click", e => { if(e.target.hasAttribute("data-close")) closeModal(); });
  document.addEventListener("keydown", e => { if(e.key==="Escape") closeModal(); });

  $("#ktoBuy").addEventListener("click", async () => {
    if(!cur || !curSize || !$("#ktoAgree").checked) return;
    if(!ENDPOINT){ window.open(IG, "_blank", "noopener"); return; }
    const btn = $("#ktoBuy"); const label = btn.textContent;
    btn.disabled = true; btn.textContent = "…";
    try{
      const r = await fetch(ENDPOINT + "/checkout", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ id: cur.id, size: curSize }) });
      const d = await r.json();
      if(d.url){ window.location = d.url; return; }
      throw new Error(d.error || "Checkout unavailable");
    }catch(err){
      alert("Sorry — checkout couldn't start. DM @ktoresells and we'll sort it.\n\n("+err.message+")");
      btn.disabled = false; btn.textContent = label;
    }
  });

  function escapeHtml(v){ return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function escapeAttr(v){ return String(v==null?"":v).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
})();
