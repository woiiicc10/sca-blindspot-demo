const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const { ROOT, LODASH_MAIN } = require('../paths');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function runNpmAudit() {
  let stdout;
  try {
    stdout = execSync('npm audit --json', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    stdout = error.stdout || '';
    if (!stdout) throw error;
  }
  const report = JSON.parse(stdout);
  const summary = report.metadata?.vulnerabilities ?? {};
  const packages = Object.keys(report.vulnerabilities ?? {});
  return {
    tool: 'npm audit',
    type: '依赖型 SCA（npm Advisory DB）',
    scanTarget: 'package-lock.json / 依赖树',
    totalVulns: summary.total ?? 0,
    high: summary.high ?? 0,
    moderate: summary.moderate ?? 0,
    packages,
    rawSummary: summary,
  };
}

function queryOsv(packageName, version) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      package: { name: packageName, ecosystem: 'npm' },
      version,
    });
    const req = https.request(
      {
        hostname: 'api.osv.dev',
        path: '/v1/query',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runOsvScanner() {
  const lockPath = path.join(ROOT, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const pkg = lock.packages?.['node_modules/lodash'];
  const name = 'lodash';
  const version = pkg?.version ?? lock.dependencies?.lodash?.version ?? '4.17.15';

  const response = await queryOsv(name, version);
  const vulns = response.vulns ?? [];

  return {
    tool: 'OSV-Scanner（OSV API）',
    type: '依赖型 SCA（OSV 数据库）',
    scanTarget: `package-lock.json → ${name}@${version}`,
    totalVulns: vulns.length,
    high: vulns.filter((v) => (v.database_specific?.severity ?? '').toLowerCase() === 'high').length,
    moderate: vulns.filter((v) => {
      const s = (v.database_specific?.severity ?? '').toLowerCase();
      return s === 'medium' || s === 'moderate';
    }).length,
    packages: vulns.length ? [name] : [],
    vulnIds: vulns.map((v) => v.id).sort(),
    rawSummary: { version, count: vulns.length },
  };
}

function runRetireJs() {
  const cmd =
    'npx --yes retire --path node_modules --outputformat json';
  const result = spawnSync(cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: true,
  });

  const stdout = (result.stdout || '').trim();
  if (!stdout) {
    throw new Error(`retire.js failed: ${result.stderr || result.status}`);
  }

  let report;
  try {
    report = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`retire.js invalid JSON: ${error.message}`);
  }
  let totalVulns = 0;
  let high = 0;
  let moderate = 0;
  const files = [];

  for (const entry of report.data ?? []) {
    files.push(entry.file);
    for (const item of entry.results ?? []) {
      for (const vuln of item.vulnerabilities ?? []) {
        totalVulns += 1;
        const sev = (vuln.severity ?? '').toLowerCase();
        if (sev === 'high') high += 1;
        else if (sev === 'medium' || sev === 'moderate') moderate += 1;
      }
    }
  }

  return {
    tool: 'Retire.js',
    type: '文件内容 SCA（扫描 node_modules 源码）',
    scanTarget: 'node_modules/**/*.js 文件内容',
    totalVulns,
    high,
    moderate,
    packages: files.map((f) => path.basename(path.dirname(f))),
    detectedVersion: report.data?.[0]?.results?.[0]?.version ?? null,
    detection: report.data?.[0]?.results?.[0]?.detection ?? null,
    rawSummary: { files: files.length, errors: report.errors ?? [] },
  };
}

function runLockfileIntegrity() {
  const lockPath = path.join(ROOT, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const integrity =
    lock.packages?.['node_modules/lodash']?.integrity ??
    lock.dependencies?.lodash?.integrity ??
    null;

  const backupPath = path.join(ROOT, 'results', 'lodash.js.original');
  let tampered = false;
  let lodashHash = null;
  let backupHash = null;

  if (fs.existsSync(LODASH_MAIN)) {
    lodashHash = sha256(LODASH_MAIN);
  }
  if (fs.existsSync(backupPath)) {
    backupHash = sha256(backupPath);
    tampered = lodashHash !== backupHash;
  }

  return {
    tool: 'Lockfile Integrity（对照组）',
    type: '安装完整性校验（非 SCA）',
    scanTarget: 'package-lock.json integrity + lodash.js SHA-256',
    totalVulns: tampered ? 1 : 0,
    high: tampered ? 1 : 0,
    moderate: 0,
    packages: tampered ? ['lodash (local file modified)'] : [],
    tampered,
    lodashSha256: lodashHash,
    backupSha256: backupHash,
    lockfileIntegrity: integrity,
    rawSummary: { tampered, lodashHash: lodashHash?.slice(0, 16) },
  };
}

function runBetterNpmAudit() {
  try {
    execSync('npx --yes better-npm-audit audit', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // better-npm-audit exits non-zero when vulnerabilities exist (same as npm audit)
    if (!error.stdout && !error.stderr) throw error;
  }

  const base = runNpmAudit();
  return {
    ...base,
    tool: 'better-npm-audit',
    type: '依赖型 SCA（npm Advisory DB 封装）',
    scanTarget: 'package-lock.json（npm audit 封装，结果同源）',
    note: 'better-npm-audit 为 npm audit 的 CLI 封装，底层 advisory 数据相同',
  };
}

module.exports = {
  runNpmAudit,
  runOsvScanner,
  runRetireJs,
  runLockfileIntegrity,
  runBetterNpmAudit,
};
