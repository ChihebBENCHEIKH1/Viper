/**
 * JNI/NDK native library analysis.
 *
 * Analyzes .so files in APK for:
 * - Missing hardening flags (RELRO, NX, PIE, stack canaries)
 * - Known CVEs in common native libraries
 * - Architecture information
 */

import { execSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface NativeLibInfo {
  readonly name: string;
  readonly path: string;
  readonly arch: string;
  readonly size: number;
  readonly hardening: HardeningFlags;
  readonly knownCves: readonly string[];
}

export interface HardeningFlags {
  readonly relro: 'full' | 'partial' | 'none';
  readonly nx: boolean;
  readonly pie: boolean;
  readonly stackCanary: boolean;
  readonly fortify: boolean;
}

/** Known vulnerable native libraries and their CVEs */
const KNOWN_VULNERABLE_LIBS: Record<string, readonly string[]> = {
  'libssl.so': ['CVE-2014-0160 (Heartbleed)', 'CVE-2016-0800 (DROWN)'],
  'libcrypto.so': ['CVE-2014-0160', 'CVE-2015-1793'],
  'libsqlite.so': ['CVE-2019-8457', 'CVE-2020-13434'],
  'libwebp.so': ['CVE-2023-4863 (critical heap buffer overflow)'],
  'libjpeg.so': ['CVE-2020-14152'],
  'libpng.so': ['CVE-2019-7317'],
  'libcurl.so': ['CVE-2023-38545 (SOCKS5 heap overflow)'],
};

function checkElfHardening(soPath: string): HardeningFlags {
  try {
    const readelf = execSync(`readelf -l "${soPath}" 2>/dev/null`, { encoding: 'utf-8' });
    const dynamic = execSync(`readelf -d "${soPath}" 2>/dev/null`, { encoding: 'utf-8' });

    // Check RELRO
    let relro: HardeningFlags['relro'] = 'none';
    if (readelf.includes('GNU_RELRO')) {
      relro = dynamic.includes('BIND_NOW') ? 'full' : 'partial';
    }

    // Check NX (non-executable stack)
    const nx = readelf.includes('GNU_STACK') && !readelf.match(/GNU_STACK.*RWE/);

    // Check PIE
    const fileOutput = execSync(`file "${soPath}" 2>/dev/null`, { encoding: 'utf-8' });
    const pie = fileOutput.includes('shared object') || fileOutput.includes('PIE');

    // Check stack canary
    const symbols = execSync(`readelf -s "${soPath}" 2>/dev/null`, { encoding: 'utf-8' });
    const stackCanary = symbols.includes('__stack_chk_fail');

    // Check FORTIFY
    const fortify = symbols.includes('__fortify_chk') || symbols.includes('_chk@');

    return { relro, nx: nx !== false, pie, stackCanary, fortify };
  } catch {
    return { relro: 'none', nx: false, pie: false, stackCanary: false, fortify: false };
  }
}

export function analyzeNativeLibraries(apktoolDir: string): readonly NativeLibInfo[] {
  const libDir = join(apktoolDir, 'lib');
  if (!existsSync(libDir)) return [];

  const results: NativeLibInfo[] = [];
  const archs = readdirSync(libDir).filter((d) => {
    try { return readdirSync(join(libDir, d)).length > 0; } catch { return false; }
  });

  for (const arch of archs) {
    const archDir = join(libDir, arch);
    const soFiles = readdirSync(archDir).filter((f) => f.endsWith('.so'));

    for (const soFile of soFiles) {
      const soPath = join(archDir, soFile);
      const hardening = checkElfHardening(soPath);
      const knownCves = KNOWN_VULNERABLE_LIBS[soFile] || [];

      results.push({
        name: soFile,
        path: `lib/${arch}/${soFile}`,
        arch,
        size: 0, // Would need stat
        hardening,
        knownCves,
      });
    }
  }

  return results;
}

export function formatNativeAnalysis(libs: readonly NativeLibInfo[]): string {
  if (libs.length === 0) return 'No native libraries found.';

  const lines: string[] = [`Found ${libs.length} native libraries:\n`];

  for (const lib of libs) {
    const issues: string[] = [];
    if (lib.hardening.relro === 'none') issues.push('No RELRO');
    if (!lib.hardening.nx) issues.push('NX disabled');
    if (!lib.hardening.pie) issues.push('No PIE');
    if (!lib.hardening.stackCanary) issues.push('No stack canary');
    if (!lib.hardening.fortify) issues.push('No FORTIFY');

    const status = issues.length === 0 ? 'HARDENED' : `WEAK (${issues.join(', ')})`;
    lines.push(`  ${lib.path}: ${status}`);

    if (lib.knownCves.length > 0) {
      lines.push(`    Known CVEs: ${lib.knownCves.join(', ')}`);
    }
  }

  return lines.join('\n');
}
