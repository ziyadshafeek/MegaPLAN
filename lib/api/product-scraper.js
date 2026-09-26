/**
 * Product Scraper — Amazon & Flipkart millions of products
 * Free, no API key for Flipkart scraper API Rust (dvishal485), Amazon needs rotating proxies
 * Systematic: categories -> subcategories -> product URLs -> details
 * Stores free: GitHub + Vercel + IndexedDB + search-index, fully indexable for AI
 */

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

async function fetchWithTimeout(url, opts = {}, timeout = 15000) {
  try {
    const { makeRateLimitedRequest } = await import('../rate-limiter.js');
    const service = url.includes('flipkart') ? 'flipkart' : url.includes('amazon') ? 'amazon' : 'flipkart';
    const r = await makeRateLimitedRequest(service, url, opts, timeout);
    return r;
  } catch {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(url, {
        ...opts,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/html',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(opts.headers || {})
        }
      });
      return r;
    } finally {
      clearTimeout(timer);
    }
  }
}

const FLIPKART_CATEGORIES = [
  'mobiles', 'laptops', 'televisions', 'electronics', 'home_appliances',
  'mens_clothing', 'womens_clothing', 'books', 'beauty', 'toys',
  'sports', 'automotive', 'grocery', 'furniture'
];

const AMAZON_CATEGORIES = [
  'Electronics', 'Mobiles', 'Laptops', 'TV', 'Fashion', 'Home',
  'Books', 'Beauty', 'Toys', 'Sports', 'Automotive', 'Grocery'
];

function getRandomUA() {
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  return uas[Math.floor(Math.random() * uas.length)];
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action') || 'categories';
  const platform = (url.searchParams.get('platform') || 'flipkart').toLowerCase();
  const category = url.searchParams.get('category') || 'mobiles';
  const page = Number(url.searchParams.get('page') || 1);
  const productUrl = url.searchParams.get('url') || '';

  try {
    if (action === 'categories') {
      return json(res, 200, {
        ok: true,
        platforms: {
          flipkart: { categories: FLIPKART_CATEGORIES, note: 'Live search is experimental and may be unavailable' },
          amazon: { categories: AMAZON_CATEGORIES, note: 'Live search is not connected' }
        },
        systematic_plan: 'Categories -> Subcategories -> Product URLs -> Details -> Price/Rating categorization -> AI',
        source: 'Static category list, not product inventory'
      });
    }

    if (action === 'search') {
      const term = url.searchParams.get('term') || url.searchParams.get('q') || '';
      if (!term) return json(res, 400, { error: 'Provide term' });

      if (platform !== 'flipkart') return json(res, 501, { error: 'Only Flipkart live search is currently attempted. Amazon is not connected.' });
      // Attempt live Flipkart results; never invent a fallback product.
      // The Rust API is typically hosted via Docker, not public. We try to scrape Flipkart search directly
      let products = [];
      try {
        // Flipkart search URL
        const fkUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(term)}&page=${page}`;
        const r = await fetchWithTimeout(fkUrl, { headers: { 'User-Agent': getRandomUA() } }, 15000);
        const html = await r.text();
        
        // Simple regex to extract product info from HTML (massive scrapping)
        // This is fragile but for demo, we extract JSON from page
        const jsonMatch = html.match(/"products":\s*(\[.*?\])/s);
        if (jsonMatch) {
          try {
            const prods = JSON.parse(jsonMatch[1]);
            products = prods.slice(0, 20).map(p => ({
              title: p.title || p.name,
              currentPrice: p.price || p.currentPrice,
              originalPrice: p.originalPrice,
              discount: p.discount,
              rating: p.rating,
              seller: p.seller,
              platform: 'flipkart',
              url: p.url,
              image: p.image || p.thumbnail
            }));
          } catch {}
        }
        
      } catch (e) {
        // Upstream unavailable; report an error instead of inventing prices.
      }

      if (!products.length) return json(res, 503, { error: 'Live product results could not be verified from the upstream page. Try the published snapshot later.' });

      return json(res, 200, {
        ok: true,
        platform,
        term,
        category,
        page,
        count: products.length,
        products: products.map(p => ({
          ...p,
          price_category: p.currentPrice < 5000 ? '<5k' : p.currentPrice < 10000 ? '5k-10k' : p.currentPrice < 20000 ? '10k-20k' : p.currentPrice < 50000 ? '20k-50k' : '50k+',
          rating_category: p.rating >= 4.5 ? '4.5+' : p.rating >= 4.0 ? '4.0+' : p.rating >= 3.5 ? '3.5+' : '<3.5',
          seller_rating_category: p.sellerRating >= 4.5 ? '4.5+' : p.sellerRating >= 4.0 ? '4.0+' : 'other',
          searchable_text: `${p.title} ${p.category||''} ${p.seller||''}`.toLowerCase()
        })),
        source: 'live Flipkart HTML (unverified prices; always check retailer)'
      });
    }

    if (action === 'product') {
      return json(res, 501, { error: 'Live product detail extraction is not supported; use a published record or a retailer link.' });
    }

    if (action === 'categories_list') {
      return json(res, 200, { ok: true, flipkart: FLIPKART_CATEGORIES.map(name => ({ name })), amazon: AMAZON_CATEGORIES.map(name => ({ name })), note: 'Category names only; counts have not been verified.' });
    }

    return json(res, 400, { error: 'Unknown action. Use categories|search|product|categories_list' });

  } catch (err) {
    return json(res, 500, { error: err.message || 'Product scraper failed' });
  }
}
