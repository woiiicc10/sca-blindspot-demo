const fs = require('fs');
const {
  LODASH_MAIN,
  BACKUP_FILE,
  TAMPER_MARKER,
  ensureResultsDir,
  assertLodashInstalled,
} = require('./paths');
const { buildBackdoorSnippet } = require('./backdoor-snippet');

const BACKDOOR_SNIPPET = buildBackdoorSnippet(TAMPER_MARKER);

function isTampered(source) {
  return source.includes(TAMPER_MARKER);
}

function inject() {
  assertLodashInstalled();
  ensureResultsDir();

  const original = fs.readFileSync(LODASH_MAIN, 'utf8');

  if (isTampered(original)) {
    console.log('Backdoor already present in lodash.js — skipping injection.');
    return;
  }

  fs.writeFileSync(BACKUP_FILE, original, 'utf8');
  fs.writeFileSync(LODASH_MAIN, original + BACKDOOR_SNIPPET, 'utf8');

  console.log(`Backed up original -> ${BACKUP_FILE}`);
  console.log(`Injected demo backdoor -> ${LODASH_MAIN}`);
  console.log('Package metadata unchanged: lodash@4.17.15');
  console.log('Run `npm run demo` to trigger the popup (Windows/macOS).');
}

function restore() {
  assertLodashInstalled();

  if (!fs.existsSync(BACKUP_FILE)) {
    const current = fs.readFileSync(LODASH_MAIN, 'utf8');
    if (!isTampered(current)) {
      console.log('Nothing to restore — lodash.js is already clean.');
      return;
    }
    throw new Error(`Backup missing at ${BACKUP_FILE}. Re-run \`npm install\` to reset.`);
  }

  fs.writeFileSync(LODASH_MAIN, fs.readFileSync(BACKUP_FILE, 'utf8'), 'utf8');
  fs.unlinkSync(BACKUP_FILE);

  console.log('Restored lodash.js from backup.');
}

const action = process.argv[2];

if (action === 'inject') {
  inject();
} else if (action === 'restore') {
  restore();
} else {
  console.error('Usage: node scripts/tamper.js <inject|restore>');
  process.exit(1);
}
