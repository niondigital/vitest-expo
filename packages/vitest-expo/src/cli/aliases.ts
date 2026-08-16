import path from 'node:path';
import { readJsonc } from './json';

export interface AliasEntry {
  /** Source of the RegExp used as the alias `find`. */
  find: string;
  /** Expression emitted as the alias `replacement` (already valid config code). */
  replacement: string;
  /** Where the entry came from, for the report. */
  origin: string;
}

export interface AliasResult {
  entries: AliasEntry[];
  /** Mappers that have no alias equivalent, with the reason. */
  skipped: Array<{ pattern: string; target: string; reason: string }>;
}

/**
 * tsconfig `paths` → Vite aliases.
 *
 * Vite replaces the matched portion of the request, so a wildcard mapping
 * becomes a prefix rewrite (`@/*` → `@/`) rather than a capture-group
 * substitution. Non-wildcard mappings match the whole request instead.
 */
export function aliasesFromTsconfig(root: string): AliasEntry[] {
  const tsconfig = readJsonc<Record<string, any>>(path.join(root, 'tsconfig.json'));
  const options = tsconfig?.compilerOptions ?? {};
  const paths = options.paths;
  if (!paths || typeof paths !== 'object') return [];

  const base = path.resolve(root, typeof options.baseUrl === 'string' ? options.baseUrl : '.');
  const entries: AliasEntry[] = [];

  for (const [pattern, targets] of Object.entries(paths as Record<string, unknown>)) {
    const target = Array.isArray(targets) ? targets[0] : targets;
    if (typeof target !== 'string') continue;

    if (pattern.endsWith('/*') && target.endsWith('/*')) {
      const prefix = pattern.slice(0, -1); // keep the trailing slash
      const dir = target.slice(0, -2);
      entries.push({
        find: `^${escapeRegex(prefix)}`,
        replacement: `${resolveExpr(base, root, dir)} + '/'`,
        origin: `tsconfig paths "${pattern}"`,
      });
      continue;
    }

    if (!pattern.includes('*') && !target.includes('*')) {
      entries.push({
        find: `^${escapeRegex(pattern)}$`,
        replacement: resolveExpr(base, root, target),
        origin: `tsconfig paths "${pattern}"`,
      });
    }
  }

  // Vite tries aliases in order: the longest prefix has to win, otherwise
  // "@/" would swallow "@/assets/".
  return entries.sort((a, b) => b.find.length - a.find.length);
}

/**
 * Jest `moduleNameMapper` → Vite aliases.
 *
 * Only file mappers translate directly. Capture-group mappers ('^@/(.*)$' →
 * '<rootDir>/src/$1') are the tsconfig `paths` aliases restated for Jest and
 * are already covered by them; package redirects and mappers with several
 * targets have no alias form and are reported instead.
 */
export function aliasesFromModuleNameMapper(
  root: string,
  mapper: Record<string, string>,
  covered: AliasEntry[]
): AliasResult {
  const entries: AliasEntry[] = [];
  const skipped: AliasResult['skipped'] = [];

  for (const [pattern, target] of Object.entries(mapper)) {
    if (/\$\d/.test(target)) {
      // The literal head of the pattern ('^@/(.*)$' → '@/') is what a prefix
      // alias matches on.
      const prefix = stripAnchors(pattern).replace(/[([\\].*$/, '');
      const alreadyCovered =
        prefix.length > 0 &&
        covered.some((entry) => entry.find.startsWith(`^${escapeRegex(prefix)}`));

      if (alreadyCovered) continue; // the tsconfig paths alias already says this

      const asPrefix = prefixAlias(root, pattern, target, prefix);
      if (asPrefix) entries.push(asPrefix);
      else {
        skipped.push({
          pattern,
          target,
          reason: 'capture-group mapper with no prefix form — add a resolve alias by hand',
        });
      }
      continue;
    }

    if (target.includes('<rootDir>') || target.startsWith('.') || target.startsWith('/')) {
      entries.push({
        find: fullMatchSource(pattern),
        replacement: resolveExpr(root, root, fromRootDir(target)),
        origin: `moduleNameMapper "${pattern}"`,
      });
      continue;
    }

    skipped.push({
      pattern,
      target,
      reason: 'maps to a package, not a file — use jest.mock/vi.mock or a resolve alias by hand',
    });
  }

  return { entries, skipped };
}

/**
 * A mapper of the shape '^@/(.*)$' → '<rootDir>/src/$1' is a directory
 * rewrite, which Vite expresses as a prefix alias. It only holds when the
 * pattern is a literal prefix followed by a single trailing capture group and
 * the target ends in that group — anything else changes the request in a way
 * a prefix replacement cannot reproduce.
 */
function prefixAlias(
  root: string,
  pattern: string,
  target: string,
  prefix: string
): AliasEntry | null {
  if (prefix.length === 0) return null;
  if (/[.*+?^${}()|[\]\\]/.test(prefix)) return null;
  // Exactly one group, and it has to sit at the very end of the pattern.
  if ((pattern.match(/\(/g) ?? []).length !== 1) return null;
  if (!/\((?:\.\*|\.\+|\[\^\/\]\+)\)\$?$/.test(pattern)) return null;
  if (!/\$1$/.test(target) || /\$[2-9]/.test(target)) return null;

  const rawDir = target.slice(0, -2); // drop the trailing "$1"
  const trailingSlash = rawDir.endsWith('/');
  // The prefix and the target have to agree on the separator, otherwise the
  // rewritten request would gain or lose one.
  if (trailingSlash !== prefix.endsWith('/')) return null;

  const dir = fromRootDir(trailingSlash ? rawDir.slice(0, -1) : rawDir);
  if (!dir.startsWith('.') && !dir.startsWith('/')) return null;

  const resolved = resolveExpr(root, root, dir);
  return {
    find: `^${escapeRegex(prefix)}`,
    replacement: trailingSlash ? `${resolved} + '/'` : resolved,
    origin: `moduleNameMapper "${pattern}"`,
  };
}

/**
 * Jest matches mapper keys as unanchored regexes and replaces the whole
 * request; Vite replaces only the matched portion. Anchoring the pattern to
 * the full request keeps the semantics identical.
 */
function fullMatchSource(pattern: string): string {
  const hasStart = pattern.startsWith('^');
  const hasEnd = pattern.endsWith('$');
  const body = pattern.slice(hasStart ? 1 : 0, hasEnd ? -1 : undefined);
  return `^${hasStart ? '' : '.*'}${body}${hasEnd ? '' : '.*'}$`;
}

function stripAnchors(pattern: string): string {
  return pattern.replace(/^\^/, '').replace(/\$$/, '');
}

function fromRootDir(target: string): string {
  return target.replace(/^<rootDir>\/?/, './');
}

/**
 * `path.resolve(import.meta.dirname, 'src')` (ESM-native — no __dirname in .mts), relative to the project root. The path is
 * emitted through JSON.stringify — a directory name may legally contain
 * quotes or backslashes, which must not escape the generated string literal.
 */
function resolveExpr(base: string, root: string, target: string): string {
  const absolute = path.resolve(base, target);
  const relative = path.relative(root, absolute) || '.';
  return `path.resolve(import.meta.dirname, ${JSON.stringify(relative.split(path.sep).join('/'))})`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
