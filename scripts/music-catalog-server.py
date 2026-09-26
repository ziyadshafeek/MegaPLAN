#!/usr/bin/env python3
"""External full MusicBrainz metadata search service (SQLite DB outside Git).

Bind behind an HTTPS reverse proxy, set MUSIC_CATALOG_TOKEN, and point the
MegaPLAN server-side /api/open-music route at it. Never expose this HTTP process
on the public Internet directly: it is plain HTTP and uses a shared secret.
"""
import json
import os
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

DB = os.environ.get('MUSIC_CATALOG_DB')
TOKEN = os.environ.get('MUSIC_CATALOG_TOKEN')


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not TOKEN or self.headers.get('Authorization') != f'Bearer {TOKEN}':
            return self.reply(401, {'error': 'Unauthorized'})
        url = urlparse(self.path)
        if url.path not in ('/search', '/stats'):
            return self.reply(404, {'error': 'Not found'})
        try:
            db = sqlite3.connect(f'file:{DB}?mode=ro', uri=True, timeout=5)
            if url.path == '/stats':
                result = {'records': db.execute('SELECT count(*) FROM recordings').fetchone()[0], 'source': 'Official MusicBrainz CC0 dump; not Spotify'}
            else:
                q = parse_qs(url.query).get('q', [''])[0][:100]
                words = re.findall(r'\w+', q, re.UNICODE)[:8]
                if not words:
                    return self.reply(400, {'error': 'Provide a search term'})
                expression = ' AND '.join('"' + word.replace('"', '') + '"*' for word in words)
                rows = db.execute('SELECT r.id,r.name,r.artists,r.album FROM recording_search s JOIN recordings r ON r.rowid=s.rowid WHERE recording_search MATCH ? LIMIT 30', (expression,)).fetchall()
                result = {'ok': True, 'results': [{'id': row[0], 'name': row[1], 'artists': row[2], 'album': row[3], 'external_url': 'https://musicbrainz.org/recording/' + row[0]} for row in rows], 'source': 'Official MusicBrainz CC0 dump metadata, not Spotify'}
            db.close()
            return self.reply(200, result)
        except (sqlite3.Error, OSError) as error:
            return self.reply(503, {'error': 'Catalog database unavailable'})

    def reply(self, code, data):
        content = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)


if __name__ == '__main__':
    if not DB or not TOKEN:
        raise SystemExit('Set MUSIC_CATALOG_DB and MUSIC_CATALOG_TOKEN (do not commit either).')
    ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('PORT', '8756'))), Handler).serve_forever()
