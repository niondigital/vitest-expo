/**
 * Node ESM loader fallback, registered by vitest-expo's setup via
 * module.register(). Handles two Metro-isms in published packages that Node's
 * resolver rejects:
 *
 * 1. Extensionless relative imports (`./Localization`) → probe .js/.mjs/index.
 * 2. Type-only relative imports that survived compilation
 *    (`import './X.types'` where only X.types.d.ts exists) → an empty module.
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EMPTY_MODULE = 'data:text/javascript,export%20{}';
const SUFFIXES = ['.js', '.mjs', '.cjs', '/index.js'];

interface ResolveContext {
  parentURL?: string;
  [key: string]: unknown;
}

type NextResolve = (
  specifier: string,
  context: ResolveContext
) => Promise<{ url: string; [key: string]: unknown }>;

function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve
): Promise<{ url: string; [key: string]: unknown }> {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      for (const suffix of SUFFIXES) {
        if (isFile(base + suffix)) {
          return { url: pathToFileURL(base + suffix).href, shortCircuit: true };
        }
      }
      // A type-only import left in the build output: only the .d.ts exists.
      if (isFile(`${base}.d.ts`)) {
        return { url: EMPTY_MODULE, shortCircuit: true };
      }
    }
    // Transform-emitted helper imports (Oxc's decorator lowering) live in
    // vitest-expo's own dependency tree, not the app's.
    if (specifier.startsWith('@oxc-project/runtime/')) {
      try {
        const resolved = createRequire(import.meta.url).resolve(specifier);
        return { url: pathToFileURL(resolved).href, shortCircuit: true };
      } catch {
        // fall through to the original error
      }
    }
    throw error;
  }
}
