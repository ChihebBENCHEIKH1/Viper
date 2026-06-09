/**
 * Platform abstraction for the dual Android/iOS pipeline.
 *
 * The platform is derived from the artifact extension (.apk/.aab => android,
 * .ipa => ios) and can be overridden explicitly. Everything downstream
 * (prompts, MCP servers, tooling) branches on this single discriminator.
 */

export type Platform = 'android' | 'ios';
export type ArtifactType = 'apk' | 'aab' | 'ipa';

const EXT_TO_TYPE: Record<string, ArtifactType> = {
  apk: 'apk',
  aab: 'aab',
  ipa: 'ipa',
};

const TYPE_TO_PLATFORM: Record<ArtifactType, Platform> = {
  apk: 'android',
  aab: 'android',
  ipa: 'ios',
};

/** In-container mount filename per platform (kept stable for the prompts). */
export const PLATFORM_ARTIFACT_FILENAME: Record<Platform, string> = {
  android: 'target.apk',
  ios: 'target.ipa',
};

export function isPlatform(value: string | undefined): value is Platform {
  return value === 'android' || value === 'ios';
}

/** Map an artifact path to its type by extension. Throws on unknown extensions. */
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

/**
 * Resolve the platform from the artifact, honoring an optional override.
 * An override that contradicts the file extension is rejected.
 */
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
