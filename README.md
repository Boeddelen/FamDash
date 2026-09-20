# Family Dashboard

A self-hosted dashboard for running a household: weekly & monthly planning, chores
with a points/rewards economy, connected calendars, a weather forecast, and a place to
keep the school's PDFs. Built to run as a background service on a Mac and be shown on
a wall-mounted tablet, while still being fully usable from a laptop or phone. Interface
available in **Norwegian** (default) and English.

- **Standard mode** needs no login — anyone can view plans, tick off chores, and
  switch who's "operating" the dashboard.
- **Admins** (parents) sign in for the big edits — family members, calendars, chore
  definitions, settings, PDF import. Any family member whose role is **Voksen/adult**
  can unlock admin mode with their own PIN, so parents don't need a separate account;
  children never can, whatever PIN they type. An admin session **times out after 5
  minutes** of inactivity and the dashboard drops back to standard mode.
- Everything is stored in a single SQLite database under `data/`. Back up = copy that
  folder. Nothing is sent to any third party except the calendar servers you connect
  and Open‑Meteo for weather.

## Requirements

- macOS with **Node.js 22.9+** (tested on Node 24)
- Xcode command-line tools (for the native `better-sqlite3` / `argon2` builds):
  `xcode-select --install`

## Install & run as a service

```bash
git clone <this repo> family-dashboard
cd family-dashboard
npm install
npm run service:install        # builds, migrates, installs a launchd agent, starts it
```

The installer prints the local and network URLs. Open the network URL on your tablet.
The service starts automatically at login and restarts if it crashes.

```bash
npm run service:uninstall      # stop & remove the service (keeps your data/)
```

Logs: `data/logs/dashboard.{out,err}.log`.

### Configuration

Copy `.env.example` to `.env` to change the port or other options (the service reads
`.env` from the repo directory). Default port is **4174** (chosen to stay clear of other
local services — change it in `.env` if it collides with something on your Mac).

### First run

Open the dashboard and you'll be taken to a setup wizard: create the first admin
account, name your household, pick a time zone, optionally set a weather location, and
add family members. You can change everything later under **Settings**.

## Development

```bash
npm run dev            # http://localhost:5173
npm test               # unit tests (Vitest)
npm run test:e2e       # end-to-end tests (Playwright) — builds & starts a server
npm run db:generate    # regenerate migrations after editing src/lib/server/db/schema.ts
```

## Feature notes

