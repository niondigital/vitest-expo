/**
 * Runtime test setup, injected via the vitestExpo() plugin.
 * Registered after vitest-native's own setup so serializers and registry
 * augmentations added here win.
 */
import { expect } from 'vitest';
import { jestExpoSnapshotSerializer } from './snapshot/serializer';
import { applyAppConfig } from './modules/expo-constants';

expect.addSnapshotSerializer(jestExpoSnapshotSerializer);

applyAppConfig();
