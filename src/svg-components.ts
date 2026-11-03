import path from 'node:path';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

const VIRTUAL_PREFIX = '\0vitest-expo:svg-component:';

/**
 * SVG files as components, for projects on react-native-svg-transformer.
 *
 * With the transformer in Metro, `import Icon from './icon.svg'` is a React
 * component and the app renders `<Icon />`. In tests the engine registers
 * `.svg` as an asset, the way Metro does without the transformer, so the import
 * is a number and React refuses to render it. When the transformer is
 * installed, an `.svg` import from app code resolves to a stand-in component
 * instead: a host element named after the file, which is what the Jest mocks
 * these projects carry render too, so `testID` and friends come through and a
 * snapshot reads `<icon testID="…" />`. Files under node_modules keep the
 * engine's asset handling.
 */
export function svgComponentsPlugin(root: string): Plugin | null {
  if (!hasSvgTransformer(root)) return null;
  return {
    name: 'vitest-expo:svg-components',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!/\.svg$/i.test(source) || !importer || importer.includes('/node_modules/')) return null;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      const file = resolved?.id ?? (source.startsWith('.') ? path.resolve(path.dirname(importer), source) : null);
      if (!file || file.includes('/node_modules/')) return null;
      return VIRTUAL_PREFIX + file;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null;
      const name = path.basename(id.slice(VIRTUAL_PREFIX.length), '.svg');
      return `export default ${JSON.stringify(name)};\n`;
    },
  };
}

function hasSvgTransformer(root: string): boolean {
  try {
    createRequire(path.join(root, 'package.json')).resolve('react-native-svg-transformer/package.json');
    return true;
  } catch {
    return false;
  }
}
