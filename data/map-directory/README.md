# Massive Directory Map — Trivandrum Origin

## Concept
Auto scraper that continuously polls map agent and integrates every location details beginning from Trivandrum into a massive directory map. As day passes, all data of map is incorporated.

**Origin:** Trivandrum (Thiruvananthapuram) 8.524139, 76.936638
**Grid:** 0.01° (~1.1km) spiral outward, entire map covered by one point via spiral algorithm
**Classification:**
- a) Road-wise: groups by `addr:street` or nearest named road
- b) Business-wise: by amenity/shop/tourism types (mosques, restaurants, churches, temples, schools, hospitals, banks etc)
- c) Religious: mosque/church/temple/other via tags and name heuristics

## Engineering — Flawless

### 1. Spiral Scanning
```js
function spiralToCoords(index) {
  // Generates (dx,dy) spiral from center
  // 0: (0,0) center
  // 1: (1,0) east
  // 2: (1,1) north-east
  // 3: (0,1) north
  // ... expands outward infinitely
}
```
- Step 0.01° = ~1.1km
- Trivandrum district ~0.4° lat x 0.5° lon = ~2000 cells
- World: infinite spiral, will take months but will cover entire map

### 2. Data Sources — Free, No API Key
- **Overpass API** (`overpass-api.de`): free, fair use, queries `nwr["amenity"]`, `["shop"]`, `["tourism"]`, etc + `way["highway"]` for roads
- **Nominatim**: reverse geocode for road classification (optional, rate limited)
- **Seed data**: fallback when Overpass offline (10 known Trivandrum places)

### 3. APIs
- `POST /api/map-scraper?index=0` — scans one cell, returns places, roads, classification, next cell
- `GET /api/map-directory?action=stats|search|road|business|religious|grid` — aggregated view
- `POST /api/map-directory` — saves scanned cell, updates index.json
- `GET /api/map-auto?batch=5` — auto runner, scans N cells, uses NVIDIA AI if available

### 4. Storage
- **Server:** `data/map-directory/cell_{index}.json` + `index.json` (committed via GitHub Action)
- **Public:** `public/data/map-directory/` mirror for frontend
- **Client:** IndexedDB `mp-map-directory` with stores `cells` and `places`, plus localStorage `mp-map-dir-progress` for progress
- **Export:** JSON export of all cells

### 5. Auto Running — Continuous Background
- **Frontend poller:** `public/js/map-directory.js` — `setInterval` every 35s (respects Overpass fair use max 2 req/min), saves to IDB + server, progress in localStorage
- **Background SW:** `public/sw-map-scraper.js` — Service Worker with Background Sync (`sync` event) and Periodic Sync, caches OSM tiles, continues even when tab closed (if browser supports)
- **App-level poller:** `public/app.js` — if `mp-map-auto-enabled=1` and progress exists, starts interval even without opening map tool
- **GitHub Action:** `.github/workflows/map-scraper.yml` — cron every 2h, runs `scripts/map-scraper-runner.mjs --start lastIndex+1 --batch 10`, commits to repo, so directory grows even when no user online

### 6. AI Classification — NVIDIA
- Uses `api/ai.js` (NVIDIA_API_KEY, model deepseek-ai/deepseek-v4.1-flash)
- Prompt: classify sample places into road-wise, business-wise, new sections
- In GitHub Action: direct call to `https://integrate.api.nvidia.com/v1/chat/completions`
- Creates new sections automatically when AI detects deficit (e.g., new business type)

### 7. Flawless Handling
- **Rate limit:** 35-40s interval, 2s delay between batch, 5s retry backoff, 429 handling
- **Offline:** fallback to seed data for Trivandrum within 20km, IDB cache, SW cache
- **Dedup:** by OSM id `type/id`, index tracks cells array
- **Error handling:** try/catch, errors array in response, retry
- **Mobile:** responsive grid, touch targets 40px, Leaflet map
- **Production:** Vercel functions maxDuration 15-60s, CORS headers, User-Agent for Overpass etiquette

### 8. Usage
- Open `/tools/map-directory` — view stats, search, road-wise, business-wise, map
- Click "Start Auto Scraper" — begins continuous scanning from last index, runs in background
- Data builds over days: Trivandrum first, then Kerala, then India, then world
- Export JSON for backup

### 9. Future
- Expand to 0.005° grid for denser coverage
- Add Google Maps tiles option if key
- Add more business types via AI
- Add Vercel Cron for server-side continuous

## Stats
- Seed: 10 places, 5 roads, 1 cell (Trivandrum center)
- Target: 2000 cells for Trivandrum district, 10k for Kerala, infinite for world
- Each cell ~0-100 places, ~5-20 roads
- At 2 cells per minute, 2000 cells = ~16 hours for district
- With GitHub Action 10 cells every 2h = 120 cells/day = 16 days for district

## Safety
- Public OSM data only, no private
- Overpass fair use respected
- No Google API key needed, free
- No user tracking
