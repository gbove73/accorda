import assert from 'node:assert/strict';
import test from 'node:test';

import { detectPitch } from '../lib/pitch-detector.ts';

const SAMPLE_RATE = 48_000;
const SAMPLE_COUNT = 8192;
const GUITAR_REGISTER = [82.4069, 110, 146.8324, 196, 246.9417, 329.6276, 440];

void test('rileva con precisione un La a 440 Hz', () => {
  const samples = synthesizeTone(440, [1, 0.22, 0.08]);
  const result = detectPitch(samples, SAMPLE_RATE, { minFrequency: 70, maxFrequency: 1000 });

  assert.ok(result);
  assert.ok(Math.abs(result.frequency - 440) < 0.5, `frequenza ottenuta: ${result.frequency}`);
  assert.ok(result.confidence > 0.8);
});

void test('mantiene la fondamentale di una corda grave ricca di armoniche', () => {
  const fundamental = 82.4069;
  const samples = synthesizeTone(fundamental, [0.58, 1, 0.46, 0.25]);
  const result = detectPitch(samples, SAMPLE_RATE, { minFrequency: 45, maxFrequency: 500 });

  assert.ok(result);
  assert.ok(
    Math.abs(result.frequency - fundamental) < 0.8,
    `frequenza ottenuta: ${result.frequency}`,
  );
});

void test('mantiene un errore inferiore a un cent nel registro della chitarra', () => {
  const centOffsets = [-0.8, 0, 0.8];

  for (const referenceFrequency of GUITAR_REGISTER) {
    for (const centOffset of centOffsets) {
      const expectedFrequency = referenceFrequency * 2 ** (centOffset / 1200);
      const samples = synthesizeTone(expectedFrequency, [0.72, 1, 0.38, 0.19], 0.0035);
      const result = detectPitch(samples, SAMPLE_RATE, {
        minFrequency: 45,
        maxFrequency: 1000,
      });

      assert.ok(result, `segnale non rilevato a ${expectedFrequency.toFixed(4)} Hz`);
      const errorInCents = Math.abs(1200 * Math.log2(result.frequency / expectedFrequency));
      assert.ok(
        errorInCents <= 1,
        `${expectedFrequency.toFixed(4)} Hz: errore ${errorInCents.toFixed(3)} cent`,
      );
    }
  }
});

void test('ignora il silenzio e il rumore sotto soglia', () => {
  const samples = new Float32Array(SAMPLE_COUNT);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin(index * 12.9898) * 0.0004;
  }

  assert.equal(detectPitch(samples, SAMPLE_RATE, { minRms: 0.003 }), null);
});

/** Genera un segnale deterministico per rendere ripetibili i test numerici. */
function synthesizeTone(frequency: number, harmonics: number[], noiseAmplitude = 0) {
  const samples = new Float32Array(SAMPLE_COUNT);
  const normalization = harmonics.reduce((sum, amplitude) => sum + amplitude, 0);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    let value = 0;
    harmonics.forEach((amplitude, harmonicIndex) => {
      value += amplitude * Math.sin(2 * Math.PI * frequency * (harmonicIndex + 1) * time);
    });
    // Il rumore deterministico simula un ingresso reale senza rendere il test instabile.
    const noise = pseudoRandom(index) * noiseAmplitude;
    samples[index] = value / normalization + noise;
  }
  return samples;
}

function pseudoRandom(index: number) {
  const raw = Math.sin((index + 1) * 12.9898) * 43_758.5453;
  return (raw - Math.floor(raw)) * 2 - 1;
}
