import path from 'node:path';
import { createRequire } from 'node:module';
import { transformWithOxc, type Plugin } from 'vite';
import { debug } from './runtime/debug';

/**
 * Babel-only syntax that babel-preset-expo accepts in app code but esbuild
 * does not: the `export default from` proposal and Flow-annotated .js files.
 * Both are handled here so that source written for a Metro/jest-expo pipeline
 * transforms without edits. Applies to app code only — node_modules either
 * ship compiled output or are handled by the engine's React Native transform.
 */
/**
 * JSX in a .js file, through Vite's own transformer (Oxc on Vite 8). Used for
 * Flow files here and for the `transformPackages` allowlist in the plugin.
 */
export function transformJsx(code: string, file: string, map?: object) {
  return transformWithOxc(code, file, { lang: 'jsx', jsx: { runtime: 'automatic' } }, map);
}

export function syntaxCompatPlugin(): Plugin {
  return {
    name: 'vitest-expo:syntax-compat',
    enforce: 'pre',
    // Vite's decorator lowering emits imports of its helper package, resolved
    // from the app file that used the decorator. The helper is a dependency of
    // this package, not of the app, so it is answered from here with an
    // absolute path — which also holds under install layouts that do not
    // hoist it into the app's reach.
    resolveId(source) {
      if (!source.startsWith('@oxc-project/runtime/')) return null;
      try {
        return createRequire(import.meta.url).resolve(source);
      } catch (error) {
        debug('syntax-compat', `could not resolve ${source}`, error);
        return null;
      }
    },
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

      // Flow files may still contain JSX in .js, which the default 'js'
      // loader rejects, so finish with an explicit jsx pass.
      if (file.endsWith('.js') || file.endsWith('.jsx')) {
        return transformJsx(result.code, file, result.map ?? undefined);
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

let flowToolchain: { babel: BabelLike; plugins: unknown[] } | null = null;
/** Directories whose probe already failed — never paid twice. */
const flowProbeFailed = new Set<string>();

/**
 * Flow strip via the project's own Babel — the same packages the engine's
 * React Native transform already requires (@babel/core plus the flow plugins
 * shipped as dependencies of @react-native/babel-preset), so this adds no
 * install-time footprint. Loaded lazily: most projects never hit a Flow file.
 */
function stripFlow(code: string, file: string): { code: string; map: any } | null {
  if (!flowToolchain) {
    // Probe from the file's own directory first (a package in a monorepo may
    // carry its own install), then from the working directory. A failure is
    // remembered per directory, not globally: a later file elsewhere in the
    // repo can still bring the toolchain into reach.
    const from = path.dirname(file);
    if (flowProbeFailed.has(from)) return null;
    flowToolchain = loadFlowToolchain(from) ?? loadFlowToolchain(process.cwd());
    if (!flowToolchain) {
      flowProbeFailed.add(from);
      return null;
    }
  }

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
  } catch (error) {
    debug('flow', `no Flow toolchain reachable from ${from} — .js files with an @flow pragma stay untransformed`, error);
    return null;
  }
}

function cleanId(id: string): string {
  const query = id.indexOf('?');
  return query === -1 ? id : id.slice(0, query);
}
