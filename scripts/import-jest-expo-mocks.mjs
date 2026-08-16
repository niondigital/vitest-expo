/**
 * Imports jest-expo's native-module mock specs into a vendored TS data file.
 *
 * jest-expo (Expo, MIT) describes every Expo native module as plain data —
 * property name → { type, functionType?, mock? } — and materializes jest.fn
 * mocks from it at setup time. We vendor the merged spec (same merge order as
 * jest-expo's setup.js: public ← thirdParty ← internal) and materialize
 * vi.fn-based mocks in src/runtime/native-modules.ts instead.
 *
 * Re-run after bumping jest-expo:  node scripts/import-jest-expo-mocks.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const jestExpoPkg = require('jest-expo/package.json');
const publicModules = require('jest-expo/src/preset/moduleMocks/expoModules.js');
const internalModules = require('jest-expo/src/preset/moduleMocks/internalExpoModules.js');
const thirdPartyModules = require('jest-expo/src/preset/moduleMocks/thirdPartyModules.js');

function merge(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    result[key] =
      value && typeof value === 'object' && !Array.isArray(value) && result[key]
        ? merge(result[key], value)
        : value;
  }
  return result;
}

const spec = merge(publicModules, merge(thirdPartyModules, internalModules));

const header = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Vendored from jest-expo@${jestExpoPkg.version} (Expo, MIT):
 * src/preset/moduleMocks/{expoModules,thirdPartyModules,internalExpoModules}.js
 * merged in jest-expo setup.js order. Regenerate via:
 *   node scripts/import-jest-expo-mocks.mjs
 */

export interface ModulePropertySpec {
  type: string;
  functionType?: string;
  mock?: unknown;
  mockDefinition?: Record<string, Record<string, ModulePropertySpec>>;
  /** vitest-expo extension (module-spec-overrides.ts): return value for mocked functions. */
  returns?: unknown;
}

export type ModuleSpec = Record<string, ModulePropertySpec>;

export const JEST_EXPO_VERSION = '${jestExpoPkg.version}';

export const EXPO_MODULE_SPECS: Record<string, ModuleSpec> = `;

const out = header + JSON.stringify(spec, null, 2) + ';\n';
const target = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/runtime/expo-module-specs.ts'
);
fs.writeFileSync(target, out);
console.log(
  `Wrote ${Object.keys(spec).length} module specs (jest-expo@${jestExpoPkg.version}) → ${path.relative(process.cwd(), target)}`
);
