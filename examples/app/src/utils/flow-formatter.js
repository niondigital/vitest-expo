// @flow
// Flow-annotated .js — Metro pipelines accept this in app code, so the test
// runner has to as well. Exercises type annotations, opaque generics and JSX
// in a plain .js file.
import * as React from 'react';
import { Text } from 'react-native';

export type Formatted = {| label: string, value: number |};

export function formatCount(label: string, value: number): Formatted {
  return { label, value };
}

export function FlowBadge({ label, value }: Formatted): React.Node {
  return <Text>{`${label}: ${value}`}</Text>;
}

const DEFAULT_LABEL: string = 'count';

export default function formatDefault(value: number): Formatted {
  return formatCount(DEFAULT_LABEL, value);
}
