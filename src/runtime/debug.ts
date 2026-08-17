/**
 * Diagnostic channel for the fallbacks that deliberately swallow errors.
 *
 * Several layers degrade quietly by design — a package mock that cannot be
 * loaded, a Flow toolchain that is not installed, an app config that fails to
 * parse. That is the right runtime behavior (a test run must not die over an
 * optional capability), but it leaves nothing to look at when the outcome is
 * surprising. Setting DEBUG=vitest-expo prints what was skipped and why.
 */
const enabled = /(^|,)\s*(\*|vitest-expo(:\*)?)\s*(,|$)/.test(process.env.DEBUG ?? '');

export function debug(scope: string, message: string, error?: unknown): void {
  if (!enabled) return;
  const reason = error instanceof Error ? `: ${error.message}` : error !== undefined ? `: ${String(error)}` : '';
  console.warn(`[vitest-expo:${scope}] ${message}${reason}`);
}

/** Whether the diagnostic channel is on — for call sites where building the message costs something. */
export const debugEnabled = enabled;
