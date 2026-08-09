# FINALIZATION TASK FOR /next/

Work only in branch `site-finalization`.

Goal: bring `/next/` from transitional state to a stable, fast, visually polished production-ready catalog without changing root site yet.

## Non-negotiable product truth
- `catalog.json` is source data and must remain read-only in this task.
- `data/forma-home-product-registry.json` and every file listed in `manualEvidenceSources` are source of truth for model grouping.
- Preserve 541 shopper-facing models / 1196 variants after approved grouping.
- Never invent colors, dimensions, prices, sourceIds, photos or variant combinations.
- Keep protected constructions separate (bar/semi-bar, different bases/geometries/heights/mechanisms).
- SOFT swatches are round; HARD swatches are square.
- A selected UI state must correspond to one real Variant/sourceId. Never create Cartesian products.

## Phase 0 — inspect before editing
Read completely:
- `next/index.html`
- `next/app-registry.js`
- `next/catalog-preprocess.js`
- `next/styles.css`
- `catalog.json`
- `data/forma-home-product-registry.json`
- all `manualEvidenceSources`
- relevant image/cover manifests, audit scripts and recent Git history for product covers.

Also inspect branch `backup-dimensions-2026-08-09` only as reference for the verified dimensions TSV/audit. Do not copy its blocking `Promise.all` implementation.

Produce a short baseline report before changes: current HEAD, runtime files loaded, catalog fetch count, model/variant counts, unresolved variant UI count, first-page model list, and current cover source for the first 48 models.

## Phase 1 — make runtime fail-safe and remove transitional artifacts
Fix customer-visible artifacts and fragile loading.

Required:
1. The catalog must load if any optional enrichment file is unavailable. Only failure of `catalog.json` may show “Каталог не загрузился”.
2. Remove customer-facing technical artifacts such as `+2`, `+N`, generic fallback labels, `Вариант 1/2/3`, technical model/source ids, diagnostic strings, and service metadata.
3. Do not hide real selectable variants. If a color cannot be trusted, represent that real variant with a human-readable neutral selector in the modal, not a technical counter on the card.
4. Cards should show clean swatches/selectors only when meaningful. No unresolved `+N` badges.
5. Variant changes must atomically update sourceId, price, retail comparison, gallery, specs/dimensions and selected state.
6. Keep pagination. Do not render the whole catalog at once.

## Phase 2 — restore verified dimensions safely
Use the verified TSV from `backup-dimensions-2026-08-09` as optional enrichment.

Rules:
- Existing exact dimensions from a Variant/specs win.
- TSV is fallback only.
- Optional dimensions loading must never block or break catalog loading.
- Prefer a static data file colocated under `/next/` or another path proven to be deployed by the current Worker. If unavailable, catalog still works without fallback dimensions.
- Modal gets a clear `Размеры` block only when real values exist.
- Do not change `catalog.json`.

## Phase 3 — fix product covers and first pages
This is a high-priority visual task.

Cover quality rule for every shopper-facing card:
1. preferred: full product, front three-quarter view;
2. acceptable: full product, straight front view;
3. unacceptable as cover when a better gallery image exists: rear three-quarter, back, side/profile, cropped detail, close-up, packaging, lifestyle image where product is not clearly readable.

Use existing local galleries first. Do not generate images. Do not guess that an image is front view from filename alone: visually inspect it if browser/image tooling is available.

Audit at least the first 96 shopper-facing models after merchandising and all historically deferred/flagged covers. Reuse prior confirmed cover work in Git history/manifests; do not undo confirmed front/front-three-quarter choices.

If a product has no acceptable full-product front/front-three-quarter image anywhere in its local gallery, add it to a manual-review report. Do not use a placeholder.

## Phase 4 — merchandising / storefront order
The current round-robin category ordering is not enough. Build an explicit deterministic merchandising score/order for the default unfiltered catalog.

First screen/pages must prioritize broad, popular, representative products:
- mainstream dining chairs and armchairs;
- dining tables;
- sofas/comfortable seating;
- coffee/side tables;
- a tasteful small amount of bar furniture and decor.

De-prioritize niche/specific products such as leather statement chairs, hangers, highly specialized bar items, unusual accessories and near-duplicates.

Do not claim real sales popularity unless sales data exists. Where no sales data exists, call this `merchandisingPriority`, based on broad usefulness, category balance, visual appeal, completeness of data/photo quality and representative assortment.

Prevent visually near-identical products from appearing consecutively when possible.

The first 48 items should look intentionally curated, not like source-file order.

## Phase 5 — mobile/desktop design and UX
Preserve the approved visual direction; do not redesign from scratch.

Check and fix:
- 320, 375/390, 412/430 px mobile widths;
- 768 px tablet;
- 1280 and 1440 px desktop;
- Safari/WebKit and Chromium where tooling permits.

Must work cleanly:
- hero/header;
- search and filters;
- cards and swipe gallery;
- pagination;
- swatches/selectors;
- favorites;
- cart/order;
- modal/gallery;
- sticky CTA/safe areas;
- long names and prices;
- keyboard focus/escape on desktop.

Modal on iPhone must remain compact and centered with safe margins, not oversized.

## Phase 6 — performance
Target a simple production runtime:
- one canonical main CSS;
- one canonical main app JS plus preprocessing only if still required;
- one catalog fetch;
- optional enrichment requests must be non-blocking and cached where sensible;
- first visible images prioritized, remaining images lazy-loaded;
- no MutationObserver patch layers;
- no obsolete loaders/v2/v3 runtime files reintroduced;
- no duplicate parsing/render pipelines.

Measure what is possible locally: asset sizes, number of requests implied by HTML/runtime, catalog fetch count, JS syntax, and browser performance if available. Do not invent Lighthouse results.

## Browser tooling
Before saying browser tests are unavailable, inspect the environment and package setup. If internet access is enabled for this Codex environment, install project-local Playwright and required Chromium/WebKit binaries if reasonably possible. Do not modify global machine state unnecessarily.

If browser installation is impossible, continue all static/runtime audits and explicitly report the missing capability. Do not claim visual verification that was not performed.

## Required automated audits
Create or update reproducible scripts so one command can verify:
- 541 shopper-facing models;
- 1196 variants;
- lost sourceIds = 0;
- duplicate sourceIds = 0;
- new unapproved merges = 0;
- protected groups remain separate;
- catalog fetch count = 1;
- no customer-facing `+N` unresolved badges / `Вариант N` labels in rendered default cards;
- optional dimensions failure does not break catalog initialization;
- first-page merchandising list is deterministic.

Run at minimum:
- `node --check next/app-registry.js`
- `node --check next/catalog-preprocess.js`
- relevant audit scripts
- `git diff --check`

## Scope safety
Do NOT switch root site.
Do NOT edit root `index.html`.
Do NOT delete old/root assets yet.
Do NOT change source prices.
Do NOT replace source images destructively.
Do NOT modify registry/manualEvidence.
Do NOT merge to main automatically.

## Delivery
Make coherent commits in `site-finalization` and create a PR back to `main` only after audits pass.

Final report must state:
1. exact HEAD started from;
2. files changed;
3. model/variant/sourceId audit results;
4. all removed customer-visible artifacts;
5. number of cover images reviewed and changed;
6. list of remaining manual-cover-review items;
7. first 48 merchandising models/categories after final ordering;
8. dimensions fallback result;
9. mobile/browser widths actually tested;
10. performance checks actually measured;
11. tests passed/failed;
12. commit SHA and PR number.
