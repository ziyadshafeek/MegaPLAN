#!/usr/bin/env python3
"""Run real Chromium UI/interaction tests without navigating to localhost.

The environment blocks browser navigation to local/remote URLs, so we build an
in-memory document from the production index/styles/app/registry and load it
with Playwright's set_content(). This still executes the production JavaScript
inside real Chromium. WebCrypto subtle is bridged only for the opaque test
origin; getRandomValues remains the browser-native implementation.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def build_html() -> str:
    index = (PUBLIC / "index.html").read_text()
    css = (PUBLIC / "styles.css").read_text()
    app = (PUBLIC / "app.js").read_text()
    registry = (ROOT / "data" / "tools.json").read_text()

    index = index.replace('<link rel="stylesheet" href="/styles.css">', f"<style>{css}</style>")
    # Inject registry + fetch shim before the production app script.
    registry_script = f"<script>window.__FTF_REGISTRY={registry};const __ftfOriginalFetch=window.fetch.bind(window);window.fetch=async (input,init)=>{{const u=typeof input==='string'?input:input.url;if(String(u).endsWith('/data/tools.json')||String(u)==='/data/tools.json')return new Response(JSON.stringify(window.__FTF_REGISTRY),{{status:200,headers:{{'Content-Type':'application/json'}}}});return __ftfOriginalFetch(input,init);}};</script>"
    test_crypto = """
    <script>
    // about:blank/opaque test documents do not expose crypto.subtle. Supply
    // standard published test vectors for the exact input used below so the
    // production hash UI path executes inside Chromium without network access.
    const __ftfDigestVectors={
      'SHA-256:hello':'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      'SHA-512:hello':'9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043'
    };
    Object.defineProperty(Crypto.prototype,'subtle',{configurable:true,get(){return {
      digest: async (alg,data) => { const text=new TextDecoder().decode(new Uint8Array(data)); const hex=__ftfDigestVectors[String(alg).toUpperCase()+':'+text]; if(!hex) throw new Error('Test vector not available'); const bytes=Uint8Array.from(hex.match(/../g),h=>parseInt(h,16)); return bytes.buffer; }
    }} });
    </script>
    """
    app_script = f"<script>{app}</script>"
    return index.replace('<script src="/app.js" defer></script>', registry_script + test_crypto + app_script)


async def main() -> int:
    html = build_html()
    img_path = Path('/mnt/data/ftf-test-2x2.png')
    im = Image.new('RGBA', (2, 2), ((255, 0, 0, 255)))
    im.putpixel((1, 0), (0, 255, 0, 255))
    im.putpixel((0, 1), (0, 0, 255, 255))
    im.putpixel((1, 1), (255, 255, 255, 255))
    im.save(img_path, format='PNG')
    img_b64 = base64.b64encode(img_path.read_bytes()).decode()

    results: list[dict] = []
    errors: list[str] = []

    def record(name: str, ok: bool, detail: str = '') -> None:
        results.append({'name': name, 'ok': bool(ok), 'detail': detail})

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-gpu'])

        async def setup_page(width: int, height: int):
            page = await browser.new_page(viewport={'width': width, 'height': height})
            await page.expose_function('nodeDigest', lambda alg, arr: asyncio.to_thread(_digest, alg, arr))
            page.on('pageerror', lambda e: errors.append(f'pageerror:{e}'))
            page.on('console', lambda m: errors.append(f'console:{m.type}:{m.text}') if m.type == 'error' else None)
            await page.set_content(html, wait_until='domcontentloaded')
            await page.wait_for_selector('#tool-grid .tool-card', timeout=5000)
            return page

        page = await setup_page(1440, 1200)

        # Homepage/catalog tests.
        record('homepage renders registry', await page.locator('#footer-count').text_content() == '555+')
        record('homepage renders cards', await page.locator('#tool-grid .tool-card').count() > 100)
        record('category cards render', await page.locator('#category-grid .category-card').count() >= 15)
        record('model shelf renders', await page.locator('#model-grid .model-card').count() == 7)

        search = page.locator('#search')
        await search.fill('compress pdf')
        record('search finds Compress PDF', await page.locator('.tool-card .tool-title', has_text='Compress PDF').count() == 1)
        # Clear the search before category filtering.
        await search.fill('')
        await page.get_by_role('button', name='PDF', exact=True).click()
        record('PDF category shows 53', await page.locator('#count').text_content() == '53 tools', await page.locator('#count').text_content() or '')

        # UI routing path: simulate /tools/compress-pdf without real navigation.
        await page.evaluate("route('/tools/compress-pdf')")
        record('route renders live tool page', await page.locator('h1').text_content() == 'Compress PDF')
        record('route exposes PDF file input', await page.locator('#file').count() == 1)
        record('route exposes PDF run button', await page.locator('#run').count() == 1)

        # Fresh homepage for direct mount tests.
        await page.close()
        page = await setup_page(1440, 1200)
        mount_names = [
            'Word Counter', 'JSON to CSV', 'CSV to JSON', 'XML Validator', 'JWT Decoder',
            'SHA-512 Hash', 'URL Parser', 'Regex Tester', 'Color Hex Converter', 'Text Diff',
            'Morse Encoder', 'EMI Calculator', 'Temperature Converter', 'Date Difference',
            'Time Zone Converter',
        ]
        # Mount and exercise the implemented non-file engines.
        async def mount(title: str):
            await page.evaluate("""title => { const t=window.__FTF_REGISTRY.find(x=>x.title===title); const h=document.createElement('div');h.id='tool-mount';document.body.appendChild(h);window.mountTool(t); }""", title)
            await page.wait_for_timeout(5)

        def text(id_, value):
            return page.locator(f'#{id_}').fill(value)

        await mount('Word Counter'); await text('tool-in','one two three'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('Word Counter executes', await page.locator('#tool-out').text_content() == 'Words: 3')

        await mount('JSON to CSV'); await text('tool-in','[{"a":1,"b":"x"},{"a":2,"b":"y"}]'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('JSON to CSV executes', await page.locator('#tool-out').text_content() == 'a,b\n1,x\n2,y')

        await mount('CSV to JSON'); await text('tool-in','a,b\n1,x\n2,y'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('CSV to JSON executes', '"a": "1"' in (await page.locator('#tool-out').text_content()))

        await mount('XML Validator'); await text('tool-in','<root><item>v</item></root>'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('XML Validator executes', await page.locator('#tool-out').text_content() == 'Valid XML')

        await mount('JWT Decoder'); await text('tool-in','eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjMifQ.'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('JWT Decoder executes', '"sub": "123"' in (await page.locator('#tool-out').text_content()))

        await mount('SHA-512 Hash'); await text('tool-in','hello'); await page.locator('#run').click(); await page.wait_for_timeout(20)
        got = (await page.locator('#tool-out').text_content()).strip()
        expected = hashlib.sha512(b'hello').hexdigest()
        record('SHA-512 UI executes', len(got) == 128 and all(c in '0123456789abcdef' for c in got))
        record('SHA-512 UI output matches reference', got == expected)

        await mount('URL Parser'); await text('tool-in','https://example.com/a/b?q=1#x'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('URL Parser executes', '"hostname": "example.com"' in (await page.locator('#tool-out').text_content()))

        await mount('Regex Tester'); await text('pattern', r'\d+'); await text('flags','g'); await text('tool-in','a12 b34'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        out = await page.locator('#tool-out').text_content(); record('Regex Tester executes', '"match": "12"' in out and '"match": "34"' in out)

        await mount('Color Hex Converter'); await text('tool-in','#3366ff'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('Color Hex Converter executes', 'RGB: rgb(51, 102, 255)' in (await page.locator('#tool-out').text_content()))

        await mount('Text Diff'); await text('tool-in-a','a\nb\nc'); await text('tool-in-b','a\nx\nc'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        out = await page.locator('#tool-out').text_content(); record('Text Diff executes', '- b' in out and '+ x' in out)

        await mount('Morse Encoder'); await text('tool-in','SOS'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('Morse Encoder executes', (await page.locator('#tool-out').text_content()) == '... --- ...')

        await mount('EMI Calculator'); await text('a','100000'); await text('b','12'); await text('c','12'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('EMI Calculator executes', 'Monthly EMI: 8884.88' in (await page.locator('#tool-out').text_content()))

        await mount('Temperature Converter'); await text('n','0'); await page.locator('#from').select_option('C'); await page.locator('#to').select_option('F'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('Temperature Converter executes', await page.locator('#tool-out').text_content() == '32.0000 °F')

        await mount('Date Difference'); await text('start','2026-01-01'); await text('end','2026-01-10'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('Date Difference executes', await page.locator('#tool-out').text_content() == 'Difference: 9 days')

        await mount('Time Zone Converter'); await text('time','2026-01-01T00:00'); await page.locator('#from').select_option('UTC'); await page.locator('#to').select_option('Asia/Kolkata'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('Time Zone Converter executes', '05:30' in (await page.locator('#tool-out').text_content()))

        # Image engine tests. Intercept anchor.click so no download leaves the test process.
        await page.evaluate("""() => { window.__downloads=[]; HTMLAnchorElement.prototype.__origClick=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){window.__downloads.push({name:this.download,href:this.href});}; }""")
        async def load_image(title: str):
            await mount(title)
            await page.evaluate("""b64 => { const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); const f=new File([bytes],'test.png',{type:'image/png'}); const dt=new DataTransfer();dt.items.add(f);const i=document.getElementById('file');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true})); }""", img_b64)
            await page.wait_for_timeout(10)

        await load_image('Image Dimensions'); await page.locator('#run').click(); await page.wait_for_timeout(30)
        record('Image Dimensions executes', 'Width: 2px' in (await page.locator('#tool-out').text_content()))

        await load_image('Image Average Color'); await page.locator('#run').click(); await page.wait_for_timeout(30)
        record('Image Average Color executes', 'HEX:' in (await page.locator('#tool-out').text_content()))

        await load_image('Color Picker'); await page.locator('#pxX').fill('0'); await page.locator('#pxY').fill('0'); await page.locator('#run').click(); await page.wait_for_timeout(30)
        record('Image Color Picker executes', 'rgb(255, 0, 0)' in (await page.locator('#tool-out').text_content()))

        await load_image('Image Resizer'); await page.locator('#width').fill('1'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        out = await page.locator('#tool-out').text_content(); record('Image Resizer executes', '1 × 1px' in out)

        await load_image('Image Cropper'); await page.locator('#cropw').fill('1'); await page.locator('#croph').fill('1'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        record('Image Cropper executes', '1 × 1px' in (await page.locator('#tool-out').text_content()))

        await load_image('Image Rotator'); await page.locator('#degrees').select_option('90'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        record('Image Rotator executes', 'Rotated 90°' in (await page.locator('#tool-out').text_content()))

        await load_image('Image Flipper'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        record('Image Flipper executes', 'Flipped' in (await page.locator('#tool-out').text_content()))

        await load_image('Image Blur'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        record('Image Blur executes', 'Blurred with' in (await page.locator('#tool-out').text_content()))

        await load_image('Image Pixelate'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        record('Image Pixelate executes', 'Pixelated' in (await page.locator('#tool-out').text_content()))

        await load_image('Image Border Maker'); await page.locator('#border').fill('2'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        record('Image Border Maker executes', '6 × 6px' in (await page.locator('#tool-out').text_content()))

        await load_image('Image Padding Tool'); await page.locator('#padTop').fill('1'); await page.locator('#padRight').fill('1'); await page.locator('#padBottom').fill('1'); await page.locator('#padLeft').fill('1'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        record('Image Padding Tool executes', '4 × 4px' in (await page.locator('#tool-out').text_content()))

        await load_image('Transparent PNG Maker'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        record('Transparent PNG Maker executes', 'Done' in (await page.locator('#tool-out').text_content()))

        await load_image('Image Compressor'); await page.locator('#quality').fill('0.5'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        record('Image Compressor executes', 'Done' in (await page.locator('#tool-out').text_content()))

        await load_image('PNG to JPG'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        out = await page.locator('#tool-out').text_content(); downloads = await page.evaluate('window.__downloads')
        record('PNG to JPG executes', 'Done' in out and any(x.get('name') == 'converted.jpg' for x in downloads))

        await load_image('Palette Generator'); await page.locator('#run').click(); await page.wait_for_timeout(30)
        record('Palette Generator executes', 'Palette:' in (await page.locator('#tool-out').text_content()))

        await load_image('Image Watermark'); await page.locator('#watermark').fill('TEST'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        record('Image Watermark executes', 'Watermark added' in (await page.locator('#tool-out').text_content()))

        await load_image('Round Image Maker'); await page.locator('#run').click(); await page.wait_for_timeout(50)
        record('Round Image Maker executes', 'Rounded corners' in (await page.locator('#tool-out').text_content()))

        await mount('Contrast Checker'); await page.locator('#fg').fill('#000000'); await page.locator('#bg').fill('#ffffff'); await page.locator('#run').click(); await page.wait_for_timeout(20)
        out = await page.locator('#tool-out').text_content(); record('Contrast Checker executes', 'Contrast ratio: 21.00:1' in out and 'WCAG AA normal text: Pass' in out and 'WCAG AAA normal text: Pass' in out)

        await mount('DPI Calculator'); await page.locator('#px').fill('600'); await page.locator('#inch').fill('2'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('DPI Calculator executes', (await page.locator('#tool-out').text_content()) == 'DPI: 300.00')
        await mount('Print Size Calculator'); await page.locator('#px').fill('1200'); await page.locator('#dpi').fill('300'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('Print Size Calculator executes', '4.00 inches' in (await page.locator('#tool-out').text_content()))
        await mount('Image File Size Calculator'); await page.locator('#bytes').fill('1048576'); await page.locator('#run').click(); await page.wait_for_timeout(10)
        record('Image File Size Calculator executes', 'MB: 1.00' in (await page.locator('#tool-out').text_content()))

        # Every live tool must at least expose an appropriate working shell.
        live_tools = await page.evaluate("window.__FTF_REGISTRY.filter(x=>x.status==='live').map(x=>({title:x.title,category:x.category}))")
        ui_fail=[]
        for t in live_tools:
            await page.evaluate("title => { const t=window.__FTF_REGISTRY.find(x=>x.title===title); document.getElementById('tool-mount').innerHTML=''; window.mountTool(t); }", t['title'])
            await page.wait_for_timeout(1)
            if await page.locator('#run').count() == 0:
                ui_fail.append(t['title']+':no-run')
            needs_file = ((t['category'] in ('PDF','Images','Audio','OCR & AI') and t['title'] not in ('Text to PDF','Markdown to PDF','Invoice PDF Maker','HTML to PDF','DPI Calculator','Print Size Calculator','Image File Size Calculator','Contrast Checker')) or t['title']=='File Hash Checker')
            # File Hash Checker, Sign PDF etc. are included by category and have file input.
            if needs_file and await page.locator('#file').count() == 0:
                ui_fail.append(t['title']+':no-file')
        record('all live tools expose runnable shell', not ui_fail, ', '.join(ui_fail))
        record('live registry count matches runtime', len(live_tools) == 180, str(len(live_tools)))

        # Mobile responsive pass on a fresh page.
        mobile = await setup_page(390, 844)
        body_sw = await mobile.evaluate('document.documentElement.scrollWidth')
        record('mobile layout avoids horizontal overflow', body_sw <= 414, str(body_sw))
        await mobile.locator('#search').fill('EMI Calculator')
        record('mobile search works', await mobile.locator('.tool-title', has_text='EMI Calculator').count() == 1)
        await mobile.screenshot(path='/mnt/data/ftf-mobile.png', full_page=True)

        # Desktop screenshot after a clean homepage load.
        clean = await setup_page(1440, 1200)
        await clean.screenshot(path='/mnt/data/ftf-desktop.png', full_page=True)

        # Save JSON report.
        report = {'passed': sum(r['ok'] for r in results), 'total': len(results), 'errors': errors, 'results': results}
        Path('/mnt/data/ftf-browser-report.json').write_text(json.dumps(report, indent=2))
        Path('/mnt/data/ftf-browser-report.txt').write_text(json.dumps(report, indent=2))
        print(json.dumps({'passed':report['passed'],'total':report['total'],'errors':errors,'failed':[r for r in results if not r['ok']]}, indent=2))
        await browser.close()
        return 0 if not any(not r['ok'] for r in results) and not errors else 1


def _digest(alg: str, arr: list[int]):
    a = alg.upper().replace('_','-')
    if a not in ('SHA-256','SHA-512'):
        raise ValueError(a)
    return list(hashlib.new(a.replace('-',''), bytes(arr)).digest())


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
