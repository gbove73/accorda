export type PitchDetectorOptions = {
  maxFrequency?: number;
  minFrequency?: number;
  minRms?: number;
  threshold?: number;
};

export type PitchDetection = {
  confidence: number;
  frequency: number;
  periodicity: number;
  rms: number;
};

const DEFAULT_OPTIONS = {
  maxFrequency: 2100,
  minFrequency: 32,
  minRms: 0.006,
  threshold: 0.14,
};

/**
 * Rilevatore ibrido basato su YIN. La decisione temporale viene verificata sullo
 * spettro armonico e rifinita con interpolazione parabolica sub-campione.
 */
export function detectPitch(
  input: Float32Array,
  sampleRate: number,
  options: PitchDetectorOptions = {},
): PitchDetection | null {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  if (input.length < 512 || sampleRate <= 0) return null;

  const { centered, rms } = centerAndDownsample(input);
  if (rms < settings.minRms) return null;

  const analysisRate = sampleRate / 2;
  const minTau = Math.max(2, Math.floor(analysisRate / settings.maxFrequency));
  const maxTau = Math.min(
    Math.floor(analysisRate / settings.minFrequency),
    Math.floor(centered.length * 0.48),
  );
  if (minTau >= maxTau) return null;

  const difference = calculateDifference(centered, minTau, maxTau);
  const normalized = cumulativeMeanNormalize(difference, minTau, maxTau);
  let tau = findFirstReliableMinimum(normalized, minTau, maxTau, settings.threshold);
  if (tau === null) {
    tau = findGlobalMinimum(normalized, minTau, maxTau);
  }

  if (tau === null || normalized[tau] > 0.48) return null;

  tau = correctOctave(centered, analysisRate, normalized, tau, maxTau);
  const refinedTau = parabolicInterpolation(normalized, tau, minTau, maxTau);
  const frequency = analysisRate / refinedTau;
  if (frequency < settings.minFrequency || frequency > settings.maxFrequency) return null;

  const periodicity = Math.max(0, Math.min(1, 1 - normalized[tau]));
  const harmonicScore = getHarmonicScore(centered, analysisRate, frequency);
  const confidence = Math.max(0, Math.min(1, periodicity * 0.86 + harmonicScore * 0.14));

  return { confidence, frequency, periodicity, rms };
}

/** Rimuove la componente continua e dimezza il campionamento con un filtro box. */
function centerAndDownsample(input: Float32Array) {
  let sum = 0;
  let power = 0;
  for (const sample of input) {
    sum += sample;
    power += sample * sample;
  }
  const mean = sum / input.length;
  const rms = Math.sqrt(power / input.length);
  const centered = new Float32Array(Math.floor(input.length / 2));
  for (let index = 0; index < centered.length; index += 1) {
    centered[index] = ((input[index * 2] - mean) + (input[index * 2 + 1] - mean)) * 0.5;
  }
  return { centered, rms };
}

function calculateDifference(samples: Float32Array, minTau: number, maxTau: number) {
  const difference = new Float64Array(maxTau + 1);
  const windowLength = samples.length - maxTau;
  for (let tau = minTau; tau <= maxTau; tau += 1) {
    let total = 0;
    for (let index = 0; index < windowLength; index += 1) {
      const delta = samples[index] - samples[index + tau];
      total += delta * delta;
    }
    difference[tau] = total;
  }
  return difference;
}

function cumulativeMeanNormalize(
  difference: Float64Array,
  minTau: number,
  maxTau: number,
) {
  const normalized = new Float64Array(difference.length);
  let runningSum = 0;
  for (let tau = minTau; tau <= maxTau; tau += 1) {
    runningSum += difference[tau];
    const relativeIndex = tau - minTau + 1;
    normalized[tau] = runningSum > 0
      ? (difference[tau] * relativeIndex) / runningSum
      : 1;
  }
  return normalized;
}

function findFirstReliableMinimum(
  normalized: Float64Array,
  minTau: number,
  maxTau: number,
  threshold: number,
) {
  for (let tau = minTau + 1; tau < maxTau; tau += 1) {
    const isLocalMinimum =
      normalized[tau] <= normalized[tau - 1] &&
      normalized[tau] < normalized[tau + 1];
    if (isLocalMinimum && normalized[tau] < threshold) return tau;
  }
  return null;
}

function findGlobalMinimum(normalized: Float64Array, minTau: number, maxTau: number) {
  let bestTau: number | null = null;
  let bestValue = Number.POSITIVE_INFINITY;
  for (let tau = minTau + 1; tau < maxTau; tau += 1) {
    if (normalized[tau] < bestValue) {
      bestValue = normalized[tau];
      bestTau = tau;
    }
  }
  return bestTau;
}

/**
 * Considera il periodo doppio solo se YIN lo giudica quasi equivalente e la
 * fondamentale inferiore è davvero presente: riduce gli errori di ottava sulle corde.
 */
function correctOctave(
  samples: Float32Array,
  sampleRate: number,
  normalized: Float64Array,
  tau: number,
  maxTau: number,
) {
  const doubledTau = tau * 2;
  if (doubledTau >= maxTau) return tau;

  const doubledMinimum = findNearbyMinimum(normalized, doubledTau, maxTau);
  if (normalized[doubledMinimum] > normalized[tau] + 0.025) return tau;

  const detectedFrequency = sampleRate / tau;
  const lowerFundamentalEnergy = spectralEnergy(samples, sampleRate, detectedFrequency / 2);
  const detectedEnergy = spectralEnergy(samples, sampleRate, detectedFrequency);
  return lowerFundamentalEnergy > detectedEnergy * 0.22 ? doubledMinimum : tau;
}

function findNearbyMinimum(normalized: Float64Array, center: number, maxTau: number) {
  let bestTau = center;
  for (let tau = Math.max(2, center - 2); tau <= Math.min(maxTau - 1, center + 2); tau += 1) {
    if (normalized[tau] < normalized[bestTau]) bestTau = tau;
  }
  return bestTau;
}

function parabolicInterpolation(
  values: Float64Array,
  tau: number,
  minTau: number,
  maxTau: number,
) {
  if (tau <= minTau || tau >= maxTau) return tau;
  const previous = values[tau - 1];
  const current = values[tau];
  const next = values[tau + 1];
  const denominator = previous - 2 * current + next;
  if (Math.abs(denominator) < 1e-12) return tau;
  return tau + (previous - next) / (2 * denominator);
}

function getHarmonicScore(samples: Float32Array, sampleRate: number, frequency: number) {
  const fundamental = spectralEnergy(samples, sampleRate, frequency);
  const second = frequency * 2 < sampleRate / 2
    ? spectralEnergy(samples, sampleRate, frequency * 2)
    : 0;
  const third = frequency * 3 < sampleRate / 2
    ? spectralEnergy(samples, sampleRate, frequency * 3)
    : 0;
  const total = fundamental + second * 0.6 + third * 0.35 + 1e-12;
  return Math.max(0, Math.min(1, (fundamental + second * 0.35 + third * 0.15) / total));
}

/** DFT mirata: costa poco perché viene valutata soltanto su tre frequenze candidate. */
function spectralEnergy(samples: Float32Array, sampleRate: number, frequency: number) {
  const angularStep = (2 * Math.PI * frequency) / sampleRate;
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (samples.length - 1));
    const value = samples[index] * window;
    real += value * Math.cos(angularStep * index);
    imaginary -= value * Math.sin(angularStep * index);
  }
  return real * real + imaginary * imaginary;
}
