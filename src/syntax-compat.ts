import path from 'node:path';
import { createRequire } from 'node:module';
import * as vite from 'vite';
import { type Plugin } from 'vite';

/**
 * Babel-only syntax that babel-preset-expo accepts in app code but esbuild
 * does not: the `export default from` proposal and Flow-annotated .js files.
 * Both are handled here so that source written for a Metro/jest-expo pipeline
 * transforms without edits. Applies to app code only — node_modules either
 * ship compiled output or are handled by the engine's React Native transform.
 */
export function syntaxCompatPlugin(): Plugin {
  return {
    name: 'vitest-expo:syntax-compat',
    enforce: 'pre',
    async transform(code, id) {
      const file = cleanId(id);
      if (file.includes('/node_modules/') || !/\.[jt]sx?$/.test(file)) return null;

      let result: { code: string; map: any } | null = null;

      if (/\.jsx?$/.test(file) && hasFlowPragma(code)) {
        result = stripFlow(code, file);
      }

      const rewritten = rewriteExportDefaultFrom(result?.code ?? code);
      if (rewritten !== null) {
        // The rewrite is length-shifting but line-preserving, so a prior
        // Flow-strip map stays line-accurate; column drift within the
        // rewritten export line is acceptable.
        result = { code: rewritten, map: result?.map ?? null };
      }

      if (!result) return null;

      // Flow files may still contain JSX in .js — esbuild's default 'js'
      // loader would reject it, so finish with an explicit jsx pass (mirrors
      // the jsx-in-js handling for allowlisted packages).
      if (file.endsWith('.js') || file.endsWith('.jsx')) {
        // Rolldown-based Vite deprecates transformWithEsbuild; prefer the Oxc
        // equivalent where it exists (same jsx handling, different options
        // shape), fall back for esbuild-based Vite 6.
        const oxc = (vite as Record<string, any>).transformWithOxc;
        if (typeof oxc === 'function') {
          return oxc(result.code, file, { lang: 'jsx', jsx: { runtime: 'automatic' } }, result.map ?? undefined);
        }
        return vite.transformWithEsbuild(
          result.code,
          file,
          { loader: 'jsx', jsx: 'automatic' },
          result.map ?? undefined
        );
      }
      return result;
    },
  };
}

/**
 * `export v from 'mod'` re-exports mod's default binding under the name v
 * (v may itself be `default`) — exactly `export { default as v } from 'mod'`,
 * which is standard ES2015 and needs no plugin. Also handles the combined
 * `export v, { named } from 'mod'` form. Keywords that start other valid
 * export statements are excluded; `export * from` / `export { … } from`
 * never match the identifier pattern.
 * Proposal: https://github.com/tc39/proposal-export-default-from
 */
function rewriteExportDefaultFrom(source: string): string | null {
  const keywords = '(?!(?:const|let|var|function|class|async|type|interface|enum|declare|namespace|abstract)\\b)';
  const single = new RegExp(
    `(^|[^.\\w$])export\\s+(${keywords}[A-Za-z_$][\\w$]*)\\s+from\\s*(['"][^'"]+['"])`,
    'gm'
  );
  const combined = new RegExp(`(^|[^.\\w$])export\\s+(${keywords}[A-Za-z_$][\\w$]*)\\s*,\\s*\\{`, 'gm');
  if (!single.test(source) && !combined.test(source)) return null;
  return source
    .replace(single, (_, lead, name, spec) => `${lead}export { default as ${name} } from ${spec}`)
    .replace(combined, (_, lead, name) => `${lead}export { default as ${name},`);
}

/** The @flow pragma, inside a comment in the file's leading region. */
function hasFlowPragma(code: string): boolean {
  return /\/\*[\s\S]{0,200}?@flow|\/\/[^\n]{0,200}@flow/.test(code.slice(0, 400));
}

interface BabelLike {
  transformSync(
    code: string,
    options: Record<string, unknown>
  ): { code?: string | null; map?: unknown } | null;
}

let flowToolchain: { babel: BabelLike; plugins: unknown[] } | null | undefined;

/**
 * Flow strip via the project's own Babel — the same packages the engine's
 * React Native transform already requires (@babel/core plus the flow plugins
 * shipped as dependencies of @react-native/babel-preset), so this adds no
 * install-time footprint. Loaded lazily: most projects never hit a Flow file.
 */
function stripFlow(code: string, file: string): { code: string; map: any } | null {
  if (flowToolchain === undefined) flowToolchain = loadFlowToolchain(path.dirname(file));
  if (!flowToolchain) return null;

  const output = flowToolchain.babel.transformSync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    plugins: flowToolchain.plugins,
    parserOpts: { plugins: ['jsx'] },
    sourceMaps: true,
  });
  if (!output?.code) return null;
  return { code: output.code, map: output.map ?? null };
}

function loadFlowToolchain(from: string): { babel: BabelLike; plugins: unknown[] } | null {
  try {
    const projectRequire = createRequire(path.join(from, 'noop.js'));
    const presetRequire = createRequire(
      projectRequire.resolve('@react-native/babel-preset/package.json')
    );
    const plugin = (name: string) => {
      const mod = presetRequire(name);
      return (mod as { default?: unknown }).default ?? mod;
    };
    return {
      babel: projectRequire('@babel/core') as BabelLike,
      plugins: [plugin('babel-plugin-transform-flow-enums'), plugin('@babel/plugin-transform-flow-strip-types')],
    };
  } catch {
    return null;
  }
}

function cleanId(id: string): string {
  const query = id.indexOf('?');
  return query === -1 ? id : id.slice(0, query);
}
