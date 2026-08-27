/**
 * A `require` that finds jest-expo wherever the install put it.
 *
 * jest-expo is a devDependency of the conformance app, not of this package, so
 * whether it lands in the root node_modules or nested under examples/app is
 * npm's hoisting decision — and that decision changes between installs. The
 * scripts here resolved from the repository root only, which worked until it
 * didn't.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const CANDIDATES = ['package.json', 'examples/app/package.json'];

export function jestExpoRequire() {
  const root = path.join(import.meta.dirname, '..');
  for (const candidate of CANDIDATES) {
    const require = createRequire(path.join(root, candidate));
    try {
      require.resolve('jest-expo/package.json');
      return require;
    } catch {
      // Try the next workspace.
    }
  }
  throw new Error(
    `jest-expo resolves from neither ${CANDIDATES.join(' nor ')} — run npm install first.`
  );
}
