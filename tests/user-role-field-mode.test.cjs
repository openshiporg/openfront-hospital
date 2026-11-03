// D-3: the role field's edit mode in the admin follows the same rule as its update access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'features/keystone/models/User.ts'), 'utf8');
const start = src.indexOf('    role: relationship({');
const block = src.slice(start, src.indexOf('\n    }),', start));

test('role fieldMode uses the update-access permission, not canManagePeople', () => {
  assert.notEqual(start, -1);
  const update = block.match(/update:[\s\S]*?permissions\.(\w+)/)[1];
  const mode = block.match(/fieldMode:[\s\S]*?permissions\.(\w+)/)[1];
  assert.equal(mode, update);
  assert.doesNotMatch(block, /fieldMode:[^\n]*canManagePeople/);
});
