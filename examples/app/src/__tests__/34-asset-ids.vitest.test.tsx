/**
 * Assets are registered ids, as in an app built with Metro. A bundled
 * `require` resolves to the id the registry assigned, and an id nothing was
 * registered for is refused the way a device refuses it. jest-expo answers
 * any id with fixed metadata instead, which is why this is a vitest-only test.
 */
import * as Font from 'expo-font';

describe('asset ids', () => {
  it('refuses an id no asset was registered for', async () => {
    await expect(Font.loadAsync('MadeUp', 1 as never)).rejects.toThrow(/asset registry/);
  });

  it('loads a bundled asset by its registered id', async () => {
    const icon = require('../../assets/images/icon.png');
    expect(typeof icon).toBe('number');
    await expect(Font.loadAsync('Bundled', icon)).resolves.toBeUndefined();
    expect(Font.isLoaded('Bundled')).toBe(true);
  });
});
