import fs from 'node:fs';
import path from 'node:path';
import {
  PATTERNS,
  applyEmptyFactoryFix,
  collectSources,
  mockedBareSpecifiers,
  scanFile,
  scanLazyRequires,
  type PatternId,
} from '../src/cli/scan';
import { project } from './helpers';

/** Patterns found in a single test file. */
function scan(source: string, options: { setup?: boolean; mocks?: boolean; aliases?: string[] } = {}) {
  const root = project({ 'a.test.ts': source });
  const findings = scanFile(
    root,
    { file: path.join(root, 'a.test.ts'), setup: options.setup ?? false, mocks: options.mocks },
    options.aliases ?? []
  );
  return findings.map((finding) => finding.pattern);
}

describe('scanFile', () => {
  it('reports a destructured render() without await, and leaves awaited ones alone', () => {
    expect(scan('const { getByText } = render(<A />);')).toContain('sync-render-destructure');
    expect(scan('const { getByText } = await render(<A />);')).not.toContain('sync-render-destructure');
    expect(scan('await render(<A />);')).not.toContain('sync-render-destructure');
  });

  it('reports Platform.OS assignment but not comparison', () => {
    expect(scan("Platform.OS = 'android';")).toContain('platform-os-assignment');
    expect(scan("if (Platform.OS === 'android') {}")).not.toContain('platform-os-assignment');
  });

  it('reports jest.doMock only in setup files', () => {
    expect(scan("jest.doMock('x', () => ({}));", { setup: true })).toContain('do-mock');
    expect(scan("jest.doMock('x', () => ({}));")).not.toContain('do-mock');
  });

  it('reports an empty mock factory', () => {
    expect(scan("jest.mock('some-pkg', () => {});")).toContain('empty-mock-factory');
    expect(scan("jest.mock('some-pkg', () => ({}));")).not.toContain('empty-mock-factory');
  });

  it('reports the upstream reanimated mock', () => {
    expect(scan("jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));")).toContain(
      'reanimated-mock'
    );
    expect(scan("jest.mock('react-native-reanimated', () => ({ default: {} }));")).not.toContain('reanimated-mock');
  });

  it('reports requireActual through a configured alias prefix only', () => {
    expect(scan("jest.requireActual('@/services/orders');", { aliases: ['@/'] })).toContain('require-actual-alias');
    expect(scan("jest.requireActual('@/services/orders');")).not.toContain('require-actual-alias');
    expect(scan("jest.requireActual('react-native');", { aliases: ['@/'] })).not.toContain('require-actual-alias');
  });

  it('reports arrow mockImplementation inside a mock factory only', () => {
    const inside = "jest.mock('sdk', () => ({ Client: jest.fn().mockImplementation(() => ({})) }));";
    expect(scan(inside)).toContain('arrow-mock-implementation');
    expect(scan('spy.mockImplementation(() => 1);')).not.toContain('arrow-mock-implementation');
  });

  it('reports dynamic CJS exports only in __mocks__ files', () => {
    const source = 'module.exports = new Proxy({}, {});';
    expect(scan(source, { mocks: true })).toContain('dynamic-cjs-mock');
    expect(scan(source)).not.toContain('dynamic-cjs-mock');
  });

  it('reports a mocked useColorScheme', () => {
    expect(scan('(useColorScheme as jest.Mock).mockReturnValue("dark");')).toContain('color-scheme-mock');
  });

  it('anchors every finding to its source line and excerpt', () => {
    const root = project({ 'a.test.ts': 'const a = 1;\n\nPlatform.OS = "ios";\n' });
    const [finding] = scanFile(root, { file: path.join(root, 'a.test.ts'), setup: false }, []);
    expect(finding).toMatchObject({ line: 3, excerpt: 'Platform.OS = "ios";', file: 'a.test.ts' });
  });
});

