/**
 * Splash screen with ASCII art branding.
 */

const GOLD = '\x1b[33m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

export function displaySplash(version?: string): void {
  const ver = version ? ` v${version}` : '';

  console.log(`
${GREEN}${BOLD}  ██╗   ██╗██╗██████╗ ███████╗██████╗${RESET}
${GREEN}${BOLD}  ██║   ██║██║██╔══██╗██╔════╝██╔══██╗${RESET}
${GREEN}${BOLD}  ██║   ██║██║██████╔╝█████╗  ██████╔╝${RESET}
${GREEN}${BOLD}  ╚██╗ ██╔╝██║██╔═══╝ ██╔══╝  ██╔══██╗${RESET}
${GREEN}${BOLD}   ╚████╔╝ ██║██║     ███████╗██║  ██║${RESET}
${GREEN}${BOLD}    ╚═══╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝${RESET}

${CYAN}  AI Android Penetration Testing Framework${ver ? ` ${GRAY}${ver}` : ''}${RESET}

  ${GRAY}╔═══════════════════════════════════════════════╗${RESET}
  ${GRAY}║${RESET}  ${BOLD}Autonomous mobile security testing powered${RESET}   ${GRAY}║${RESET}
  ${GRAY}║${RESET}  ${BOLD}by Claude • Frida • Appium • JADX${RESET}            ${GRAY}║${RESET}
  ${GRAY}╚═══════════════════════════════════════════════╝${RESET}

  ${RED}🔒 DEFENSIVE SECURITY ONLY — Authorized testing only 🔒${RESET}
`);
}
