#!/bin/bash
# Quick Viper test — runs static analysis directly via Claude CLI
# No Docker or Temporal needed. Just claude CLI + JADX/APKTool.

set -e

APK_PATH="${1:-workspaces/offmon.apk}"
SOURCE_PATH="${2:-}"
WORKSPACE="workspaces/test-$(date +%s)"

echo ""
echo "  ██╗   ██╗██╗██████╗ ███████╗██████╗ "
echo "  ██║   ██║██║██╔══██╗██╔════╝██╔══██╗"
echo "  ██║   ██║██║██████╔╝█████╗  ██████╔╝"
echo "  ╚██╗ ██╔╝██║██╔═══╝ ██╔══╝  ██╔══██╗"
echo "   ╚████╔╝ ██║██║     ███████╗██║  ██║"
echo "    ╚═══╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝"
echo ""
echo "  Quick Test Mode — Static Analysis via Claude CLI"
echo ""

# Check prerequisites
if ! command -v claude &> /dev/null; then
    echo "ERROR: claude CLI not found. Install Claude Code first."
    exit 1
fi

if [ ! -f "$APK_PATH" ]; then
    echo "ERROR: APK not found at $APK_PATH"
    echo "Usage: ./run-test.sh <path-to-apk> [path-to-source]"
    exit 1
fi

# Create workspace
mkdir -p "$WORKSPACE/decompiled"
mkdir -p "$WORKSPACE/deliverables"

echo "  APK:       $(realpath "$APK_PATH")"
echo "  Workspace: $WORKSPACE"
if [ -n "$SOURCE_PATH" ]; then
    echo "  Source:    $SOURCE_PATH"
fi
echo ""

# Build the prompt — inline static analysis instructions
PROMPT="You are a Mobile Application Static Analysis Specialist performing a security audit.

## Target
APK: $(realpath "$APK_PATH")
Decompiled output will be in: $(realpath "$WORKSPACE/decompiled")/

## Instructions

1. First, decompile the APK:
   - Run: jadx -d \"$(realpath "$WORKSPACE/decompiled")/jadx/\" \"$(realpath "$APK_PATH")\" || true
   - If jadx is not installed, try: apktool d -f -o \"$(realpath "$WORKSPACE/decompiled")/apktool/\" \"$(realpath "$APK_PATH")\" || true
   - If neither works, use the Android SDK build-tools or any available decompiler.

2. If decompilation tools aren't available, analyze the APK directly:
   - unzip -l the APK to see contents
   - Use aapt or aapt2 to dump the manifest: aapt dump badging \"$(realpath "$APK_PATH")\"

3. Analyze AndroidManifest.xml for:
   - Exported components (activities, services, receivers, providers)
   - Permissions requested (identify unused/excessive)
   - Deep links, intent filters
   - allowBackup, debuggable flags
   - network_security_config reference

4. Search decompiled source for dangerous patterns:
   - Hardcoded secrets (grep for API keys, tokens, passwords)
   - Insecure SharedPreferences usage (plaintext sensitive data)
   - SQL injection in ContentProviders (rawQuery with string concat)
   - WebView with JavaScript enabled + addJavascriptInterface
   - Weak cryptography (DES, ECB, MD5 for security, hardcoded keys)
   - Insecure HTTP connections (no HTTPS)
   - Logging of sensitive data (Log.d with tokens/passwords)

5. Map findings to OWASP Mobile Top 10 2024:
   M1: Improper Credential Usage
   M3: Insecure Authentication
   M4: Insufficient Input Validation
   M5: Insecure Communication
   M9: Insecure Data Storage
   M10: Insufficient Cryptography

$(if [ -n "$SOURCE_PATH" ]; then echo "6. ALSO read the actual source code at: $SOURCE_PATH
   Cross-reference with decompiled output for deeper analysis."; fi)

## Output

Save your complete findings report to: $(realpath "$WORKSPACE/deliverables")/static_analysis_deliverable.md

Format each finding as:
- **Code location**: file:line
- **Sink**: The dangerous function call
- **Risk**: CRITICAL / HIGH / MEDIUM / LOW
- **OWASP Category**: M1-M10
- **Description**: What the vulnerability is
- **Impact**: What an attacker could do

Be thorough. This is a real security assessment."

echo "  Starting static analysis with Claude CLI..."
echo "  This may take a few minutes..."
echo ""

# Run via Claude CLI
claude --model claude-sonnet-4-6 \
  --max-turns 50 \
  --verbose \
  --dangerously-skip-permissions \
  -p "$PROMPT" 2>&1 | while IFS= read -r line; do
    # Parse JSON lines for progress
    if echo "$line" | python3 -c "import sys,json; msg=json.load(sys.stdin); t=msg.get('type','')
if t=='tool_use': print(f'  🔧 {msg.get(\"name\",\"\")}')
elif t=='result':
    print(f'')
    print(f'  ✅ Analysis complete!')
    print(f'  Cost: \${msg.get(\"total_cost_usd\",0):.2f}')
    print(f'  Duration: {msg.get(\"duration_ms\",0)/1000:.1f}s')
" 2>/dev/null; then
      true
    fi
done

echo ""
if [ -f "$WORKSPACE/deliverables/static_analysis_deliverable.md" ]; then
    echo "  📄 Report saved to: $WORKSPACE/deliverables/static_analysis_deliverable.md"
    echo ""
    echo "  Preview:"
    head -30 "$WORKSPACE/deliverables/static_analysis_deliverable.md"
else
    echo "  Report may be in the workspace. Check: $WORKSPACE/"
    echo "  Also check if Claude wrote the file with a different name:"
    ls -la "$WORKSPACE/deliverables/" 2>/dev/null || echo "  (deliverables dir empty)"
fi
