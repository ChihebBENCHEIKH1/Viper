# CLAUDE.md

AI-powered penetration testing agent for Android native applications. Automates vulnerability assessment by combining static analysis (JADX, APKTool) with dynamic testing (Frida, Appium) and AI-powered exploitation.

## Commands

**Prerequisites:** Docker (with KVM support), AI provider credentials (`.env` for local, `viper setup` or env vars for npx)

```bash
# Setup
echo "ANTHROPIC_API_KEY=your-key" > .env

# Build worker image (includes JADX, APKTool, Frida, ADB, mitmproxy)
./viper build

# Run pentest
./viper start -a ./app.apk                              # Black-box (APK only)
./viper start -a ./app.apk -s ./android-project          # White-box (APK + source)
./viper start -a ./app.apk -c config.yaml -w my-audit    # With config + named workspace

# Monitor
./viper logs my-audit
./viper status
# Temporal Web UI: http://localhost:8233

# Stop
./viper stop
./viper stop --clean
```

**Monorepo tooling:** pnpm workspaces, Turborepo for task orchestration, Biome for linting/formatting.

## Architecture

### Monorepo Layout

```
apps/cli/        — @viper/cli (published to npm, bundled with tsdown)
apps/worker/     — @viper/worker (private, Temporal worker + pipeline logic)
```

### Six-Phase Pipeline

1. **Static Analysis** (`static-analysis`) — JADX + APKTool decompilation, code review, manifest analysis
2. **Recon** (`recon`) — Attack surface mapping from static findings + runtime enumeration
3. **Vulnerability Analysis** (5 parallel agents) — storage, crypto, auth, network, injection — mapped to OWASP Mobile Top 10 2024
4. **Exploitation** (5 parallel agents, conditional) — Prove vulnerabilities with PoCs using Frida + Appium + mitmproxy
5. **Reporting** (`report`) — Executive security report with CVSS scores
6. **Cleanup** — Emulator teardown, log archival

### MCP Servers
- `appium-mcp` — UI automation on Android emulator
- `frida-mcp` — Runtime instrumentation, method hooking, SSL pinning bypass
- `android-mcp` — ADB device control, file pull, logcat

### Key Files

**CLI:** `apps/cli/src/index.ts` (dispatcher), `apps/cli/src/commands/start.ts`
**Entry Points:** `apps/worker/src/temporal/workflows.ts`, `apps/worker/src/temporal/shared.ts`
**Core Logic:** `apps/worker/src/session-manager.ts`, `apps/worker/src/services/agent-execution.ts`, `apps/worker/src/ai/mcp-config.ts`
**Prompts:** `apps/worker/prompts/` (13 agent prompts + shared partials)
**Config:** `docker-compose.yml`, `apps/worker/configs/`

### Docker Architecture
- `viper-temporal` — Temporal workflow server (ports 7233, 8233)
- `viper-emulator` — Rooted Android emulator with Frida + mitmproxy CA (ports 5555, 6080, 27042, 8080)
- `viper-worker-XXXX` — Ephemeral worker per scan (JADX, APKTool, ADB, Frida client, Node.js)

## Development Notes

### Adding a New Agent
1. Define in `apps/worker/src/session-manager.ts` (AGENTS record)
2. Add type to `apps/worker/src/types/agents.ts` (ALL_AGENTS)
3. Create prompt in `apps/worker/prompts/`
4. Register in `apps/worker/src/temporal/workflows.ts`

### Prompt Engineering Patterns
- **Backward taint analysis**: Trace from dangerous sinks, not entry points
- **@include directives**: Shared partials in `prompts/shared/`
- **Variable interpolation**: `{{APK_PATH}}`, `{{PACKAGE_NAME}}`, `{{EMULATOR_HOST}}`, etc.
- **Structured output**: JSON exploitation queues consumed by exploit agents
- **Evidence standards**: 4-level proof system (POTENTIAL → CONFIRMED → EXPLOITED → CRITICAL)
- `--pipeline-testing` for fast iteration with minimal prompts

### Key Design Patterns
- **Result<T, E>** for explicit error handling (no exceptions in services)
- **Services boundary** — activities are thin Temporal wrappers; services own business logic
- **DI Container** — per-workflow in `services/container.ts`. AuditSession excluded (parallel safety)
- **Phase-pipelined execution** — vuln+exploit pairs run as pipelines, not synchronized batches

## Code Style Guidelines

Biome handles formatting and linting. Run `pnpm biome:fix`. Config: single quotes, semicolons, trailing commas, 2-space indent, 120 char line width.

- Use `function` keyword for top-level functions
- Explicit return types on exported functions
- `exactOptionalPropertyTypes` enabled — use spread for optional props
- Comments must be timeless — no references to this conversation or the AI
- Numbered sequential steps for multi-phase functions (see `agent-execution.ts`)

## Security
Defensive security tool only. Use only on applications you own or have explicit permission to test.
