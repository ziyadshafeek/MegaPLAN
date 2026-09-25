# FreeToolForge

A large, free-first utility platform designed as a "tool Wikipedia": many genuinely useful tools under one coherent search/category experience, with local-first processing where practical and ad-supported access.

## Continue development
Read `MASTER_CONTEXT.md` first. The project source of truth is the public GitHub repository `ziyadshafeek/MegaPLAN`.

## Run locally
```bash
python -m http.server 8080 --directory public
```
Open http://localhost:8080

## Validate
```bash
python scripts/validate_registry.py
node tests/smoke.mjs
```

## Optional backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8081
```

## Design principles
- ordinary productivity brand, not AI-first branding
- free core tools + tasteful ads
- no manual fulfillment
- honest live/beta/catalogued status
- privacy-first processing where feasible
- model licensing verified before commercial use