describe('PATTERNS metadata', () => {
  it('describes every pattern the scanner can emit', () => {
    const emitted = new Set<PatternId>([
      'reanimated-mock',
      'do-mock',
      'require-mock',
      'arrow-mock-implementation',
      'require-actual-alias',
      'platform-os-assignment',
      'color-scheme-mock',
      'dynamic-cjs-mock',
      'empty-mock-factory',
      'lazy-require-mocked',
      'sync-render-destructure',
    ]);
    expect(new Set(Object.keys(PATTERNS))).toEqual(emitted);
    for (const info of Object.values(PATTERNS)) {
      expect(info.anchor.startsWith('#')).toBe(true);
      expect(['change', 'check']).toContain(info.severity);
    }
  });
});

describe('applyEmptyFactoryFix', () => {
  it('rewrites empty factories and reports how many', () => {
    const root = project({
      'setup.ts': "jest.mock('a', () => {});\nvi.mock('b', () => {});\njest.mock('c', () => ({ x: 1 }));\n",
    });
    const file = path.join(root, 'setup.ts');
    expect(applyEmptyFactoryFix(file)).toBe(2);
    const fixed = fs.readFileSync(file, 'utf8');
    expect(fixed).toContain("jest.mock('a', () => ({}))");
    expect(fixed).toContain("vi.mock('b', () => ({}))");
    expect(fixed).toContain("jest.mock('c', () => ({ x: 1 }))");
    expect(applyEmptyFactoryFix(file)).toBe(0);
  });
});

describe('lazy require cross-check', () => {
  it('finds a mocked package loaded through a runtime require in app code', () => {
    const root = project({
      'src/__tests__/a.test.ts': "jest.mock('analytics-sdk', () => ({ track: jest.fn() }));",
      'src/service.ts': 'export function track() {\n  const sdk = require("analytics-sdk");\n  return sdk.track();\n}',
      'src/clean.ts': "import { track } from 'analytics-sdk';",
    });
    const sources = collectSources(root, []);
    const mocked = mockedBareSpecifiers(sources);
    expect(mocked).toContain('analytics-sdk');

    const findings = scanLazyRequires(root, mocked);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ pattern: 'lazy-require-mocked', file: path.join('src', 'service.ts') });
  });

  it('ignores relative mocks when collecting bare specifiers', () => {
    const root = project({ 'a.test.ts': "jest.mock('./local');\njest.mock('@scope/pkg');" });
    const mocked = mockedBareSpecifiers([{ file: path.join(root, 'a.test.ts'), setup: false }]);
    expect([...mocked]).toEqual(['@scope/pkg']);
  });
});

describe('collectSources', () => {
  it('collects test files and setup files, and skips build output', () => {
    const root = project({
      'src/a.test.ts': '',
      'src/b.spec.tsx': '',
      'src/helper.ts': '',
      'src/__mocks__/pkg.js': '',
      'node_modules/pkg/x.test.ts': '',
      'dist/old.test.ts': '',
      'test-setup.ts': '',
    });
    const files = collectSources(root, ['test-setup.ts']).map((source) =>
      path.relative(root, source.file).split(path.sep).join('/')
    );
    expect(files).toEqual(expect.arrayContaining(['src/a.test.ts', 'src/b.spec.tsx', 'test-setup.ts']));
    expect(files).not.toContain('src/helper.ts');
    expect(files.some((file) => file.startsWith('node_modules/') || file.startsWith('dist/'))).toBe(false);
  });

  it('marks setup and __mocks__ files', () => {
    const root = project({ 'src/__mocks__/pkg.js': '', 'setup.ts': '', 'a.test.ts': '' });
    const sources = collectSources(root, ['setup.ts']);
    const byName = Object.fromEntries(sources.map((source) => [path.basename(source.file), source]));
    expect(byName['setup.ts'].setup).toBe(true);
    expect(byName['a.test.ts'].setup).toBe(false);
    expect(byName['pkg.js']?.mocks).toBe(true);
  });
});
