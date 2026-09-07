# Brand Restyle + Leaflet Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the agreed "Modern Rounded" brand look (rounded cards, soft shadows, `#0086cf`/`#004c6c`/white/`#404040`) as one consistent stylesheet, and replace Google Maps (which requires a currently-leaked, billable API key) with Leaflet + OpenStreetMap everywhere it's used.

**Architecture:** `minima` stays as the Jekyll layout engine (its gem-provided layouts are not forked). One new stylesheet, `assets/css/theme.css`, defines brand CSS variables and component styles (nav, footer, card, button) and is loaded after minima's own CSS, superseding the ad-hoc `custom.css`/`tweaks.css`. `jc-overview.css` and `join-form.css` (page-specific, stay separate) switch their hardcoded colors to the same variables. Both Leaflet map integrations (`_includes/jc-map.html`'s clustered world map and `_includes/jc-lookup.html`'s admin geocoder) drop their Google Maps API key dependency; `map.html`'s standalone page (which had a copy-paste bug duplicating `jc-overview.html`'s `<head>`) is simplified to just include the shared map partial.

**Tech Stack:** Leaflet + `leaflet.markercluster` (via CDN, matching the existing pattern of pulling `markerclustererplus` from unpkg), OpenStreetMap tiles, Nominatim (OSM's free geocoder). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-website-modernization-design.md`

**Depends on:** none of the other three plans — this one only touches CSS, Jekyll includes/pages, and `_config.yml`. Safe to ship independently, in any order.

## Global Constraints

- `minima` gem stays as the theme; no local `_layouts/default.html`/`page.html`/`home.html` are created.
- Brand colors: `#0086cf` (`--color-rpt-primary`, already defined), `#004c6c` (`--color-rpt-secondary`, already defined), white, `#404040` (`--color-rpt-dark`, new).
- No Google Maps API key anywhere in the codebase or `_config.yml` after this plan.
- No new npm dependencies; map libraries load from CDN the same way `markerclustererplus` already does today.

---

## File Structure

- Create: `assets/css/theme.css` — brand tokens, nav/footer/card/button component styles. Supersedes `custom.css` + `tweaks.css`.
- Delete: `assets/css/custom.css`, `assets/css/tweaks.css`.
- Modify: `_includes/head.html` — link `theme.css` instead of `tweaks.css`/`custom.css`.
- Modify: `assets/css/jc-overview.css`, `assets/css/join-form.css` — use the shared brand tokens.
- Modify: `_includes/jc-map.html` — rewrite with Leaflet + OSM + marker clustering.
- Modify: `map.html` — reduce to a thin page that includes `jc-map.html`, fixing its copy-paste `<head>` bug.
- Modify: `_includes/jc-lookup.html` — geocode via Nominatim instead of Google.
- Modify: `assets/js/join-form.js` — the address-to-geolocation lookup (`geolocateAddress`) uses Nominatim.
- Modify: `join-reproducibiliTea.html` — the "drag a pin" picker map uses Leaflet instead of Google Maps.
- Modify: `_config.yml` — remove the `APIkeys` block.
- Delete: `_includes/keys.html`; remove its `{% include keys.html %}` call sites.

---

### Task 1: Brand stylesheet

**Files:**
- Create: `assets/css/theme.css`
- Modify: `_includes/head.html`
- Delete: `assets/css/custom.css`
- Delete: `assets/css/tweaks.css`

No unit test — this is CSS. Verified visually in Step 4.

- [ ] **Step 1: Create the consolidated stylesheet**

Create `assets/css/theme.css`, folding in every rule from `custom.css` and `tweaks.css` (reproduced verbatim below, since neither is superseded elsewhere) plus new brand tokens and rounded-card/button treatment:
```css
/* Brand tokens */
:root {
    --color-rpt-primary: rgb(0, 134, 207);   /* #0086cf */
    --color-rpt-secondary: rgb(0, 77, 108);  /* #004c6c */
    --color-rpt-dark: rgb(64, 64, 64);       /* #404040 */
    --color-rpt-white: #ffffff;
    --radius-card: 12px;
    --shadow-card: 0 1px 3px rgba(0, 76, 108, 0.15);
}

/* Base link/text color overrides (minima defaults to #2a7ae2) */
a {
    color: var(--color-rpt-primary);
}
a:visited {
    color: var(--color-rpt-secondary);
}
body {
    color: var(--color-rpt-dark);
}

/* Animations */
@keyframes spin {
    from { transform: rotateY(0deg); }
    to { transform: rotateY(360deg); }
}

/* Header / footer */
header.site-header,
footer.site-footer {
    background-color: var(--color-rpt-white);
}
.site-header .wrapper {
    display: flex;
    justify-content: space-evenly;
}
.site-nav {
    margin: auto;
}
.site-nav label[for="nav-trigger"] {
    display: flex;
    width: unset;
    height: unset;
    padding: 0 0.5em;
}
.site-nav .menu-label {
    padding-right: 0.5em;
    display: none;
}
.site-nav .menu-icon {
    float: unset;
    width: unset;
    height: unset;
}
.site-nav.site-nav {
    margin: auto 0;
}
.site-nav .page-link.page-link:not(:last-child) {
    margin-right: unset;
}
.header-links {
    display: grid;
    list-style: none;
    margin: 0;
    grid-auto-flow: column;
    grid-column-gap: 1em;
}
.header-links li {
    display: flex;
    position: relative;
    background-color: var(--color-rpt-white);
}
label.page-link {
    cursor: pointer;
}
.header-links .page-link:checked + .header-links,
.header-links > .header-links:hover {
    display: grid;
    z-index: 1;
}
.header-links input.page-link {
    height: 0;
    width: 0;
    margin: 0;
}
.header-links .header-links {
    display: none;
    grid-auto-flow: row;
    position: absolute;
    top: 100%;
    right: 0;
    width: max-content;
    padding: 0.5em;
    background-color: var(--color-rpt-white);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
}
.header-links .header-links a.page-link {
    width: 100%;
}
div.page-link {
    font-weight: bold;
    cursor: default;
    letter-spacing: .25em;
    color: var(--color-rpt-secondary);
}

/* Sponsors footer block */
.sponsors {
    display: flex;
    width: 100%;
    justify-content: space-evenly;
}
.sponsors .thanks {
    align-self: center;
}
.sponsor {
    display: grid;
    grid-template-columns: 1fr 4fr;
    grid-column-gap: 1em;
}
.sponsor .logo {
    align-self: center;
}

/* Buttons, site-wide */
button, .mock-button {
    background-color: var(--color-rpt-primary);
    color: var(--color-rpt-white);
    border: none;
    border-radius: 8px;
    padding: 0.5em 1em;
    cursor: pointer;
}
button:hover {
    background-color: var(--color-rpt-secondary);
}

/* index.html JC list */
.jc-list {
    margin-bottom: 0;
}

/* Person.html */
.person {
    position: relative;
    background-color: #eaf6fc;
    padding: 2px;
    white-space: pre-wrap;
}
.person-social {
    display: none;
}
.person:hover .person-social {
    position: absolute;
    width: 100%;
    left: 50%;
    top: calc(-100% - .5em);
    display: flex;
    flex-direction: row;
    justify-content: space-evenly;
    background-color: #eaf6fc;
    border-top-left-radius: 25%;
    border-top-right-radius: 25%;
    padding-top: .5em;
    padding-bottom: 2px;
    min-width: min-content;
    transform: translateX(-50%);
}
.person-social i, .person-social svg {
    font-size: 1.2em;
    padding: .2em;
}

/* Image.html */
.image {
    max-width: 100%;
    margin: auto;
    transition: all 400ms;
    text-align: center;
}
.fig a * {
    max-width: 100%;
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
}

/* Tags */
.tag-list ul {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
    list-style: none;
}
.tag-list li {
    padding: .25em .5em;
    background-color: #eaf6fc;
    border-radius: .5em;
    margin: .33em;
    font-size: .8em;
    box-shadow: var(--shadow-card);
}
.tag-list li:hover {
    background-color: #d7eefd;
}
.tag-list a:hover {
    text-decoration: none;
}

/* Journal club showcase cards */
.jc-showcase {
    margin-top: 2em;
}
.jc-showcase:not(.placeholder) {
    display: flex;
    justify-content: space-between;
    background-color: var(--color-rpt-white);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 1.5em;
}
.jc-body {
    width: 60%;
}
.jc-info {
    display: flex;
    flex-direction: column;
    width: 30%;
    min-height: 100%;
    justify-content: center;
}
.jc-details {
    display: flex;
    flex-direction: column;
}
.jc-organisers {
    display: flex;
    flex-direction: column;
}

/* Map container */
#map {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-card);
    overflow: hidden;
}

/* Biohazard / notice callouts */
.biohazard {
    padding: 1em;
    text-align: justify;
    border-radius: var(--radius-card);
    border: 2px solid var(--color-rpt-secondary);
}
.biohazard h3 {
    background-color: #ffe8a3;
    text-align: center;
}
.biohazard:not(:hover):not(:focus) h3 {
    margin: 0;
}
.biohazard a {
    font-weight: bold;
}
.biohazard:not(:hover):not(:focus) p {
    display: none;
}
p.elipsis {
    display: none;
    margin-bottom: 0;
}
.biohazard:not(:hover):not(:focus) p.elipsis {
    display: block;
    text-align: center;
}

@media screen and (max-width: 800px) {
    .jc-showcase {
        flex-wrap: wrap;
    }
    .jc-body, .jc-info {
        min-width: 100%;
        padding: unset;
    }
    .jc-info {
        min-height: unset;
        justify-content: space-evenly;
        width: 100%;
        flex-direction: row;
    }
}

@media screen and (max-width: 600px) {
    .site-nav .menu-label {
        display: block;
    }
    .header-links {
        display: unset;
    }
}
```

- [ ] **Step 2: Point `head.html` at the new stylesheet**

In `_includes/head.html`, find:
```html
    <link rel="stylesheet" href="{{ "/assets/css/main.css" | relative_url }}">
    <link rel="stylesheet" href="{{ "/assets/css/tweaks.css" | relative_url }}">
    <link rel="stylesheet" href="{{ "/assets/css/custom.css" | relative_url }}">
```
Replace with:
```html
    <link rel="stylesheet" href="{{ "/assets/css/main.css" | relative_url }}">
    <link rel="stylesheet" href="{{ "/assets/css/theme.css" | relative_url }}">
```

- [ ] **Step 3: Delete the superseded stylesheets**

```bash
git rm assets/css/custom.css assets/css/tweaks.css
```

- [ ] **Step 4: Manual visual verification**

Run: `npm run serve` (or `bundle exec jekyll serve`), open the homepage and `/journal-clubs/`. Confirm: brand blue links/buttons, rounded showcase cards with a soft shadow, header/footer render with no visual regressions (menu dropdown still works, mobile breakpoint at 600px still collapses the nav).

- [ ] **Step 5: Commit**

```bash
git add assets/css/theme.css _includes/head.html
git commit -m "Consolidate custom.css/tweaks.css into one brand stylesheet"
```

---

### Task 2: Brand the form/admin pages' own stylesheets

**Files:**
- Modify: `assets/css/jc-overview.css`
- Modify: `assets/css/join-form.css`

- [ ] **Step 1: Update `jc-overview.css`**

Find:
```css
tr {
    background-color: lightskyblue;
}

tr:nth-of-type(2n+1) {
    background-color: #d7eefd;
}

thead tr:first-of-type {
    background-color: white;
    border-bottom: 2px solid black;
}
```
Replace with:
```css
tr {
    background-color: #cfe9f5;
}

tr:nth-of-type(2n+1) {
    background-color: #e6f4fb;
}

thead tr:first-of-type {
    background-color: white;
    border-bottom: 2px solid var(--color-rpt-secondary);
}
```

- [ ] **Step 2: Update `join-form.css`**

Find:
```css
.row .label-details {
    display: none;
    position: absolute;
    width: calc(100% - 2em);
    padding: .25em;
    border-left: 2px solid #1756a9;
    background-color: azure;
    left: 0;
    top: 100%;
    z-index: 5;
    font-size: .9em;
    line-height: 1em;
}
```
Replace with:
```css
.row .label-details {
    display: none;
    position: absolute;
    width: calc(100% - 2em);
    padding: .25em;
    border-left: 2px solid var(--color-rpt-primary);
    background-color: #eaf6fc;
    left: 0;
    top: 100%;
    z-index: 5;
    font-size: .9em;
    line-height: 1em;
    border-radius: 0 var(--radius-card) var(--radius-card) 0;
}
```

Find:
```css
.label-details li.hidden {
    color: #1756a9;
    font-weight: bold;
}
```
Replace with:
```css
.label-details li.hidden {
    color: var(--color-rpt-secondary);
    font-weight: bold;
}
```

Find:
```css
.icon {
    font-size: xx-large;
    text-align: center;
    color: #0085d4;
}
```
Replace with:
```css
.icon {
    font-size: xx-large;
    text-align: center;
    color: var(--color-rpt-primary);
}
```

Find:
```css
#LoadingModal > div {
    background-color: white;
    transform: translateY(50%);
    max-width: min(600px, 95%);
    margin: auto;
    padding: 1em;
    border-radius: 1em;
    border: .25em solid #2a7ae2;
    text-align: center;
}
```
Replace with:
```css
#LoadingModal > div {
    background-color: white;
    transform: translateY(50%);
    max-width: min(600px, 95%);
    margin: auto;
    padding: 1em;
    border-radius: var(--radius-card);
    border: .25em solid var(--color-rpt-primary);
    text-align: center;
}
```

- [ ] **Step 3: Manual visual verification**

Load `/jc-overview.html` and `/join-reproducibiliTea/` locally, confirm brand-blue accents replace the old ad-hoc blues (`lightskyblue`, `#1756a9`, `#0085d4`, `#2a7ae2`) with no layout breakage.

- [ ] **Step 4: Commit**

```bash
git add assets/css/jc-overview.css assets/css/join-form.css
git commit -m "Apply brand color tokens to admin/form page stylesheets"
```

---

### Task 3: Leaflet map (`_includes/jc-map.html`) + `map.html` dedup

**Files:**
- Modify: `_includes/jc-map.html`
- Modify: `map.html`

No unit test — client-side map rendering, verified visually.

- [ ] **Step 1: Rewrite `_includes/jc-map.html` with Leaflet**

Replace all of `_includes/jc-map.html` with:
```html
<div id="map" style="height: 500px"></div>

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>

<script>
    {% assign geos = site.journal-clubs | where_exp: "item", "item.geolocation" | where_exp: "item", "item.status != 'pending'" %}
    const jcLocations = [
        {% for jc in geos %}["{{ jc.title | escape }}", {{ jc.geolocation | join: ", " }}]{% unless forloop.last %},{% endunless %}
        {% endfor %}
    ];

    const map = L.map('map', { center: [20, 0], zoom: 2 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
    }).addTo(map);

    const cluster = L.markerClusterGroup();
    jcLocations.forEach(([title, lat, lng]) => {
        cluster.addLayer(L.marker([lat, lng]).bindPopup(title));
    });
    map.addLayer(cluster);
</script>
```

- [ ] **Step 2: Reduce `map.html` to include the shared partial**

Replace all of `map.html` with:
```liquid
---
layout: page
title: Map
permalink: /map/
---

{% include jc-map.html %}
```

- [ ] **Step 3: Manual visual verification**

Load the homepage (`/`) and `/map/` locally, confirm both render a Leaflet world map with clustered pins, popups show the JC title on click, no console errors, no references to `google.maps` remain.

- [ ] **Step 4: Commit**

```bash
git add _includes/jc-map.html map.html
git commit -m "Replace Google Maps with Leaflet + OpenStreetMap, dedupe map.html"
```

---

### Task 4: Nominatim geocoding (`jc-lookup.html`, `join-form.js`, creation-form pin picker)

**Files:**
- Modify: `_includes/jc-lookup.html`
- Modify: `assets/js/join-form.js`
- Modify: `join-reproducibiliTea.html`

No unit test — client-side network calls to a third-party geocoder, verified manually.

- [ ] **Step 1: Rewrite `_includes/jc-lookup.html` to use Nominatim**

Replace all of `_includes/jc-lookup.html` with:
```html
{% assign id = jc.title | replace: " ", "-" %}
{% unless jc.geolocation %}
<input id="{{ id }}" type="text" value="" placeholder="awaiting fetch result"/>
<script type="text/javascript">
    function lookup() {
        const input = document.getElementById("{{ id }}");
        const addr = "{{ jc.address | url_encode }}";
        fetch(`https://nominatim.openstreetmap.org/search?q=${addr}&format=json&limit=1`)
            .then(r => r.json())
            .then(j => {
                if (!j[0] || !j[0].lat || !j[0].lon) throw "No result from Nominatim.";
                input.value = `geolocation: [${j[0].lat}, ${j[0].lon}]`;
            })
            .catch(err => {
                console.warn(err);
                input.placeholder = String(err);
            });
    }
    lookup();
</script>
{% endunless %}
```

- [ ] **Step 2: Rewrite `geolocateAddress()` in `join-form.js`**

Find:
```js
function geolocateAddress() {
    const address = document.getElementById('post');
    const addr = address.value.replace(/\s/g, '+');
    const input = document.getElementById('geolocation');
    const key = document.getElementById('APIkeys').dataset.maps;

    // Try to fetch the address
    fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${addr}&key=${key}`)
        .then(r => r.json())
        .then(j => {
            if(!j.results ||
                !j.results[0] ||
                !j.results[0].geometry ||
                !j.results[0].geometry.location)
                throw "No geometry or geometry.location in response.";
            input.value = `${j.results[0].geometry.location.lat}, ${j.results[0].geometry.location.lng}`;
        })
        .catch(
            (err) => {
                console.warn(`Failed to geolocate ${addr}: ${err}`);
                input.placeholder = "Use button to locate >>";
            }
        )
}
```
Replace with:
```js
function geolocateAddress() {
    const address = document.getElementById('post');
    const addr = encodeURIComponent(address.value);
    const input = document.getElementById('geolocation');

    fetch(`https://nominatim.openstreetmap.org/search?q=${addr}&format=json&limit=1`)
        .then(r => r.json())
        .then(j => {
            if (!j[0] || !j[0].lat || !j[0].lon) throw "No result from Nominatim.";
            input.value = `${j[0].lat}, ${j[0].lon}`;
        })
        .catch(
            (err) => {
                console.warn(`Failed to geolocate ${addr}: ${err}`);
                input.placeholder = "Use button to locate >>";
            }
        )
}
```

- [ ] **Step 3: Replace the Google Maps pin-picker with Leaflet in `join-reproducibiliTea.html`**

Find (the `<article id="geolocation-map">` block and its `<script>`, currently lines 760-808):
```html
<article id="geolocation-map">
    <h2>Drag the marker to position your Journal Club (you can zoom in!)</h2>
    <div id="geolocation-map-display"></div>
    <div class="geolocation-map-controls"><button onclick="setGeolocation(event)"><i class="fas fa-map-marker-alt"></i> Use location</button></div>
    <script id="mapAPIsource"></script>
    <script>
        {% assign key = site.APIkeys | where_exp: "k", "k[0] == 'maps'" %}
        let key = "{{ key[0][1] }}";
        document.getElementById('mapAPIsource').src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=initialize`;

        let map;
        let endMarker;
        const input = document.getElementById("geolocation");

        function initialize() {
            map = new google.maps.Map(
                document.getElementById("geolocation-map-display"),
                {
                    zoom: 1,
                    center: {lat: 0, lng: 0}
                }
                );

            const existing = input.value;
            let position = map.getCenter();
            if(existing) {
                const parse = existing.split(',');
                position = {lat: parseFloat(parse[0]), lng: parseFloat(parse[1])};
            }

            // create the marker
            endMarker = new google.maps.Marker({
                position,
                map: map,
                draggable: true,
            });

            // add an event "onDrag"
            google.maps.event.addListener(endMarker, 'dragend', function() {
                copyMarkerpositionToInput();
            });
        }

        function copyMarkerpositionToInput() {
            // get the position of the marker, and set it as the value of input
            input.value = endMarker.getPosition().lat() +','+  endMarker.getPosition().lng();
        }
    </script>
</article>
```
Replace with:
```html
<article id="geolocation-map">
    <h2>Drag the marker to position your Journal Club (you can zoom in!)</h2>
    <div id="geolocation-map-display" style="height: 400px"></div>
    <div class="geolocation-map-controls"><button onclick="setGeolocation(event)"><i class="fas fa-map-marker-alt"></i> Use location</button></div>

    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        let pickerMap;
        let endMarker;
        const input = document.getElementById("geolocation");

        function initialize() {
            if (pickerMap) return;
            const existing = input.value;
            let position = [0, 0];
            let zoom = 1;
            if (existing) {
                const parse = existing.split(',');
                position = [parseFloat(parse[0]), parseFloat(parse[1])];
                zoom = 10;
            }

            pickerMap = L.map('geolocation-map-display', { center: position, zoom });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 18
            }).addTo(pickerMap);

            endMarker = L.marker(position, { draggable: true }).addTo(pickerMap);
            endMarker.on('dragend', copyMarkerpositionToInput);
        }

        function copyMarkerpositionToInput() {
            const pos = endMarker.getLatLng();
            input.value = pos.lat + ',' + pos.lng;
        }

        initialize();
    </script>
</article>
```

Note: `geolocate(event)` (in `join-form.js`) toggles the `#geolocation-map` article's `active` class to show/hide this picker — unchanged by this task. Since `initialize()` now runs immediately (Leaflet doesn't need an async script-load callback the way the Google Maps JS API did), remove the old `initialize` callback wiring; there is none left to remove beyond what's shown above.

