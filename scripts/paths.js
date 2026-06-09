const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'results');
const LODASH_PKG = path.join(ROOT, 'node_modules', 'lodash');
const LODASH_MAIN = path.join(LODASH_PKG, 'lodash.js');
const BACKUP_FILE = path.join(RESULTS_DIR, 'lodash.js.original');
const TAMPER_MARKER = '/* SCA-BLINDSPOT-DEMO: injected backdoor */';

function ensureResultsDir() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function auditPath(phase) {
  return path.join(RESULTS_DIR, `audit-${phase}.json`);
}

function assertLodashInstalled() {
  if (!fs.existsSync(LODASH_MAIN)) {
    throw new Error(
      'lodash is not installed. Run `npm install` first.'
    );
  }
}

module.exports = {
  ROOT,
  RESULTS_DIR,
  LODASH_PKG,
  LODASH_MAIN,
  BACKUP_FILE,
  TAMPER_MARKER,
  ensureResultsDir,
  auditPath,
  assertLodashInstalled,
};
