/**
 * CLI-local mirror of the worker platform abstraction. The CLI is its own
 * package/tsconfig and must not import the worker build, so the small detection
 * logic is duplicated here. Keep in sync with apps/worker/src/types/platform.ts.
 */

export type Platform = 'android' | 'ios';
export type ArtifactType = 'apk' | 'aab' | 'ipa';

const EXT_TO_TYPE: Record<string, ArtifactType> = { apk: 'apk', aab: 'aab', ipa: 'ipa' };
const TYPE_TO_PLATFORM: Record<ArtifactType, Platform> = {
  apk: 'android',
  aab: 'android',
  ipa: 'ios',
};

export function isPlatform(value: string | undefined): value is Platform {
  return value === 'android' || value === 'ios';
}

export function detectArtifactType(artifactPath: string): ArtifactType {
  const ext = artifactPath.split('.').pop()?.toLowerCase() ?? '';
  const type = EXT_TO_TYPE[ext];
  if (!type) {
    throw new Error(
      `Unsupported artifact "${artifactPath}" — expected .apk, .aab (Android) or .ipa (iOS)`,
    );
  }
  return type;
}

export function detectPlatform(artifactPath: string, override?: string): Platform {
  const detected = TYPE_TO_PLATFORM[detectArtifactType(artifactPath)];
  if (override !== undefined && override !== '') {
    if (!isPlatform(override)) {
      throw new Error(`Invalid platform "${override}" — use "android" or "ios"`);
    }
    if (override !== detected) {
      throw new Error(
        `--platform ${override} conflicts with a ${detected} artifact (${artifactPath}). ` +
          `Fix the file or drop the override.`,
      );
    }
    return override;
  }
  return detected;
}
