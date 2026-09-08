export type PolyphonicPitchDetection = {
  cents: number;
  confidence: number;
  frequency: number;
  targetFrequency: number;
};

export type PolyphonicDetectorOptions = {
  maxDeviationCents?: number;
  minRms?: number;
  minSignalToNoiseDb?: number;
};

const DEFAULT_OPTIONS = {
  maxDeviationCents: 70,
  minRms: 0.006,
  minSignalToNoiseDb: 10,
};
const MIN_RELATIVE_PARTIAL_DB = -36;

/**
 * Analizza più fondamentali note in anticipo usando un unico spettro ad alta
 * risoluzione. Lo zero-padding rende continua la ricerca in cent, mentre il controllo
 * delle armoniche riduce i falsi positivi prodotti dalle altre corde della pennata.
 */
export function detectPolyphonicPitches(
  input: Float32Array,
  sampleRate: number,
  targetFrequencies: number[],
  options: PolyphonicDetectorOptions = {},
): Array<PolyphonicPitchDetection | null> {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  if (!isPowerOfTwo(input.length) || input.length < 4096 || sampleRate <= 0) {
    return targetFrequencies.map(() => null);
  }

  const { centered, rms } = centerSignal(input);
  if (rms < settings.minRms) return targetFrequencies.map(() => null);

  const fftSize = input.length * 4;
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  applyHannWindow(centered, real);
  transformRadixTwo(real, imaginary);

  const spectrum = calculatePowerSpectrum(real, imaginary);
  const noiseFloor = estimateNoiseFloor(spectrum);
  const strongestSpectrumPower = findStrongestSpectrumPower(spectrum);
  const binWidth = sampleRate / fftSize;

  return targetFrequencies.map((targetFrequency, targetIndex) => {
    const candidates = collectHarmonicCandidates({
      binWidth,
      maxDeviationCents: settings.maxDeviationCents,
      minSignalToNoiseDb: settings.minSignalToNoiseDb,
      noiseFloor,
      spectrum,
      strongestSpectrumPower,
      targetFrequencies,
      targetFrequency,
      targetIndex,
    });
    if (candidates.length < 2) return null;

    const frequency = median(candidates.map((candidate) => candidate.frequency));
    const cents = 1200 * Math.log2(frequency / targetFrequency);
    if (Math.abs(cents) > settings.maxDeviationCents) return null;

    const averageSignalToNoiseDb = candidates.reduce(
      (sum, candidate) => sum + candidate.signalToNoiseDb,
      0,
    ) / candidates.length;
    const confidence = clamp01(
      (averageSignalToNoiseDb - settings.minSignalToNoiseDb) / 32 * 0.75 +
        Math.min(1, candidates.length / 3) * 0.25,
    );

    return { cents, confidence, frequency, targetFrequency };
  });
}

type HarmonicCandidate = {
  contaminated: boolean;
  frequency: number;
  signalToNoiseDb: number;
};

function collectHarmonicCandidates({
  binWidth,
  maxDeviationCents,
  minSignalToNoiseDb,
  noiseFloor,
  spectrum,
  strongestSpectrumPower,
  targetFrequencies,
  targetFrequency,
  targetIndex,
}: {
  binWidth: number;
  maxDeviationCents: number;
  minSignalToNoiseDb: number;
  noiseFloor: number;
  spectrum: Float64Array;
  strongestSpectrumPower: number;
  targetFrequencies: number[];
  targetFrequency: number;
  targetIndex: number;
}) {
  const candidates: HarmonicCandidate[] = [];
  for (let harmonic = 1; harmonic <= 4; harmonic += 1) {
    const expectedHarmonic = targetFrequency * harmonic;
    if (expectedHarmonic >= spectrum.length * binWidth) break;
    const contaminated = hasOverlappingPartial(
      expectedHarmonic,
      targetFrequencies,
      targetIndex,
    );

    const lowerFrequency = expectedHarmonic * 2 ** (-maxDeviationCents / 1200);
    const upperFrequency = expectedHarmonic * 2 ** (maxDeviationCents / 1200);
    const lowerBin = Math.max(2, Math.floor(lowerFrequency / binWidth));
    const upperBin = Math.min(spectrum.length - 3, Math.ceil(upperFrequency / binWidth));
    const peakBin = findStrongestPeak(spectrum, lowerBin, upperBin);
    if (peakBin === null) continue;

    const refinedBin = interpolatePeak(spectrum, peakBin);
    const peakPower = interpolatePower(spectrum, refinedBin);
    const signalToNoiseDb = 10 * Math.log10(peakPower / noiseFloor);
    const relativePartialDb = 10 * Math.log10(peakPower / strongestSpectrumPower);
    if (
      signalToNoiseDb < minSignalToNoiseDb ||
      relativePartialDb < MIN_RELATIVE_PARTIAL_DB
    ) continue;
    candidates.push({
      contaminated,
      frequency: refinedBin * binWidth / harmonic,
      signalToNoiseDb,
    });
  }
  return selectConsistentCandidates(candidates);
}

/**
 * Esclude le bande in cui una parziale di un'altra corda può imitare la nota.
 * Il confronto usa i target, quindi resta valido anche per accordature alternative.
 */
function hasOverlappingPartial(
  expectedFrequency: number,
  targetFrequencies: number[],
  targetIndex: number,
) {
  return targetFrequencies.some((otherFrequency, otherIndex) => {
    if (otherIndex === targetIndex) return false;
    for (let harmonic = 1; harmonic <= 6; harmonic += 1) {
      const otherPartial = otherFrequency * harmonic;
      const distanceInCents = Math.abs(1200 * Math.log2(otherPartial / expectedFrequency));
      if (distanceInCents < 12) return true;
      if (otherPartial > expectedFrequency * 1.02) break;
    }
    return false;
  });
}

