import assert from 'node:assert/strict';
import test from 'node:test';

import { parseChangelog } from '../lib/changelog-parser.ts';

void test('converte versioni e voci Keep a Changelog nella timeline', () => {
  const releases = parseChangelog(`
## [Unreleased]

## [1.0.0] - 2026-09-09

### Fixed

- Corregge il rilevamento
  delle corde omonime.
`);

  assert.deepEqual(releases, [{
    date: '2026-09-09',
    sections: [{ items: ['Corregge il rilevamento delle corde omonime.'], title: 'Fixed' }],
    version: '1.0.0',
  }]);
});
