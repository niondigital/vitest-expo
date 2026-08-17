import path from 'node:path';
import { syntaxCompatPlugin } from '../src/syntax-compat';

const plugin = syntaxCompatPlugin();
// Inside the repository, so the Flow toolchain (@babel/core plus the plugins
// shipped with @react-native/babel-preset) resolves the way it would in a real
// project.
const root = path.resolve(import.meta.dirname, '..');

/** Runs the plugin's transform hook the way Vite would. */
async function transform(code: string, file: string): Promise<string | null> {
  const handler = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform!.handler;
  const result = await handler.call({} as never, code, path.join(root, file));
  if (!result) return null;
  return typeof result === 'string' ? result : (result.code ?? null);
}

describe('export default from', () => {
  it('rewrites the bare form into a standard re-export', async () => {
    const out = await transform("export formatDefault from './formatter';", 'a.ts');
    expect(out).toContain("export { default as formatDefault } from './formatter'");
  });

  it('rewrites the combined form, keeping the named exports', async () => {
    const out = await transform("export v, { a, b } from './mod';", 'a.ts');
    expect(out).toContain('export { default as v, a, b } from');
  });

  it('handles `export default from` itself', async () => {
    const out = await transform("export default from './mod';", 'a.ts');
    expect(out).toContain("export { default as default } from './mod'");
  });

  it('leaves standard export syntax untouched', async () => {
    for (const source of [
      "export * from './mod';",
      "export { a, b } from './mod';",
      "export * as ns from './mod';",
      'export default function main() {}',
      'export const value = 1;',
      'export type Thing = string;',
      'export class Service {}',
      'export async function load() {}',
      "export { default as x } from './mod';",
    ]) {
      expect(await transform(source, 'a.ts')).toBeNull();
    }
  });

  it('does not match a property access that reads like the proposal', async () => {
    expect(await transform("obj.export = from('x');", 'a.ts')).toBeNull();
  });
});

describe('flow', () => {
  it('strips annotations from a pragma-carrying .js file', async () => {
    const out = await transform('// @flow\nexport function f(x: number): string {\n  return String(x);\n}\n', 'f.js');
    expect(out).toBeTruthy();
    expect(out).not.toContain(': number');
    expect(out).toContain('String(x)');
  });

  it('handles a block-comment pragma and JSX in the same file', async () => {
    const out = await transform(
      '/* @flow */\nimport * as React from "react";\nexport const B = (p: {x: string}) => <div>{p.x}</div>;\n',
      'b.js'
    );
    expect(out).toBeTruthy();
    expect(out).not.toContain(': {x: string}');
  });

  it('ignores .js files without the pragma', async () => {
    expect(await transform('export const a = 1;\n', 'plain.js')).toBeNull();
  });

  it('does not treat a stray @flow in a string as a pragma', async () => {
    expect(await transform('export const doc = "see @flow docs";\n', 'c.js')).toBeNull();
  });
});

describe('scope', () => {
  it('skips node_modules and non-JS files', async () => {
    expect(await transform("export v from './m';", 'node_modules/pkg/index.js')).toBeNull();
    expect(await transform("export v from './m';", 'styles.css')).toBeNull();
  });

  it('ignores a query suffix on the module id', async () => {
    const handler = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform!.handler;
    const result = await handler.call({} as never, "export v from './m';", path.join(root, 'a.ts?v=1'));
    expect(result).toBeTruthy();
  });
});
