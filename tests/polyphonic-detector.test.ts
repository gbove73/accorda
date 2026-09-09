import assert from 'node:assert/strict';
import test from 'node:test';

import { detectPolyphonicPitches } from '../lib/polyphonic-detector.ts';

const SAMPLE_RATE = 48_000;
const SAMPLE_COUNT = 32_768;
const STANDARD_GUITAR = [82.4069, 110, 146.8324, 196, 246.9417, 329.6276];
const DROP_D_GUITAR = [73.4162, 110, 146.8324, 196, 246.9417, 329.6276];

void test('misura simultaneamente sei corde con errore inferiore a un cent', () => {
  const offsets = [-7.2, 4.5, -0.8, 0.6, 8.4, -3.7];
  const actualFrequencies = STANDARD_GUITAR.map(
    (frequency, index) => frequency * 2 ** ((offsets[index] ?? 0) / 1200),
  );
  const samples = synthesizeStrum(actualFrequencies);
  const detections = detectPolyphonicPitches(samples, SAMPLE_RATE, STANDARD_GUITAR, {
    minRms: 0.002,
  });

  detections.forEach((detection, index) => {
    assert.ok(detection, `corda ${index + 1} non rilevata`);
    const expectedFrequency = actualFrequencies[index];
    const errorInCents = Math.abs(1200 * Math.log2(detection.frequency / expectedFrequency));
    assert.ok(
      errorInCents <= 1,
      `corda ${index + 1}: errore ${errorInCents.toFixed(3)} cent`,
    );
  });
});

void test('ignora un mix polifonico sotto la soglia di volume', () => {
  const samples = synthesizeStrum(STANDARD_GUITAR, 0.0003);
  const detections = detectPolyphonicPitches(samples, SAMPLE_RATE, STANDARD_GUITAR, {
    minRms: 0.003,
  });

  assert.deepEqual(detections, STANDARD_GUITAR.map(() => null));
});

void test('non inventa una corda assente usando le armoniche delle altre', () => {
  const withoutBString = STANDARD_GUITAR.filter((_, index) => index !== 4);
  const samples = synthesizeStrum(withoutBString);
  const detections = detectPolyphonicPitches(samples, SAMPLE_RATE, STANDARD_GUITAR, {
    minRms: 0.002,
  });

  assert.equal(detections[4], null);
});

void test('distingue una corda singola da una pennata polifonica', () => {
  const samples = synthesizeStrum([STANDARD_GUITAR[2]]);
  const detections = detectPolyphonicPitches(samples, SAMPLE_RATE, STANDARD_GUITAR, {
    minRms: 0.002,
  });

  assert.equal(
    detections.filter(Boolean).length,
    1,
    JSON.stringify(detections.map((detection) => detection?.cents ?? null)),
  );
  assert.ok(detections[2]);
});

void test('distingue i due Re del Drop D anche con scostamenti diversi', () => {
  const offsets = [-9, 1.2, 7, -0.5, 2.1, -1.4];
  const actualFrequencies = DROP_D_GUITAR.map(
    (frequency, index) => frequency * 2 ** ((offsets[index] ?? 0) / 1200),
  );
  const samples = synthesizeStrum(actualFrequencies, 0.8, [1.7, 1, 0.72, 0.9, 0.86, 0.78]);
  const detections = detectPolyphonicPitches(samples, SAMPLE_RATE, DROP_D_GUITAR, {
    minRms: 0.002,
  });

  assertDetectedWithinTwoCents(detections[0], actualFrequencies[0], 'Re grave');
  assertDetectedWithinTwoCents(detections[2], actualFrequencies[2], 'Re superiore');
});

void test('distingue Mi grave e Mi cantino con la corda grave dominante', () => {
  const offsets = [-8, 0.4, -1.1, 1.3, -0.7, 6.5];
  const actualFrequencies = STANDARD_GUITAR.map(
    (frequency, index) => frequency * 2 ** ((offsets[index] ?? 0) / 1200),
  );
  const samples = synthesizeStrum(actualFrequencies, 0.8, [1.8, 0.95, 0.9, 0.84, 0.8, 0.65]);
  const detections = detectPolyphonicPitches(samples, SAMPLE_RATE, STANDARD_GUITAR, {
    minRms: 0.002,
  });

  assertDetectedWithinTwoCents(detections[0], actualFrequencies[0], 'Mi grave');
  assertDetectedWithinTwoCents(detections[5], actualFrequencies[5], 'Mi cantino');
});

function assertDetectedWithinTwoCents(
  detection: ReturnType<typeof detectPolyphonicPitches>[number],
  expectedFrequency: number,
  label: string,
) {
  assert.ok(detection, `${label} non rilevato`);
  const errorInCents = Math.abs(1200 * Math.log2(detection.frequency / expectedFrequency));
  assert.ok(errorInCents <= 2, `${label}: errore ${errorInCents.toFixed(3)} cent`);
}

/** Crea una pennata ripetibile con attacco, armoniche, fasi diverse e rumore. */
function synthesizeStrum(
  frequencies: number[],
  masterGain = 0.8,
  stringGains: number[] = [],
) {
  const samples = new Float32Array(SAMPLE_COUNT);
  const harmonics = [1, 0.52, 0.27, 0.14, 0.08];

  frequencies.forEach((frequency, stringIndex) => {
    const stringGain = masterGain *
      (stringGains[stringIndex] ?? 0.78 + stringIndex * 0.045) /
      frequencies.length;
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      const time = sampleIndex / SAMPLE_RATE;
      const attack = Math.min(1, sampleIndex / 850);
      const decay = Math.exp(-time * (0.7 + stringIndex * 0.035));
      let value = 0;
      harmonics.forEach((amplitude, harmonicIndex) => {
        const harmonic = harmonicIndex + 1;
        const phase = stringIndex * 0.71 + harmonicIndex * 0.37;
        value += amplitude * Math.sin(2 * Math.PI * frequency * harmonic * time + phase);
      });
      samples[sampleIndex] += value * stringGain * attack * decay;
    }
  });

  for (let index = 0; index < samples.length; index += 1) {
    samples[index] += pseudoRandom(index) * masterGain * 0.0008;
  }
  return samples;
}

function pseudoRandom(index: number) {
  const raw = Math.sin((index + 1) * 78.233) * 43_758.5453;
  return (raw - Math.floor(raw)) * 2 - 1;
}
