/**
 * Runtime test setup, injected via the vitestExpo() plugin.
 * Registered after vitest-native's own setup so serializers and registry
 * augmentations added here win.
 */
import { expect } from 'vitest';
import { jestExpoSnapshotSerializer } from './snapshot/serializer';
import { applyAppConfig } from './modules/expo-constants';
import { installDevBuildModel } from './runtime/dev-build';
import { applyModuleValues } from './runtime/module-values';

expect.addSnapshotSerializer(jestExpoSnapshotSerializer);

installDevBuildModel();
applyModuleValues();
applyAppConfig();
