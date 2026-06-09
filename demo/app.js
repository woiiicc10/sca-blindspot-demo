/**
 * Simulates a normal application that depends on lodash.
 * After tampering, requiring lodash triggers a system popup — npm audit won't notice.
 */
delete process.env.SCA_DEMO_SILENT;

const _ = require('lodash');

console.log('App started — lodash loaded normally.');
console.log('Sample:', _.capitalize('sca blindspot demo'));

if (process.platform === 'win32' || process.platform === 'darwin') {
  console.log('\nPopup should have appeared before this line (requires tampering).');
} else {
  console.log('\nOn Linux, check stderr for [SCA-DEMO] backdoor message.');
}