### Weather
Uses [Open‑Meteo](https://open-meteo.com) — no API key. Set the location in the setup
wizard or **Settings → Household**. Refreshes every 30 minutes.

### "Visste du at?" (Did you know?)
A card on the Today page pulls historical events, births and deaths for the current
date from the free [dayinhistory.dev](https://dayinhistory.dev) API — no key needed.
Fetched once a night (00:10) plus once on boot, cached in the database, so the page
itself never calls out to the internet. Tap **🔀** to browse a few more facts from the
same day. The facts are third-party content in English; only the surrounding card
chrome is translated.

### Calendars (Settings → Calendars)

- **iCloud / CalDAV** — enter your Apple ID and an
  [app-specific password](https://support.apple.com/en-us/102654) (Server URL defaults
  to `https://caldav.icloud.com`). Works with Fastmail, Nextcloud, etc. too.
- **Google Calendar** — each instance uses its **own** OAuth client (no shared
  secret is shipped):
  1. In [Google Cloud Console](https://console.cloud.google.com/) create a project,
     enable the **Google Calendar API**, and create an **OAuth client ID** of type
     *Web application*.
  2. Add the redirect URI shown in the Settings dialog
     (`http://<host>:<port>/api/calendars/google/callback`).
  3. Paste the client ID and secret into the dialog and complete the consent screen.
- **Subscribe to an .ics URL** — any public/secret calendar feed (Outlook, school
  portals, holiday calendars…). Read-only, refreshed on each sync (every 15 min).

Credentials are encrypted at rest with AES‑256‑GCM using the key in
`data/secret.key` (generated on first run, `chmod 600`).

### Published feed
**Settings → Published calendar feed** gives you a secret `.ics` URL. Subscribe to it
in any calendar app to see upcoming chores alongside your normal calendar. Treat the
URL like a password — if it ever leaks, hit **Regenerate link** to invalidate the old
one immediately (you'll need to re-subscribe wherever you used it).

### Weekly plan (**Ukeplan** tab)
Admins upload the school's PDFs — weekly plans, newsletters, forms. They're stored in
`data/uploads/school/` on the Mac (nothing leaves the machine). Anyone can tap a
document to read it in a full-screen viewer, or download it. No text extraction —
scanned/photographed PDFs work fine. The dashboard's Today page also links straight to
it, showing the most recently uploaded document.

The viewer draws the pages itself rather than handing the file to the browser, so the
plan previews **inline on Android too** (Android's Chrome has no built-in PDF viewer and
would otherwise just offer a download). Multi-page documents scroll; there's still a
download button.

## Oppgaver (Tasks)
Chores, rewards, consequences and bonus tasks are one page — `/tasks` — behind four
tabs: **Plikter · Premier · Konsekvenser · Bonus**. The tab is kept in the URL
(`/tasks?tab=premier`), so a reload, a bookmark or a wall tablet left alone all come
back to the tab you were on. Above the tabs sits a compact **points strip** — one pill
per child showing their spendable balance — which stays on screen whichever tab is open.

### Chores (**Plikter** tab)
Define chores with a schedule (once / daily / weekdays / specific weekdays), assign
them to a family member or leave them open, give them points, and optionally tag them
(see **Tags** below). Each child gets their own **card deck**; each chore is a bordered
card — neutral when not started, **red** when overdue, **green** when done. Anyone can
tick a card off in standard mode — it's credited to whoever is the current operator.
New chores are only scheduled from today forward (no backfilled "missed" pile).

#### Points
Every child's points are tracked **separately** — today / this week / this month / this
year, plus an all-time **balance**. It goes up when a chore is completed or a bonus task
is claimed, and down when a reward is redeemed. The points strip above the tabs shows
one pill per child; nothing is ever added up into a household total. The full
per-period breakdown lives on each member's profile popup.

#### The ring around every avatar
Every avatar in the app draws a ring showing **how far through today** that person is —
chores due today, done over total. It's **dim** at nothing done, grows steadily stronger
as the day's list gets ticked off, goes **full strength** once everything due today is
done, and starts **glowing** on top of that once they've also claimed a bonus task.
Nothing due today means no ring at all, rather than an empty one that would read as
"behind" on a day off.

### Rewards, consequences & bonus tasks (**Premier**, **Konsekvenser**, **Bonus** tabs)
Three tabs, one economy:

- **🎁 Rewards** — a catalog of things points buy ("Movie night — 50p"). Redeem one
  directly, or pull the lever to spin for a random one the child can actually afford.
  Rewards can carry a **duration** ("for 2 weeks") and a **tag** — tag one with a
  member's name and it pre-selects them as who it's for, without stopping anyone else
  from picking someone different.
- **⚡ Consequences** — the same machine in red, for when a rule got broken.
- **⭐ Bonus tasks** — standing offers of extra points ("Wash the car — +15p"), shown as
  a deck of **cards with photos** you browse sideways. Anyone can claim one, as often as
  they like, and the points land immediately. Admins add the cards and give each one a
  picture (the photo is shrunk in your browser before it uploads, so a phone snap is
  fine). Because a photo rarely fits a card by luck, you can **frame it**: drag the
  picture in the preview to pick what stays in shot, zoom in, or switch to *Whole
  picture* to letterbox it instead of cropping. What you see in the preview is exactly
  what the card shows.

Pulling a lever and claiming a bonus task are open to everyone. **Admins** define the
catalogs — and can **roll anything back** from the history list: undoing a redemption
puts the points straight back in the bank, ready to spend again, and undoing a bonus
claim takes those points back out.

### Tags
A free-form set of labels (Settings → Tags) you can attach to chores, week to-dos and
calendar notations — use them for whatever grouping matters to your household ("Indoor",
"School", "Someone else's turn"…). The Week view has a tag filter to narrow down what's
shown.

### Calendar notations (Week tab)
The Week tab always **starts on today** and runs seven days forward, so what's next is
the first thing you see (the arrows page a week at a time; **Today** jumps back). Beyond
quick single-day to-dos it can hold richer notations: **multi-day**
(a trip, a school break), **timed or all-day**, tied to **one or more family members**
(each shown as their own colored dot), and **recurring** (daily / weekdays / specific
weekdays — regenerated automatically, looking about 3 months ahead). Deleting or moving
a single occurrence of a recurring notation doesn't bring it back the next day; there's
also a one-tap "delete whole series".

### Member profiles
Tap anyone's avatar (on the dashboard or anywhere the member bar is shown) to open their
profile: points breakdown, current streak, today's chores, and upcoming to-dos. The same
popup is how you switch who's "operating" the dashboard.

### Family members & photos
Each member has a colour, an emoji, and an optional **face photo** (JPG/PNG/WebP) shown
as a round avatar on the operator bar and chore decks. Manage them under
**Innstillinger → Familiemedlemmer**. Photos are shrunk to a small square in the browser
as you pick them, so a 2 MB camera shot is stored as ~15 KB and the faces appear
instantly rather than loading in. If you have photos from before that (stored at full
size), `node scripts/optimize-avatars.mjs` re-encodes them and keeps the originals in
`data/backups/avatars-original/`.

### Language
**Innstillinger → Husstand → Språk** switches the whole interface between Norsk and
English (also chosen in the first-run wizard). Default is Norsk.

### Wall tablet tips
- iPad: open the network URL in Safari → **Share → Add to Home Screen** for a
  full-screen icon. Use **Guided Access** (Settings → Accessibility) to lock it to the
  app.
- The dashboard auto-refreshes every 5 minutes and updates the clock live.

## Backup & restore

Stop the service, copy the `data/` folder somewhere safe, restart. To restore, put the
folder back before starting. A rolling nightly copy is also kept in `data/backups/`.

## Tech

SvelteKit (adapter-node) · SQLite via Drizzle ORM · `tsdav` (CalDAV/Google) ·
`node-ical` · Open‑Meteo · `node-cron`.
