# Storefront styles and releases

`manifest.json` lists CSS sources in cascade order. Edit those sources; do not reorder them without visual review. `layout.css` contains the former inline styles. The generated `storefront.css` stays at the repository root to preserve relative asset URLs.

Edit page markup in `styles/index.template.html`, then run:

```sh
python scripts/build-release.py YYYYMMDD-description
```

Commit the sources and generated `index.html`, `storefront.css`, and `sw.js` together. The build appends a content fingerprint and records SHA-256 checksums for the complete shell.

Worker caches are isolated by registration scope. Failed release downloads leave the active release intact. The previous shell remains available to existing tabs; catalog and photo caches survive releases. Saved data can be used offline; unseen photos and details still need a connection. Browser storage eviction can remove offline copies.

Run `node scripts/check-cache-lifecycle.cjs` to test offline responses, failed updates and cache isolation with a mocked network and CacheStorage. This is a logic test, not a real-device Safari test.
