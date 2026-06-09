const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ROOT, RESULTS_DIR } = require('./paths');
const {
  runNpmAudit,
  runOsvScanner,
  runRetireJs,
  runLockfileIntegrity,
  runBetterNpmAudit,
} = require('./scanners');

const BENCHMARK_DIR = path.join(RESULTS_DIR, 'benchmark');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stable(obj) {
  return JSON.stringify(obj, null, 2);
}

async function runAllScanners(phase) {
  console.log(`\n--- Running scanners (${phase}) ---\n`);
  const results = {};

  const runners = [
    ['npm-audit', () => runNpmAudit()],
    ['osv-scanner', () => runOsvScanner()],
    ['retire-js', () => runRetireJs()],
    ['better-npm-audit', () => runBetterNpmAudit()],
    ['lockfile-integrity', () => runLockfileIntegrity()],
  ];

  for (const [key, runner] of runners) {
    process.stdout.write(`  ${key}... `);
    try {
      results[key] = await runner();
      console.log('OK');
    } catch (error) {
      results[key] = { error: error.message };
      console.log(`FAILED (${error.message})`);
    }
  }

  const outDir = path.join(BENCHMARK_DIR, phase);
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, 'summary.json'), stable(results), 'utf8');
  return results;
}

function comparePhase(before, after) {
  const rows = [];
  for (const key of Object.keys(before)) {
    const b = before[key];
    const a = after[key];
    if (b.error || a.error) {
      rows.push({ key, tool: b.tool ?? key, error: b.error || a.error, detectTampering: 'N/A' });
      continue;
    }

    const sameCount = b.totalVulns === a.totalVulns;
    const samePackages = stable(b.packages ?? []) === stable(a.packages ?? []);
    const identical = sameCount && samePackages;

    let detectTampering = '否';
    if (key === 'lockfile-integrity') {
      detectTampering = a.tampered && !b.tampered ? '是（文件哈希变化）' : b.tampered === a.tampered ? '否' : '部分';
    } else if (!identical) {
      detectTampering = '结果有变化（需人工复核）';
    }

    rows.push({
      key,
      tool: b.tool,
      type: b.type,
      scanTarget: b.scanTarget,
      beforeTotal: b.totalVulns,
      afterTotal: a.totalVulns,
      beforeHigh: b.high,
      afterHigh: a.high,
      identical,
      detectTampering,
      before: b,
      after: a,
    });
  }
  return rows;
}