- [ ] **Step 4: Manual verification**

Load `/join-reproducibiliTea/` locally: type an address into the postal-address field, confirm the geolocation field populates via Nominatim; click the map-marker button, confirm the Leaflet picker opens, drag the pin, confirm the geolocation field updates; on `/jc-overview.html`, confirm any JC missing `geolocation` shows a Nominatim-derived suggestion instead of erroring.

- [ ] **Step 5: Commit**

```bash
git add _includes/jc-lookup.html assets/js/join-form.js join-reproducibiliTea.html
git commit -m "Replace Google geocoding with Nominatim, pin picker with Leaflet"
```

---

### Task 5: Remove the leaked Google Maps API key

**Files:**
- Modify: `_config.yml`
- Delete: `_includes/keys.html`
- Modify: `join-reproducibiliTea.html`
- Modify: `edit-jc.html`
- Modify: `_includes/jc-lookup.html` (confirm no residual `keys.html` include — none introduced by Task 4)

- [ ] **Step 1: Remove the `APIkeys` block from `_config.yml`**

Find:
```yaml
APIkeys:
  - [maps, AIzaSyDsXPnhrJW3Q__6xb9DaW5C0RalHmQsz3g] # google Maps API key

```
Delete this block entirely.

- [ ] **Step 2: Remove `{% include keys.html %}` call sites**

