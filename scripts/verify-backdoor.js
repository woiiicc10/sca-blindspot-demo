const fs = require('fs');
const { execSync } = require('child_process');
const { ROOT, LODASH_MAIN } = require('./paths');
const { MARKER_FILE } = require('./backdoor-snippet');

console.log('=== Verify injected backdoor executes ===\n');
console.log(`Target file: ${LODASH_MAIN}\n`);

if (fs.existsSync(MARKER_FILE)) {
  fs.unlinkSync(MARKER_FILE);
}

try {
  execSync('node -e "require(\'lodash\')"', {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      SCA_DEMO_SILENT: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (error) {
  console.error('Failed to load lodash:', error.message);
  process.exitCode = 1;
  process.exit(1);
}

if (fs.existsSync(MARKER_FILE)) {
  console.log('Backdoor triggered successfully while requiring lodash.');
  console.log(`Marker file: ${MARKER_FILE}`);
  console.log('\nThe malicious code runs, but npm audit does not analyze it.');
  console.log('Run `npm run demo` to see the GUI popup on Windows/macOS.');
  fs.unlinkSync(MARKER_FILE);
} else {
  console.log('lodash loaded, but backdoor marker was not written.');
  console.log('Ensure tampering ran: npm run tamper');
  process.exitCode = 1;
}
