/**
 * Conformance: spying in Jest syntax — class prototypes, object methods,
 * and module namespaces (jestCompat provides the `jest` global under Vitest).
 *
 * Namespace spying deserves a note: under plain Vitest/ESM it throws (frozen
 * namespaces), but vitest-expo's pipeline compiles app modules through Babel
 * to CJS semantics — so this jest-only-looking pattern stays portable here.
 */
import * as GreetingModule from '@/services/greeting-service';
import { GreetingService } from '@/services/greeting-service';


describe('spies (both runners)', () => {
  it('spies on a class prototype method', () => {
    const spy = jest.spyOn(GreetingService.prototype, 'greet').mockReturnValue('spied');
    expect(new GreetingService().greet('x')).toBe('spied');
    expect(spy).toHaveBeenCalledWith('x');
    spy.mockRestore();
    expect(new GreetingService().greet('x')).toBe('Hello, x!');
  });

  it('spies on an object method', () => {
    const obj = { load: () => 'real' };
    const spy = jest.spyOn(obj, 'load').mockReturnValue('spied');
    expect(obj.load()).toBe('spied');
    spy.mockRestore();
  });

  it('spies on a module namespace (CJS semantics in both runners)', () => {
    const spy = jest.spyOn(GreetingModule, 'formatGreeting').mockReturnValue('ns-spied');
    expect(GreetingModule.formatGreeting('x')).toBe('ns-spied');
    spy.mockRestore();
    expect(GreetingModule.formatGreeting('x')).toBe('** x **');
  });

  it('jest.fn with mock state APIs works', () => {
    const fn = jest.fn((n: number) => n * 2);
    expect(fn(2)).toBe(4);
    expect(fn.mock.calls).toEqual([[2]]);
    fn.mockReset();
    expect(fn.mock.calls).toEqual([]);
  });
});
