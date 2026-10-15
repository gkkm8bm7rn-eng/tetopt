#!/usr/bin/env python3
"""Build the exact CSS cascade and a checksum-verified offline release.
Run: python scripts/build-release.py RELEASE_ID
Commit the generated index.html, storefront.css and sw.js with the sources.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
release = sys.argv[1]
if not re.fullmatch(r'[A-Za-z0-9._-]+', release):
    raise SystemExit('Invalid release ID')
sources = json.loads((root / 'styles/manifest.json').read_text())['sources']
# All original stylesheets lived at the repository root. Keep the output there
# too, so relative asset URLs and data URLs retain their existing meaning.
css = '\n'.join('/* Source: '+name+' */\n'+(root/name).read_text() for name in sources)
(root / 'storefront.css').write_text(css)
html = (root / 'styles/index.template.html').read_text()
scripts = re.findall(r'<script src="([^"?]+\.js)', html)
fingerprint = css + html + (root/'scripts/sw.template.js').read_text()
fingerprint += ''.join((root/name).read_text() for name in scripts)
release += '-'+hashlib.sha256(fingerprint.encode()).hexdigest()[:10]
html = html.replace('<!-- STOREFRONT_STYLES -->',
                    '<link rel="stylesheet" href="storefront.css?v='+release+'">')
html = re.sub(r'((?:src|href)="[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"',
              r'\1?v='+release+'"', html)
(root / 'index.html').write_text(html)
assets = [{'url': 'index.html?release='+release, 'key': 'index.html',
           'sha256': hashlib.sha256((root/'index.html').read_bytes()).hexdigest()}]
for name in ['storefront.css', *scripts]:
    assets.append({'url': name+'?v='+release,
                   'sha256': hashlib.sha256((root/name).read_bytes()).hexdigest()})
worker = (root / 'scripts/sw.template.js').read_text()
worker = worker.replace('__RELEASE__', json.dumps(release)).replace('__RESOURCES__', json.dumps(assets, indent=2))
(root / 'sw.js').write_text(worker)
print(f'{root.name}: {len(sources)} CSS sources → 1 stylesheet; {len(assets)} verified shell files')
