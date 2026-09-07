# ReproducibiliTea Content Reorganization + Native-Popover Nav + Semantic HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the ReproducibiliTea Jekyll site's top-level pages around user intent (find a club / become an organizer / wider community), replace the checkbox-hack nav with a native-popover nav, and sweep semantic HTML while touching every page.

**Architecture:** This is a Jekyll static site (Ruby 3.4.7, Jekyll >=4.4.1, minima theme 2.5.2) deployed to Netlify. There is no client-side framework and no JS test runner — "tests" for this plan are `bundle exec jekyll build` (must succeed with no new errors) followed by `grep` assertions against the generated `_site/` output, which is a faithful substitute for unit tests on a content/markup site. Every task's Ruby/Jekyll commands must be run with rbenv's shims on `PATH` (see Global Constraints).

**Tech Stack:** Jekyll 4.x, minima 2.5.2 theme, kramdown markdown, plain CSS (`assets/css/custom.css`, `assets/css/tweaks.css`, not compiled from Sass — edit them directly), Netlify (redirects via `_redirects`), native HTML Popover API (no JS, no polyfill).

**Spec:** `docs/superpowers/specs/2026-08-26-content-reorganization-design.md`

## Global Constraints

- Ruby is managed by rbenv but rbenv is not on `PATH` in a fresh shell. Every Bash step that runs `ruby`/`bundle`/`jekyll` in this plan must first run:
  ```bash
  export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
  ```
- Build the site with: `bundle exec jekyll build --destination /tmp/rtk-build` (use a scratch destination so you never clobber a real `_site/` the user might be serving; delete it when done: `rm -rf /tmp/rtk-build`).
- The build prints pre-existing Sass deprecation warnings from the vendored `minima` gem (`lighten()`, `@import`) — these are unrelated to this plan and are not a failure signal. A failure is a non-zero exit code or a Liquid/Jekyll `Error:` line.
- Every internal nav link must point at the *served* URL, not the source filename. Pages with an explicit `permalink:` front-matter key serve at that path (e.g. `journal-clubs.md` with `permalink: /journal-clubs/` serves at `/journal-clubs/`); pages without one serve as a flat `name.html` (e.g. `code-of-conduct.md` → `/code-of-conduct.html`) but Netlify's default pretty-URL rewriting means `/code-of-conduct/` (trailing slash, no `.html`) also resolves in production — this is the existing site-wide convention (confirmed: current `header.html` already links `/code-of-conduct/`, `/Zotero-group/`, `/online/` this way) and this plan continues it. Do not add explicit `permalink:` to files that don't already need one — only `organizers.md` and `community.md` (new pages) get one, matching `journal-clubs.md`'s existing pattern.
- Decorative external-link icons (`<i class="fas fa-external-link-square-alt"></i>`, always wrapped in `<sup>`) get `aria-hidden="true"` added **only in files this plan edits** — do not go fix this pattern in untouched files (`online.md`, `join-reproducibiliTea.html`, `_sponsors/ukrn.md`, `_includes/sponsors.html`, `_includes/podcast.html` all have the same pattern and are intentionally left alone; they're out of scope per the spec's "don't go hunting beyond the touched files" rule).

---

## File structure

