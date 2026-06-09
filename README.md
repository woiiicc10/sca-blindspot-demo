# SCA Blindspot Demo

**证明：主流 SCA 工具（以 `npm audit` 为例）仅根据「包名 + 版本号」匹配已知漏洞，不检查本地 `node_modules` 中的代码是否被篡改。**

即使手动在第三方库源码中植入后门，`npm audit` 的扫描结果依然不变。

---

## 实验假设

| 维度 | 内容 |
|------|------|
| **H0（零假设）** | SCA 会检测本地源码篡改，篡改后扫描结果会变化 |
| **H1（备择假设）** | SCA 只做 advisory 匹配（包名+版本），篡改后结果不变 |
| **预期结论** | 支持 H1 — `npm audit` 输出 before/after 完全一致 |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 一键运行（二选一）
npm run experiment   # 快速：仅 npm audit 对比
npm run benchmark    # 完整：多工具对比 + 生成 REPORT.md
```

实验会自动：

1. 安装 `lodash@4.17.15`（含已知 CVE 的旧版本）
2. 运行 `npm audit`，保存 `results/audit-before.json`
3. 在 `node_modules/lodash/lodash.js` 末尾注入演示用后门
4. 再次运行 `npm audit`，保存 `results/audit-after.json`
5. 对比两份报告（应完全相同）
6. 验证后门确实能执行（证明威胁真实存在）

## 分步命令

```bash
npm run setup              # npm install
npm run audit:before       # 篡改前 audit
npm run tamper             # 注入后门
npm run audit:after        # 篡改后 audit
npm run compare            # 对比 JSON 报告
npm run verify:backdoor    # 证明后门可触发（静默模式，写 marker 文件）
npm run verify:integrity   # 对照：npm ci 能发现篡改（可选）
npm run demo               # 模拟正常应用加载 lodash → 弹出警告窗
npm run restore            # 从备份恢复 lodash.js
npm run benchmark          # 多工具对比扫描 + 自动生成 REPORT.md
```

## 多工具对比报告

运行 `npm run benchmark` 会对比以下工具在篡改前后的扫描结果，并生成 **[REPORT.md](REPORT.md)**：

| 工具 | 类型 |
|------|------|
| npm audit | 依赖型 SCA（npm Advisory DB） |
| OSV-Scanner（OSV API） | 依赖型 SCA（OSV 数据库） |
| Retire.js | 文件内容 SCA（扫描 node_modules 源码） |
| better-npm-audit | npm audit CLI 封装 |
| Lockfile Integrity | 完整性对照组（SHA-256） |

原始数据：`results/benchmark/before/summary.json` 与 `results/benchmark/after/summary.json`（运行 `npm run benchmark` 后本地生成）

完整实验报告见 **[实验报告.md](实验报告.md)**；`REPORT.md` 为 benchmark 自动生成的摘要（不纳入版本库）。


## 实验设计

```
┌─────────────────────────────────────────────────────────────┐
│  package.json          lodash@4.17.15  (固定版本)            │
│  package-lock.json     integrity hash (安装时校验)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  npm audit                                                   │
│  ┌──────────────┐    advisory DB     ┌──────────────────┐   │
│  │ 包名+版本号   │ ───────────────►  │ 已知 CVE/GHSA    │   │
│  └──────────────┘                    └──────────────────┘   │
│         ✗ 不读取 node_modules 源码内容                       │
└─────────────────────────────────────────────────────────────┘
                              │
         手动篡改 node_modules/lodash/lodash.js
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  npm audit 结果 → 不变（本 demo 的核心结论）                  │
└─────────────────────────────────────────────────────────────┘
```

### 为什么选 lodash@4.17.15？

- 广泛使用，认知度高
- 该版本在 advisory 数据库中有已知漏洞（Prototype Pollution 等）
- 篡改前后都有非零漏洞报告，对比更直观

### 注入的后门是什么？

在 `lodash.js` 末尾追加一段**仅用于演示**的代码。当任何程序 `require('lodash')` 时：

- **Windows / macOS**：弹出系统警告对话框
- **Linux**：在 stderr 输出提示（无 GUI）

弹窗内容示例：

> lodash 已被篡改植入后门！  
> npm audit 仅匹配「包名 + 版本号」，无法检测 node_modules 中的源码篡改。

**不修改** `package.json` 版本号，**不修改** `package-lock.json`，因此 `npm audit` 结果不变。

#### 演示弹窗（推荐用于答辩/展示）

```bash
npm run tamper    # 注入后门（若尚未注入）
npm run demo      # 模拟正常业务代码 require('lodash') → 弹窗出现
```

自动化实验使用 `SCA_DEMO_SILENT=1` 跳过弹窗，避免阻塞流水线。

## 预期输出示例

```
=== npm audit comparison (before vs after tampering) ===

