#!/usr/bin/env python3
"""Build the self-contained manual browser harness from production sources."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'

index = (PUBLIC / 'index.html').read_text()
css = (PUBLIC / 'styles.css').read_text()
app = (PUBLIC / 'app.js').read_text()
registry = (ROOT / 'data' / 'tools.json').read_text()

index = index.replace('<link rel="stylesheet" href="/styles.css">', f'<style>{css}</style>')
info = '''<section id="browser-harness-info" style="max-width:1180px;margin:18px auto 0;padding:12px 20px;border:1px solid #e4e7ec;border-radius:14px;background:#fff"><strong>Browser harness</strong> — embedded production shell, app code and 555-entry registry. Automated regression: <code>python tests/browser-e2e.py</code>.</section>'''
index = index.replace('<main class="container">', '<main class="container">' + info)
shim = f'''<script>window.__FTF_REGISTRY={registry};const __ftfOriginalFetch=window.fetch.bind(window);window.fetch=async (input,init)=>{{const u=typeof input==='string'?input:input.url;if(String(u).endsWith('/data/tools.json')||String(u)==='/data/tools.json')return new Response(JSON.stringify(window.__FTF_REGISTRY),{{status:200,headers:{{'Content-Type':'application/json'}}}});return __ftfOriginalFetch(input,init);}};</script>'''
index = index.replace('<script src="/app.js" defer></script>', shim + f'<script>{app}</script>')
(ROOT / 'browser-harness.html').write_text(index)
print(f'Built {ROOT / "browser-harness.html"} ({len(index):,} bytes)')
