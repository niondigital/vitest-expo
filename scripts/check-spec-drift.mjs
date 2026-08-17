/**
 * Guards the vendored module specs against drift.
 *
 * src/runtime/expo-module-specs.ts is generated from the installed jest-expo.
 * When jest-expo is bumped without regenerating, the mocked native surface
 * silently describes the previous SDK — a failure mode that shows up as
 * confusing test behavior rather than an error. This check makes it loud.
 *
 * Usage: node scripts/check-spec-drift.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const specFile = path.join(import.meta.dirname, '..', 'src', 'runtime', 'expo-module-specs.ts');

const header = fs.readFileSync(specFile, 'utf8').slice(0, 500);
const vendored = /jest-expo@([\d.]+(?:-[\w.]+)?)/.exec(header)?.[1];
const installed = require('jest-expo/package.json').version;

if (!vendored) {
  console.error('could not read the vendored jest-expo version from the generated header');
  process.exit(1);
}

if (vendored !== installed) {
  console.error(
    `vendored module specs are stale: generated from jest-expo@${vendored}, installed is ${installed}\n` +
      '  regenerate with: npm run import-jest-expo-mocks'
  );
  process.exit(1);
}

console.log(`module specs match the installed jest-expo@${installed}`);
