/**
 * Service Worker for Map Directory Auto Scraper
 * Runs continuously in background, even when page closed (via Background Sync / Periodic Sync)
 * Flawless engineering: retry, offline handling, IndexedDB
 */

const CACHE_NAME = 'mp-map-dir-v1';
const INDEXEDDB_NAME = 'mp-map-directory';
const PROGRESS_KEY = 'mp-map-dir-progress';

// Install
self.addEventListener('install', event => {
  console.log('[SW Map] Install');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW Map] Activate');
  event.waitUntil(self.clients.claim());
});

// Background Sync
self.addEventListener('sync', event => {
  if (event.tag === 'map-scraper-sync') {
    console.log('[SW Map] Background sync triggered');
    event.waitUntil(scrapeNextCell());
  }
});

// Periodic Sync (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'map-scraper-periodic') {
    console.log('[SW Map] Periodic sync');
    event.waitUntil(scrapeNextCell());
  }
});

// Message from client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'START_SCRAPER') {
    console.log('[SW Map] Start scraper message');
    event.waitUntil(scrapeNextCell());
  }
  if (event.data && event.data.type === 'SCAN_CELL') {
    event.waitUntil(scrapeCell(event.data.index));
  }
});

async function getProgress() {
  try {
    const allClients = await self.clients.matchAll();
    // Try to get from client localStorage via message? For SW, use IndexedDB
    // We'll store progress in IndexedDB as well
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(INDEXEDDB_NAME, 2);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['cells'], 'readonly');
        const store = tx.objectStore('cells');
        const countReq = store.count();
        countReq.onsuccess = () => {
          // Get last index from cells
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const cells = getAll.result;
            const lastIndex = cells.length ? Math.max(...cells.map(c => c.index)) : -1;
            resolve({ lastIndex, totalCells: cells.length });
          };
          getAll.onerror = () => resolve({ lastIndex: -1, totalCells: 0 });
        };
        countReq.onerror = () => resolve({ lastIndex: -1, totalCells: 0 });
      };
      req.onerror = () => resolve({ lastIndex: -1, totalCells: 0 });
    });
  } catch {
    return { lastIndex: -1, totalCells: 0 };
  }
}

async function scrapeCell(index) {
  try {
    console.log(`[SW Map] Scraping cell ${index}`);
    const res = await fetch(`/api/map-scraper?index=${index}`, { headers: { 'User-Agent': 'MegaPLAN-SW-Scraper/1.0' } });
    const data = await res.json();
    if (!res.ok) throw Error(data.error || 'Scraper failed');

    // Save to IndexedDB
    const dbReq = indexedDB.open(INDEXEDDB_NAME, 2);
    dbReq.onupgradeneeded = () => {
      const db = dbReq.result;
      if (!db.objectStoreNames.contains('cells')) db.createObjectStore('cells', { keyPath: 'index' });
      if (!db.objectStoreNames.contains('places')) db.createObjectStore('places', { keyPath: 'id' });
    };
    dbReq.onsuccess = () => {
      const db = dbReq.result;
      const tx = db.transaction(['cells', 'places'], 'readwrite');
      tx.objectStore('cells').put({ index: data.current.index, lat: data.current.lat, lng: data.current.lng, places: data.places?.length || 0, scannedAt: new Date().toISOString(), data });
      for (const p of (data.places || []).slice(0, 50)) {
        try { tx.objectStore('places').put(p); } catch {}
      }
      tx.oncomplete = () => {
        console.log(`[SW Map] Saved cell ${index} to IDB`);
        db.close();
      };
    };

    // Also save to server
    try {
      await fetch('/api/map-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (e) {
      console.log('[SW Map] Server save failed, keeping locally', e.message);
    }

    // Notify clients
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: 'CELL_SCANNED', index, places: data.places?.length || 0 });
    }

    return data;
  } catch (e) {
    console.log(`[SW Map] Cell ${index} failed: ${e.message}`);
    throw e;
  }
}

async function scrapeNextCell() {
  const prog = await getProgress();
  const nextIndex = (prog.lastIndex ?? -1) + 1;
  console.log(`[SW Map] Next cell to scrape: ${nextIndex}`);

  try {
    await scrapeCell(nextIndex);
    // Schedule next via setTimeout in SW? Use background sync again
    // For continuous, we can use setTimeout if SW stays alive, but better to rely on periodic sync
    // We'll try to schedule next scan in 40s
    setTimeout(() => {
      self.registration.sync.register('map-scraper-sync').catch(() => {
        // Fallback: direct call
        scrapeNextCell().catch(() => {});
      });
    }, 40000); // 40s to respect Overpass fair use

  } catch (e) {
    // Retry in 60s
    setTimeout(() => {
      self.registration.sync.register('map-scraper-sync').catch(() => {});
    }, 60000);
  }
}

// Fetch handler - cache map tiles and API
self.addEventListener('fetch', event => {
  // Only handle map-directory and map-scraper API, and OSM tiles
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/map-') || url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cached => {
          const fetched = fetch(event.request).then(networkRes => {
            if (networkRes.ok) cache.put(event.request, networkRes.clone());
            return networkRes;
          }).catch(() => cached);
          return cached || fetched;
        });
      })
    );
  }
});