- Create: `_redirects` (Netlify redirects, plain text, no extension)
- Modify: `_config.yml` — add `include: ["_redirects"]` so Jekyll's underscore-file exclusion doesn't drop it from `_site/`
- Modify: `_includes/header.html` — full rewrite to flat 3-item native-popover nav
- Modify: `assets/css/custom.css` — replace the "nav display" block (`/* nav display */` through the end of the file's `@media screen and (max-width: 600px)` block) to match the new nav markup
- Modify: `_includes/footer.html` — add Code of Conduct / Merchandise / OSF Repository links
- Modify: `journal-clubs.md` — becomes the "Find a Club" page (keeps `/journal-clubs/` permalink)
- Create: `organizers.md` (`/organizers/`)
- Create: `community.md` (`/community/`)
- Modify: `index.md` — absorb `about.md`, add "What's on?" section, fix pre-existing duplicate-`<h1>` bug
- Delete: `about.md`, `getting-started.md`
- Modify: `categories.html`, `tags.html` — heading-level fix
- Modify: `resources.md` — heading-level fix
- Modify: `join-reproducibiliTea.html` — heading-level fix
- Modify: `card.html`, `jc-overview.html` — `<a onclick>`/`<div onclick>` → `<button>`
- Modify: `conference2026.html` — add missing `<header>`/`<main>` landmarks (edit via `sed`, not the Edit tool — the file contains multi-megabyte base64 image data URIs on single lines that exceed the file-read size limit)

---

### Task 1: Netlify redirects for retired pages

**Files:**
- Create: `_redirects`
- Modify: `_config.yml`

**Interfaces:**
- Produces: `/about/` and `/about` → `/` (301); `/getting-started/` and `/getting-started` → `/organizers/` (301). Task 8 (deletes `about.md`) and Task 9 (creates `organizers.md`, deletes `getting-started.md`) depend on these targets existing by the time this plan is fully applied, but the redirect file itself has no code dependency — do this task first since it's foundational and independent.

- [ ] **Step 1: Add the include directive**

Edit `_config.yml`: leave the existing commented-out `exclude:` block at the bottom exactly as it is, and append a new active `include:` block immediately after it (Jekyll excludes any file/dir starting with `_` by default; `include:` is the escape hatch). The file should end with:

```yaml
# Exclude from processing.
# The following items will not be processed, by default. Create a custom list
# to override the default setting.
# exclude:
#   - Gemfile
#   - Gemfile.lock
#   - node_modules
#   - vendor/bundle/
#   - vendor/cache/
#   - vendor/gems/
#   - vendor/ruby/

# Netlify reads _redirects from the build output. Jekyll excludes
# underscore-prefixed files by default, so it must be explicitly included.
include:
  - _redirects
```

- [ ] **Step 2: Create the redirects file**

Create `_redirects` at the repo root (plain text, Netlify's `_redirects` syntax is `source  destination  status`):

```
/about              /                301
/about/             /                301
/getting-started        /organizers/      301
/getting-started/       /organizers/      301
```

- [ ] **Step 3: Build and verify the file is included in `_site/`**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
cat /tmp/rtk-build/_redirects
```

Expected: the four-line redirects file printed verbatim (before Step 1/2 this file would not exist in `_site/` at all — Jekyll would silently drop it).

- [ ] **Step 4: Commit**

```bash
git add _config.yml _redirects
git commit -m "feat: add Netlify redirects for retired /about/ and /getting-started/ pages"
```

---

### Task 2: Rewrite header nav to flat 3-item native-popover nav

**Files:**
- Modify: `_includes/header.html`

**Interfaces:**
- Produces: nav links to `/journal-clubs/` ("Find a Club"), `/organizers/` ("Organizers"), `/community/` ("Community & Outputs"). Task 5, 6, 7 must serve real pages at exactly those three URLs — do this task in any order relative to those, but the final site isn't link-clean until both sides exist.
- Consumes: `_includes/logo.html` (unchanged, existing include).

The current file is a checkbox-hack (`input#nav-trigger`, `input.page-link` submenus, a `pageLinks.forEach` mutual-exclusivity script). Replace the whole thing with two literal copies of the same flat 3-link list — one always-visible `<ul>` for desktop, one inside a native `<div popover>` reached via `<button popovertarget>` for mobile. This needs no JavaScript: the browser's native Popover API handles show/hide/light-dismiss, and a CSS media query decides which of the two lists is visible at a given viewport width (see Task 3). This duplication (two `<ul>`s) is intentional — the `popover` attribute can't be toggled by a media query, so an always-open desktop list and a native-popover mobile list have to be separate elements. Both use `class="page-link"` on the `<a>` tags so they keep minima's base link styling for free.

- [ ] **Step 1: Read the current file for reference**

```bash
cat _includes/header.html
```

(Confirms the exact current markup before replacing it — no assertion, just orientation.)

- [ ] **Step 2: Replace the file contents**

Replace the entire contents of `_includes/header.html` with:

```html
<header class="site-header">

    <div class="wrapper">
        <a class="site-title" rel="author" href="{{ "/" | relative_url }}">
        {% include logo.html %}
        </a>

        <nav class="site-nav" aria-label="Primary">
            <ul class="site-nav-links">
                <li><a class="page-link" href="/journal-clubs/">Find a Club</a></li>
                <li><a class="page-link" href="/organizers/">Organizers</a></li>
                <li><a class="page-link" href="/community/">Community &amp; Outputs</a></li>
            </ul>

            <button type="button" class="nav-toggle" popovertarget="site-nav-menu" aria-label="Menu">
                <svg viewBox="0 0 18 15" width="30px" height="30px">
                    <path d="M18,1.484c0,0.82-0.665,1.484-1.484,1.484H1.484C0.665,2.969,0,2.304,0,1.484l0,0C0,0.665,0.665,0,1.484,0 h15.032C17.335,0,18,0.665,18,1.484L18,1.484z M18,7.516C18,8.335,17.335,9,16.516,9H1.484C0.665,9,0,8.335,0,7.516l0,0 c0-0.82,0.665-1.484,1.484-1.484h15.032C17.335,6.031,18,6.696,18,7.516L18,7.516z M18,13.516C18,14.335,17.335,15,16.516,15H1.484 C0.665,15,0,14.335,0,13.516l0,0c0-0.82,0.665-1.483,1.484-1.483h15.032C17.335,12.031,18,12.695,18,13.516L18,13.516z"/>
                </svg>
            </button>

            <div id="site-nav-menu" popover class="site-nav-menu">
                <ul>
                    <li><a class="page-link" href="/journal-clubs/">Find a Club</a></li>
                    <li><a class="page-link" href="/organizers/">Organizers</a></li>
                    <li><a class="page-link" href="/community/">Community &amp; Outputs</a></li>
                </ul>
            </div>
        </nav>
    </div>
</header>
```

Note what's gone: the `titles_size`/`page_paths` Liquid setup (was only feeding the now-deleted dynamic-links comment block), the `input#nav-trigger` checkbox, the nested `input.page-link` submenu checkboxes, and the trailing `<script>` block that made them mutually exclusive.

- [ ] **Step 3: Build and verify the checkbox hack is gone and the new links are present**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -c "nav-trigger" /tmp/rtk-build/index.html
grep -o 'popovertarget="site-nav-menu"' /tmp/rtk-build/index.html
grep -o 'href="/organizers/"' /tmp/rtk-build/index.html
```

Expected: first command prints `0` (no more checkbox hack anywhere in the rendered page), second and third each print one match.

- [ ] **Step 4: Commit**

```bash
git add _includes/header.html
git commit -m "feat: rebuild header nav as flat 3-item native-popover menu"
```

---

### Task 3: Nav CSS for the new markup

**Files:**
- Modify: `assets/css/custom.css`

**Interfaces:**
- Consumes: the class names introduced in Task 2 (`site-nav-links`, `nav-toggle`, `site-nav-menu`, `page-link`). This task must run after Task 2 (needs the new markup to visually verify against) but can be developed by reading Task 2's diff alone.

The existing `/* nav display */` block (and the matching `@media screen and (max-width: 600px) { .header-links { display: unset; } }` block at the end of the file) was written for the old nested-submenu checkbox markup (`.header-links`, `label.page-link`, `input.page-link:checked + .header-links`, etc). None of those selectors exist in the new markup, so this whole block is now dead weight and must be replaced.

- [ ] **Step 1: Locate the exact lines to replace**

```bash
grep -n "nav display\|header-links\|\.header-links\|max-width: 600px" assets/css/custom.css
```

Confirm the block runs from the `/* nav display */` comment down through `div.page-link { ... }`, plus the separate `@media screen and (max-width: 600px) { .header-links { display: unset; } }` block near the end of the file.

- [ ] **Step 2: Replace the block**

Remove everything from `/* nav display */` through the `div.page-link { ... }` rule (inclusive), and replace it with:

```css
/* nav display */
header.site-header,
footer.site-footer {
    background-color: white
}
.site-nav {
    display: flex;
    align-items: center;
}
.site-nav-links {
    display: flex;
    gap: 1.5em;
    list-style: none;
    margin: 0;
    padding: 0;
}
.nav-toggle {
    display: none;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
}
.nav-toggle svg {
    fill: var(--color-rpt-secondary);
}
#site-nav-menu {
    border: 1px solid #e8e8e8;
    border-radius: 5px;
}
#site-nav-menu ul {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.75em;
    margin: 0;
    padding: 0.5em 0;
}