In `join-reproducibiliTea.html`, find (line 4):
```liquid
{% include keys.html %}
```
Delete this line.

In `edit-jc.html`, find (line 4):
```liquid
{% include keys.html %}
```
Delete this line.

- [ ] **Step 3: Delete the now-unused include**

```bash
git rm _includes/keys.html
```

- [ ] **Step 4: Confirm no remaining references**

Run: `grep -rn "keys.html\|APIkeys\|AIzaSy" --include="*.html" --include="*.yml" --include="*.md" --include="*.js" .`
Expected: no matches (aside from this plan file itself, if grepped from the repo root including `docs/`).

- [ ] **Step 5: Rebuild and verify**

Run: `bundle exec jekyll build`
Expected: build succeeds with no Liquid errors about a missing `keys.html` include or `site.APIkeys`.

- [ ] **Step 6: Commit**

```bash
git add _config.yml join-reproducibiliTea.html edit-jc.html
git commit -m "Remove the leaked Google Maps API key and its now-unused include"
```

- [ ] **Step 7: Immediate manual action (not a code step, do this regardless of when the rest of this plan ships)**

Revoke/rotate the leaked key (`AIzaSyDsXPnhrJW3Q__6xb9DaW5C0RalHmQsz3g`) in the Google Cloud Console now — it has been sitting in the public git history and, until this plan ships, is still live in `_config.yml` on `master`.
