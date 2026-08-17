// Type surface for reexports.js — the implementation uses Babel-only syntax
// (`export default from`, Flow) that tsc cannot parse; with a .d.ts present
// the type checker reads this file and skips the .js.
import type * as React from 'react';

export interface Formatted {
	label: string;
	value: number;
}

export function formatCount(label: string, value: number): Formatted;
export function formatDefault(value: number): Formatted;
export function FlowBadge(props: Formatted): React.ReactElement;
declare function defaultExport(value: number): Formatted;
export default defaultExport;