@media screen and (max-width: 600px) {
    .site-nav-links {
        display: none;
    }
    .nav-toggle {
        display: flex;
    }
}
```

Also delete the now-dead `@media screen and (max-width: 600px) { .header-links { display: unset; } }` block near the end of the file (it targeted a class that no longer exists anywhere).

- [ ] **Step 3: Build, then manually verify in a browser**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll serve --destination /tmp/rtk-build --port 4567 &
```

Open `http://localhost:4567/` in a browser. At full width: confirm "Find a Club", "Organizers", "Community & Outputs" show inline in the header and the hamburger button is hidden. Resize below 600px (or use devtools responsive mode): confirm the inline links hide, the hamburger button appears, and clicking it opens a popover with the same three links (native browser behavior — no console errors). Then stop the server (`kill %1` or `fg` + Ctrl-C).

- [ ] **Step 4: Commit**

```bash
git add assets/css/custom.css
git commit -m "feat: style the native-popover nav, remove dead checkbox-hack CSS"
```

---

### Task 4: Footer links

**Files:**
- Modify: `_includes/footer.html`

**Interfaces:**
- Produces: footer links to `/code-of-conduct/` (existing page, unchanged), `https://www.redbubble.com/people/rptea/works/62022837?asc=u` (Merchandise), `https://osf.io/3qrj6/` (OSF Repository). These are the same URLs the old header used for "Code of Conduct" and the unlabeled last nav group.

- [ ] **Step 1: Add a new footer column**

In `_includes/footer.html`, insert a new `<div class="footer-col footer-col-links">` between the existing `footer-col-3` div (closes after the contact list) and the `footer-col sponsors` div:

```html
            <div class="footer-col footer-col-links">
                <ul class="contact-list">
                    <li><a href="/code-of-conduct/">Code of Conduct</a></li>
                    <li><a href="https://www.redbubble.com/people/rptea/works/62022837?asc=u" target="_blank">Merchandise <sup><i class="fas fa-external-link-square-alt" aria-hidden="true"></i></sup></a></li>
                    <li><a href="https://osf.io/3qrj6/" target="_blank">OSF Repository <sup><i class="fas fa-external-link-square-alt" aria-hidden="true"></i></sup></a></li>
                </ul>
            </div>

```

Also add `aria-hidden="true"` to the pre-existing UKRN external-link icon a few lines above it (line with `We are grateful for the support of the <a href="https://ukrn.org/" ...>UKRN <sup><i class="fas fa-external-link-square-alt"></i></sup></a>`) — since this file is already being edited, fix this one too rather than leaving an inconsistent icon right next to the new ones.

- [ ] **Step 2: Build and verify**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -o 'href="/code-of-conduct/"' /tmp/rtk-build/index.html
grep -o 'href="https://osf.io/3qrj6/"' /tmp/rtk-build/index.html
grep -c 'fa-external-link-square-alt" aria-hidden="true"' /tmp/rtk-build/index.html
```

Expected: first two each print one match; third prints at least `3` (UKRN + Merchandise + OSF, all in the footer which renders on every page including `index.html`).

- [ ] **Step 3: Commit**

```bash
git add _includes/footer.html
git commit -m "feat: add Code of Conduct, Merchandise, OSF Repository links to footer"
```

---

### Task 5: "Find a Club" page (`journal-clubs.md` rewrite)

**Files:**
- Modify: `journal-clubs.md`

**Interfaces:**
- Produces: page served at `/journal-clubs/` (permalink unchanged), title "Find a Club" (so the auto-generated `<h1>` from `layout: page` matches the nav label).
- Consumes: `_includes/jc-showcase.html` (unchanged), links to `/map.html`, `/calendar/`, `/online/` (all unchanged, no-op pages per the spec).

- [ ] **Step 1: Replace the file contents**

```markdown
---
layout: page
title: Find a Club
permalink: /journal-clubs/
---

We now have journal clubs set up in many universities. Please use the search tool below to find out if there's one in your area:

{% include jc-showcase.html initial-value="" %}

## More ways to connect

- See every journal club plotted on the [map](/map.html).
- Many of our journal clubs meet online and gladly welcome guests — check the [community calendar](/calendar/) for upcoming sessions open to wider participation.
- New to online journal clubs? Read our [advice for attending online meetings](/online/).
```

This drops the old getting-started.md "Way 2" section's embedded Google Calendar `<iframe>` in favor of linking out to `/calendar/`, which already embeds the identical calendar — per the spec, avoid duplicating that iframe.

- [ ] **Step 2: Build and verify**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -o "<h1[^>]*>Find a Club</h1>" /tmp/rtk-build/journal-clubs/index.html
grep -o 'href="/calendar/"' /tmp/rtk-build/journal-clubs/index.html
grep -o 'href="/online/"' /tmp/rtk-build/journal-clubs/index.html
```

Expected: all three commands print one match each.

- [ ] **Step 3: Commit**

```bash
git add journal-clubs.md
git commit -m "feat: rebuild journal-clubs.md as the Find a Club page"
```

---

### Task 6: Organizers page (new)

**Files:**
- Create: `organizers.md`

**Interfaces:**
- Produces: page served at `/organizers/`. This is the redirect target for retired `/getting-started/` (Task 1) and a nav target from Task 2.
- Consumes: links to `/join-reproducibiliTea.html`, `/online/`, `/Zotero-group/`, `/edit-jc.html`, `/card/`, `/code-of-conduct/` (all unchanged, existing pages).

Content is "Way 1" from the old `getting-started.md` (starting a club) plus the old header's "Organizer Tools" group, plus the Code of Conduct *template* entry point. Per the spec, add an explicit link to `join-reproducibiliTea.html` — the actual automated signup form, which existed in the repo but was reachable from no nav-linked page before this reorg.

- [ ] **Step 1: Create the file**

