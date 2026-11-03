/**
 * Installs the packed tarball into a scratch Expo app with a given package
 * manager and runs one suite there.
 *
 * The engine resolves React Native and the Expo packages through the real
 * node_modules tree, so an install layout is a genuine compatibility surface:
 * a hoisting difference shows up as a resolution failure, not as a type error.
 *
 * Usage: node scripts/verify-install-layout.mjs <npm|pnpm|yarn|bun> [tarball-dir] [--sdk 57|58]
 *
 * The scratch app is an Expo SDK 58 app unless --sdk names the other verified
 * SDK, which is how the SDK 57 row of the compatibility table is kept honest.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const sdkFlag = args.indexOf('--sdk');
const sdk = sdkFlag >= 0 ? args.splice(sdkFlag, 2)[1] : '58';
const manager = args[0] ?? 'npm';
const tarballDir = path.resolve(args[1] ?? os.tmpdir());

// Pinned per SDK: the Expo package, its expo-constants, and the React and
// React Native versions that SDK ships.
const SDKS = {
  57: { expo: '~57.0.31', 'expo-constants': '~57.0.22', react: '19.2.3', 'react-native': '0.86.3' },
  58: { expo: '~58.0.22', 'expo-constants': '~58.0.14', react: '19.3.0', 'react-native': '0.88.1' },
};
if (!SDKS[sdk]) {
  console.error(`unknown Expo SDK: ${sdk} (verified: ${Object.keys(SDKS).join(', ')})`);
  process.exit(1);
}

const tarball = fs
  .readdirSync(tarballDir)
  .filter((name) => /^vitest-expo-.*\.tgz$/.test(name))
  .map((name) => path.join(tarballDir, name))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

if (!tarball) {
  console.error(`no vitest-expo tarball in ${tarballDir} — run: npm pack --workspaces=false`);
  process.exit(1);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), `layout-${manager}-`));
console.log(`[${manager}] scratch app: ${root} (Expo SDK ${sdk})`);
console.log(`[${manager}] tarball: ${tarball}`);

const files = {
  'package.json': {
    name: 'install-layout-check',
    version: '0.0.1',
    private: true,
    scripts: { test: 'vitest run' },
    dependencies: SDKS[sdk],
    devDependencies: {
      '@babel/core': '^7.25.0',
      '@react-native/babel-preset': '*',
      '@testing-library/react-native': '^14.1.0',
      // RNTL 14's renderer peer. npm installs peers on its own; yarn does not,
      // so the scaffold declares it the way a real project has to.
      'test-renderer': '^1.0.0',
      vitest: '^5',
      'vitest-expo': `file:${tarball}`,
      // The engine range the packed vitest-expo declares as its peer.
      'vitest-native': JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
        .peerDependencies['vitest-native'],
    },
  },
  'app.json': { expo: { name: 'layout-check', slug: 'layout-check', scheme: 'layoutcheck' } },
};

for (const [name, value] of Object.entries(files)) {
  fs.writeFileSync(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`);
}

fs.writeFileSync(
  path.join(root, 'vitest.config.mts'),
  `import { defineConfig } from 'vitest/config';
import { vitestExpo } from 'vitest-expo';

export default defineConfig({
  plugins: [vitestExpo()],
  test: { globals: true },
});
`
);

fs.mkdirSync(path.join(root, '__tests__'), { recursive: true });
fs.writeFileSync(
  path.join(root, '__tests__', 'layout.test.tsx'),
  `import React from 'react';
import { Text, View, Platform } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import Constants from 'expo-constants';

function Greeting() {
  return (
    <View>
      <Text>Hello from {Platform.OS}</Text>
    </View>
  );
}

describe('install layout', () => {
  it('renders react native through the installed tree', async () => {
    await render(<Greeting />);
    expect(screen.getByText('Hello from ios')).toBeTruthy();
  });

  it('reads the app config through the Expo module layer', () => {
    expect(Constants.expoConfig?.slug).toBe('layout-check');
  });
});
`
);

const install = {
  npm: ['install'],
  pnpm: ['install'],
  // Yarn Berry defaults to Plug'n'Play, which the React Native toolchain cannot
  // resolve through; the node-modules linker is the supported layout.
  yarn: ['install'],
  bun: ['install'],
}[manager];

if (!install) {
  console.error(`unknown package manager: ${manager}`);
  process.exit(1);
}

if (manager === 'yarn') {
  fs.writeFileSync(path.join(root, 'yarn.lock'), '');
  fs.writeFileSync(path.join(root, '.yarnrc.yml'), 'nodeLinker: node-modules\n');
}
if (manager === 'pnpm') {
  // The engine loads React Native through Node's resolver, which needs the
  // transitive dependencies reachable from the packages that require them.
  fs.writeFileSync(path.join(root, '.npmrc'), 'node-linker=hoisted\n');
}

function run(command, args, label) {
  console.log(`[${manager}] ${label}: ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
}

run(manager, install, 'install');
// Every manager understands `run test`, which is the scaffold's `vitest run`.
run(manager, ['run', 'test'], 'test');

console.log(`[${manager}] install layout verified`);
