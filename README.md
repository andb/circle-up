# Circle Up

Circle Up is a web app for meetups. People join from their phone with a four-digit event code and say what they would like to talk about. An agent forms small groups under a versioned set of grouping rules, using an open model served by [Featherless](https://featherless.ai). After the round people rate their group, and between rounds the agent rewrites its own grouping rules from those ratings. [PostHog](https://posthog.com) records the numbers, so you can compare each version of the rules with the last.

## Status

A one-day hackathon prototype, built at AI Tinkerers Prague on 2026-11-13. It was written for that event and is not maintained, has no persistence and has had no security review. Treat it as a starting point to read or adapt, not a product to run as is.

## What data it handles

The join page shows attendees this notice before they join; in short:

- Attendees enter a name, what they would like to talk about, optional profile links (LinkedIn, GitHub, a website) and an optional email.
- The talk line is sent to Featherless to form groups. Names and links are not.
- If someone gives profile links, the app reads each page once: LinkedIn and websites through [Apify](https://apify.com), GitHub through GitHub's public API. The page text goes to Featherless, with names, handles and links removed where found, to write a short interest summary used for grouping.
- Email is shown only to two people who both said they would talk to each other again. It is never sent to the model or to analytics.
- PostHog receives numbers only: ratings, group sizes, rules versions, model timing and token counts. No names or text.
- What attendees enter is held in server memory only, deleted when the organiser ends the event and lost on any restart. Apify keeps its own copy of pages it reads, under the Apify account's retention settings; delete those runs after an event.
- The organiser-only test routes `/api/apify` and `/api/featherless` record their requests and replies to `replay/sponsor-calls.json` in live mode. Attendee calls never go through that recording.

### LinkedIn name search (off by default)

With `NAME_SEARCH=on`, a joiner who gives no LinkedIn link is searched for by name on LinkedIn through an Apify actor, and the model suggests a likely match for that person alone to confirm or reject. This looks people up by name, so it is off unless you turn it on; switch it on only where your attendees have been told and you are comfortable with the privacy and platform-terms implications.

## Run it

Tested on Node.js 24 (the tests use `module.registerHooks`) and accounts with Featherless, Apify and PostHog.

1. `npm ci`
2. Copy `infra/env.example` to `.env.local` and fill it in. Each variable is described there.
3. `npm run build && npm run start`

The organiser page is at `/organiser` and asks for the organiser password (`ORGANISER_SECRET`). Attendees join at `/join`. Use the built app, not `npm run dev`: hot reload in dev mode wipes the in-memory state.

Tests: `npx tsx --test test/*.test.ts` (16 tests). There is no `npm test` script, and `npm run lint` currently reports 8 errors in the React components.

### Environment variables

Required: `FEATHERLESS_API_KEY`, `APIFY_TOKEN`, `POSTHOG_KEY`, `POSTHOG_HOST`, `ORGANISER_SECRET`, `SPONSOR_MODE` (`live`, or `replay` to answer the organiser test routes from a recording made earlier in live mode; attendee calls are always live).

Optional: `GITHUB_TOKEN` (raises GitHub's rate limit for profile reads), `NAME_SEARCH` (`on` to enable the name search above; off otherwise), `EVENT_CODE` (a fixed four-digit code, so the code survives a restart).

`infra/keys-check.sh` reports which required variables are set without printing their values.

## Known limitations

- All event state lives in server memory. A restart, redeploy, changed environment variable or hot reload empties the event: people, ratings and rounds are gone. The organiser page can download the event as JSON and restore the rules history from it; people and their text do not come back. Run exactly one instance.
- No accounts or persistence; the organiser password is the only access control.
- The grouping quality depends on the model and the rules it has rewritten; there is no evaluation beyond the attendee ratings.

## Deploy

The app was deployed to Railway for the event. `infra/DEPLOY.md` is the guide written for that deploy; it has not been re-checked step by step against what was done. `infra/smoke.sh` checks a deployed copy.

## License

MIT, see `LICENSE`.
