#!/usr/bin/env node
/**
 * Compatibility shim for insights modules.
 */

const fs = require('fs');
const insights = require('./insights/index');

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.error('Usage: node insights.js <metrics.json> [--cwd <path>]');
    process.exit(1);
  }

  const metricsPath = argv[0];
  let cwd = null;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--cwd' && argv[i + 1]) {
      cwd = argv[i + 1];
      i += 1;
    }
  }

  const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  process.stdout.write(JSON.stringify(insights.buildInsights(metrics, { cwd }), null, 2));
}

if (require.main === module) main();

module.exports = insights;
