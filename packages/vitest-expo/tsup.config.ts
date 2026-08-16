import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    setup: 'src/setup.ts',
    'setup-web': 'src/setup-web.ts',
    'router/index': 'src/router/index.tsx',
    'snapshot-serializer': 'src/snapshot/serializer.ts',
    helpers: 'src/helpers.ts',
    'esm-loader': 'src/esm-loader.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  // esm-loader is a Node loader hook and the CLI is a binary, not user-facing
  // API — no .d.ts needed for either (and esm-loader's node:* imports trip the
  // isolated dts entry build).
  dts: {
    entry: {
      index: 'src/index.ts',
      setup: 'src/setup.ts',
    'setup-web': 'src/setup-web.ts',
      'router/index': 'src/router/index.tsx',
      'snapshot-serializer': 'src/snapshot/serializer.ts',
      helpers: 'src/helpers.ts',
    },
  },
  clean: true,
  target: 'node20',
  // Everything bare stays external — the package transpiles, it does not vendor.
  external: [/^[a-zA-Z@]/],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
