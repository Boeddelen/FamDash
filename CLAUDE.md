# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repository.

## What this is

A self-hosted, single-household "Family Dashboard": weekly/monthly planning, chores
with a points/rewards economy, tags, member profiles, connected calendars, weather, and
school PDF storage. SvelteKit (adapter-node) + SQLite (Drizzle ORM), running as a
launchd service on the user's Mac (`com.slikroad.familydashboard`). See `README.md` for
the user-facing feature set — this file is about working on the code itself.

Real production data lives in `data/dashboard.db` — one actual household, with the
family's own names and photographs in it. **Treat it like production** — see the DB
section below before running any migration or ad-hoc script. `data/` is gitignored and
must stay that way.

**The service should always be running.** It's the family's actual dashboard, checked
on a wall tablet throughout the day, so treat any downtime as an incident to fix, not a
background task. It's reachable on the LAN at the host and port `scripts/install-service.sh`
configured — **port 4174** — so `http://localhost:4174` on this Mac. If
`curl -s http://localhost:4174/healthz` doesn't return `{"status":"ok",...}`, see
"Deploy" below — check `launchctl print` first, don't just `kickstart -k` blind.

## Stack & conventions

- **Svelte 5 runes** everywhere (`$state`, `$derived`, `$derived.by`, `$props`,
  `{#snippet}`). No legacy `export let` / reactive `$:` syntax.
- **Drizzle ORM** over `better-sqlite3`. Schema: `src/lib/server/db/schema.ts`.
  `better-sqlite3` is synchronous — `.get()` returns the row directly, not a Promise.
  `await`ing it is a harmless no-op (both styles appear in the codebase); don't assume
  a missing `await` is a bug.
- **Validation**: `zod` schemas via `body(request, schema)` / `z` from
  `$lib/server/http.ts`. Every `+server.ts` follows this pattern — don't hand-roll
  parsing.
- **Admin auth**: `guardAdmin(locals)` (throws 401) at the top of any admin-only
  handler. `locals.admin` / `locals.operator` are resolved once in `hooks.server.ts`.
  Client side: `apiAdmin()` from `$lib/adminGate` auto-prompts the login modal on a 401
  and retries — never call admin endpoints with the plain `api()` helper.
- **i18n**: `src/lib/i18n.ts` holds two flat dictionaries (`en`, `nb` — Norwegian is the
  default locale). Add a key to **both** when adding UI text; missing keys don't error,
  they silently show nothing useful in one language.
- **Money-shaped state (points, per-tag/per-member data) is never summed across
  members** — it's a deliberate product rule established early in this project. Render
  one row/entry per child everywhere, not a household total.
- **`/tasks` is one page with four tabs**, not four pages: Plikter · Premier ·
  Konsekvenser · Bonus (`src/routes/tasks/+page.svelte`, chores extracted into
  `ChoresTab.svelte`). One `+page.server.ts` loads all four tabs' data — switching tabs
  is a client-side toggle, not a navigation, so there's nothing to load per tab. The tab
  lives in the URL (`?tab=premier`; the default Plikter stays out of it) so a reload or a
  parked wall tablet comes back where it was, and it's set with `replaceState` so Back
  doesn't need four taps to escape. The slugs are Norwegian and **locale-independent** —
  only the labels translate. Above the tabs, always visible, is `PointsStrip.svelte`:
  one pill per child, ring + name + balance. (It replaced a five-column `PointsPanel`;
  the per-period breakdown now only exists on the member profile popup.)
- **Every avatar draws a "how far through today" ring** (`Avatar.svelte` +
  `chores/progress.ts`). Four states, in order: dim → filling → full at all-of-today's
  chores done → *glowing* once a bonus task is also claimed that day. Deliberate details,
  all of which have a test: a glow needs the chores done first (a bonus at 0/3 must not
  reward skipping the list); a skipped occurrence stays in the denominator; nothing due
  today means **no ring at all**, because an empty ring reads as "behind" on a day off.
  The ring is drawn *inside* the avatar's own box (the face is inset, not the box grown)
  so adding one never changes how much room an avatar takes — an e2e assertion pins the
  rendered width. Progress is resolved once per request in `+layout.server.ts` and read
  off `page.data`, so any avatar anywhere gets its ring without its page knowing about
  chores; pass `progress={false}` to opt out (the settings photo editor does).
  `size` takes a number (pixels) **or a CSS length** — the operator bar passes
  `clamp(46px, 13vw, 76px)` so a whole household fits one row on a phone. Everything
  inside derives from `--s`, so a fluid size carries the ring, glow and emoji with it;
  don't pass a *percentage*, because `--s` feeds `font-size` calcs where a percentage
  resolves against the parent font size, not the width.
