const fs = require('fs');
const { auditPath } = require('./paths');

function loadAudit(phase) {
  const file = auditPath(phase);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}. Run audit for "${phase}" first.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function extractAdvisories(report) {
  const advisories = report.vulnerabilities ?? {};
  return Object.entries(advisories)
    .map(([name, entry]) => ({
      name,
      severity: entry.severity,
      via: (entry.via ?? [])
        .map((item) => (typeof item === 'string' ? item : item.source ?? item.name ?? item.url))
        .filter(Boolean)
        .sort(),
      range: entry.range,
      fixAvailable: entry.fixAvailable,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function extractSummary(report) {
  return report.metadata?.vulnerabilities ?? null;
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

function main() {
  const before = loadAudit('before');
  const after = loadAudit('after');

  const beforeSummary = extractSummary(before);
  const afterSummary = extractSummary(after);
  const beforeAdvisories = extractAdvisories(before);
  const afterAdvisories = extractAdvisories(after);

  console.log('=== npm audit comparison (before vs after tampering) ===\n');

  console.log('Summary (metadata.vulnerabilities):');
  console.log('  before:', beforeSummary ?? '(none)');
  console.log('  after :', afterSummary ?? '(none)');
  console.log(
    '  match :',
    stableStringify(beforeSummary) === stableStringify(afterSummary) ? 'YES' : 'NO'
  );
  console.log();

  console.log('Advisory entries:');
  console.log(`  before count: ${beforeAdvisories.length}`);
  console.log(`  after count : ${afterAdvisories.length}`);
  console.log(
    '  match       :',
    stableStringify(beforeAdvisories) === stableStringify(afterAdvisories) ? 'YES' : 'NO'
  );
  console.log();

  if (beforeAdvisories.length > 0) {
    console.log('Sample advisories (unchanged):');
    for (const item of beforeAdvisories.slice(0, 5)) {
      console.log(`  - ${item.name} [${item.severity}] via ${item.via.join(', ')}`);
    }
    console.log();
  }

  const identical =
    stableStringify(beforeSummary) === stableStringify(afterSummary) &&
    stableStringify(beforeAdvisories) === stableStringify(afterAdvisories);

  if (identical) {
    console.log('CONCLUSION: npm audit output is IDENTICAL after local source tampering.');
    console.log('SCA matched package name + version only — it did not inspect modified code.');
  } else {
    console.log('CONCLUSION: Unexpected difference detected. Inspect results/ manually.');
    process.exitCode = 1;
  }
}

main();
