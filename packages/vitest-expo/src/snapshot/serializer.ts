/**
 * Snapshot serializer that renders RNTL host-component trees in a curated,
 * jest-expo-like shape.
 *
 * Why: jest-expo snapshots serialize the composite tree (`<View>`, `<Text>`,
 * props as authored) because Jest's react-native preset mocks core components.
 * vitest-native runs real React Native, so `screen.toJSON()` yields the host
 * tree (`<RCTView>`, `<RCTText>`, every resolved default prop and internal
 * event handler). Raw, that output is noisy and drowns the signal.
 *
 * This serializer does not chase byte-parity with jest-expo; it keeps what is
 * meaningful in a snapshot and drops resolved-runtime noise:
 *  - host component names are mapped to their public names (RCTView → View, …)
 *  - style arrays are flattened to a single object (the effective style)
 *  - function-valued props are dropped — on the host tree these are RN's
 *    internal responder/event plumbing, never the author's handlers
 *  - `undefined` prop values are dropped, including inside nested objects;
 *    props that end up as empty objects disappear (e.g. Pressable's
 *    all-undefined accessibilityState)
 *  - resolved RN default props that carry no authored intent are dropped
 *    (allowFontScaling=true, ellipsizeMode="tail", collapsable, …)
 *  - pretty-format runs with Jest's snapshot defaults for a familiar layout
 *
 * Layering note: everything in this file is React-Native-generic — an upstream
 * candidate for vitest-native (which auto-registers a noisier host-tree
 * serializer today). The Expo-specific part is only the extension table of Expo
 * host-view names that vitest-expo passes via createSnapshotSerializer().
 */
import { format, plugins } from 'pretty-format';

const REACT_TEST_JSON = Symbol.for('react.test.json');

/** Host component name → public React Native component name. */
const HOST_COMPONENT_NAMES: Record<string, string> = {
  RCTView: 'View',
  RCTText: 'Text',
  RCTVirtualText: 'Text',
  RCTImageView: 'Image',
  RCTScrollView: 'ScrollView',
  RCTScrollContentView: 'View',
  RCTRefreshControl: 'RefreshControl',
  RCTSafeAreaView: 'SafeAreaView',
  RCTModalHostView: 'Modal',
  RCTSwitch: 'Switch',
  RCTActivityIndicatorView: 'ActivityIndicator',
  RCTSinglelineTextInputView: 'TextInput',
  RCTMultilineTextInputView: 'TextInput',
  AndroidTextInput: 'TextInput',
  AndroidSwitch: 'Switch',
  AndroidHorizontalScrollView: 'ScrollView',
  AndroidHorizontalScrollContentView: 'View',
};

/** Layout/bridge internals that never encode authored intent. */
const NOISE_PROPS = new Set(['collapsable', 'collapsableChildren', 'nativeID']);

/** Resolved RN default values — dropped when they match, kept when authored differently. */
const DEFAULT_PROP_VALUES: Record<string, unknown> = {
  allowFontScaling: true,
  ellipsizeMode: 'tail',
  fadingEdgeLength: 0,
};

interface TestJsonNode {
  $$typeof: symbol;
  type: string;
  props: Record<string, unknown>;
  children: Array<TestJsonNode | string> | null;
}

function isTestJsonNode(value: unknown): value is TestJsonNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as TestJsonNode).$$typeof === REACT_TEST_JSON
  );
}

/** StyleSheet.flatten semantics without importing react-native. */
function flattenStyle(style: unknown): unknown {
  if (!Array.isArray(style)) return style;
  const flat: Record<string, unknown> = {};
  for (const entry of style.flat(Infinity)) {
    if (entry && typeof entry === 'object') Object.assign(flat, entry);
  }
  return flat;
}

function isEmptyObject(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

/**
 * React internals reachable through props (refs, owner links, class-instance
 * containers) are run-dependent — a stable placeholder keeps the snapshot
 * meaningful. As a pretty-format plugin it applies at every print depth,
 * including inside objects the prop cleaner deliberately leaves untouched.
 */
const fiberNodePlugin = {
  test: (value: unknown) =>
    typeof value === 'object' && value !== null && value.constructor?.name === 'FiberNode',
  serialize: () => '[FiberNode]',
};

/** Recursively remove undefined entries from plain objects. */
function cleanValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanValue);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      cleaned[k] = cleanValue(v);
    }
    return cleaned;
  }
  return value;
}

function cleanProps(props: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(props).sort()) {
    if (key === 'children') continue;
    if (NOISE_PROPS.has(key)) continue;
    let value = props[key];
    if (value === undefined) continue;
    if (typeof value === 'function') continue;
    if (key in DEFAULT_PROP_VALUES && value === DEFAULT_PROP_VALUES[key]) continue;
    value = key === 'style' ? cleanValue(flattenStyle(value)) : cleanValue(value);
    if (isEmptyObject(value)) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

export interface SnapshotSerializerOptions {
  /** Additional host component name mappings, merged over the RN core table. */
  hostComponentNames?: Record<string, string>;
}

export function createSnapshotSerializer(options: SnapshotSerializerOptions = {}) {
  const nameMap = { ...HOST_COMPONENT_NAMES, ...options.hostComponentNames };

  function cleanNode(node: TestJsonNode | string): TestJsonNode | string {
    if (typeof node === 'string') return node;
    return {
      $$typeof: REACT_TEST_JSON,
      type: nameMap[node.type] ?? node.type,
      props: cleanProps(node.props ?? {}),
      children: node.children ? node.children.map(cleanNode) : null,
    };
  }

  return {
    test(value: unknown): boolean {
      return isTestJsonNode(value);
    },
    serialize(
      value: TestJsonNode,
      _config: unknown,
      indentation: string,
      _depth: number,
      _refs: unknown,
      _printer: unknown
    ): string {
      const output = format(cleanNode(value), {
        // ReactElement prints element-valued props as compact JSX instead of
        // dumping fiber internals (_debugOwner, _debugStack, …) — those are
        // run-dependent and never snapshot-worthy.
        plugins: [fiberNodePlugin, plugins.ReactTestComponent, plugins.ReactElement],
        // Jest's snapshotFormat defaults (jest >= 29), for a familiar layout.
        escapeString: false,
        printBasicPrototype: false,
        printFunctionName: false,
        indent: 2,
        // Depth cap: host trees can carry deeply shared prop objects (chart
        // data, engine handles) that would print exponentially — and detail at
        // that depth carries no review signal anyway.
        maxDepth: 12,
      });
      // Re-indent for the (rare) case the tree is nested inside a larger value.
      return indentation ? output.split('\n').join(`\n${indentation}`) : output;
    },
  };
}

/** Expo host views → their public component names (the vitest-expo layer). */
export const EXPO_HOST_COMPONENT_NAMES: Record<string, string> = {
  ExpoImage: 'Image',
  ExpoLinearGradient: 'LinearGradient',
  ExpoBlurView: 'BlurView',
  ExpoVideoView: 'VideoView',
  ExpoCameraView: 'CameraView',
};

export const jestExpoSnapshotSerializer = createSnapshotSerializer({
  hostComponentNames: EXPO_HOST_COMPONENT_NAMES,
});
