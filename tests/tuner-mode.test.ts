import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAutomaticModeCandidate,
  selectDominantPolyphonicPitch,
} from '../lib/tuner-mode.ts';

void test('su chitarra usa l’ago fino a tre corde e la griglia da quattro', () => {
  assert.equal(getAutomaticModeCandidate(1, 6, true), 'precision');
  assert.equal(getAutomaticModeCandidate(2, 6, true), 'precision');
  assert.equal(getAutomaticModeCandidate(3, 6, true), 'precision');
  assert.equal(getAutomaticModeCandidate(4, 6, true), 'polyphonic');
  assert.equal(getAutomaticModeCandidate(6, 6, true), 'polyphonic');
});

void test('mantiene la modalità corrente quando non rileva una nota dominante', () => {
  assert.equal(getAutomaticModeCandidate(0, 6, false), null);
});

void test('sugli strumenti più piccoli richiede tutte le corde del preset', () => {
  assert.equal(getAutomaticModeCandidate(2, 3, true), 'precision');
  assert.equal(getAutomaticModeCandidate(3, 3, true), 'polyphonic');
});

void test('seleziona la nota con maggiore energia armonica', () => {
  const quieter = createDetection(110, 0.18);
  const dominant = createDetection(146.83, 0.71);

  assert.equal(
    selectDominantPolyphonicPitch([quieter, null, dominant]),
    dominant,
  );
});

function createDetection(frequency: number, salience: number) {
  return {
    cents: 0,
    confidence: 0.9,
    frequency,
    salience,
    targetFrequency: frequency,
  };
}
