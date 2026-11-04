# J.A.R.V.I.S Crew Command Center

Iron Man–styled public HUD for Ismael Santiago’s Grok Bot crew.

**Live:** https://directorish.github.io/jarvis-command-center/

## What it shows

- Needs-attention strip and active alerts  
- Weekly usage KPIs  
- Bot grid with filter / sort / search  
- Per-bot detail drawer  
- Usage share bars + history chart (`data/history.json`)

The page is static HTML/CSS/JS. It loads `data/crew.json` and re-fetches every 60 seconds (`cache: no-store`). A stale warning appears if sync is older than 45 minutes.

## Privacy

This repository is **public**. Files intentionally omit emails, phones, addresses, client names, money amounts, and credentials.

## Refresh

See [REFRESH.md](./REFRESH.md) for the every-~30-minute sync procedure (write JSON → commit → push).

## Local preview

```bash
cd /workspace/jarvis-command-center
python3 -m http.server 8080
# open http://127.0.0.1:8080/
```
