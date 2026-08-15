/**
 * Conformance: automock (factory-less jest.mock without a __mocks__ file) —
 * class methods and functions become auto-mocked fns returning undefined.
 */
import { GreetingService, formatGreeting } from '@/services/greeting-service';


jest.mock('@/services/greeting-service');

describe('automock without factory or __mocks__ (both runners)', () => {
  it('auto-mocks exported functions', () => {
    expect(formatGreeting('x')).toBeUndefined();
    expect((formatGreeting as any).mock).toBeTruthy();
  });

  it('auto-mocks class methods', () => {
    const service = new GreetingService();
    expect(service.greet('x')).toBeUndefined();
  });
});
