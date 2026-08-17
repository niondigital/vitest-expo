import { aliasesFromModuleNameMapper, aliasesFromTsconfig } from '../src/cli/aliases';
import { project, json } from './helpers';

describe('aliasesFromTsconfig', () => {
  it('turns a wildcard path mapping into a prefix alias', () => {
    const root = project({
      'tsconfig.json': json({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
    });
    const [entry] = aliasesFromTsconfig(root);
    expect(entry.find).toBe('^@/');
    expect(entry.replacement).toContain('src');
    expect(entry.origin).toContain('tsconfig');
  });

  it('matches a non-wildcard mapping as a whole request', () => {
    const root = project({
      'tsconfig.json': json({ compilerOptions: { paths: { '~config': ['./config.ts'] } } }),
    });
    const [entry] = aliasesFromTsconfig(root);
    expect(entry.find).toMatch(/\$$/); // anchored at both ends
  });

  it('honours baseUrl and tolerates comments in the tsconfig', () => {
    const root = project({
      'tsconfig.json': '// project config\n' + json({ compilerOptions: { baseUrl: './app', paths: { '@/*': ['./src/*'] } } }),
    });
    const [entry] = aliasesFromTsconfig(root);
    expect(entry.replacement).toContain('app');
  });

  it('returns nothing when there are no paths', () => {
    expect(aliasesFromTsconfig(project({ 'tsconfig.json': json({}) }))).toEqual([]);
    expect(aliasesFromTsconfig(project({}))).toEqual([]);
  });
});

describe('aliasesFromModuleNameMapper', () => {
  const root = '/project';

  it('skips a capture-group mapper the tsconfig paths already cover', () => {
    const covered = [{ find: '^@/', replacement: '/project/src/', origin: 'tsconfig paths "@/*"' }];
    const result = aliasesFromModuleNameMapper(root, { '^@/(.*)$': '<rootDir>/src/$1' }, covered);
    expect(result.entries).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('translates a capture-group mapper with no tsconfig equivalent', () => {
    const result = aliasesFromModuleNameMapper(root, { '^@/(.*)$': '<rootDir>/src/$1' }, []);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].origin).toContain('moduleNameMapper');
  });

  it('translates a file mapper', () => {
    const result = aliasesFromModuleNameMapper(root, { '\\.(css)$': '<rootDir>/css-stub.js' }, []);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].replacement).toContain('css-stub.js');
  });

  it('reports a package redirect it cannot express as an alias', () => {
    const result = aliasesFromModuleNameMapper(root, { '^lodash$': 'lodash-es' }, []);
    expect(result.entries).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ pattern: '^lodash$', target: 'lodash-es' });
    expect(result.skipped[0].reason).toBeTruthy();
  });
});
