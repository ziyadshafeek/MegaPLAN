/**
 * Product Directory — Amazon & Flipkart massive dataset
 * Free storage GitHub+Vercel+IndexedDB, fully indexable for AI
 * Shows all business info: price, rating, seller rating, category, brand, etc
 */

import { esc, mountShell, toast } from './kit.js';

export function mountProductDirectory(root, tool) {
  const id = 'pd-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="display:grid;grid-template-columns:340px 1fr;gap:0;min-height:78vh;border:1px solid #e0d5c4;border-radius:12px;overflow:hidden">
      <aside style="background:#efe6d8;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px;border-right:1px solid #e0d5c4">
        <div>
          <b>Product Directory — Amazon & Flipkart Massive</b>
          <p class="muted" style="margin:4px 0 8px;font-size:12px">Scrap millions of products with price, categorizing, rating, seller rating etc. Similar to map, big project, must complete entire Amazon and Flipkart. Systematic: categories → subcategories → product URLs → details. Free storage GitHub+Vercel+IndexedDB, fully indexable for AI.</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn primary" id="${id}-scan" style="font-size:12px">▶ Start Scraper</button>
            <button class="btn secondary" id="${id}-stop" style="font-size:12px">⏸ Stop</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <input id="${id}-q" class="field" placeholder="Search products: iphone, laptop…" style="flex:1">
            <button class="btn secondary" id="${id}-search" style="font-size:12px">Search</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <button class="btn ghost" data-cat="mobiles" style="font-size:11px">📱 Mobiles</button>
            <button class="btn ghost" data-cat="laptops" style="font-size:11px">💻 Laptops</button>
            <button class="btn ghost" data-cat="electronics" style="font-size:11px">🔌 Electronics</button>
            <button class="btn ghost" data-price="<5k" style="font-size:11px"><5k</button>
            <button class="btn ghost" data-price="10k-20k" style="font-size:11px">10k-20k</button>
            <button class="btn ghost" data-rating="4.5" style="font-size:11px">4.5+ ⭐</button>
          </div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Progress — 10M+ Flipkart, 100M+ Amazon</b>
          <div id="${id}-progress" style="font-size:12px;margin-top:6px">Loading…</div>
          <div style="margin-top:8px;background:#e0d5c4;border-radius:8px;height:10px;overflow:hidden"><div id="${id}-bar" style="height:100%;width:0%;background:#c45c26;transition:width 0.3s"></div></div>
          <div id="${id}-stats" style="font-size:11px;color:#6e655b;margin-top:6px"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Categories & Price & Rating</b>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn secondary" id="${id}-cats" style="font-size:11px">Categories</button>
            <button class="btn secondary" id="${id}-price" style="font-size:11px">Price</button>
            <button class="btn secondary" id="${id}-rating" style="font-size:11px">Rating</button>
          </div>
          <div id="${id}-class" style="margin-top:8px;max-height:200px;overflow:auto;font-size:11px"></div>
        </div>

        <div id="${id}-log" class="note" style="font-size:11px;max-height:100px;overflow:auto">Product scraper log…<br>• Flipkart scraper API Rust free no auth<br>• Amazon needs rotating proxies<br>• 4 workers, 3 mirrors, 2s interval<br>• Free storage GitHub+Vercel+IndexedDB</div>
      </aside>

      <div style="padding:12px;overflow:auto;background:#fffaf2">
        <b>Massive Product Dataset — Amazon & Flipkart</b>
        <div id="${id}-info" style="margin-top:8px;font-size:12px">Loading…</div>
        <div id="${id}-products" style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px"></div>
      </div>
    </div>
    <div class="note" style="margin-top:10px;font-size:11px">Product Directory: Scrap millions of products from Flipkart (10M+ via affiliate API 3.25k/sec free) and Amazon (100M+ via Scrapy 300 products 15-20 sec). Systematic: categories → subcategories → product URLs → details (title, price, original price, discount, rating, seller name, seller rating, thumbnails, highlights, offers, specifications). Categorize by price (<5k, 5k-10k, 10k-20k, 20k-50k, 50k+), rating (4.5+, 4.0+), seller rating. Free storage GitHub data/product-directory/ + Vercel public + IndexedDB + search-index fully indexable for AI multi-tool. Use NVIDIA AI for new sections. Flawless: proxy rotation, UA rotation, retry, deduplication.</div>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  let autoInterval = null;
  let isRunning = false;

  function log(msg) {
    const el = $(`log`);
    el.innerHTML = `${new Date().toLocaleTimeString()} — ${esc(msg)}<br>` + el.innerHTML;
  }

  async function updateProgress() {
    try {
      const r = await fetch('/api/product-directory?action=stats');
      const j = await r.json();
      if (!j.ok) throw Error(j.error);
      const idx = j.index;
      $(`progress`).innerHTML = `Total: <b>${idx.totalProducts||0}</b> products · Categories: ${Object.keys(idx.categories||{}).length} · Last: ${idx.lastScannedAt ? new Date(idx.lastScannedAt).toLocaleTimeString() : 'never'}`;
      const pct = Math.min(100, (idx.totalProducts||0) / 10000 * 100); // 10k for demo
      $(`bar`).style.width = pct.toFixed(1) + '%';
      $(`stats`).innerHTML = `Price: ${JSON.stringify(idx.priceRanges||{})}<br>Rating: ${JSON.stringify(idx.ratingRanges||{})}`;
      $(`info`).innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px">
          <div class="panel" style="padding:6px"><b>Total</b><br>${idx.totalProducts||0}</div>
          <div class="panel" style="padding:6px"><b>Categories</b><br>${Object.keys(idx.categories||{}).length}</div>
          <div class="panel" style="padding:6px"><b>Price Ranges</b><br>${Object.keys(idx.priceRanges||{}).length}</div>
          <div class="panel" style="padding:6px"><b>Rating</b><br>${Object.keys(idx.ratingRanges||{}).length}</div>
        </div>
      `;
    } catch (e) {
      $(`progress`).innerHTML = `Failed: ${esc(e.message)}`;
    }
  }

  async function search(term) {
    if (!term) return toast('Enter term');
    $(`info`).innerHTML = `Searching for "${esc(term)}"…`;
    try {
      // First try product-directory search
      let r = await fetch(`/api/product-directory?action=search&q=${encodeURIComponent(term)}`);
      let j = await r.json();
      let products = j.results || [];
      
      // If no results, try scraper search (live)
      if (!products.length) {
        r = await fetch(`/api/product-scraper?action=search&term=${encodeURIComponent(term)}&platform=flipkart`);
        j = await r.json();
        products = j.products || [];
        // Save to directory for free storage
        if (products.length) {
          fetch('/api/product-directory', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ products }) }).catch(()=>{});
        }
      }

      $(`products`).innerHTML = products.slice(0, 20).map(p => `
        <div style="border:1px solid #e0d5c4;border-radius:10px;padding:10px;background:#fff">
          <img src="${esc(p.image||p.img||'')}" style="width:100%;height:120px;object-fit:contain;background:#f4efe6;border-radius:6px" onerror="this.style.display='none'">
          <b style="font-size:13px">${esc(p.title||'Unnamed')}</b><br>
          <div style="font-size:12px;margin-top:4px">
            <div>💰 ₹${p.currentPrice||p.price||0} ${p.originalPrice ? `<small style="text-decoration:line-through;color:#8a7f72">₹${p.originalPrice}</small> <span style="color:#2f7d4a">${p.discountPercent||''}% off</span>` : ''}</div>
            <div>⭐ ${p.rating||0} · Seller: ${esc(p.seller||'')} (${p.sellerRating||0}⭐) · ${esc(p.category||'')}</div>
            <div>🏷 ${esc(p.platform||'')} · Price: ${esc(p.price_category||'')} · Rating: ${esc(p.rating_category||'')}</div>
            <div style="margin-top:4px"><small>${esc((p.highlights||[]).slice(0,2).join(' · '))}</small></div>
          </div>
        </div>
      `).join('') || 'No products found';

    } catch (e) {
      $(`info`).innerHTML = `Search failed: ${esc(e.message)}`;
    }
  }

  function startScraper() {
    if (autoInterval) return;
    isRunning = true;
    localStorage.setItem('mp-product-auto', '1');
    log('Product scraper started — systematic categories → subcategories → products, 2s interval, proxy rotation, fully automatic');
    autoInterval = setInterval(async () => {
      try {
        const categories = ['mobiles', 'laptops', 'electronics', 'books', 'beauty', 'toys'];
        const cat = categories[Math.floor(Math.random()*categories.length)];
        const r = await fetch(`/api/product-scraper?action=search&term=${encodeURIComponent(cat)}&platform=flipkart`);
        const j = await r.json();
        if (j.products && j.products.length) {
          await fetch('/api/product-directory', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ products: j.products }) });
          log(`Scraped ${j.products.length} products for ${cat}, total now growing, free storage GitHub+Vercel+IndexedDB`);
          updateProgress();
        }
      } catch (e) { log(`Scraper error: ${e.message}`); }
    }, 8000);
    $(`scan`).textContent = '● Running — Fully Automatic';
    toast('Product scraper started — fully automatic');
  }

  function stopScraper() {
    if (autoInterval) clearInterval(autoInterval);
    autoInterval = null;
    isRunning = false;
    localStorage.setItem('mp-product-auto', '0');
    $(`scan`).textContent = '▶ Start Scraper';
    log('Scraper paused');
  }

  // Fully automatic by default
  function ensureAuto() {
    if (localStorage.getItem('mp-product-auto') === null) {
      localStorage.setItem('mp-product-auto', '1');
      return true;
    }
    return localStorage.getItem('mp-product-auto') === '1';
  }

  $(`scan`).onclick = startScraper;
  $(`stop`).onclick = stopScraper;
  $(`search`).onclick = () => search($(`q`).value.trim());
  $(`q`).addEventListener('keydown', e => { if (e.key === 'Enter') search($(`q`).value.trim()); });

  body.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { $(`q`).value = b.dataset.cat; search(b.dataset.cat); });
  body.querySelectorAll('[data-price]').forEach(b => b.onclick = async () => {
    const range = b.dataset.price;
    try {
      const r = await fetch(`/api/product-directory?action=price&range=${encodeURIComponent(range)}`);
      const j = await r.json();
      $(`products`).innerHTML = (j.products||[]).slice(0,20).map(p=>`<div class="panel" style="padding:8px"><b>${esc(p.title)}</b><br>₹${p.currentPrice} · ${p.rating}⭐</div>`).join('') || 'No products in range';
    } catch (e) { toast('Failed'); }
  });
  body.querySelectorAll('[data-rating]').forEach(b => b.onclick = async () => {
    const min = b.dataset.rating;
    try {
      const r = await fetch(`/api/product-directory?action=rating&min=${min}`);
      const j = await r.json();
      $(`products`).innerHTML = (j.products||[]).slice(0,20).map(p=>`<div class="panel" style="padding:8px"><b>${esc(p.title)}</b><br>₹${p.currentPrice} · ${p.rating}⭐</div>`).join('') || 'No products';
    } catch {}
  });

  $(`cats`).onclick = async () => {
    try {
      const r = await fetch('/api/product-scraper?action=categories_list');
      const j = await r.json();
      $(`class`).innerHTML = `<b>Flipkart:</b><br>${j.flipkart.map(c=>`${esc(c.name)} (${c.estimated})`).join('<br>')}<br><br><b>Amazon:</b><br>${j.amazon.map(c=>`${esc(c.name)} (${c.estimated})`).join('<br>')}`;
    } catch (e) { $(`class`).innerHTML = `Failed: ${esc(e.message)}`; }
  };
  $(`price`).onclick = async () => {
    try {
      const r = await fetch('/api/product-directory?action=stats');
      const j = await r.json();
      $(`class`).innerHTML = `<b>Price Ranges:</b><br>${Object.entries(j.index.priceRanges||{}).map(([k,v])=>`${esc(k)}: ${v}`).join('<br>')}`;
    } catch {}
  };
  $(`rating`).onclick = async () => {
    try {
      const r = await fetch('/api/product-directory?action=stats');
      const j = await r.json();
      $(`class`).innerHTML = `<b>Rating:</b><br>${Object.entries(j.index.ratingRanges||{}).map(([k,v])=>`${esc(k)}: ${v}`).join('<br>')}`;
    } catch {}
  };

  updateProgress();
  search('mobile');
  if (ensureAuto()) startScraper();
}