- **Rewards and consequences are deliberate twins.** Both live on `/tasks`, on adjacent
  tabs (`RewardBandit.svelte` / `ConsequenceBandit.svelte`), and must keep the same anatomy in
  the same order: heading + admin "new" button → reel → member/note controls → lever →
  result → catalog → history. They're told apart by `--accent` (`--ok` green vs
  `--danger` red) and the heading emoji (🎁 vs ⚡), not by layout. If you add a feature to
  one — weights, durations, notes, the history row's undo button — add it to the other
  or they drift apart. Both levers are open to everyone; only catalog editing and the
  undo buttons are admin-gated.
- **A chore can only be registered on the day it's due.** `POST /api/chore-instances/[id]`
  and its `/checklist` sibling both `guardAdmin` when the instance's `dueDate` isn't
  `todayIso()` — the checklist route too, since ticking every step completes the
  instance and would otherwise be the way round the rule. Ticking yesterday's off today
  backdates points into a week that has already been scored; ticking tomorrow's claims
  them before the work exists. An admin can still do either, deliberately, after
  unlocking. `ChoreCard` mirrors this with a `locked` state (dimmed, 🔒, no tap) so the
  card never offers something that would 401, and a 401 that slips through anyway — a
  wall tablet parked overnight holds a stale `today` — toasts the reason and reloads.
  Both the card's `today` and the endpoint's come from the *server's* clock, so they
  can't disagree; don't compute either client-side.
- **Everything that moves points is just a row, and undo is a `DELETE`.** A balance is
  `sum(done chore instances) + sum(bonus_claims) − sum(reward_redemptions)`, computed
  live in `chores/points.ts`. There is no ledger, no running total, no compensating
  entry: an admin rolling a redemption back (`DELETE /api/reward-redemptions/[id]`) puts
  the points straight back in the bank, spendable again, and undoing a bonus claim
  (`DELETE /api/bonus-claims/[id]`) takes them back out. Keep it that way — a stored
  total is a second source of truth waiting to drift.
- **Bonus tasks are the fourth tab on `/tasks`** (`BonusDeck.svelte`): a browsable,
  sideways-scrolling deck of standing offers ("wash the car, +15p") with photo
  thumbnails, claimable by anyone as often as they like, points landing immediately.
  This is the one place points are *earned* off the Plikter tab, which keeps the chore
  decks and the weekly leaderboard. Thumbnails go
  through the same browser-side downscale as avatars (`$lib/image.ts`'s
  `shrinkThumbnail`) and the shared disk helpers in `src/lib/server/images.ts`; there is
  still no image library on the server.
- **A photo never crops well by luck, so framing is stored per card**, not guessed:
  `bonus_tasks.image_fit/x/y/zoom`, edited by dragging a focal point on a preview in the
  admin dialog. The card and that preview both render from `framingStyle()` in
  `$lib/bonusImage.ts` — one function, so what a parent drags into place is literally
  what the deck shows. Framing saves itself on each drag/slider change via its own
  `PATCH`, independent of the dialog's Save button.
- **Two different "weeks" live in this codebase, on purpose.** The `/week` planner shows
  a *rolling* seven days starting today (`?w=n` shifts by whole weeks), because its day
  columns wrap on a phone and a Mon–Sun grid would bury today below days already gone.
  Chore points still score the *calendar* week via `weekDates()` so they reset
  predictably on Mondays. Don't "unify" these — they answer different questions.