```markdown
---
layout: page
title: Organizers
permalink: /organizers/
---

## Start your own journal club

Do it! It's a low commitment, fun and flexible way to start spreading Open Research ideas in your department. It allows you to learn the fundamentals together with the people you work with, making it easier to implement new ideas and practices.
We also have an active Slack community where ReproducibiliTea organizers support each other.

We have an [OSF page <sup><i class="fas fa-external-link-square-alt" aria-hidden="true"></i></sup>](https://osf.io/3qrj6/wiki/home/) where you can download all the necessary materials that you can freely share and adapt. There you will find:
- A welcome letter telling you more about ReproducibiliTea
- The ReproducibiliTea Logo
- Various ReproducibiliTea poster templates
- A sample checklist for organising your own Journal Club
- Our [reading lists <sup><i class="fas fa-external-link-square-alt" aria-hidden="true"></i></sup>](https://rpt-rl.netlify.app/) on many Open Research topics
- And much much more ...

Ready to get started? [Sign up your journal club](/join-reproducibiliTea.html) — the form automatically adds you to our list of journal clubs, creates you a page on the website, initialises an OSF repository for you, and invites you to the Slack workspace. Got questions first? Email us at [{{ site.email }}](mailto:{{ site.email }}).

## Tools for organizers

- [Online meetings](/online/) — etiquette and hosting advice for running a journal club online.
- [Zotero Group Info](/Zotero-group/) — how the shared Zotero library works and how to get access.
- [Edit your journal club](/edit-jc.html) — request a link to update your journal club's details.
- [Make a meeting card](/card/) — generate a shareable schedule card image.
- [Code of Conduct template](/code-of-conduct/) — an optional template your journal club can adopt as its own.
```

- [ ] **Step 2: Build and verify**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -o "<h1[^>]*>Organizers</h1>" /tmp/rtk-build/organizers/index.html
grep -o 'href="/join-reproducibiliTea.html"' /tmp/rtk-build/organizers/index.html
grep -o 'href="/edit-jc.html"' /tmp/rtk-build/organizers/index.html
grep -o 'href="/code-of-conduct/"' /tmp/rtk-build/organizers/index.html
```

Expected: all four commands print one match each.

- [ ] **Step 3: Commit**

```bash
git add organizers.md
git commit -m "feat: add Organizers page absorbing getting-started Way 1 + organizer tools"
```

---

### Task 7: Community & Outputs page (new)

**Files:**
- Create: `community.md`

**Interfaces:**
- Produces: page served at `/community/`, a nav target from Task 2.
- Consumes: links to `/sharing-stories/`, `/collaborations/`, `/special-interest-groups/`, `/conference2026/`, `/posts/`, `/post-publication-reviews/`, `/resources/`, plus two external links (Reading Lists, Podcast) — all unchanged, existing pages/URLs, several previously reachable only through the old "Community"/"Projects" nav submenus.

- [ ] **Step 1: Create the file**

```markdown
---
layout: page
title: Community & Outputs
permalink: /community/
---

## Get involved

- [Sharing Stories](/sharing-stories/)
- [Collaborations](/collaborations/)
- [Special Interest Groups](/special-interest-groups/)
- [Conference 2026](/conference2026/)

## Outputs & resources