Summary (metadata.vulnerabilities):
  before: { info: 0, low: 0, moderate: 1, high: 1, critical: 0, total: 2 }
  after : { info: 0, low: 0, moderate: 1, high: 1, critical: 0, total: 2 }
  match : YES

Advisory entries:
  before count: 1
  after count : 1
  match       : YES

CONCLUSION: npm audit output is IDENTICAL after local source tampering.
SCA matched package name + version only — it did not inspect modified code.
```

## 对照实验：什么能发现篡改？

| 机制 | 能否发现本地篡改 | 说明 |
|------|------------------|------|
| `npm audit` | ❌ 不能 | 仅查 advisory 数据库 |
| `npm ci` + lockfile integrity | ✅ 能（重装时） | 删除并重装 `node_modules`，用 tarball 哈希校验；不会报警，而是静默覆盖篡改 |
| Socket.dev / Phylum 等 | ⚠️ 部分能 | 行为/内容分析，非传统 SCA |
| 文件完整性监控 | ✅ 能 | 独立安全层 |

运行对照实验：

```bash
npm run tamper
npm run verify:integrity
```

## 结论与启示

1. **SCA ≠ 代码完整性校验** — SCA 解决的是「是否使用了有已知漏洞的版本」，不是「代码是否可信」。
2. **供应链攻击有两个盲区**：
   - 同版本本地篡改（本实验）
   - 恶意包尚未进入 advisory 数据库（Typosquatting、账号劫持）
3. **缓解需分层**：lockfile + `npm ci`、provenance/sigstore、行为分析工具、最小权限、代码审查。

## 扩展实验（加分项）

同一项目可对比其他工具，预期结果类似：

```bash
npx snyk test                    # Snyk CLI
# OWASP Dependency-Check 扫描 package-lock.json
# GitHub Dependabot — push 后观察 PR
```

## 开源贡献说明

本仓库可作为：

- 可复现的安全教育 demo
- 向社区文档补充「SCA 能力边界」的 PR 素材（npm docs、OWASP wiki 等）
- 课程/作业实验报告的可验证附件

## 安全声明

- 后门代码**仅供本地实验**，请勿发布到 npm 或任何公共仓库的 `node_modules`
- 实验结束后运行 `npm run restore` 或 `rm -rf node_modules && npm ci` 恢复

## 目录结构

```
sca-blindspot-demo/
├── package.json              # 依赖 lodash@4.17.15
├── package-lock.json         # 含 integrity 哈希
├── demo/
│   └── app.js                # 模拟正常应用，触发弹窗
├── scripts/
│   ├── benchmark.js            # 多工具 benchmark（--quick 为 npm audit 快速实验）
│   ├── audit.js                # 保存 audit JSON
│   ├── tamper.js               # 注入/恢复后门
│   ├── backdoor-snippet.js     # 弹窗后门代码生成
│   ├── compare-audit.js        # 对比 npm audit 报告
│   ├── verify-backdoor.js      # 验证后门执行
│   ├── verify-integrity.js     # 完整性对照实验
│   └── scanners/               # 各扫描工具适配
├── 实验报告.md                  # 完整实验报告（作业用）
├── results/                    # 实验输出（gitignore，本地生成）
└── README.md
```

## License

MIT

---

## English Summary

This demo shows that **npm audit matches CVEs by package name and version only**. Manually injecting a backdoor into `node_modules/lodash/lodash.js` does not change audit results. Run `npm run experiment` to reproduce. See the comparison table above for what *does* detect tampering (e.g. `npm ci` integrity checks).
