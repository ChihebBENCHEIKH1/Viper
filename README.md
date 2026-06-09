# 🐍 Viper — AI Mobile Penetration Testing Framework

Viper is an autonomous **Android + iOS** mobile app pentester. You point it at an
app artifact; it decompiles/extracts it, then runs a six-phase pipeline of Claude
agents (static analysis → recon → vulnerability analysis → exploitation → report)
mapped to the OWASP Mobile Top 10 / MASVS, and writes a security report.

> **Defensive use only.** Run it only on apps you own or are explicitly authorized to test.

---

## What it supports

| | Android | iOS |
|---|---|---|
| **Artifact** | `.apk`, `.aab` | `.ipa` |
| **Static analysis** | ✅ JADX + APKTool decompile, manifest, taint analysis | ✅ unzip + `Info.plist`/entitlements, Mach-O (otool/LIEF), ATS, jailbreak/anti-debug |
| **Dynamic (Frida/Appium)** | ✅ Docker emulator **or** `--device usb` | ⚠️ requires a **jailbroken device** via `--device usb` (no iOS simulator on Linux) |
| **Auto-detected as** | `.apk`/`.aab` → `android` | `.ipa` → `ios` |

The platform is **auto-detected from the file extension** — you usually don't pass `--platform` at all.

---

## Prerequisites

1. **Docker** running (Docker Desktop or native engine). The worker runs in a container.
2. **Node 20** (the CLI needs ≥18; the bundled tools assume 20). If your system Node is old:
   ```bash
   nvm install 20 && nvm use 20      # or: export PATH="$HOME/.nvm/versions/node/v20.x.y/bin:$PATH"
   ```
3. **Claude credentials** (one of):
   - **Claude subscription (recommended, no API bill):** be logged in to Claude Code
     (`claude` CLI) on this machine, **or** mint a token:
     ```bash
     claude setup-token
     export CLAUDE_CODE_OAUTH_TOKEN=<token it prints>
     ```
     Viper bind-mounts your `~/.claude` into the worker, so a logged-in Claude Code "just works".
   - **API key:** create a `.env` in the repo root:
     ```bash
     echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
     ```
4. *(Android dynamic only)* Android `platform-tools` (`adb`) if you use `--device usb`.
5. *(iOS dynamic only)* `libimobiledevice` (`idevice_id`, `ideviceinstaller`) on the host + a jailbroken device.

---

## One-time setup

```bash
# from the repo root
./viper build        # builds the worker Docker image (JADX, APKTool, Frida, iOS static tools…)
```
This pulls a few GB and takes a few minutes the first time.

---

## Running a scan

```bash
# Android — emulator (default), black-box
./viper start -a ./app.apk

# Android — white-box with source, on a real USB device
./viper start -a ./app.apk -s ./android-project --device usb -w my-android-audit

# iOS — static analysis (auto-detected from .ipa), white-box with Swift source
./viper start -a ./app.ipa -s ./ios-app-source -w my-ios-audit

# iOS — dynamic, against a jailbroken device
./viper start -a ./app.ipa --device usb -w my-ios-dynamic
```

### `start` options
| Flag | Meaning |
|---|---|
| `-a, --apk <path>` | Artifact: `.apk`/`.aab` (Android) or `.ipa` (iOS) — **required** |
| `-s, --source <path>` | Source code → enables white-box review (recommended) |
| `--platform <android\|ios>` | Override auto-detection (rejected if it contradicts the file) |
| `--device <emulator\|usb>` | `emulator` (default, Android) or `usb` (real device) |
| `-w, --workspace <name>` | Named workspace (auto-resumes if it exists) |
| `-o, --output <path>` | Copy deliverables to this directory |
| `--pipeline-testing` | Minimal prompts for a fast/cheap smoke run |

---

## Watching it + getting results

```bash
./viper logs <workspace>     # tail the run
./viper status               # running workers
# Temporal UI:  http://localhost:8233
```

Deliverables land in `workspaces/<workspace>/deliverables/` (and in `-o <path>` if set).
The final report is `executive_report.md`.

```bash
./viper stop [--clean]       # tear down containers
```

---

## Notes & gotchas

- **iOS is static-only by default.** iOS *dynamic* instrumentation can't run in the
  Linux/Docker worker — it needs a jailbroken device over USB (`--device usb`). iOS
  static analysis of an `.ipa` runs fully in the worker. (You can't build an `.ipa`
  on Linux — produce it on macOS/CI first.)
- **Android emulator + Docker Desktop:** Docker Desktop's VM doesn't expose `/dev/kvm`,
  so the in-container Android emulator may fail to boot. Use **native Docker**, or boot
  an emulator on the host and run with `--device usb`.
- **Cost:** every phase calls Claude. Use your subscription (see auth) and/or
  `--pipeline-testing` for cheap smoke runs.
- **Model:** agent model tiers are set in `apps/worker/src/ai/models.ts`.

---

## Architecture (quick map)

```
apps/cli/      @viper/cli      — CLI: platform detection, docker orchestration
apps/worker/   @viper/worker   — Temporal worker, 6-phase pipeline, Claude agents, prompts
```
- Platform is a single discriminator (`android` | `ios`) threaded from the CLI through
  the worker to the prompts and MCP server selection (`apps/worker/src/types/platform.ts`).
- Agent prompts live in `apps/worker/prompts/` with per-platform shared partials
  (`shared/_ios-attacks.txt`, `shared/_android-frida-patterns.txt`, …).
