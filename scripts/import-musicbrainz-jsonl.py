#!/usr/bin/env python3
"""Stream *verified official* MusicBrainz JSON dump JSONL to an external SQLite DB.

Use BOTH the release dump (most recordings) and standalone-recording dump.
This stores song metadata ONLY. No media, genres, tags, annotations or ratings.
Do not put the large input archives or SQLite database in Git.
"""
import argparse
import json
import sqlite3
import sys
import uuid
from pathlib import Path


def artist_text(credit):
    if not isinstance(credit, list):
        return ''
    return ', '.join(str(x.get('artist', {}).get('name', '')) for x in credit if isinstance(x, dict) and isinstance(x.get('artist'), dict))[:180]


def records(entity, kind):
    if kind == 'recording':
        candidates = [(entity, '')]
    else:
        album = str(entity.get('title') or '')[:180]
        candidates = [(track.get('recording') or {}, album) for medium in entity.get('media', []) if isinstance(medium, dict) for track in medium.get('tracks', []) if isinstance(track, dict)]
    for item, album in candidates:
        if not isinstance(item, dict):
            continue
        try:
            identifier = str(uuid.UUID(str(item.get('id') or '')))
        except ValueError:
            continue
        name = str(item.get('title') or '').strip()[:180]
        if name:
            yield identifier, name, artist_text(item.get('artist-credit')), album, 'MusicBrainz CC0'


def import_file(db, jsonl, kind, max_lines=0):
    db.execute('CREATE TABLE IF NOT EXISTS recordings (id TEXT PRIMARY KEY, name TEXT NOT NULL, artists TEXT, album TEXT, source TEXT NOT NULL)')
    parsed = 0
    with open(jsonl, encoding='utf-8') as stream:
        for line in stream:
            if max_lines and parsed >= max_lines:
                break
            if not line.strip():
                continue
            doc = json.loads(line)
            if not isinstance(doc, dict):
                raise ValueError(f'Unexpected JSON object at line {parsed + 1}')
            db.executemany('INSERT OR REPLACE INTO recordings(id,name,artists,album,source) VALUES(?,?,?,?,?)', records(doc, kind))
            parsed += 1
            if parsed % 2000 == 0:
                db.commit()
    db.commit()
    db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS recording_search USING fts5(name, artists, album, content='recordings', content_rowid='rowid')")
    db.execute("INSERT INTO recording_search(recording_search) VALUES('rebuild')")
    db.commit()
    return parsed, db.execute('SELECT count(*) FROM recordings').fetchone()[0]


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--db', required=True, help='External SQLite DB path, outside Git')
    p.add_argument('--jsonl', required=True, help='Extracted MusicBrainz dump mbdump/release or mbdump/recording')
    p.add_argument('--kind', choices=['release', 'recording'], required=True)
    p.add_argument('--verified-official-dump', action='store_true', help='I verified the official archive checksum/signature and COPYING')
    p.add_argument('--max-lines', type=int, default=0, help='Test with limited fixture lines')
    a = p.parse_args()
    if not a.verified_official_dump:
        p.error('First verify the official dump checksum/signature and license; then pass --verified-official-dump')
    if Path(a.db).resolve().is_relative_to(Path(__file__).resolve().parent.parent):
        p.error('Database must be stored outside the Git repository')
    with sqlite3.connect(a.db) as db:
        lines, count = import_file(db, a.jsonl, a.kind, a.max_lines)
    print(f'Imported {lines} {a.kind} entities; {count} DISTINCT recording names/IDs in external SQLite DB. No audio.')
