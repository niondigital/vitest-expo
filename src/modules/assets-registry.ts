/**
 * Module mock for React Native's asset registry.
 *
 * On a device, Metro registers every `require('./image.png')` in this registry
 * and hands back a numeric id; packages then look the metadata up by that id.
 * Test runners have no Metro, so the registry stays empty and every lookup
 * fails — which breaks the real code paths of expo-asset (`Asset.fromModule`)
 * and, through it, expo-font's asset loading.
 *
 * Serving fixed metadata for any id keeps those code paths alive and
 * deterministic. The values mirror Jest's Expo preset so a suite that asserts
 * on asset metadata reads the same under both runners.
 */
const ASSET_METADATA = {
  fileSystemLocation: '/full/path/to/directory',
  httpServerLocation: '/assets/full/path/to/directory',
  scales: [1],
  fileHashes: ['md5'],
  name: 'name',
  exists: true,
  type: 'type',
  hash: 'md5',
  uri: 'uri',
  width: 1,
  height: 1,
};

export function assetsRegistryMock() {
  return {
    registerAsset: () => 1,
    getAssetByID: () => ({ ...ASSET_METADATA }),
  };
}
