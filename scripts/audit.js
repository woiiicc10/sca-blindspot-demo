const { execSync } = require('child_process');
const fs = require('fs');
const { ensureResultsDir, auditPath, ROOT } = require('./paths');

const phase = process.argv[2];

if (!phase || !['before', 'after'].includes(phase)) {
  console.error('Usage: node scripts/audit.js <before|after>');
  process.exit(1);
}

ensureResultsDir();

let output;
try {
  output = execSync('npm audit --json', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (error) {
  // npm audit exits 1 when vulnerabilities exist — JSON is still valid
  output = error.stdout;
  if (!output) {
    throw error;
  }
}

const destination = auditPath(phase);
fs.writeFileSync(destination, output, 'utf8');

let summary;
try {
  summary = JSON.parse(output);
} catch {
  summary = { parseError: true };
}

const vulnCount = summary.metadata?.vulnerabilities ?? summary.vulnerabilities ?? null;

console.log(`Saved ${phase} audit report -> ${destination}`);
if (vulnCount) {
  console.log(
    `Vulnerabilities: total=${vulnCount.total ?? '?'} ` +
      `(critical=${vulnCount.critical ?? 0}, high=${vulnCount.high ?? 0}, ` +
      `moderate=${vulnCount.moderate ?? 0}, low=${vulnCount.low ?? 0})`
  );
}