function selectConsistentCandidates(candidates: HarmonicCandidate[]) {
  if (candidates.length < 2) return candidates;

  let bestCluster: HarmonicCandidate[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const anchor of candidates) {
    const cluster = candidates.filter((candidate) => (
      Math.abs(1200 * Math.log2(candidate.frequency / anchor.frequency)) <= 6
    ));
    const cleanCandidates = cluster.filter((candidate) => !candidate.contaminated).length;
    if (cleanCandidates === 0) continue;
    const averageSignalToNoise = cluster.reduce(
      (sum, candidate) => sum + candidate.signalToNoiseDb,
      0,
    ) / cluster.length;
    const score = cluster.length * 10 + cleanCandidates * 2 + averageSignalToNoise / 100;
    if (score > bestScore) {
      bestCluster = cluster;
      bestScore = score;
    }
  }
  return bestCluster;
}

function centerSignal(input: Float32Array) {
  let sum = 0;
  let power = 0;
  for (const sample of input) {
    sum += sample;
    power += sample * sample;
  }

  const mean = sum / input.length;
  const centered = new Float64Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    centered[index] = input[index] - mean;
  }
  return { centered, rms: Math.sqrt(power / input.length) };
}

function applyHannWindow(input: Float64Array, output: Float64Array) {
  for (let index = 0; index < input.length; index += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (input.length - 1));
    output[index] = input[index] * window;
  }
}

/** FFT iterativa in-place: evita dipendenze e mantiene prevedibile il costo sul browser. */
function transformRadixTwo(real: Float64Array, imaginary: Float64Array) {
  const length = real.length;
  let reversed = 0;
  for (let index = 1; index < length; index += 1) {
    let bit = length >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }

  for (let blockSize = 2; blockSize <= length; blockSize *= 2) {
    const halfBlock = blockSize / 2;
    const angle = (-2 * Math.PI) / blockSize;
    const phaseStepReal = Math.cos(angle);
    const phaseStepImaginary = Math.sin(angle);

    for (let blockStart = 0; blockStart < length; blockStart += blockSize) {
      let phaseReal = 1;
      let phaseImaginary = 0;
      for (let offset = 0; offset < halfBlock; offset += 1) {
        const evenIndex = blockStart + offset;
        const oddIndex = evenIndex + halfBlock;
        const oddReal = real[oddIndex] * phaseReal - imaginary[oddIndex] * phaseImaginary;
        const oddImaginary = real[oddIndex] * phaseImaginary + imaginary[oddIndex] * phaseReal;
        const evenReal = real[evenIndex];
        const evenImaginary = imaginary[evenIndex];

        real[evenIndex] = evenReal + oddReal;
        imaginary[evenIndex] = evenImaginary + oddImaginary;
        real[oddIndex] = evenReal - oddReal;
        imaginary[oddIndex] = evenImaginary - oddImaginary;

        const nextPhaseReal = phaseReal * phaseStepReal - phaseImaginary * phaseStepImaginary;
        phaseImaginary = phaseReal * phaseStepImaginary + phaseImaginary * phaseStepReal;
        phaseReal = nextPhaseReal;
      }
    }
  }
}

function calculatePowerSpectrum(real: Float64Array, imaginary: Float64Array) {
  const spectrum = new Float64Array(real.length / 2);
  for (let index = 0; index < spectrum.length; index += 1) {
    spectrum[index] = real[index] ** 2 + imaginary[index] ** 2;
  }
  return spectrum;
}

function estimateNoiseFloor(spectrum: Float64Array) {
  const samples: number[] = [];
  const step = Math.max(1, Math.floor(spectrum.length / 2048));
  for (let index = 2; index < spectrum.length; index += step) {
    samples.push(spectrum[index]);
  }
  samples.sort((left, right) => left - right);
  return Math.max(1e-18, samples[Math.floor(samples.length * 0.45)] ?? 1e-18);
}

function findStrongestSpectrumPower(spectrum: Float64Array) {
  let strongestPower = 1e-18;
  for (let index = 2; index < spectrum.length; index += 1) {
    if (spectrum[index] > strongestPower) strongestPower = spectrum[index];
  }
  return strongestPower;
}

function findStrongestPeak(spectrum: Float64Array, lowerBin: number, upperBin: number) {
  let strongestBin: number | null = null;
  let strongestPower = 0;
  for (let bin = lowerBin; bin <= upperBin; bin += 1) {
    if (
      spectrum[bin] >= spectrum[bin - 1] &&
      spectrum[bin] > spectrum[bin + 1] &&
      spectrum[bin] > strongestPower
    ) {
      strongestPower = spectrum[bin];
      strongestBin = bin;
    }
  }
  return strongestBin;
}

function interpolatePeak(spectrum: Float64Array, peakBin: number) {
  // Sulla finestra Hann la parabola dell'ampiezza è meno distorta dal decadimento
  // naturale della corda rispetto alla stessa interpolazione in scala logaritmica.
  const previous = Math.sqrt(spectrum[peakBin - 1]);
  const current = Math.sqrt(spectrum[peakBin]);
  const next = Math.sqrt(spectrum[peakBin + 1]);
  const denominator = previous - 2 * current + next;
  if (Math.abs(denominator) < 1e-12) return peakBin;
  return peakBin + clamp((previous - next) / (2 * denominator), -0.5, 0.5);
}

function interpolatePower(spectrum: Float64Array, bin: number) {
  const lower = Math.floor(bin);
  const upper = Math.min(spectrum.length - 1, lower + 1);
  const blend = bin - lower;
  return spectrum[lower] * (1 - blend) + spectrum[upper] * blend;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function isPowerOfTwo(value: number) {
  return value > 0 && (value & (value - 1)) === 0;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}