function generateReport(rows, meta) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push('# 供应链扫描工具对比实验报告');
  lines.push('');
  lines.push(`> 生成日期：${date}  |  项目：sca-blindspot-demo  |  依赖：lodash@4.17.15`);
  lines.push('');
  lines.push('## 1. 实验目的');
  lines.push('');
  lines.push('验证常见供应链扫描工具在 **本地篡改 `node_modules` 源码（植入后门、包名与版本不变）** 场景下的检测能力。');
  lines.push('');
  lines.push('## 2. 实验方法');
  lines.push('');
  lines.push('| 步骤 | 操作 |');
  lines.push('|------|------|');
  lines.push('| 1 | 安装 `lodash@4.17.15`，运行各扫描工具（**篡改前**） |');
  lines.push('| 2 | 在 `node_modules/lodash/lodash.js` 末尾注入演示后门（弹窗 + marker 文件） |');
  lines.push('| 3 | 再次运行各扫描工具（**篡改后**） |');
  lines.push('| 4 | 对比两次结果；`npm run demo` 验证后门可执行 |');
  lines.push('');
  lines.push('**篡改不影响**：`package.json` 版本号、`package-lock.json`、包 metadata。');
  lines.push('');
  lines.push('## 3. 测试工具');
  lines.push('');
  lines.push('| 工具 | 类型 | 扫描对象 |');
  lines.push('|------|------|----------|');

  for (const row of rows) {
    if (row.type) {
      lines.push(`| ${row.tool} | ${row.type} | ${row.scanTarget ?? '-'} |`);
    }
  }

  lines.push('');
  lines.push('## 4. 对比结果');
  lines.push('');
  lines.push('| 工具 | 篡改前漏洞数 | 篡改后漏洞数 | 结果是否相同 | 能否发现源码篡改 |');
  lines.push('|------|-------------|-------------|-------------|-----------------|');

  for (const row of rows) {
    if (row.error) {
      lines.push(`| ${row.tool ?? row.key} | - | - | - | 运行失败：${row.error} |`);
      continue;
    }
    lines.push(
      `| ${row.tool} | ${row.beforeTotal} | ${row.afterTotal} | ${row.identical ? '**是**' : '**否**'} | ${row.detectTampering} |`
    );
  }

  lines.push('');
  lines.push('## 5. 分项说明');
  lines.push('');

  for (const row of rows) {
    if (row.error) continue;
    lines.push(`### ${row.tool}`);
    lines.push('');
    lines.push(`- **类型**：${row.type}`);
    lines.push(`- **扫描对象**：${row.scanTarget}`);
    lines.push(`- **篡改前**：total=${row.beforeTotal}, high=${row.beforeHigh ?? 'N/A'}`);
    lines.push(`- **篡改后**：total=${row.afterTotal}, high=${row.afterHigh ?? 'N/A'}`);
    lines.push(`- **能否发现篡改**：${row.detectTampering}`);

    if (row.key === 'better-npm-audit') {
      lines.push(`- **说明**：better-npm-audit 是 npm audit 的 CLI 封装，底层使用相同 advisory 数据，结果与 npm audit 一致。`);
    }
    if (row.key === 'retire-js') {
      lines.push(`- **说明**：Retire.js 读取 \`node_modules\` 内 JS 文件内容识别库版本，但仍仅匹配**已知 CVE 版本范围**，不会识别任意植入的后门代码。`);
    }
    if (row.key === 'lockfile-integrity') {
      lines.push(`- **说明**：通过 SHA-256 对比 ` + '`lodash.js`' + ` 与备份文件，**能证明文件被修改**；但这是完整性校验，不是 SCA 漏洞扫描。`);
      if (row.after?.lodashSha256) {
        lines.push(`- **篡改后 lodash.js SHA-256**：\`${row.after.lodashSha256.slice(0, 32)}…\``);
      }
    }
    lines.push('');
  }

  lines.push('## 6. 结论');
  lines.push('');
  lines.push('1. **依赖型 SCA 工具**（npm audit、better-npm-audit、OSV-Scanner）仅基于 **包名 + 版本号** 匹配已知漏洞 advisory，篡改前后扫描结果 **完全相同**，**无法发现**本地源码植入的后门。');
  lines.push('2. **Retire.js** 虽扫描 `node_modules` **文件内容**，但目的是识别库版本并匹配已知 CVE，**同样无法发现**任意后门代码；篡改前后漏洞计数不变。');
  lines.push('3. **Lockfile / 文件哈希校验**（对照组）能发现 `lodash.js` 被修改，属于 **完整性层**，与 SCA 是不同安全能力，**不能替代**恶意代码检测。');
  lines.push('4. 实验中后门可通过 `npm run demo` 触发 **系统弹窗**，证明威胁真实存在，而上述 SCA 工具均未报警。');
  lines.push('');
  lines.push('## 7. 复现命令');
  lines.push('');
  lines.push('```bash');
  lines.push('npm install');
  lines.push('npm run benchmark    # 运行本报告对应的全部扫描对比');
  lines.push('npm run demo         # 验证弹窗后门');
  lines.push('```');
  lines.push('');
  lines.push('原始 JSON 数据：`results/benchmark/before/summary.json` 与 `results/benchmark/after/summary.json`');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*报告由 \`scripts/benchmark.js\` 自动生成（Node ${process.version}，${meta.platform}）*`);

  return lines.join('\n');
}

async function runQuickExperiment() {
  console.log('SCA Blindspot Demo — npm audit quick experiment');
  console.log('==============================================\n');

  execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/tamper.js restore', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/audit.js before', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/tamper.js inject', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/audit.js after', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/compare-audit.js', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/verify-backdoor.js', { cwd: ROOT, stdio: 'inherit' });

  console.log('\nOptional: npm run benchmark — multi-tool comparison');
  console.log('Optional: npm run demo — GUI popup demo\n');
}

async function main() {
  if (process.argv.includes('--quick')) {
    ensureDir(RESULTS_DIR);
    await runQuickExperiment();
    return;
  }

  ensureDir(BENCHMARK_DIR);

  console.log('SCA Tool Benchmark — multi-scanner comparison');
  console.log('============================================');

  execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/tamper.js restore', { cwd: ROOT, stdio: 'inherit' });

  const before = await runAllScanners('before');

  execSync('node scripts/tamper.js inject', { cwd: ROOT, stdio: 'inherit' });

  const after = await runAllScanners('after');

  const rows = comparePhase(before, after);
  fs.writeFileSync(path.join(BENCHMARK_DIR, 'comparison.json'), stable(rows), 'utf8');

  const report = generateReport(rows, { platform: process.platform });
  const reportPath = path.join(ROOT, 'REPORT.md');
  fs.writeFileSync(reportPath, report, 'utf8');

  console.log('\n============================================');
  console.log('Benchmark complete.');
  console.log(`Report: ${reportPath}`);
  console.log(`Data:   ${BENCHMARK_DIR}/before|after/summary.json`);
  console.log('============================================\n');

  for (const row of rows) {
    if (row.error) {
      console.log(`  [FAIL] ${row.key}: ${row.error}`);
    } else {
      console.log(
        `  ${row.tool}: ${row.beforeTotal} -> ${row.afterTotal}  ` +
          `identical=${row.identical}  tampering=${row.detectTampering}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
