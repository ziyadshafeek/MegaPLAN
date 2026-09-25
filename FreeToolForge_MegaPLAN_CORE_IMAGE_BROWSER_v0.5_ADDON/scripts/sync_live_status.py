import json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
APP=ROOT/"public/app.js"
REG=ROOT/"data/tools.json"
MIRROR=ROOT/"public/tools-registry.json"
text=APP.read_text()
match=re.search(r"const live = new Set\(\[(.*?)\n\]\)",text,re.S)
if not match:
    raise SystemExit("live set not found")
live=set(re.findall(r"'([^']+)'",match.group(1)))
data=json.loads(REG.read_text())
for item in data:
    item["status"]="live" if item["title"] in live else "catalogued"
serialized=json.dumps(data,ensure_ascii=False,indent=2)+"\n"
REG.write_text(serialized)
MIRROR.write_text(serialized)
print(f"Synced {len(data)} registry entries from {len(live)} implemented live titles")
