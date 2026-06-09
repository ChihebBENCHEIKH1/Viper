# Viper Worker — Multi-stage build
# Stage 1: Build TypeScript
# Stage 2: Runtime with Android pentest tools

# === Stage 1: Builder ===
FROM node:20-slim AS builder

RUN npm install -g pnpm@10

WORKDIR /build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/tsconfig.json apps/worker/
COPY apps/worker/src/ apps/worker/src/

RUN pnpm install --frozen-lockfile
RUN pnpm run build --filter=@viper/worker

# === Stage 2: Runtime ===
FROM cgr.dev/chainguard/wolfi-base AS runtime

# Install system dependencies
RUN apk add --no-cache \
    nodejs-20 \
    npm \
    python3 \
    py3-pip \
    openjdk-17-jre \
    git \
    curl \
    unzip \
    bash

# Install Android platform-tools (ADB)
RUN curl -sL https://dl.google.com/android/repository/platform-tools-latest-linux.zip -o /tmp/platform-tools.zip && \
    unzip -q /tmp/platform-tools.zip -d /opt/ && \
    rm /tmp/platform-tools.zip
ENV PATH="/opt/platform-tools:${PATH}"

# Install JADX
ARG JADX_VERSION=1.5.1
RUN curl -sL "https://github.com/skylot/jadx/releases/download/v${JADX_VERSION}/jadx-${JADX_VERSION}.zip" -o /tmp/jadx.zip && \
    unzip -q /tmp/jadx.zip -d /opt/jadx/ && \
    chmod +x /opt/jadx/bin/jadx && \
    rm /tmp/jadx.zip
ENV PATH="/opt/jadx/bin:${PATH}"

# Install APKTool (vendored in build context — see vendor/; avoids flaky in-build downloads)
COPY vendor/apktool /usr/local/bin/apktool
COPY vendor/apktool.jar /usr/local/bin/apktool.jar
RUN chmod +x /usr/local/bin/apktool

# Install Frida tools (Android + iOS dynamic client)
RUN pip3 install --break-system-packages frida-tools objection

# Install mitmproxy
RUN pip3 install --break-system-packages mitmproxy

# === iOS static-analysis tooling (Linux-runnable) ===
# LIEF parses Mach-O (load commands, LC_ENCRYPTION_INFO/cryptid, symbols, libs);
# binutils provides nm/strings/objdump for the binary; Python stdlib `plistlib`
# reads binary + XML plists; unzip (above) extracts the .ipa.
# iOS DYNAMIC (Frida/objection on a jailbroken device) reuses the Frida client
# above + libimobiledevice when a device is attached — installed best-effort so
# the image still builds where those packages are unavailable.
RUN pip3 install --break-system-packages lief
RUN apk add --no-cache binutils && \
    (apk add --no-cache libimobiledevice ideviceinstaller libusbmuxd 2>/dev/null || \
     echo "NOTE: libimobiledevice not available — iOS USB/dynamic needs it; static analysis unaffected")

# Copy built worker
WORKDIR /app
COPY --from=builder /build/apps/worker/dist/ apps/worker/dist/
COPY --from=builder /build/apps/worker/package.json apps/worker/
COPY --from=builder /build/node_modules/ node_modules/
COPY apps/worker/prompts/ apps/worker/prompts/
COPY apps/worker/configs/ apps/worker/configs/

# Install production dependencies
RUN cd apps/worker && npm install --omit=dev 2>/dev/null || true

CMD ["node", "apps/worker/dist/temporal/worker.js"]
