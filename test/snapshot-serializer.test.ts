import { createSnapshotSerializer, jestExpoSnapshotSerializer } from '../src/snapshot/serializer';

const REACT_TEST_JSON = Symbol.for('react.test.json');

/** A host node the way react-test-renderer's toJSON() produces it. */
function node(type: string, props: Record<string, unknown> = {}, children: unknown[] | null = null) {
  return { $$typeof: REACT_TEST_JSON, type, props, children };
}

function print(value: unknown, serializer = jestExpoSnapshotSerializer): string {
  return serializer.serialize(value as never, {}, '', 0, {}, {});
}

describe('test()', () => {
  it('claims host trees and nothing else', () => {
    expect(jestExpoSnapshotSerializer.test(node('View'))).toBe(true);
    expect(jestExpoSnapshotSerializer.test({ type: 'View' })).toBe(false);
    expect(jestExpoSnapshotSerializer.test('text')).toBe(false);
    expect(jestExpoSnapshotSerializer.test(null)).toBe(false);
  });
});

describe('props', () => {
  it('drops functions, undefined values and empty objects', () => {
    const out = print(node('View', { onPress: () => {}, testID: undefined, extra: {}, accessible: true }));
    expect(out).toContain('accessible={true}');
    expect(out).not.toContain('onPress');
    expect(out).not.toContain('testID');
    expect(out).not.toContain('extra');
  });

  it('flattens a style array into the effective style', () => {
    const out = print(node('View', { style: [{ padding: 4 }, [{ padding: 8, color: 'red' }]] }));
    expect(out).toContain('"padding": 8');
    expect(out).toContain('"color": "red"');
    expect(out).not.toMatch(/style=\{\[/);
  });

  it('removes undefined entries inside style objects', () => {
    const out = print(node('View', { style: [{ margin: 2, padding: undefined }] }));
    expect(out).toContain('"margin": 2');
    expect(out).not.toContain('padding');
  });

  it('prints props in a stable order regardless of insertion order', () => {
    const forward = print(node('View', { alpha: 1, beta: 2 }));
    const reverse = print(node('View', { beta: 2, alpha: 1 }));
    expect(forward).toBe(reverse);
  });

  it('replaces React fiber internals with a placeholder', () => {
    class FiberNode {
      tag = 5;
    }
    const out = print(node('View', { ref: { current: new FiberNode() } }));
    expect(out).toContain('[FiberNode]');
    expect(out).not.toContain('tag');
  });
});

describe('component names', () => {
  it('maps Expo host views to their public names', () => {
    expect(print(node('ExpoImage'))).toContain('<Image');
    expect(print(node('ExpoLinearGradient'))).toContain('<LinearGradient');
    expect(print(node('ExpoBlurView'))).toContain('<BlurView');
  });

  it('leaves unknown host names untouched', () => {
    expect(print(node('SomeVendorView'))).toContain('<SomeVendorView');
  });

  it('accepts additional mappings through the factory', () => {
    const serializer = createSnapshotSerializer({ hostComponentNames: { VendorNative: 'Vendor' } });
    expect(print(node('VendorNative'), serializer)).toContain('<Vendor');
  });
});

describe('tree output', () => {
  it('renders children and text nodes', () => {
    const out = print(node('View', {}, [node('Text', {}, ['Hello'])]));
    expect(out).toBe(['<View>', '  <Text>', '    Hello', '  </Text>', '</View>'].join('\n'));
  });

  it('indents the whole tree when nested in a larger value', () => {
    const out = jestExpoSnapshotSerializer.serialize(
      node('View', {}, [node('Text', {}, ['Hi'])]) as never,
      {},
      '  ',
      0,
      {},
      {}
    );
    expect(out.split('\n').every((line, index) => index === 0 || line.startsWith('  '))).toBe(true);
  });

  it('survives a deeply nested prop object without exploding', () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 40; i++) deep = { nested: deep };
    expect(() => print(node('View', { data: deep }))).not.toThrow();
  });
});