- **The shopping list (`/shopping`) is wide open and grouped by category.** Nothing on
  it is admin-gated — a list only the parents can write to is one nobody keeps current —
  so adding, renaming, ticking off and deleting are all plain `api()` calls. Items are
  grouped because a phone in a shop is read aisle by aisle, and `quantity` is free text
  ("2 poser", "1 l") on purpose: a number plus a unit dropdown is a form, and nobody
  fills one in while cooking. **Deleting a category never deletes items** — they fall
  back to the uncategorised pile, the same rule as the document boxes.
- **The shopping list remembers products** (`shopping_products`, migration 0018). Every
  row on the list is an instance of a remembered product; typing two letters suggests
  them, and picking one brings back its category *and its picture*. Matching is
  case-insensitive with a `COLLATE NOCASE` unique index, so typing a name out in full
  lands on the same product as picking it would — a second "bakepapir" would otherwise
  split a picture away from half the purchases. **The picture lives on the product, not
  on the list row**, which is what lets the list be cleared without losing the work of
  cutting a photo out. Clearing removes rows; products survive.
- **Shopping lists are `shopping_lists` / `list_id` everywhere** — table, columns, API
  routes (`/api/shopping-lists`), identifiers and CSS classes. They were briefly called
  categories; migration 0021 renamed the table and both foreign keys, and SQLite rewrote
  the referencing FK clauses itself. *Chores* still have a genuine `category` of their
  own (`chores.category`, `$lib/categories.ts`) — that is a different concept, so don't
  sweep it up in a search-and-replace across the two.
- **Every item is on a list; there is no catch-all.** The uncategorised pile is gone
  (migration 0020 swept the last loose rows into a list called "Handleliste"), the item
  API requires a `categoryId`, and the page shows nothing at all when no list exists —
  an empty box nobody made was the complaint that prompted this. **Deleting a list
  deletes the items on it**, which is a deliberate reversal of the old "a box never
  eats its contents" rule: with no pile to fall into, orphaned rows would simply be
  invisible. Nothing is really lost, because the *products* survive in the register and
  can be put straight back.
- **`/shopping` is one page with two tabs**, Handleliste · Register, on the same pattern
  as `/tasks`: locale-independent slug in the URL (`?tab=register`, the default omitted),
  `replaceState` so Back doesn't need a tap per tab. `/shopping/register` still exists
  purely as a 307 to the tab, for old links.
- **The list is open; the register behind it is curated.** `/shopping` stays writable by
  everyone — adding, ticking off, setting an amount and choosing a unit for a line. But a
  product's *master data* is admin-only: its canonical name, the unit it's normally
  bought in, its price, its default category and its picture (`PATCH`/`DELETE` on
  `api/shopping-products`, and the image `POST`/`DELETE`, all `guardAdmin`). Adding an
  unknown name still creates a register entry, because refusing that would break the
  open list. `/shopping/register` is the page for it: readable by all, editable by an
  admin. Don't gate item creation, and don't un-gate the register.
- **Units are a closed list plus a named 'other'** (`$lib/units.ts`). `other` is a real
  member of the list rather than a blank, and picking it stores the household's own word
  ("nett", "beger") in `unit_label` — so the list can say "2 nett" without free text
  leaking into every other item's arithmetic. A product carries the unit it's *normally*
  bought in; a row on the list inherits that and is then free to differ, so something
  usually bought by the kilo can be one packet this week without rewriting the register.
- **Money is whole øre in an integer, never kroner in a float.** 19.50 has no exact
  binary representation, so a list of them drifts a few øre off the total — and a
  shopping list that can't add up is worse than one with no prices. `priceOre` is the
  price for *one of the product's unit*; a line costs `amount × priceOre`, and the header
  totals only what's **not** yet ticked (a total that included the basket would fall as
  you shop, which is the opposite of what a budget is for). Parsing accepts "19,50" or
  "19.50"; rendering follows the household's locale.
- **A product's `store` is free text, not a fixed list of chains.** Same register-only
  editing as unit and price (admin-gated `PATCH`), shown read-only wherever unit and
  price already show — the item dialog and the tile's chip row. A closed enum of stores
  would need editing every time the household shopped somewhere new; free text doesn't.
  Don't conflate this with a shopping *list* (`shopping_lists`) — a list groups items for
  browsing ("Frukt og grønt"), `store` records where to actually buy one. The confusion
  between the two is exactly what prompted adding `store` as its own field.
