# ReproducibiliTea content reorganization + native-popover nav + semantic HTML

## Context

The site (Jekyll on Netlify, see `docs/superpowers/specs/2026-08-26-website-modernization-design.md` for the backend/infra spec that's landing in parallel) has grown its top-level pages ad hoc. The current header nav (`_includes/header.html`) groups pages by content *type* (Community / Projects / Organizer Tools / an unlabeled leftover group), which mixes audiences on the same menu: a public "Online meetings" page sits under "Organizer Tools", the blog has no nav entry at all, and several pages (`map.html`, `jc-overview.html`, `categories.html`, `tags.html`) aren't linked from the nav at all.

This spec covers three things the user asked to do together, since all three touch the same files:

1. **Reorganize content by user intent** (find a club / become an organizer / wider community output), not content type.
2. **Rebuild the nav on the native Popover API**, replacing the current checkbox-hack menu (`input.nav-trigger`, `input.page-link` + adjacent-sibling CSS + a `mutually-exclusive-checkboxes` JS block).
3. **Sweep the site for semantic HTML** while touching every page anyway.

**Coordination note:** `docs/superpowers/plans/2026-08-26-website-restyle.md` (not yet implemented — see Task 1) writes CSS against the *current* `.site-nav` / `input.page-link` checkbox markup. That plan's nav CSS is superseded by this spec's nav rebuild; implement this spec's nav work either before that plan's Task 1, or fold the brand tokens (colors/spacing) from that plan's stylesheet into the new nav markup instead of styling the checkbox hack. Everything else in that plan (map, forms, cards) is unaffected and independent.

## Content decisions (from user discussion)

- **Home** (`index.md`) absorbs `about.md`'s content (mission, sponsors, stats). `about.md` is retired.
- **Find a Club** (root page, reuses `journal-clubs.md`'s `/journal-clubs/` permalink) absorbs "Way 2: want to join an existing club?" from `getting-started.md` (the JC showcase + community calendar). Links out to Map (`map.html`), Calendar (`calendar.md`), Online meetings (`online.md`).
- **Organizers** (new page, `/organizers/`) absorbs "Way 1: want to start your own club?" from `getting-started.md`, plus the existing "Organizer Tools" group. One page covers both becoming an organizer (link to `join-reproducibiliTea.html`) and tools for existing organizers (Edit your journal club `edit-jc.html`, Make a meeting card `card.html`, Zotero Group Info `Zotero-group.md`, and the Code of Conduct *template* link — see below). Rationale (user's call): starting a club is just step zero of being an organizer, no need for a separate nav item.
- **Community & Outputs** (new page, `/community/`) links to everything else, split into two on-page sections since the list is long:
  - *Get Involved*: Sharing Stories, Collaborations, Special Interest Groups, Conference 2026
  - *Outputs & Resources*: Blog (posts), Post-publication Reviews, Resources, Reading Lists ↗ (external), Podcast ↗ (external)
- **`getting-started.md` is retired.** Way 1 → Organizers, Way 2 → Find a Club, Way 3 (self-directed reading list pointer) is a pure duplicate of the Outputs & Resources section and is dropped, not relocated.
- **Code of Conduct** (`code-of-conduct.md`, unchanged content — it holds two links: the org's own CoC and a template CoC for individual JCs to adopt) moves out of the header nav entirely. The org's own CoC is linked from the **footer** on every page. The JC template CoC link is linked from the **Organizers** page. Both links point at the same existing page/anchors — no content duplication needed, just two entry points.
- **Homepage map stays** (`_includes/jc-map.html`, already embedded in `index.md`) — user wants it kept as the at-a-glance "here's our reach" visual. Below it, add a **"What's on?"** section with two links: *Online* → Calendar, *Near me* → Find a Club.
  - **Stretch, not required for this pass:** "Near me" auto-filters to the visitor's nearest JC via the browser Geolocation API + haversine distance against each JC's existing `geolocation` frontmatter field (already present on every `_journal-clubs/*.md` entry — no new data needed). Must degrade gracefully to the plain unfiltered Find a Club page when permission is denied or unsupported. Implement only after the core reorg ships; note it as a follow-up task in the plan rather than blocking on it.
- **Footer** also carries the two previously-unhoused external links: Merchandise ↗, OSF Repository ↗.
- **`jc-overview.html`** (admin-only sortable table of all JCs, including `status: pending` ones per the parallel creation-flow spec) is **unlinked from all nav** — reachable only by direct URL, not gated. True gating requires moving its data from Jekyll build-time embedding to a runtime Netlify Function checked against a token (reusing `src/lib/tokens.js` and the `ADMIN_EMAILS` list already being built in `docs/superpowers/plans/2026-08-26-jc-creation-flow.md`) — that's a separate follow-up spec, out of scope here.
- **`categories.html` / `tags.html`** get no nav entry. Reachable only via category/tag chips rendered on individual blog posts (`_layouts/post.html` — confirm it links to `/categories/#slug` and `/tags/#slug` per tag/category; add the links if missing).

## Nav structure

Flat, three-item top-level nav — no dropdowns needed, because every item now lands on a real page that lists its own sub-links (that's the point of the "root page + on-page links" pattern above):

```
[logo] → /            Find a Club → /journal-clubs/     Organizers → /organizers/     Community & Outputs → /community/
```

Mobile: the existing hamburger disclosure (currently `input#nav-trigger` + `label`) becomes a single native `<button popovertarget="site-nav-menu">` revealing a `<div id="site-nav-menu" popover>` containing the same three links. No nested popovers, no mutual-exclusivity JS — the current `pageLinks.forEach(...)` script in `header.html` is deleted entirely along with the checkbox submenu structure it manages.

Footer (`_includes/footer.html` — check current content, extend rather than replace): Code of Conduct, Merchandise ↗, OSF Repository ↗.

## Semantic HTML sweep

Applies while touching every page for the reorg above, and as a pass over the remaining templates in `_includes/`/`_layouts/`. Checklist (fix violations found, don't go hunting beyond the touched files):

- `<header>`/`<nav>`/`<main>`/`<footer>` landmarks present once each per page (verify `_layouts/default.html`/`page.html` wrap content in `<main>`).
- One `<h1>` per page; heading levels don't skip (no `<h1>` → `<h3>`).
- Real `<button>` for actions (menu toggle, table sort controls in `jc-overview.html`/`jc-lookup.html` currently using `<a onclick=...>`), real `<a href>` only for navigation.
- Forms (`join-reproducibiliTea.html`, `edit-jc.html`) use `<label for=...>` tied to inputs, not placeholder-as-label.
- Tabular data (`jc-overview.html`) keeps `<table>`; non-tabular layouts elsewhere don't use tables for positioning (spot-check `card.html`).
- Images have meaningful `alt` (or `alt=""` if purely decorative, e.g. the external-link icons already using `<i class="fas ...">` — those are fine as icon fonts but should carry `aria-hidden="true"` since they're decorative next to visible link text).
- Replace the checkbox-hack menu's `<input type="checkbox">`-as-UI-state pattern (semantically meaningless here) with the native `popover` attribute per the nav section above.

## File structure

- Modify: `index.md` — absorb `about.md` content, add "What's on?" section under the map.
- Delete: `about.md`, `getting-started.md` (content redistributed per above).
- Rename/expand: `journal-clubs.md` → Find a Club root page (keep `/journal-clubs/` permalink), add Map/Calendar/Online-meetings links and the absorbed "Way 2" content.
- Create: `organizers.md` (`/organizers/`) — absorbed "Way 1" content + existing Organizer Tools links + CoC template link.
- Create: `community.md` (`/community/`) — the two on-page sections listed above.
- Modify: `_includes/header.html` — full rewrite to the flat 3-item native-popover nav.
- Modify: `_includes/footer.html` — add Code of Conduct, Merchandise, OSF Repository links.
- Modify: `code-of-conduct.md` — no content change; just no longer in header nav.
- No change: `calendar.md`, `online.md`, `map.html`, `edit-jc.html`, `card.html`, `Zotero-group.md`, `resources.md`, `post-publication-reviews.md`, `sharing-stories.md`, `collaborations.md`, `special-interest-groups.md`, `conference2026.html`, `join-reproducibiliTea.html`, `posts.md`, `categories.html`, `tags.html`, `jc-overview.html` — only linked-to differently, and swept for semantic HTML per the checklist above.

## Redirects

`about.md`, `getting-started.md`, and any changed permalinks need Netlify `_redirects` entries (or Jekyll `redirect_from` if a plugin is already in use — check `Gemfile` first) so existing external links/bookmarks don't 404:

- `/about/` → `/`
- `/getting-started/` → `/organizers/` (closest surviving equivalent; most of its content lands there)

## Out of scope (flagged, not forgotten)

- `jc-overview.html` admin-token gating — needs its own spec once the creation-flow admin auth infra (`ADMIN_EMAILS`, `admin-approve` token purpose) has landed.
- "Near me" geolocation auto-filter — stretch goal, ship after the core reorg, own task in the implementation plan.
- Visual restyle (colors, cards, Leaflet maps) — already covered by `docs/superpowers/plans/2026-08-26-website-restyle.md`; only coordinate on nav CSS as noted above, don't redo that work here.
