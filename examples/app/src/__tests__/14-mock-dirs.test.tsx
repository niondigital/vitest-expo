/**
 * Conformance: __mocks__ directory resolution — local module (adjacent
 * __mocks__ dir) and node_modules package (root __mocks__ dir), both via an
 * explicit factory-less jest.mock call, as jest-expo apps use it.
 */
import * as Clipboard from 'expo-clipboard';
import { getQuote } from '@/services/quote-service';


jest.mock('@/services/quote-service');
jest.mock('expo-clipboard');

describe('__mocks__ directory resolution (both runners)', () => {
  it('resolves a local module from its adjacent __mocks__ directory', () => {
    expect(getQuote()).toBe('mocked quote from __mocks__');
  });

  it('resolves a node_modules package from the root __mocks__ directory', async () => {
    await expect(Clipboard.getStringAsync()).resolves.toBe('clipboard from root __mocks__');
  });
});