- **A product photo is a cut-out, made in the browser** (`CutoutEditor.svelte`). Picking
  a photo opens it automatically — asked for as a separate step afterwards, background
  removal is a step nobody takes. It crops (the same pan/zoom gesture as every other
  framing control here), floods away a tapped background colour, has an eraser for the
  rest, trims to the subject, and outputs a 512px **PNG**. PNG and not the WebP the other
  uploads use: a cut-out has hard alpha edges and lossy WebP fringes them with coloured
  halos against a dark tile. Flood fill is connectivity-based rather than "every pixel of
  this colour", because a white label on a jar is the same white as the worktop behind it
  and only one should go. A saved cut-out forces `imageFit: 'contain'` — cropping a
  cut-out to fill a square would slice the lid off the jar. An existing photo can be
  re-cut from its stored URL (same-origin, so the canvas stays untainted).
- **A product photo is framed exactly like a bonus card.** Same `image_fit/x/y/zoom`
  columns, the same drag-a-focal-point control, and the same `framingStyle()` from
  `$lib/bonusImage.ts` rendering *both* the preview and the list tile — so what someone
  drags into place is literally what the list shows. Framing PATCHes itself on each drag,
  independent of the dialog's Save. Bytes land via `src/lib/server/images.ts`; there is
  still no image library on the server.
- **School documents live in named boxes** (`document_groups` + `school_documents.group_id`),
  because the weekly plans arrive one per child every Monday and a flat list made you read
  filenames to tell them apart. A box is created with the same round `.btn-add` the tasks
  page uses, renamed by typing in its heading (an inline `<input value=…>`, so assert on
  `toHaveValue`, not `getByText`), and uploaded into with its own small `+`. The boxes are
  deliberately *not* tied to `members` — a household may want one for "Skjema" as well as
  one per child. **Deleting a box never deletes documents**: they fall back to the unfiled
  pile, which only renders when something is in it. `/upload` has no static admin prompt —
  admin-only controls are simply absent for everyone else.
- **On `/upload`, adding is everyone's job and destroying is a parent's.** Uploading a
  document and renaming one are *not* admin-gated: a plan arriving on a Monday should be
  filed by whoever is at the tablet, and it lands as `skann_0423.pdf` so it needs naming
  there and then. Deleting a document, creating/renaming/deleting a box, and un-archiving
  all still require admin. Don't "tidy" the upload endpoint by adding `guardAdmin` back.
- **Weekly plans archive themselves each Saturday** (`school_documents.archived_at`, the
  `doc-archive` job). The cutoff is derived from the calendar — `lastSaturdayStart()`,
  everything still active that was uploaded before it — rather than from "did the job
  fire", so it's idempotent and a Saturday missed to downtime is caught up by the
  boot-time run instead of skipping a week. That date math is pinned in
  `src/lib/server/school.test.ts`; it can only be wrong on certain days of the week, which
  is exactly the kind of bug that hides. Archived documents are hidden behind a toggle.
  **A parent putting one back sets `archive_exempt`, and the job skips those forever
  after.** Without it the restore is futile: `archived_at` goes null and the next run
  re-archives the row off the same unchanged `uploaded_at`, silently reversing them. It's
  also the escape hatch for the one case an upload date can't express — a plan uploaded on
  the Friday *before* the week it's actually for, which the cutoff would otherwise archive
  the very next day.
- **The weather card shows today, not the week.** It sits at the top of the Today page,
  where the seven-day grid was the tallest block on screen and the least looked at — so
  it's gone, and today's high/low moved up next to the current temperature instead. The
  snapshot still carries `daily[]` in full, so putting the forecast on `/week` or behind
  a tap needs no server change; just don't put it back on the Today card.

## Gotchas that have already bitten

