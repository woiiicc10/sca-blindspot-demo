# SCA Blindspot Demo

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](package.json)

**A reproducible lab showing that common SCA tools match CVEs by package name + version — not by actual code in `node_modules`.**

[中文说明](#中文说明) · [Full report (中文)](实验报告.md)

---

## Overview

Software Composition Analysis (SCA) tools such as `npm audit` are widely used in CI/CD pipelines. They answer:

> *Does this project depend on packages with **known** vulnerabilities?*

They do **not** answer:

> *Has the installed code in `node_modules` been tampered with?*

This repository demonstrates that gap with a controlled experiment:

1. Pin a vulnerable dependency (`lodash@4.17.15`)
2. Run multiple scanners **before** tampering
3. Inject a demo backdoor into `node_modules/lodash/lodash.js`
4. Run the same scanners **after** tampering
5. Compare results — SCA output stays the same; the backdoor still runs

**Takeaway:** passing `npm audit` does not mean your dependencies are trustworthy.

## Key findings

| Tool | Detects tampering? | Notes |
|------|:------------------:|-------|
| npm audit | No | Advisory lookup by package + version |
| OSV-Scanner (OSV API) | No | Same class as npm audit |
| Retire.js | No | Scans file content, but only for **known CVE version ranges** |
| better-npm-audit | No | Wrapper around npm audit |
| File hash check (control) | **Yes** | Integrity layer, not SCA |

## Requirements

- Node.js **≥ 18**
- npm
- Network access (for `npm install`, OSV API, and `npx retire`)

## Quick start

```bash
git clone https://github.com/woiiicc10/sca-blindspot-demo.git
cd sca-blindspot-demo
npm install
```

**Option A — full multi-tool benchmark (recommended):**

```bash
npm run benchmark
```

**Option B — quick npm audit only:**

```bash
npm run experiment
```

**Option C — visual demo (popup on Windows/macOS):**

```bash
npm run tamper    # inject demo backdoor if not already present
npm run demo      # require('lodash') → system warning dialog
```

## Expected output

After `npm run benchmark`, you should see:

```
  npm audit: 1 -> 1  identical=true  tampering=否
  OSV-Scanner（OSV API）: 6 -> 6  identical=true  tampering=否
  Retire.js: 6 -> 6  identical=true  tampering=否
  better-npm-audit: 1 -> 1  identical=true  tampering=否
  Lockfile Integrity（对照组）: 0 -> 1  identical=false  tampering=是（文件哈希变化）
```

- SCA tools report the **same** vulnerability counts before and after tampering
- The integrity control detects that `lodash.js` was modified
- A summary is written to `REPORT.md` (local, gitignored)
- Raw JSON: `results/benchmark/before/summary.json` and `results/benchmark/after/summary.json`

## How it works

```
 package.json / package-lock.json
         │
         ▼
   SCA tools ──► advisory DB ──► known CVEs for lodash@4.17.15
         │
         ✗ does not inspect node_modules file contents for backdoors
         │
  manual tamper of node_modules/lodash/lodash.js
         │
         ▼
   SCA results unchanged  ·  backdoor still executes on require()
```

The demo backdoor is appended to `lodash.js`. It:

- Does **not** change `package.json` or `package-lock.json`
- Shows a system dialog on Windows/macOS when lodash is loaded (`npm run demo`)
- Uses `SCA_DEMO_SILENT=1` during automated runs to skip the GUI

## Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | Install dependencies |
| `npm run benchmark` | Multi-tool scan before/after tampering + generate `REPORT.md` |
| `npm run experiment` | Quick npm audit-only flow |
| `npm run tamper` | Inject demo backdoor into lodash |
| `npm run restore` | Restore original `lodash.js` from backup |
| `npm run demo` | Simulate an app loading lodash (triggers popup) |
| `npm run audit:before` | Save pre-tamper `npm audit` JSON |
| `npm run audit:after` | Save post-tamper `npm audit` JSON |
| `npm run compare` | Diff audit before/after |
| `npm run verify:backdoor` | Verify backdoor runs (silent mode) |
| `npm run verify:integrity` | Control: file hash + `npm ci` behavior |

## Project structure

```
sca-blindspot-demo/
├── demo/app.js              # Sample app that requires lodash
├── scripts/
│   ├── benchmark.js         # Multi-tool benchmark orchestrator
│   ├── tamper.js            # Inject / restore backdoor
│   ├── scanners/            # Scanner adapters
│   └── ...
├── 实验报告.md               # Full experiment write-up (Chinese)
├── package.json             # lodash@4.17.15
└── results/                 # Generated locally (gitignored)
```

## Mitigations

SCA alone is not enough. Consider layering:

- **Lockfile + `npm ci`** — tarball integrity on reinstall
- **Provenance / Sigstore** — verify package origin
- **Behavior analysis** (e.g. Socket.dev) — complement traditional SCA
- **Least privilege & code review** — defense in depth

## Security notice

This repo contains **intentional demo backdoor code** injected into `node_modules` for local research only.

- Do **not** publish tampered `node_modules` to npm or any registry
- Do **not** use the backdoor pattern in production code
- After experiments: `npm run restore` or `rm -rf node_modules && npm ci`

## License

[MIT](LICENSE)

---

## 中文说明

### 项目简介

本仓库是一个可复现的供应链安全实验：**主流 SCA 工具（npm audit、OSV-Scanner、Retire.js 等）仅根据「包名 + 版本号」匹配已知 CVE，无法检测对 `node_modules` 的本地源码篡改。**

即使手动植入可执行的后门，扫描结果依然不变。

### 快速开始

```bash
git clone https://github.com/woiiicc10/sca-blindspot-demo.git
cd sca-blindspot-demo
npm install
npm run benchmark    # 多工具对比（推荐）
npm run demo         # 弹窗演示
```

### 文档

- **[实验报告.md](实验报告.md)** — 完整实验报告（背景、方法、结果、分析）
- **`REPORT.md`** — 运行 benchmark 后本地自动生成的摘要（不提交到 Git）

### 结论摘要

1. **SCA ≠ 代码完整性校验** — audit 只回答「是否用了有 CVE 的版本」
2. **Retire.js 也防不住任意后门** — 它读文件是为了识别版本，不是恶意代码检测
3. **完整性校验（哈希 / npm ci）** 属于另一安全层，与 SCA 互补

完整分析见 [实验报告.md](实验报告.md)。
