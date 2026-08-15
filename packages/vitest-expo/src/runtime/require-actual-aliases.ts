/**
 * Teaches jest-compat's `jest.requireActual` the project's Vite aliases.
 *
 * requireActual resolves through Node (createRequire from the project root),
 * so `jest.requireActual('@/services/foo')` — a common partial-mock pattern in
 * real jest-expo suites, where babel maps tsconfig paths — fails out of the
 * box. The plugin serializes the resolved alias table into
 * VITEST_EXPO_ALIASES; this wrapper expands a matching alias before delegating
 * to the original implementation.
 */

import fs from 'node:fs';

interface SerializedAlias {
  find?: string;
  regex?: string;
  flags?: string;
  replacement: string;
}

// The suffixes Metro (and TypeScript) resolve for an extensionless specifier —
// Node's require, which requireActual delegates to, does not know .ts/.tsx.
const RESOLUTION_SUFFIXES = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.js',
];

export function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** The active alias expander, shared with the Node resolution fallback. */
export let expandAlias: (id: string) => string = (id) => id;

export function installRequireActualAliases(): void {
  const raw = process.env.VITEST_EXPO_ALIASES;
  if (!raw) return;

  let aliases: SerializedAlias[];
  try {
    aliases = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(aliases) || aliases.length === 0) return;

  const expand = (id: string): string => {
    let expanded = id;
    for (const alias of aliases) {
      if (alias.regex !== undefined) {
        const pattern = new RegExp(alias.regex, alias.flags);
        if (pattern.test(id)) {
          expanded = id.replace(pattern, alias.replacement);
          break;
        }
      } else if (alias.find !== undefined) {
        if (id === alias.find) {
          expanded = alias.replacement;
          break;
        }
        if (id.startsWith(`${alias.find}/`)) {
          expanded = alias.replacement + id.slice(alias.find.length);
          break;
        }
      }
    }
    // Aliased app paths are usually extensionless TS — resolve them the way
    // Metro would, since Node's resolver stops at .js. A path that exists but
    // is a directory still needs the /index.* probe.
    if (expanded !== id && !isFile(expanded)) {
      for (const suffix of RESOLUTION_SUFFIXES) {
        if (isFile(expanded + suffix)) return expanded + suffix;
      }
    }
    return expanded;
  };

  expandAlias = expand;

  // jest-compat exposes requireActual on both the `jest` global and `vi`
  // (its mock transform rewrites factory-internal calls to vi.requireActual).
  for (const holder of [(globalThis as any).jest, (globalThis as any).vi]) {
    if (holder && typeof holder.requireActual === 'function') {
      const original = holder.requireActual.bind(holder);
      holder.requireActual = (id: string) => original(expand(id));
    }
  }
}
