/**
 * Product Directory — published snapshot and on-demand search
 * Published repository snapshot; no visitor-side ingestion.
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
          <b>Product Directory</b>
          <p class="muted" style="margin:4px 0 8px;font-size:12px">Nationwide product inventory is not populated yet (zero verified products). On-demand third-party lookup is experimental and may fail; prices are not verified. Detailed nationwide listings require authorized retailer feeds.</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn primary" id="${id}-scan" style="font-size:12px">About indexing</button>
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
          <b>Published snapshot</b>
          <div id="${id}-progress" style="font-size:12px;margin-top:6px">Loading…</div>
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

        <div id="${id}-log" class="note" style="font-size:11px;max-height:100px;overflow:auto">Published records require authorized retailer feeds. Browser searches do not publish.</div>
      </aside>

      <div style="padding:12px;overflow:auto;background:#fffaf2">
        <b>Products in the published snapshot</b>
        <div id="${id}-info" style="margin-top:8px;font-size:12px">Loading…</div>
        <div id="${id}-products" style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px"></div>
      </div>
    </div>
    <div class="note" style="margin-top:10px;font-size:11px">Current snapshot has zero verified products. A live experimental lookup is not a licensed nationwide product database. Sellers, prices and product details need permissioned source feeds and periodic verification.</div>
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
      if (!r.ok) throw Error(j.error || 'Published product search failed');
      let products = j.results || [];
      
      // If no results, try scraper search (live)
      if (!products.length) {
        r = await fetch(`/api/product-scraper?action=search&term=${encodeURIComponent(term)}&platform=flipkart`);
        j = await r.json();
        if (!r.ok) throw Error(j.error || 'Live product lookup unavailable');
        products = j.products || [];
        // Live search results are ephemeral; repository snapshots come from scheduled jobs.
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
    log('Bulk retail scraping is disabled. Import an authorized affiliate feed after verifying rights. On-demand lookup is experimental.');
    toast('Use Search for on-demand results');
  }

  $(`scan`).onclick = startScraper;
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
      $(`class`).innerHTML = `<b>Flipkart:</b><br>${j.flipkart.map(c=>`${esc(c.name)}`).join('<br>')}<br><br><b>Amazon:</b><br>${j.amazon.map(c=>`${esc(c.name)}`).join('<br>')}`;
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

}
