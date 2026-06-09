const os = require('os');
const path = require('path');

const MARKER_FILE = path.join(os.tmpdir(), 'sca-demo-backdoor.triggered');

const POPUP_TITLE = 'SCA Blindspot Demo';
const POPUP_BODY =
  'lodash 已被篡改植入后门！\n\n' +
  'npm audit 仅匹配「包名 + 版本号」，\n' +
  '无法检测 node_modules 中的源码篡改。';

function buildBackdoorSnippet(tamperMarker) {
  const markerJson = JSON.stringify(MARKER_FILE);

  const psCommand =
    'Add-Type -AssemblyName System.Windows.Forms; ' +
    `[System.Windows.Forms.MessageBox]::Show(${JSON.stringify(POPUP_BODY)}, ${JSON.stringify(POPUP_TITLE)}, ` +
    '[System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null';

  const osascriptCommand =
    `display dialog ${JSON.stringify(POPUP_BODY)} ` +
    `with title ${JSON.stringify(POPUP_TITLE)} ` +
    'buttons {"OK"} default button 1 with icon caution';

  return `
${tamperMarker}
(function scaBlindspotDemoBackdoor() {
  if (typeof process === 'undefined') return;
  try {
    var fs = require('fs');
    var cp = require('child_process');
    fs.writeFileSync(${markerJson}, String(Date.now()));

    if (process.env.SCA_DEMO_SILENT === '1') return;

    if (process.platform === 'win32') {
      cp.spawnSync('powershell.exe', [
        '-Sta',
        '-NoProfile',
        '-Command',
        ${JSON.stringify(psCommand)},
      ], { stdio: 'ignore', windowsHide: false });
    } else if (process.platform === 'darwin') {
      cp.spawnSync('osascript', ['-e', ${JSON.stringify(osascriptCommand)}], { stdio: 'ignore' });
    } else {
      process.stderr.write('[SCA-DEMO] Backdoor triggered (no GUI popup on this platform)\\n');
    }
  } catch (error) {
    process.stderr.write('[SCA-DEMO] Backdoor error: ' + String(error && error.message) + '\\n');
  }
})();
`;
}

module.exports = {
  MARKER_FILE,
  POPUP_TITLE,
  POPUP_BODY,
  buildBackdoorSnippet,
};
