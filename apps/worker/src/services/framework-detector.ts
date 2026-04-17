/**
 * React Native / Flutter / Xamarin framework detection and bridge analysis.
 *
 * Detects hybrid frameworks in APK and identifies bridge methods for fuzzing.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type FrameworkType = 'native' | 'react-native' | 'flutter' | 'xamarin' | 'cordova' | 'ionic';

export interface FrameworkDetection {
  readonly framework: FrameworkType;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly indicators: readonly string[];
  readonly bridgeMethods?: readonly string[];
  readonly securityNotes: readonly string[];
}

export function detectFramework(apktoolDir: string, jadxDir: string): FrameworkDetection {
  const indicators: string[] = [];
  const securityNotes: string[] = [];

  // === React Native Detection ===
  const rnBundle = join(apktoolDir, 'assets', 'index.android.bundle');
  const rnHermes = existsSync(join(apktoolDir, 'lib', 'arm64-v8a', 'libhermes.so'))
    || existsSync(join(apktoolDir, 'lib', 'armeabi-v7a', 'libhermes.so'));

  if (existsSync(rnBundle) || rnHermes) {
    indicators.push(existsSync(rnBundle) ? 'index.android.bundle found' : 'Hermes engine detected');
    if (rnHermes) indicators.push('libhermes.so present');

    const bridgeMethods = detectReactNativeBridges(jadxDir);

    securityNotes.push(
      'React Native apps expose JavaScript bridge methods that can be fuzzed',
      'Check for sensitive operations in bridge (auth, payment, file access)',
      'Hermes bytecode can be decompiled with hbcdump',
      'JS bundle may contain hardcoded API keys and secrets',
    );

    return {
      framework: 'react-native',
      confidence: 'high',
      indicators,
      bridgeMethods,
      securityNotes,
    };
  }

  // === Flutter Detection ===
  const flutterSo = existsSync(join(apktoolDir, 'lib', 'arm64-v8a', 'libflutter.so'))
    || existsSync(join(apktoolDir, 'lib', 'armeabi-v7a', 'libflutter.so'));
  const flutterAssets = existsSync(join(apktoolDir, 'assets', 'flutter_assets'));

  if (flutterSo || flutterAssets) {
    if (flutterSo) indicators.push('libflutter.so present');
    if (flutterAssets) indicators.push('flutter_assets directory found');

    securityNotes.push(
      'Flutter apps compile Dart to native code — harder to reverse engineer',
      'Look for platform channels (MethodChannel) for native bridge vulnerabilities',
      'Check for insecure HTTP client configuration in Dart code',
      'flutter_assets/kernel_blob.bin may contain app logic',
    );

    return {
      framework: 'flutter',
      confidence: 'high',
      indicators,
      securityNotes,
    };
  }

  // === Xamarin Detection ===
  const xamarinDll = existsSync(join(apktoolDir, 'assemblies'));
  if (xamarinDll) {
    indicators.push('assemblies/ directory found (Xamarin/.NET)');

    securityNotes.push(
      'Xamarin apps contain .NET assemblies that can be decompiled with ILSpy/dnSpy',
      'Check for sensitive logic in managed code',
      'Mono runtime may have known vulnerabilities',
    );

    return {
      framework: 'xamarin',
      confidence: 'high',
      indicators,
      securityNotes,
    };
  }

  // === Cordova/Ionic Detection ===
  const cordovaConfig = existsSync(join(apktoolDir, 'assets', 'www', 'cordova.js'));
  if (cordovaConfig) {
    indicators.push('cordova.js found in assets/www/');

    securityNotes.push(
      'Cordova apps run in WebView — check for XSS and JavaScript injection',
      'Plugin bridge exposes native APIs to JavaScript',
      'Check cordova_plugins.js for installed plugins',
    );

    return {
      framework: 'cordova',
      confidence: 'high',
      indicators,
      securityNotes,
    };
  }

  return {
    framework: 'native',
    confidence: 'high',
    indicators: ['No hybrid framework detected — native Android app'],
    securityNotes: ['Standard Android security testing applies'],
  };
}

function detectReactNativeBridges(jadxDir: string): string[] {
  const bridges: string[] = [];

  try {
    // Search for @ReactMethod annotations in decompiled source
    const findResult = require('node:child_process').execSync(
      `grep -r "@ReactMethod" "${jadxDir}" --include="*.java" -l 2>/dev/null`,
      { encoding: 'utf-8' },
    );

    for (const file of findResult.trim().split('\n').filter(Boolean)) {
      const content = readFileSync(file, 'utf-8');
      const methods = content.match(/@ReactMethod[\s\S]*?public\s+\w+\s+(\w+)\(/g);
      if (methods) {
        for (const method of methods) {
          const name = method.match(/public\s+\w+\s+(\w+)\(/)?.[1];
          if (name) bridges.push(name);
        }
      }
    }
  } catch {
    // grep may fail if no matches
  }

  return bridges;
}