- [Blog](/posts/)
- [Post-publication Reviews](/post-publication-reviews/)
- [Resources](/resources/)
- [Reading Lists <sup><i class="fas fa-external-link-square-alt" aria-hidden="true"></i></sup>](https://rpt-rl.netlify.app/)
- [Podcast <sup><i class="fas fa-external-link-square-alt" aria-hidden="true"></i></sup>](https://soundcloud.com/reproducibilitea)
```

- [ ] **Step 2: Build and verify**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -o "<h1[^>]*>Community &amp; Outputs</h1>" /tmp/rtk-build/community/index.html
grep -o 'href="/posts/"' /tmp/rtk-build/community/index.html
grep -o 'href="https://soundcloud.com/reproducibilitea"' /tmp/rtk-build/community/index.html
```

Expected: all three commands print one match each.

- [ ] **Step 3: Commit**

```bash
git add community.md
git commit -m "feat: add Community & Outputs page"
```

---

### Task 8: Home page — absorb `about.md`, add "What's on?", fix duplicate `<h1>`s

**Files:**
- Modify: `index.md`

**Interfaces:**
- Produces: single `<h1>` per page (was 3: "Welcome...", "Current Journal Clubs", "Podcast" — fixed by demoting the latter two to `<h2>`), a new "What's on?" section linking `/calendar/` and `/journal-clubs/`, and the sponsors/team/articles content absorbed from `about.md`.
- Consumes: `_includes/jc-map.html`, `_includes/jc-showcase.html`, `_includes/sponsors.html`, `_includes/podcast.html` (all unchanged).

`index.md` uses `layout: default`, which does *not* auto-inject an `<h1>` from `page.title` (unlike `layout: page`/`layout: post`) — so every heading on this page is hand-managed in the Markdown, and the file already has a **pre-existing bug**: three top-level `# ` headings ("Welcome to ReproducibiliTea", "Current Journal Clubs", "Podcast"). Fix this while absorbing `about.md`'s content.

`about.md`'s first paragraph is dropped as a near-duplicate of `index.md`'s existing opening paragraph (both state the mission in similar terms); its second and third paragraphs (how a journal club runs, founding history) are genuinely distinct and are kept. The opening CTA paragraph is rewritten because it linked to `/about/` and `/getting-started/`, both retired.

- [ ] **Step 1: Replace the file contents**

```markdown
---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults

layout: default
---

{% assign countries = "" %}
{% for jc in site.journal-clubs %}
{% if jc.country %}
{% assign countries = countries | append: "|" | append: jc.country %}
{% endif %}
{% endfor %}
{% assign country_count = countries | split: "|" | uniq | size | minus: 1 %}


# **Welcome to ReproducibiliTea**

We are a grassroots journal club initiative that helps researchers create local Open Research journal clubs at their universities to discuss diverse issues, papers and ideas about improving research, reproducibility and the Open Research movement. Started in early 2018 at the University of Oxford, ReproducibiliTea has now spread to {{ site.journal-clubs.size }} institutions in {{ country_count }} different countries. We are completely volunteer run, and provide a unique and supportive community for our members, who are predominantly Early Career Researchers.

We all know how horrible it can be to jump through annoying administrative hurdles or dodge financial barriers to ultimately try to make a positive change. Setting up a ReproducibiliTea Journal Club is easy, free and does not need any admin approval. In a ReproducibiliTea Journal Club, papers are selected that are broadly relevant to the replication crisis and research improvements. The journal club is advertised around the department or university, raising awareness of reproducibility and Open Research in the process. The chosen papers are then discussed during regular journal club meetings, often over cups of tea, lunch or snacks.

The ReproducibiliTea Journal Club has proven to be a success in Oxford, where it was founded in spring 2018 by Sophia Crüwell, Amy Orben, and Sam Parsons (then Masters student, PhD student, and early postdoc respectively). Since then, it has received widespread international recognition. There are now {{ site.journal-clubs.size | minus: 1}} other ReproducibiliTea Journal Clubs.

Want to join the movement? [Find your local journal club](/journal-clubs/), or find out [how to start one](/organizers/). Just curious for now? Grab your cup of (Reproducibili)tea and use our freely accessible and adaptable materials to explore.
<a rel="me" href="https://scicomm.xyz/@ReproducibiliTeaGlobal"></a>

{% include jc-map.html %}

<br/>

## What's on?

- **Online** — check the [community calendar](/calendar/) for upcoming sessions open to wider participation.
- **Near me** — browse [Find a Club](/journal-clubs/) to search for a journal club in your area.

<br/>

## Current Journal Clubs

{% include jc-showcase.html initial-value="" %}

{% assign countries = countries | split: "|" | uniq | sort_natural %}
{% for c in countries %}
{% assign jcs = site.journal-clubs | where: "country", c %}
{% assign jcs = jcs | sort_natural: "title" %}
{% assign jc_count = jcs | size %}
{% if jc_count > 0 %}
{:.jc-list #{{c}}}
### {{ c }} 
{% for jc in jcs %}
- [{{ jc.title }}](/journal-clubs/#{{ jc.title }}) ({{ jc.organisers | join: ", " }})
{:.jc-list}
{% endfor %}
{% endif %}
{% endfor %}

<br/>

## Our sponsors

{% include sponsors.html %}

<br/>

## ReproducibiliTeam

The ReproducibiliTea parent organisation is run by a Steering Committee of ECR volunteers: 


* Ze Freeman [@zefreeman.bsky.social](https://bsky.app/profile/zefreeman.bsky.social)
* Ezgi Hatip Ünlü [(LinkedIn)](https://www.linkedin.com/in/ezgi-hatip-unlu-752584149)
* Quentin Le Cornu [@quentinlc.bsky.social](https://bsky.app/profile/quentinlc.bsky.social) / [(LinkedIn)](https://www.linkedin.com/in/quentin-le-cornu-898546244/)
* Abigail Licata [@licataae.bsky.social](https://bsky.app/profile/licataae.bsky.social) / [(LinkedIn)](https://www.linkedin.com/in/abigail-licata-456929103/)
* Anastasiia Marmyleva [@marmyleva_ana](https://x.com/marmyleva_ana) / [@marmyleva-ana.bsky.social](https://bsky.app/profile/marmyleva-ana.bsky.social) / [(LinkedIn)](https://www.linkedin.com/in/anastasiia-marmyleva-5ba646106/)
* Marjan Monshi
* Michael Muhoozi [(LinkedIn)](https://www.linkedin.com/in/michael-muhoozi-9319724a/)
* Hemani Sharma [(LinkedIn)](https://www.linkedin.com/in/hemani-sharma-b9476516/)
* Lianne Wolsink [(LinkedIn)](https://www.linkedin.com/in/liannewolsink/) (Chair)



The Steering Committee alumni act as an Advisory Board who can be consulted when necessary.
The Advisory Board are:

* Sophia Crüwell [@cruwelli.bsky.social](https://bsky.app/profile/cruwelli.bsky.social) (Co-founder)
* Helena Gellersen [@hgellersen](https://twitter.com/hgellersen) 
* Matt Jaquiery
* Paulina Manduch [(LinkedIn)](https://www.linkedin.com/in/paulinamanduch/) 
* William Ngiam [@williamngiam.github.io](https://bsky.app/profile/williamngiam.github.io)
* Amy Orben [@orbenamy.bsky.social](https://bsky.app/profile/orbenamy.bsky.social) (Co-founder)
* Sam Parsons [@Sam_D_Parsons](https://twitter.com/Sam_D_Parsons) (Co-founder)
* Jade Pickering [@jadepickering.bsky.social](https://bsky.app/profile/jadepickering.bsky.social)
* Hazel Aileen van der Walle [@hazelvanderwalle.bsky.social](https://bsky.app/profile/hazelvanderwalle.bsky.social)
* Jan Vornhagen [@VornhagenJB@hci.social](https://hci.social/@VornhagenJB) 

<br/>

## Podcast

Not ready to start your own journal club, but interested in Open Research and want to learn more? We also release ReproducibiliTea podcast episodes that highlight the great work of early career researchers in Open Research.

{% include podcast.html %}

<br/>

## Articles

ReproducibiliTea features in the following articles:

* Bochynska, A., Kalandadze, T., Korbmacher, M., Mayiwar, L., Mayor, J., & Quintana, D. (2025). **Grassroots networks can help implement and harmonize open research efforts**. Nordic Perspectives on Open Science, 10. [https://doi.org/10.7557/11.8343](https://doi.org/10.7557/11.8343)
* Skubera, M., Korbmacher, M., Evans, T. R., Azevedo, F., & Pennington, C. R. (2025). **International initiatives to enhance awareness and uptake of open research in psychology: a systematic mapping review**. Royal Society Open Science, 12(3), 241726. [http://doi.org/10.1098/rsos.241726](http://doi.org/10.1098/rsos.241726)
* Vinatier, C., Kozula, M., Van den Eynden, V., Caquelin, L., Roubik, H., Stegeman, I., & Naudet, F. (2024). **Public engagement with research reproducibility**. PLoS biology, 22(12), e3002953. [https://doi.org/10.1371/journal.pbio.3002953](https://doi.org/10.1371/journal.pbio.3002953)
* Kohrs, F. E., Auer, S., Bannach-Brown, A., Fiedler, S., Haven, T. L., Heise, V., Holman, C., Azevedo, F., Bernard, R., Bleier, A., Bössel, N., Cahill, B. P., Castro, L. J., Ehrenhofer, A., Eichel, K., Frank, M., Frick, C., Friese, M., Gärtner, A., Gierend, K., … Weissgerber, T. L. (2023). **Eleven strategies for making reproducible research and open science training the norm at research institutions**. eLife, 12, e89736. [https://doi.org/10.7554/eLife.89736](https://doi.org/10.7554/eLife.89736) 
* Haven, T., Gopalakrishna, G., Tijdink, J. et al. (2022). **Promoting trust in research and researchers: How open science and research integrity are intertwined**. BMC research notes, 15, 302. [https://doi.org/10.1186/s13104-022-06169-y](https://doi.org/10.1186/s13104-022-06169-y) 
* Kent, B. A., Holman, C., Amoako, E., Antonietti, A., Azam, J. M., Ballhausen, H., Bediako, Y., Belasen, A. M., Carneiro, C. F. D., Chen, Y. C., Compeer, E. B., Connor, C. A. C., Crüwell, S., Debat, H., Dorris, E., Ebrahimi, H., Erlich, J. C., Fernández-Chiappe, F., Fischer, F., Gazda, M. A., … Weissgerber, T. L. (2022). **Recommendations for empowering early career researchers to improve research culture and practice**. PLoS biology, 20(7), e3001680. [https://doi.org/10.1371/journal.pbio.3001680](https://doi.org/10.1371/journal.pbio.3001680)
* Armeni, K., Brinkman, L., Carlsson, R., Eerland, A., Fijten, R., Fondberg, R., Heininga, V. E., Heunis, S., Koh, W. Q., Masselink, M., Moran, N., Ó Baoill, A., Sarafoglou, A., Schettino, A., Schwamm, H., Sjoerds, Z., Teperek, M., van den Akker, O. R., van't Veer, A., Zurita-Milla, R. (2021). **Towards wide-scale adoption of open science practices: The role of open science communities**. Science and Public Policy, Volume 48, Issue 5, Pages 605–611, [https://doi.org/10.1093/scipol/scab039](https://doi.org/10.1093/scipol/scab039)
* Kathawalla, U.-K., Silverstein, P., & Syed, M. (2021). **Easing into open science: A guide for graduate students and their advisors**. Collabra: Psychology, 7(1), Article 18684. [https://doi.org/10.1525/collabra.18684](https://doi.org/10.1525/collabra.18684)
* Robson, S. G.,  Baum, M. A., Beaudry, J. L., Beitner, J., Brohmer, H., Chin, J. M., Jasko, K., Kouros, Ch. D., Laukkonen, R. E., Moreau, D., Searston, R. A., Slagter, H. A., Steffens, N. K., Tangen, J. M., Thomas, A. (2021). **Promoting Open Science: A Holistic Approach to Changing Behaviour**. Collabra: Psychology; 7 (1): 30137. [https://doi.org/10.1525/collabra.30137](https://doi.org/10.1525/collabra.30137)
* Orben A. (2019). **A journal club to fix science**. Nature, 573(7775), 465. [https://doi.org/10.1038/d41586-019-02842-8](https://doi.org/10.1038/d41586-019-02842-8)
```

- [ ] **Step 2: Build and verify**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -c "<h1" /tmp/rtk-build/index.html
grep -o "What's on?" /tmp/rtk-build/index.html
grep -o 'href="/organizers/"' /tmp/rtk-build/index.html
grep -o 'href="/about/"\|href="/getting-started/"' /tmp/rtk-build/index.html
```

Expected: first command prints `1` (was 3 before this task); second and third each print one match; fourth prints nothing (no more dangling links to retired pages).

- [ ] **Step 3: Commit**

```bash
git add index.md
git commit -m "feat: absorb about.md into home page, add What's on section, fix duplicate h1s"
```

---

### Task 9: Delete retired pages

**Files:**
- Delete: `about.md`, `getting-started.md`

**Interfaces:**
- Consumes: Task 1's redirects (must already exist so these URLs 301 instead of 404 once deleted), Task 8 (home page must already have absorbed `about.md`'s content), Task 6 (organizers.md must already exist as the getting-started.md replacement) — run this task last among Tasks 1/6/8/9.

- [ ] **Step 1: Delete the files**

```bash
git rm about.md getting-started.md
```

- [ ] **Step 2: Build and verify no page links to the deleted files, and the redirect covers them**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -rl 'href="/about/"\|href="/getting-started/"' /tmp/rtk-build --include="*.html"
ls /tmp/rtk-build/about /tmp/rtk-build/getting-started 2>&1
```

Expected: `grep -rl` prints nothing (no page in the whole built site still links to either retired path — `conference2026.html`, `map.html`, and any `_posts`/`_journal-clubs` entries are excluded from this plan's touched-file set and were already confirmed not to reference these URLs). The `ls` command should fail for both paths with "No such file or directory" — confirming the pages are actually gone.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete about.md and getting-started.md, content absorbed into index.md/organizers.md"
```

---

### Task 10: Semantic sweep — `categories.html` / `tags.html` heading levels

**Files:**
- Modify: `categories.html`, `tags.html`

**Interfaces:** None (self-contained fix, no dependency on other tasks).

Both files currently have two `<h1>`s each (one for the category/tag chip list, one for "Posts by category/tag"), with the per-category/tag name as `<h2>` and each post title as `<h3>` nested under it — this leaves an `<h2>` directly under a second illegal `<h1>`. Fix: first heading stays `<h1>` (page title), second heading becomes `<h2>`, category/tag name becomes `<h3>`, post title becomes `<h4>` — a clean unbroken chain.

- [ ] **Step 1: Fix `categories.html`**

```
<h1>Categories:</h1>          →  <h1>Categories</h1>
<h1>Posts by category:</h1>   →  <h2>Posts by category</h2>
<h2 id="{{ cat[0] | slugify }}">{{ cat[0] }}</h2>   →  <h3 id="{{ cat[0] | slugify }}">{{ cat[0] }}</h3>
<h3>                          →  <h4>   (the post-title heading inside the `<li>`, and its closing `</h3>` → `</h4>`)
```

- [ ] **Step 2: Fix `tags.html`** (identical pattern)

```
<h1>Tags:</h1>            →  <h1>Tags</h1>
<h1>Posts by tag:</h1>    →  <h2>Posts by tag</h2>
<h2 id="{{ tag[0] | slugify }}">{{ tag[0] }}</h2>   →  <h3 id="{{ tag[0] | slugify }}">{{ tag[0] }}</h3>
<h3>                      →  <h4>   (post-title heading + its closing tag)
```

- [ ] **Step 3: Build and verify**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -c "<h1" /tmp/rtk-build/categories.html
grep -c "<h1" /tmp/rtk-build/tags.html
grep -c "<h4>" /tmp/rtk-build/categories.html
```

Expected: first two commands each print `1`; third prints a number equal to the total post count across all categories (>0, confirming the demotion actually landed on real rendered output, not just source).

- [ ] **Step 4: Commit**

```bash
git add categories.html tags.html
git commit -m "fix: correct heading hierarchy on categories/tags pages (was two h1s each)"
```

---

### Task 11: Semantic sweep — `resources.md` heading levels

**Files:**
- Modify: `resources.md`

**Interfaces:** None.

`resources.md` uses `layout: page`, which auto-injects `<h1>{{ page.title }}</h1>` ("Resources") — but the content *also* has two hand-written `# ` (h1) headings ("Resources published by ReproducibiliTea journal clubs", "Other resources"), for three `<h1>`s total. Demote both in-content headings to `##` (h2), since they're subsections of the single auto-generated page title.

- [ ] **Step 1: Make the edit**

In `resources.md`, change:
```
# Resources published by ReproducibiliTea journal clubs
```
to:
```
## Resources published by ReproducibiliTea journal clubs
```
and change:
```
# Other resources
```
to:
```
## Other resources
```

- [ ] **Step 2: Build and verify**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -c "<h1" /tmp/rtk-build/resources.html
```

Expected: `1` (was 3 before this task).

- [ ] **Step 3: Commit**

```bash
git add resources.md
git commit -m "fix: correct heading hierarchy on resources page (was three h1s)"
```

---

### Task 12: Semantic sweep — `join-reproducibiliTea.html` heading levels

**Files:**
- Modify: `join-reproducibiliTea.html`

**Interfaces:** None.

This file uses `layout: default` (no auto-injected h1), but hand-writes three `<h1>`s — one per wizard step ("1/3 Welcome", "2/3 Get ready", "3/3 Sign up"). All three sections are simultaneously present in the DOM (it's one long scrolling page with anchor-jump links between sections, not a JS-hidden tab panel), so a screen reader / accessibility tree sees three `<h1>`s on one page. Fix: demote all three to `<h2>`, and add one real page-level `<h1>` above them.

- [ ] **Step 1: Add a page `<h1>`**

Immediately after `<article id="signupForm">` (and before `<section id="joinWelcome">`), insert:
```html
    <h1>Start a New Journal Club</h1>
```

- [ ] **Step 2: Demote the three step headings**

```
<h1>1<span class="fade">/3</span> Welcome</h1>   →   <h2>1<span class="fade">/3</span> Welcome</h2>
<h1><a href="#joinWelcome"><i class="fas fa-level-up-alt fa-flip-horizontal"></i></a> 2<span class="fade">/3</span> Get ready</h1>   →   <h2>...</h2>  (same inner content, just the tag)
<h1><a href="#joinSetup"><i class="fas fa-level-up-alt fa-flip-horizontal"></i></a> 3<span class="fade">/3</span> Sign up</h1>   →   <h2>...</h2>
```

- [ ] **Step 3: Build and verify**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -c "<h1" /tmp/rtk-build/join-reproducibiliTea.html
grep -o "<h1>Start a New Journal Club</h1>" /tmp/rtk-build/join-reproducibiliTea.html
grep -c "<h2>" /tmp/rtk-build/join-reproducibiliTea.html
```

Expected: first command prints `1`; second prints one match; third prints at least `3`.

- [ ] **Step 4: Commit**

```bash
git add join-reproducibiliTea.html
git commit -m "fix: correct heading hierarchy on join form (was three h1s across wizard steps)"
```

---

### Task 13: Semantic sweep — real `<button>` for actions in `card.html` and `jc-overview.html`

**Files:**
- Modify: `card.html`, `jc-overview.html`

**Interfaces:** None. (`sortTable(fieldName, ascending)` in `assets/js/jc-overview.js` is called by `onclick` and doesn't inspect the calling element, so swapping `<a onclick>` → `<button onclick>` needs no JS change; same for `saveCardPNG()` in `card.html`.)

- [ ] **Step 1: Fix `card.html`'s download control**

Change:
```html
<div class="save" onclick="saveCardPNG()">
    <span id="save-link">Download .png</span>
</div>
```
to:
```html
<button type="button" class="save" onclick="saveCardPNG()">
    <span id="save-link">Download .png</span>
</button>
```

Then, in the adjacent `<style>` block in the same file, add browser button-chrome resets to the existing `.save` rule so it keeps its current visual appearance (native `<button>` UA styles would otherwise add a border/padding/background that clashes with the hand-styled look):

```css
    .save {
        width: 600px;
        text-align: center;
        background-color: aliceblue;
        font-size: 1.5em;
        line-height: 2em;
        cursor: pointer;
        border: none;
        padding: 0;
        font-family: inherit;
        display: block;
    }
```

(Only the four new lines — `border`, `padding`, `font-family`, `display` — are additions; the rest of the rule is unchanged.)

- [ ] **Step 2: Fix `jc-overview.html`'s sort controls**

Change:
```html
<th>{{f}} <a onclick="sortTable('{{f}}')">&#x25B2;</a><a onclick="sortTable('{{f}}', false)">&#x25BC;</a></th>
```
to:
```html
<th>{{f}} <button type="button" onclick="sortTable('{{f}}')">&#x25B2;</button><button type="button" onclick="sortTable('{{f}}', false)">&#x25BC;</button></th>
```

- [ ] **Step 3: Build and verify**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -o 'onclick="saveCardPNG()"' /tmp/rtk-build/card.html
grep -c '<div class="save"' /tmp/rtk-build/card.html
grep -c '<button type="button" onclick="sortTable' /tmp/rtk-build/jc-overview.html
```

Expected: first command prints one match (still calls the same function, now from a `<button>`); second prints `0` (the `<div>` is gone); third prints `26` (13 fields × 2 sort-direction buttons — count `{{ fields }}` in the file's Liquid front matter to confirm the exact number if the field list ever changes).

- [ ] **Step 4: Manually verify `card.html` still looks right**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll serve --destination /tmp/rtk-build --port 4567 &
```

Open `http://localhost:4567/card.html`, confirm the "Download .png" control still fills the same width and has no visible button border/padding change, then click it and confirm a PNG download still triggers. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add card.html jc-overview.html
git commit -m "fix: use real <button> for the download and sort actions instead of <a>/<div onclick>"
```

---

### Task 14: Semantic sweep — `conference2026.html` landmarks

**Files:**
- Modify: `conference2026.html`

**Interfaces:** None.

This file is a fully standalone HTML document (its own `<!DOCTYPE>`/`<html>`/`<head>`/`<body>`, not run through the Jekyll `default` layout) with embedded multi-megabyte base64 image data URIs on individual lines — too large for the Edit tool's file-read precondition. Use `sed` instead. It already has exactly one `<h1>` (confirmed) and a `<nav>` + `<footer>`, but is missing `<header>` (wrapping the nav) and `<main>` (wrapping the page sections) landmarks.

- [ ] **Step 1: Confirm the exact anchor lines are still where expected**

```bash
grep -n "^<nav>$\|^</nav>$\|^<footer>$" conference2026.html
```

Expected: `127:<nav>`, `138:</nav>`, `440:<footer>`. If the line numbers differ (file has changed since this plan was written), adjust the `sed` commands below accordingly — do not guess, re-run this grep and use what it reports.

- [ ] **Step 2: Wrap the nav in `<header>`**

```bash
sed -i '138a </header>' conference2026.html
sed -i '127i <header>' conference2026.html
```

(Insert the closing tag first so the earlier line number for the opening tag insertion isn't shifted by the first `sed` call.)

- [ ] **Step 3: Wrap the page content in `<main>`**

After Step 2, every line number from 139 onward has shifted down by 2 (one line added before line 127, one after line 138). Re-run the anchor grep to get fresh line numbers before this step:

```bash
grep -n "^</header>$\|^<footer>$" conference2026.html
```

Insert `<main>` immediately after the new `</header>` line and `</main>` immediately before `<footer>`, doing this one edit at a time with a fresh line lookup between each (do NOT compute both line numbers up front and apply them back-to-back — the first edit shifts every later line number):

```bash
HEADER_CLOSE_LINE=$(grep -n "^</header>$" conference2026.html | cut -d: -f1)
sed -i "$((HEADER_CLOSE_LINE + 1))a <main>" conference2026.html
FOOTER_LINE=$(grep -n "^<footer>$" conference2026.html | cut -d: -f1)
sed -i "$((FOOTER_LINE - 1))a </main>" conference2026.html
```

- [ ] **Step 4: Verify structure and that the file still starts/ends correctly**

```bash
grep -n "^<header>$\|^</header>$\|^<main>$\|^</main>$\|^<footer>$\|^</footer>$\|^</body>$\|^</html>$" conference2026.html
```

Expected output is six landmark open/close pairs plus `</body>`/`</html>` at the very end, in this order: `<header>`, `</header>`, `<main>`, (content, not shown by this grep), `</main>`, `<footer>`, `</footer>`, `</body>`, `</html>`. If the order is wrong, undo with `git checkout -- conference2026.html` and redo Steps 2–3 carefully — do not attempt to hand-patch a half-broken result with more `sed` calls.

- [ ] **Step 5: Build and verify the file still parses as one document (no orphan tags) and renders**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
bundle exec jekyll build --destination /tmp/rtk-build
grep -c "^<header>$" /tmp/rtk-build/conference2026.html
grep -c "^<main>$" /tmp/rtk-build/conference2026.html
```

Expected: both print `1`. Then open `http://localhost:4567/conference2026.html` (start `bundle exec jekyll serve --destination /tmp/rtk-build --port 4567 &` first if not already running) and confirm the page still renders normally — hero image, nav bar, program sections, footer all visually unchanged, since `<header>`/`<main>` are non-visual landmark elements with no default browser styling that would affect this page's own CSS-driven layout. Stop the server after checking.

- [ ] **Step 6: Commit**

```bash
git add conference2026.html
git commit -m "fix: add missing header/main landmarks to conference2026.html"
```

---

### Task 15: Full-site verification pass

**Files:** None (verification only).

**Interfaces:** Depends on every prior task being complete.

- [ ] **Step 1: Clean build from scratch**

```bash
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
rm -rf /tmp/rtk-build
bundle exec jekyll build --destination /tmp/rtk-build
echo "exit code: $?"
```

Expected: `exit code: 0`, no `Error:` lines (Sass deprecation warnings are fine, see Global Constraints).

- [ ] **Step 2: Confirm every nav target and every retired-page redirect exists**

```bash
for p in journal-clubs organizers community; do
  test -f "/tmp/rtk-build/$p/index.html" && echo "OK: $p" || echo "MISSING: $p"
done
test ! -e /tmp/rtk-build/about && echo "OK: about.md gone" || echo "STILL PRESENT: about"
test ! -e /tmp/rtk-build/getting-started && echo "OK: getting-started.md gone" || echo "STILL PRESENT: getting-started"
grep -q "^/about" /tmp/rtk-build/_redirects && grep -q "^/getting-started" /tmp/rtk-build/_redirects && echo "OK: redirects present"
```

Expected: `OK` for every line.

- [ ] **Step 3: Confirm no page in the built site still links to a retired URL**

```bash
grep -rl 'href="/about/"\|href="/getting-started/"' /tmp/rtk-build --include="*.html"
```

Expected: no output (empty = no matches = nothing left pointing at the retired pages).

- [ ] **Step 4: Manual browser walkthrough**

```bash
bundle exec jekyll serve --destination /tmp/rtk-build --port 4567 &
```

In a browser, from `http://localhost:4567/`:
1. Confirm the header shows exactly three nav links at desktop width: "Find a Club", "Organizers", "Community & Outputs". Click each — confirm it lands on the right page with no 404.
2. Resize to mobile width, confirm the hamburger button appears and opens/closes a popover menu with the same three links (click outside it to confirm native light-dismiss works, no JS needed).
3. On the home page, confirm "What's on?" appears under the map with working Online/Near me links, and scroll down to confirm sponsors/team/podcast/articles content (from the old about.md) is present with no duplicate headings.
4. Click through to `/organizers/`, confirm the "Sign up your journal club" link goes to `/join-reproducibiliTea.html` and loads.
5. In the footer (any page), confirm Code of Conduct, Merchandise, OSF Repository links are present and work.
6. Visit `/about/` and `/getting-started/` directly — confirm the *dev server* doesn't redirect (Netlify redirects only apply on Netlify, not `jekyll serve`) but does 404 cleanly rather than crash; this is expected locally, real redirect behavior can only be confirmed after deploy to Netlify.

Stop the server when done (`kill %1`).

- [ ] **Step 5: No commit needed** — this task is pure verification. If any check in Steps 1–4 fails, go back to the relevant task above, fix it there, and re-run this task's checks from Step 1.

---

## Out of scope (per spec, not part of this plan)

- `jc-overview.html` admin-token gating — needs its own spec once `ADMIN_EMAILS`/`admin-approve` token infra lands (tracked separately).
- "Near me" geolocation auto-filter on the home page's "What's on?" section — stretch goal explicitly deferred by the spec; the plain unfiltered `/journal-clubs/` link ships now.
- Visual restyle (colors, cards, Leaflet maps) — covered by `docs/superpowers/plans/2026-08-26-website-restyle.md`; this plan's nav CSS is deliberately minimal so that plan's brand tokens can be layered on top without fighting these rules.
