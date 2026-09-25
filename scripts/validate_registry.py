import json, pathlib, re
p=pathlib.Path('data/tools.json'); data=json.loads(p.read_text())
assert len(data)>=500
slugs=[x['slug'] for x in data]; assert len(slugs)==len(set(slugs)), 'duplicate slugs'
for x in data:
    assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',x['slug'])
    assert x['status'] in {'live','beta','catalogued'}
    assert x['processing'] in {'browser','server','hybrid'}
    assert x['title'] and x['category'] and x['description']
print(f'Registry OK: {len(data)} tools')
