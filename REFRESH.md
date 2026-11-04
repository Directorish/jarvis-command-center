# J.A.R.V.I.S Crew Command Center — Refresh Procedure

Use this when a scheduled run (target: every ~30 minutes) or a manual "refresh the command center" request comes in.
Keep usage light: one `CheckSubscriptionUsage` call, and only skim recent transcript/search hits for bots that actually moved. Do **not** deep-read every bot chat.

Repo: `Directorish/jarvis-command-center`  
Working copy: `/workspace/jarvis-command-center` (clone if missing)  
Live site: https://directorish.github.io/jarvis-command-center/

## Privacy rules (public site)

Never write into `data/crew.json` or `data/history.json`:
- emails, phone numbers, street addresses
- client / landlord / personal names beyond bot display names
- money amounts, account balances, card/credential details
- private conversation quotes

Allowed: bot names, roles, statuses (`active|blocked|idle|quiet`), generic work summaries, blockers phrased without private detail, routine names, usage share percentages, ISO timestamps in America/New_York.

## Steps

1. **Clone or pull**
   ```bash
   cd /workspace
   if [ -d jarvis-command-center/.git ]; then
     cd jarvis-command-center && git pull --ff-only
   else
     gh repo clone Directorish/jarvis-command-center /workspace/jarvis-command-center
     cd /workspace/jarvis-command-center
   fi
   ```

2. **Gather usage (one call)**  
   Call `CheckSubscriptionUsage` in the `cursor` namespace. Record:
   - `weeklyUsedPct`
   - reset time, converted to America/New_York label (e.g. `Mon Nov 9 · 6:33 PM ET`)

3. **Gather crew activity (light)**  
   Prefer existing Page snapshot / prior `crew.json` as the base.  
   For bots that likely changed since last sync, use `ReadTranscript` sparingly (or parent-provided status) to update:
   - `status`, `lastEt`, `lastSort`, `work`, `needs`, `routines`, `share`
   Rebuild `attention[]` and `alerts[]` from blocked / needs-you / stale bots only.  
   Recompute `kpis.active`, `kpis.blocked`, `kpis.needsYou`, `kpis.quietIdle`, `kpis.totalBots`.  
   Rebuild `usageTop` from known shares (top ~10). Keep `dayShare` if you have a weekly day breakdown; otherwise leave prior values.

4. **Stamp sync time**  
   Box is already on America/New_York:
   ```bash
   TZ=America/New_York date -Iseconds   # -> syncedAt
   # Human label example: "Wed Nov 4, 2026 · 12:11 AM ET" -> syncedAtEt
   ```
   Set `syncedAt` (ISO with offset) and `syncedAtEt` on `crew.json`.

5. **Write `data/crew.json`**  
   Overwrite with the full public-safe payload (same shape as the current file). Validate:
   ```bash
   python3 -c "import json; json.load(open('data/crew.json')); print('ok')"
   ```

6. **Append `data/history.json`**  
   Load existing `points`. Append one object:
   ```json
   {
     "t": "<syncedAt>",
     "et": "<short ET label>",
     "weeklyUsedPct": <number>,
     "active": <n>,
     "blocked": <n>,
     "needsYou": <n>,
     "quietIdle": <n>
   }
   ```
   Cap history at ~200 points (drop oldest) so the file stays small. Validate JSON.

7. **Commit and push**
   ```bash
   git add data/crew.json data/history.json
   git -c user.name='J.A.R.V.I.S' -c user.email='jarvis@users.noreply.github.com' \
     commit -m "chore: refresh crew telemetry $(TZ=America/New_York date '+%Y-%m-%d %H:%M ET')"
   git push origin main
   ```
   Only commit when `crew.json` or `history.json` actually changed.

8. **Confirm (optional, ~30–90s after push)**  
   ```bash
   curl -sI "https://directorish.github.io/jarvis-command-center/data/crew.json" | head -n 5
   ```
   The browser client already re-fetches `crew.json` every 60s with cache-busting; stale banner trips if `syncedAt` is older than 45 minutes.

## Do not

- Push HTML/CSS/JS changes in a routine refresh unless asked to redesign.
- Call heavy tools for every quiet horror-crew bot.
- Put secrets or private CRM details in the public JSON.