- **The launchd plist can silently drift from this repo's path.** It happened once:
  `~/Library/LaunchAgents/com.slikroad.familydashboard.plist` pointed its
  `WorkingDirectory`/`DATA_DIR` at a stale `/Users/frederik/SlikRoadServices` (an old
  clone location) instead of this repo, so the service crash-looped forever on
  `Cannot find module '.../build/index.js'` — silent because `launchctl print` still
  reports the job as loaded even while it's crash-looping; only `last exit code` /
  the err log gives it away. If `/healthz` doesn't respond, run
  `launchctl print "gui/$(id -u)/com.slikroad.familydashboard"` and check
  `working directory` matches this repo before assuming anything else is wrong.
  `scripts/install-service.sh` rewrites the plist from scratch and fixes this.
- **pdf.js must be the `legacy` build.** `pdfjs-dist/build/pdf.mjs` calls brand-new JS
  (`Uint8Array.prototype.toHex`) that older iPads/Android tablets — and the pinned
  Playwright Chromium — don't have; the viewer dies with `n.toHex is not a function`.
  Import `pdfjs-dist/legacy/build/pdf.mjs` + its matching worker. It's also imported
  dynamically so it stays out of every normal page load (~430KB core + 1.2MB worker).
- **Never render a PDF in an `<iframe>`.** Android Chrome has no inline PDF viewer and
  offers a download instead, so the weekly plan is unreadable on a phone. Pages are
  rendered to `<canvas>`; the e2e test asserts a canvas with real pixels for this reason.
- **…and never rasterise the whole document at once.** At the viewer's width an A4 page
  is ~1940x2743 device pixels on a 2x screen — about 21 MB of canvas — so a twelve-page
  newsletter rendered eagerly asks Android for a quarter of a gigabyte. Its failure mode
  is the nasty one: the allocation "succeeds" and hands back a *blank* canvas, so pages
  look empty rather than broken. `PdfViewer` lays out one placeholder per page at the
  page's real aspect ratio (so the scrollbar is honest and nothing jumps), then rasterises
  and releases with an `IntersectionObserver`, and caps any single canvas at
  `MAX_CANVAS_PX`. Measured on the 12-page fixture: **1 page resident, 5.1 MB**, versus
  all twelve before. An e2e test asserts fewer canvases exist than there are pages — if
  you make rendering eager again, it fails.
- **Avatars are downscaled in the browser before upload** (`$lib/image.ts`, canvas →
  WebP, 320px square; bonus-task thumbnails take the same path uncropped at 640px).
  There is deliberately no image library on the server — `src/lib/server/images.ts` only
  writes bytes and hands them back with a content-derived ETag. Photos uploaded before
  that existed were multi-megabyte; `scripts/optimize-avatars.mjs` re-encodes existing
  ones using Playwright's Chromium and keeps the originals.
- **An "admin" is not always an `admins` row.** An adult member who unlocked with their
  own PIN gets a member-backed session, so `locals.admin.kind` is `'member'` and
  `locals.admin.id` is a *member* id. Anything writing an admin foreign key (e.g.
  `rewardRedemptions.redeemedByAdminId`) must check `kind` first. `resolveAdmin`
  re-checks role and PIN on every request, so demoting a parent revokes it instantly.

## Layout rules (this is a phone/tablet app first)

- **Every page opens with `.page-head`** (in `app.css`), matching the Today page's hero:
  heading, optional controls beside it, `--s-5` to the content. It exists because that gap
  used to be whatever each page declared — nothing at all on `/week` and `/month`, `--s-5`
  on `/upload`, just the `h1`'s own `0.4em` elsewhere — so switching tabs shifted the
  content up and down. Add `.spread` when there are controls to push to the far side.
