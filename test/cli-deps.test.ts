import { checkDependencies, installLine } from '../src/cli/deps';
import { project, json } from './helpers';

/** A project whose package.json declares the given dev dependencies. */
function withDevDeps(devDependencies: Record<string, string>, extra: Record<string, string> = {}) {
  return project({
    'package.json': json({ name: 'app', version: '1.0.0', devDependencies, dependencies: extra }),
  });
}

describe('checkDependencies', () => {
  it('lists what a plain jest-expo project still needs', () => {
    const report = checkDependencies(withDevDeps({ jest: '^29.7.0', 'jest-expo': '~57.0.0' }));
    expect(report.missing).toEqual(
      expect.arrayContaining(['vitest-expo', 'vitest-native', '@react-native/babel-preset'])
    );
    expect(report.removable).toEqual(expect.arrayContaining(['jest', 'jest-expo']));
  });

  it('pins @babel/core to 7 when it is absent, and warns when the project is on 8', () => {
    const absent = checkDependencies(withDevDeps({}));
    expect(absent.missing).toContain('@babel/core@^7');
    expect(absent.notes.join(' ')).not.toContain('@babel/core');

    const babel8 = checkDependencies(withDevDeps({ '@babel/core': '^8.0.0' }));
    expect(babel8.missing).not.toContain('@babel/core@^7');
    expect(babel8.notes.join(' ')).toMatch(/@babel\/core.*requires 7/);

    const babel7 = checkDependencies(withDevDeps({ '@babel/core': '^7.25.0' }));
    expect(babel7.notes.join(' ')).not.toContain('@babel/core');
  });

  it('requires Vitest 4 and flags an older declared major', () => {
    expect(checkDependencies(withDevDeps({})).missing).toContain('vitest@^4');
    expect(checkDependencies(withDevDeps({ vitest: '^3.2.0' })).notes.join(' ')).toMatch(/requires Vitest 4/);
    expect(checkDependencies(withDevDeps({ vitest: '^4.1.0' })).notes.join(' ')).not.toMatch(/Vitest 4/);
  });

  it('asks for react-test-renderer at the project react version on RNTL 13', () => {
    const report = checkDependencies(
      withDevDeps({ '@testing-library/react-native': '^13.2.0' }, { react: '19.1.0' })
    );
    expect(report.missing).toContain('react-test-renderer@19.1.0');
    expect(report.missing).not.toContain('test-renderer@^1');
  });

  it('flags a react-test-renderer whose major differs from react', () => {
    const report = checkDependencies(
      withDevDeps({ '@testing-library/react-native': '^13.2.0', 'react-test-renderer': '18.3.1' }, { react: '19.1.0' })
    );
    expect(report.notes.join(' ')).toMatch(/react-test-renderer 18\.3\.1 does not match react 19\.1\.0/);
  });

  it('asks for the standalone test-renderer on RNTL 14', () => {
    const report = checkDependencies(
      withDevDeps({ '@testing-library/react-native': '^14.0.1' }, { react: '19.1.0' })
    );
    expect(report.missing).toContain('test-renderer@^1');
    expect(report.missing.join(' ')).not.toContain('react-test-renderer');
  });

  it('accepts a declared test-renderer on RNTL 14', () => {
    const report = checkDependencies(
      withDevDeps({ '@testing-library/react-native': '^14.0.1', 'test-renderer': '^1.2.0' }, { react: '19.1.0' })
    );
    expect(report.missing).not.toContain('test-renderer@^1');
    expect(report.present).toContain('test-renderer');
  });

  it('treats declared packages as present', () => {
    const report = checkDependencies(
      withDevDeps({ 'vitest-expo': '^57.0.0', 'vitest-native': '^0.11.0', vitest: '^4.1.0' })
    );
    expect(report.missing).not.toContain('vitest-expo');
    expect(report.present).toEqual(expect.arrayContaining(['vitest-expo', 'vitest-native', 'vitest']));
  });

  it('survives a project without a package.json', () => {
    expect(() => checkDependencies(project({}))).not.toThrow();
  });
});

describe('installLine', () => {
  it('renders a single install command', () => {
    expect(installLine(['vitest-expo', 'vitest@^4'])).toBe('npm install -D vitest-expo vitest@^4');
  });
});
