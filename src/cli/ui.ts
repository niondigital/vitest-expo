/**
 * Terminal output primitives for the CLI.
 *
 * Colors are emitted through a tiny inline helper rather than a dependency —
 * the package must stay installable without pulling anything into a user's
 * project just to print a report.
 */

const enabled =
  process.stdout.isTTY === true &&
  !process.env.NO_COLOR &&
  process.env.TERM !== 'dumb' &&
  !process.env.CI;

const ESC = '\u001B[';

function wrap(open: number, close: number) {
  return (text: string): string =>
    enabled ? `${ESC}${open}m${text}${ESC}${close}m` : text;
}

export const color = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  cyan: wrap(36, 39),
};

export function heading(text: string): void {
  console.log(`\n${color.bold(text)}`);
}

export function ok(text: string): void {
  console.log(`  ${color.green('+')} ${text}`);
}

export function warn(text: string): void {
  console.log(`  ${color.yellow('!')} ${text}`);
}

export function info(text: string): void {
  console.log(`  ${color.blue('-')} ${text}`);
}

export function fail(text: string): void {
  console.log(`  ${color.red('x')} ${text}`);
}

export function plain(text = ''): void {
  console.log(text ? `    ${text}` : '');
}

export function code(text: string): void {
  console.log(`    ${color.cyan(text)}`);
}
