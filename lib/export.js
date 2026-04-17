#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { REPORTS_DIR } = require('./config');

function latestReportPath() {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith('.html')).sort();
  if (!files.length) return null;
  return path.join(REPORTS_DIR, files[files.length - 1]);
}

function main() {
  const reportPath = process.argv[2] || latestReportPath();
  if (!reportPath || !fs.existsSync(reportPath)) {
    console.error('No report file found to export.');
    process.exit(1);
  }
  const content = fs.readFileSync(reportPath);
  process.stdout.write(JSON.stringify({
    file: path.basename(reportPath),
    encoding: 'base64',
    content_base64: content.toString('base64')
  }, null, 2));
}

if (require.main === module) main();

module.exports = { latestReportPath };
