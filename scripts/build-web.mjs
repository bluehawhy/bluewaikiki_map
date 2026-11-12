/** BlueWaikiki Dashboard's web-build invokes npm run build:web.
 * No UI framework, bundler, npm dependencies, API service, or database required.
 * Dashboard publishes dist/ under /<project-slug>/.
 */
import { cpSync, existsSync, lstatSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'web');
const output = join(root, 'dist');

if (!existsSync(join(source, 'index.html')) || !lstatSync(source).isDirectory()) {
  throw new Error('web/index.html must exist before building the static map');
}

// Preserve relative asset references (./main.js, ./site.css, ./styles/*).
// These resolve correctly under Dashboard's /<slug>/ publication path.
rmSync(output, { recursive: true, force: true });
cpSync(source, output, { recursive: true, errorOnExist: true, force: false });

if (!existsSync(join(output, 'index.html'))) {
  throw new Error('Static web build did not produce dist/index.html');
}
console.log('Static map ready: dist/index.html (no framework or PostGIS required)');
