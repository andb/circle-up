# Deploy to Railway

A guide written for deploying Circle Up to Railway for one event; it has not been re-checked step by step. Steps marked "(unverified)" describe dashboard settings whose exact names may differ.

1. Keys: `bash infra/keys-check.sh` exits 0. `git check-ignore -v .env.local` prints the `.env*` line.
2. `cp infra/railwayignore .railwayignore` (do not exclude `replay/` if you use replay mode).
3. `npm i -g @railway/cli`, then `railway login --browserless`: open the printed URL on any device and enter the code.
4. `railway init` (new project) or `railway link` (existing one).
5. In the dashboard's Variables tab, set every required name in `infra/env.example`. Set `SPONSOR_MODE` before the event; changing it later redeploys and empties the round.
6. Settings: replicas exactly 1, serverless sleeping off (unverified; takes effect at the next deploy).
7. `railway up`. Watch the upload: if `.env.local` goes up, stop. Then confirm the Variables page shows only what you set.
8. Public address: `railway domain`, or Settings, Networking, Generate Domain.
9. Port (unverified): if the address answers 502, set the domain's target port to 3000 in Networking.
10. `bash infra/smoke.sh https://<address>`: join page 200, organiser asks for the password, round unchanged after 5 minutes (via `GET /api/health`). Also join once from a phone.
11. Freeze: once real people have joined, no deploy, variable change or restart until the event ends. Each one empties memory.

## After a crash or broken deploy
1. If the app still answers, on /organiser press "Download event (JSON)". The organiser's browser also saves backups after Publish, after ratings close and after "Improve the rules"; take the newest file.
2. Fix and redeploy (`railway up`), then re-run step 10 (the wait can be shortened: `smoke.sh <url> 30`).
3. Log in at /organiser, "Restore history (JSON)", choose the backup. Rules versions, tallies and evidence return; people and their text do not.
4. Tell attendees to join again from their phones.
5. After the event, delete every backup file.