- **All spacing comes from the fluid scale in `app.css`** — `--s-1` … `--s-7` plus
  `--gutter`. Never write a raw `rem` for a `gap`, `padding` or `margin`; there is no
  value between the steps, and if a design seems to need one the scale is wrong (fix it
  in `:root`, not locally). Each step is a `clamp()` that reaches its minimum at 360px
  and its maximum at 1024px, so **one token is tight on a phone and roomy on the wall
  tablet** — which is the whole reason it exists. A fixed `rem` gives both devices
  identical spacing, so one of them is always wrong: tablet-comfortable card padding
  eats a tenth of a 360px phone's width, and phone-tight padding makes the tablet look
  like a stretched phone. Because the scale carries the device difference, components
  need no breakpoint of their own — the old `@media (max-width: 640px)` gutter step on
  `.app-shell` is gone, and nothing should reintroduce that kind of rule for spacing.
  A negative margin tracks the scale too (`calc(-1 * var(--s-2))`), or the overlap it
  corrects for grows on a tablet while the correction stays put.
- **All type comes from the scale too** — `--t-1` … `--t-8` in `app.css`, same 360px→1024px
  interpolation, for a sharper reason than spacing: **reading distance**. A phone is at
  arm's length, the wall tablet is read from across the kitchen, so the same text has to
  be physically bigger there — something a fixed `rem` cannot express. That's how the app
  had accumulated *twelve* sizes between 10.4px and 15.2px, all flat. The heading ramp is
  one step per level (`h1`→`--t-7` … `h4`→`--t-4`); `h3` is the workhorse (25 uses) and
  `h4` deliberately lands on body size, its weight carrying the distinction. `body` itself
  is `--t-4`, so buttons and inputs (`font: inherit`) grow with everything else — and at
  360px that's still exactly 16px, so the coarse-pointer iOS floor is never undercut.
  The month grid's two purpose-built `clamp()`s stay off the scale on purpose: they're
  sized by the seven-column constraint, not by reading distance.
- **The member picker is a band on a phone and a standing rail on a tablet.** Below
  768px `OperatorBar` is a horizontal row that spreads the faces `space-between` across
  the full width (avatars are `clamp(52px, 15vw, 76px)`, so four reach both edges of a
  360px screen); from 768px up it turns into a vertical column and `+layout.svelte`
  gives it a real grid track beside the content, sticky so it stays reachable down a
  long page. The trade is deliberate: a phone has width to spare and no height, a tablet
  the reverse, and the band was costing ~110px of height on the screen with least of it.
- **A `{@render children()}` is *not* one element.** Pages render several top-level
  nodes, so putting `{@render children()}` directly into a grid deals those nodes out as
  separate grid items — half the page ends up in the rail's narrow track, and the symptom
  is a wildly overflowing page whose culprit element reports a 36px-wide parent. It's
  wrapped in a single `.content` div (with `min-width: 0`) for exactly this reason; keep
  it wrapped.
- **Never write a fixed column count for content.** Use
  `repeat(auto-fit, minmax(min(<size>, 100%), 1fr))`. The inner `min(…, 100%)` is the
  part people forget: a plain `minmax(320px, 1fr)` track refuses to shrink below 320px
  and silently pushes the whole page sideways on a small phone. The month grid is the one
  deliberate exception — seven columns is what makes it a month — so its *cells* scale
  with `clamp()` instead.
- **Dialogs use the shared `.backdrop` / `.modal` in `app.css`.** Don't re-declare them
  per component (there used to be six near-identical copies, and the ones missing
  `overflow-y` clipped the top of a tall form on a short screen with no way to reach it).
  Override only `max-width` locally.
- `min-width: 0` on any flex/grid child that holds text. Without it the item can't shrink
  below its longest word and it, not the viewport, decides the page width.
- Tap targets: 44px is the floor for anything a child taps. Small glyph buttons get a
  36px box that grows to 44px under `@media (pointer: coarse)`.
- Form controls must never render below 16px on touch — iOS Safari zooms the page in on
  focus. `app.css` enforces a floor under `@media (pointer: coarse)`; don't fight it with
  a smaller `font-size` in a component.
- `dvh`, not `vh` (iOS toolbars), and `env(safe-area-inset-*)` on anything full-bleed —
  the app sets `viewport-fit=cover`, so without insets content slides under the notch.
- A component that lives in a variable-width column (the weather card, the points table)
  should respond to **its own** width via a container query, not the viewport's. The
  spacing scale is the deliberate exception: it's keyed to the viewport because it
  encodes *device ergonomics* — a phone at arm's length vs a tablet read from across the
  kitchen — which is a property of the screen, not of the column a card happens to sit
  in. Layout decisions (how many columns, does this row wrap) still belong to the
  container.
