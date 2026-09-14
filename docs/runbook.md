# FOSSStudio Runbook

Plain-language guide for keeping FOSSStudio running. **Almost everything
lives in the dashboard** - https://YOUR-DOMAIN/host/ → System tab.
This file is for when the dashboard itself is unreachable.

## Day-to-day (no terminal needed)

| I want to… | Where |
|---|---|
| Restart the studio | System tab → **Restart studio** |
| Make a backup right now | System tab → **Back up now** (runs daily automatically) |
| Restore a backup | System tab → backup list → restore icon, click twice |
| See what the server is doing | System tab → **Recent log** |
| Download everything I own | System tab → **Download everything (zip)** |
| Get recordings | Recordings tab → click the file names |
| Change my password / add 2FA | Security tab |

## If the site is down (dashboard unreachable)

1. **Wait 5 minutes.** It may just be restarting itself.
2. SSH to the VPS:
   ```
   ssh root@YOUR-SERVER
   ```
3. Restart everything:
   ```
   cd /opt/fossstudio/current && docker compose -p fossstudio restart
   ```
4. Still broken? Look at the logs:
   ```
   cd /opt/fossstudio/current && docker compose -p fossstudio logs --tail 100
   ```
5. If it broke right after a deploy, roll back to the previous version
   (from the dev machine, in the project folder):
   ```
   FOSSSTUDIO_HOST=root@YOUR-SERVER ./scripts/rollback.sh
   ```

## Restore a backup when the dashboard is down

Backups are on the VPS at `/opt/fossstudio/data/backups/`.

```
ssh root@YOUR-SERVER
cd /opt/fossstudio/data
tar -xzf backups/backup-<pick-the-date-you-want>.tar.gz -C .
cd /opt/fossstudio/current && docker compose -p fossstudio restart app
```

## What's backed up

Daily, keeping the last 5 by default (set how many under System - Backups): settings, theme, session list, login details,
recording index. **Not included:** the recording media files themselves
(they're big) - download the ones you care about from the Recordings tab
and keep them somewhere safe.

## The moving parts (for context)

- **app** - the studio itself (Node.js). Its data lives in `/opt/fossstudio/data`.
- **caddy** - handles the domain and HTTPS certificate. Renews itself.
  (Only there if you uncommented it; some installs put their own proxy
  in front instead.)
- **coturn** - helps guests behind strict firewalls connect.
- Deploys land in `/opt/fossstudio/releases/<timestamp>`; the newest 5 are
  kept, and `current` points at the live one. Rollback just points
  `current` at the previous release.
- A restart during a take costs only the seconds nobody had uploaded
  yet. The server does no work on a recording after the fact, so there
  is never anything in flight for a deploy to interrupt.

## Uptime check

A GitHub Actions job (in this repo, `.github/workflows/uptime.yml`)
pings the project's own instance every 15 minutes from outside and
emails the maintainer if it does not answer. It runs only on the
upstream repository. To watch your own studio the same way, fork it,
change the address and the repository check, and set your own SMTP
secrets in your repository settings - see the workflow file for the
names.
