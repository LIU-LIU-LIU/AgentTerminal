import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore release automation is a standalone Node script
import { nextVersion } from '../scripts/prepare-release.mjs';

test('automatic release versions respect existing tags, manual bumps and prereleases', () => {
  assert.equal(nextVersion('0.1.1', []), '0.1.1');
  assert.equal(nextVersion('0.1.1', ['v0.1.1', 'v0.1.9', 'v0.1.10', 'v9.0.0-beta.1']), '0.1.11');
  assert.equal(nextVersion('0.2.0', ['v0.1.11']), '0.2.0');
  assert.equal(nextVersion('0.1.0', ['v1.2.3', 'unrelated']), '1.2.4');
  assert.throws(() => nextVersion('invalid', []));
});