- Two e2e tests guard all of this: one asserts zero horizontal overflow on every route at
  360/390/768/1024, one asserts a tall dialog stays reachable on a short screen. If you
  change layout and they fail, the page really doesn't fit — don't loosen them.
- **`height: 100%` on a child of an auto-sized flex/grid row silently resolves to
  `auto`.** A percentage height needs a *definite* containing-block height; an
  auto-sized row's height depends on its content, so the percentage would be circular
  and the spec makes it fall back to the intrinsic size. Bit the bonus-task card: a
  238px-wide, 4:3 (179px tall) window held an `<img>` with `width:100%; height:100%;
  object-fit: cover`, and the image rendered **238×317** — its own intrinsic height —
  with `overflow: hidden` quietly clipping a third of every photo, and `object-fit`
  doing nothing because the box already matched the image's ratio. The fix is to take
  the child out of flow (`position: absolute; inset: 0`) so the `aspect-ratio` box is
  the containing block. Applies to any fixed-ratio media window: use `inset: 0`, not
  `height: 100%`. An e2e assertion compares the `<img>`'s `offsetHeight` to the frame's
  `clientHeight` so this can't come back.
- **Don't centre an emoji by centring its span.** Emoji fonts (Apple Color Emoji
  especially) have line-box metrics far taller than the glyph, so a perfectly centred
  span still draws the glyph visibly off-centre, and it differs per platform. Give the
  wrapper `position: absolute; inset: 0`, centre with flexbox, and set `line-height: 1`
  so what's centred is the glyph, not a font's idea of a line.
- **`bind:value` on a `<select>` races a plain `$effect` trying to set its default.**
  If the bound state is `undefined` when the `<select>` mounts, the browser's native
  "first option selected" default gets synced back into that state *before* an
  `$effect` (which runs after the DOM updates) gets a chance to set a smarter default —
  so the smart default silently loses. Use `$effect.pre` for this (runs before the DOM
  patches). Hit this exact bug once in `RewardBandit`'s tag→member redeem-default.
- Recurring things (chores, calendar notations) share one date-math module:
  `src/lib/server/recurrence.ts`'s `dueDatesFor()`. Don't reimplement weekday-mask
  logic elsewhere — chores' `chores/generate.ts` and plans' `plans/generate.ts` both
  call into it and follow the same "definition + generated occurrences" shape (see
  `chores`/`chore_instances` and `plan_series`/`plan_items`).

## Database & migrations

Migrations are **hand-written SQL** in `drizzle/*.sql` + `drizzle/meta/_journal.json`
(not `drizzle-kit generate`, which needs an interactive TTY this environment doesn't
have). To add a migration: write the next-numbered `.sql` file, add its journal entry
by hand, matching the existing files' format.

**`npm run db:migrate` does NOT respect `DATA_DIR`** — it reads `DB_PATH`, which
defaults straight to `./data/dashboard.db` (the live database) regardless of any
`DATA_DIR` env var you set. Running it bare applies migrations to production
immediately. This has already bitten this project once (harmlessly — the migration was
additive). If you need to sanity-check a migration against a scratch copy, set
`DB_PATH` explicitly, not `DATA_DIR`.

Unit tests are already wired to be safe by default: `vite.config.ts` sets
`test.env.DATA_DIR` to a scratch `.vitest-data/` directory (cleared on every config
load), so `npm test` never touches `./data`. Playwright does the same via `.pw-data/`
in `playwright.config.ts`. Don't remove or bypass either.

## Testing

- `npm test` — Vitest, unit + a few DB-backed integration tests (call `runMigrations()`
  in `beforeAll`, then use Drizzle directly against the scratch DB).
- `npm run test:e2e` — Playwright (pinned to 1.49.1 for macOS 12 compatibility — don't
  bump without checking that constraint still applies), one long serial spec
  (`tests/e2e/dashboard.spec.ts`) that builds up one household's state test-by-test.
  Order matters; a test can rely on state a prior test created.
