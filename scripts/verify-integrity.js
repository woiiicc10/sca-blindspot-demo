const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROOT, LODASH_MAIN, BACKUP_FILE } = require('./paths');

function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function formatHash(hash) {
  return `${hash.slice(0, 16)}…`;
}

console.log('=== Control: install-time integrity vs npm audit ===\n');

if (!fs.existsSync(LODASH_MAIN)) {
  console.error('lodash not installed. Run npm install first.');
  process.exit(1);
}

const lockPath = path.join(ROOT, 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const tarballIntegrity =
  lock.packages?.['node_modules/lodash']?.integrity ??
  lock.dependencies?.lodash?.integrity ??
  '(not found)';

console.log('1) lockfile stores TARBALL integrity (registry download), not per-file hashes:');
console.log(`   ${tarballIntegrity}\n`);

const currentHash = sha256(LODASH_MAIN);
const backupExists = fs.existsSync(BACKUP_FILE);
const backupHash = backupExists ? sha256(BACKUP_FILE) : null;

console.log('2) Local file SHA-256:');
console.log(`   lodash.js now   : ${formatHash(currentHash)}`);
if (backupHash) {
  console.log(`   lodash.js backup: ${formatHash(backupHash)}`);
  console.log(`   tampered        : ${currentHash !== backupHash ? 'YES' : 'NO'}`);
} else {
  console.log('   (no backup — run npm run tamper first)');
}
console.log();

console.log('3) npm ci behavior after tampering:');
console.log('   npm ci deletes node_modules and reinstalls from the lockfile tarball.');
console.log('   It does NOT scan for backdoors — it replaces local files entirely.\n');

try {
  execSync('npm ci', { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  const afterCiHash = sha256(LODASH_MAIN);
  console.log('   npm ci completed.');
  console.log(`   lodash.js after npm ci: ${formatHash(afterCiHash)}`);

  if (backupHash) {
    const restored = afterCiHash === backupHash;
    console.log(`   matches clean backup: ${restored ? 'YES' : 'NO'}`);
    if (restored) {
      console.log('\n   => Tampering was silently overwritten at install time.');
      console.log('   => npm audit still would not have flagged the backdoor before npm ci.');
    }
  }
} catch (error) {
  console.error('   npm ci failed:', `${error.stdout ?? ''}${error.stderr ?? ''}`);
  process.exitCode = 1;
}

console.log('\nTakeaway: integrity checks and SCA operate at different layers.');
console.log('  - npm audit     → advisory lookup (package@version)');
console.log('  - npm ci        → tarball integrity on reinstall (not runtime code analysis)');
