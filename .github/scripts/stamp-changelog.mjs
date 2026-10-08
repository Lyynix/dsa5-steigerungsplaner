// Release step for CHANGELOG.md: the "## Unveröffentlicht" section collects entries between
// releases and is always there in the repository - this turns it into the released version.
//
//   node .github/scripts/stamp-changelog.mjs <version> <date> [--keep-unreleased]
//
// - entries under "## Unveröffentlicht": the heading becomes "## <version> – <date>". With
//   --keep-unreleased (the commit back to the repository) a fresh, empty "## Unveröffentlicht"
//   goes on top of it, without (the release archive) there's none.
// - no entries: without --keep-unreleased the empty heading is removed, with it nothing changes.
//
// Prints whether the file changed, the workflow only commits if it did.
import { readFileSync, writeFileSync } from 'node:fs';

const UNRELEASED = '## Unveröffentlicht';
const [version, date, flag] = process.argv.slice(2);
if (!version || !date) {
  console.error('usage: stamp-changelog.mjs <version> <date> [--keep-unreleased]');
  process.exit(1);
}
const keepUnreleased = flag === '--keep-unreleased';

const file = 'CHANGELOG.md';
const text = readFileSync(file, 'utf8');
// Keeps the file's line endings, CRLF in a Windows checkout.
const eol = text.includes('\r\n') ? '\r\n' : '\n';
const lines = text.split(eol);

const start = lines.findIndex((line) => line.trim() === UNRELEASED);
if (start === -1) {
  console.log(`no "${UNRELEASED}" heading, unchanged`);
  process.exit(0);
}

// The section runs up to the next version heading (or the end of the file).
let end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
if (end === -1) end = lines.length;
const hasEntries = lines.slice(start + 1, end).some((line) => line.trim());

if (hasEntries) {
  const heading = `## ${version} – ${date}`;
  lines.splice(start, 1, ...(keepUnreleased ? [UNRELEASED, '', heading] : [heading]));
} else if (!keepUnreleased) {
  lines.splice(start, end - start);
} else {
  console.log('no unreleased entries, unchanged');
  process.exit(0);
}

writeFileSync(file, lines.join(eol));
console.log(hasEntries ? `stamped ${version} – ${date}` : 'removed empty unreleased section');
