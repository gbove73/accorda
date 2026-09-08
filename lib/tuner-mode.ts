import type { PolyphonicPitchDetection } from './polyphonic-detector';

export type AutomaticModeCandidate = 'polyphonic' | 'precision' | null;

const POLYPHONIC_TRIGGER_STRING_COUNT = 4;

/**
 * Mantiene l'ago fino a tre corde e apre la griglia da quattro rilevamenti.
 * Per i preset più piccoli richiede comunque tutte le corde disponibili.
 */
export function getAutomaticModeCandidate(
  detectedStringCount: number,
  targetStringCount: number,
  hasDominantPitch: boolean,
): AutomaticModeCandidate {
  const requiredStringCount = Math.min(POLYPHONIC_TRIGGER_STRING_COUNT, targetStringCount);
  if (requiredStringCount > 1 && detectedStringCount >= requiredStringCount) {
    return 'polyphonic';
  }
  return hasDominantPitch ? 'precision' : null;
}

/** Seleziona la corda con maggiore energia armonica relativa nel fotogramma. */
export function selectDominantPolyphonicPitch<T extends PolyphonicPitchDetection>(
  detections: Array<T | null>,
) {
  return detections.reduce<T | null>((dominant, detection) => {
    if (!detection) return dominant;
    if (!dominant || detection.salience > dominant.salience) return detection;
    return dominant;
  }, null);
}
