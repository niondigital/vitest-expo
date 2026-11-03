import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    setup: 'src/setup.ts',
    'setup-web': 'src/setup-web.ts',
    'router/index': 'src/router/index.tsx',
    'snapshot-serializer': 'src/snapshot/serializer.ts',
    helpers: 'src/helpers.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  // The CLI is a binary, not user-facing API — no .d.ts needed.
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
  target: 'node22',
  // Everything bare stays external — the package transpiles, it does not vendor.
  external: [/^[a-zA-Z@]/],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