- **Dates in tests must be the server's local day, not UTC.** `tests/e2e/dashboard.spec.ts`
  has an `isoDay()` helper — use it. `new Date().toISOString().slice(0, 10)` is UTC, while
  every `YYYY-MM-DD` in the app is the server's local zone (`src/lib/server/date.ts`), so
  between local midnight and the UTC offset they disagree by a day: a chore gets filed
  under yesterday and the assertion that it's in today's deck fails. The whole suite used
  to go red after midnight CEST and green again by morning.
- **An icon-only button's accessible name is its text content, not its `title`.** A button
  containing only an emoji is named "wastebasket" to `getByRole` and to a screen reader;
  `title` is merely a fallback for when there's no content at all. Put the glyph in a
  `<span aria-hidden="true">` and the real name in `aria-label` (the `.btn-add` SVG buttons
  already do this).
- Gotcha found repeatedly while writing these tests: several list rows (tag labels,
  member names) are rendered as **inline-editable `<input value=...>` elements, not
  text nodes** — `getByText('Ada')` will not find them; assert on the input's `value`
  instead (`toHaveValue`).
- `npm run check` (svelte-check) should report **0 errors** before you're done; a
  handful of pre-existing a11y/reactivity warnings are known and accepted (see below).

## Known, accepted trade-offs (don't "fix" without reason to revisit)

- No CSP header — dynamic per-member/per-tag colors are applied via inline
  `style="--c:…"` attributes throughout the UI; a CSP strict enough to matter would
  need blanket `'unsafe-inline'` for styles anyway.
- A handful of svelte-check warnings persist by design:
  - `state_referenced_locally` on settings/setup forms — those `$state(data.foo)`
    calls are intentionally seeding a one-time edit buffer from server data; making
    them reactive would overwrite in-progress edits on every reload.
  - `label_has_associated_control` on a few group-pickers (tag/member chip pickers) —
    the `<label>` describes a button group, not a single control.
- ICS-subscription calendar URLs (admin-only feature) have no SSRF blocking of private
  IP ranges — deliberately, since the README documents subscribing to a self-hosted
  Nextcloud/etc. feed on the same LAN as a supported use case.
- `household.reward_note` DB column is deprecated/unused (superseded by the rewards
  catalog) but not dropped — avoids a destructive migration for a cosmetic cleanup.

## Deploy

**`npm run test:e2e` must never build into `./build`.** That is what the live launchd
service runs from, and rewriting it under a running Node process tears the module graph
out from under it: the dashboard starts 500-ing with `ERR_MODULE_NOT_FOUND`, launchd
restarts it onto whatever half-written build is on disk, and unreviewed code — including
unapplied migrations — silently goes live. This happened three times in one session and
took the family's dashboard down for about ten minutes. `svelte.config.js` therefore
reads `BUILD_OUT`, and `playwright.config.ts` sets it to `build-e2e`. Keep it that way;
if you add another script that builds, give it its own `BUILD_OUT` too.

```bash
npm run build
launchctl kickstart -k "gui/$(id -u)/com.slikroad.familydashboard"
curl -s http://localhost:4174/healthz   # {"status":"ok","db":true,...}
```

**Port 4174, not 4173** — this Mac also runs an unrelated project (`DashDash`) that's
claimed 4173, and the two have collided before. If the port ever needs to change again,
editing `~/Library/LaunchAgents/com.slikroad.familydashboard.plist` and `kickstart -k`
is **not enough** — kickstart restarts the process but reuses launchd's already-loaded
copy of the environment variables, so a new `PORT` in the plist is silently ignored.
It needs a full reload:

```bash
launchctl bootout "gui/$(id -u)/com.slikroad.familydashboard"
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.slikroad.familydashboard.plist
```

`scripts/install-service.sh` already does this correctly (and writes `.env` + the
plist's `PORT` in sync) — prefer re-running it over hand-editing the plist.

Logs: `data/logs/dashboard.{out,err}.log`. After touching migrations or the DB
directly, verify the real household's data is intact, e.g.:

```bash
sqlite3 data/dashboard.db "select count(*) from members;"   # the household is 4 people
```
