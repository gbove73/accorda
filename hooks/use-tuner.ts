'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { detectPitch } from '@/lib/pitch-detector';
import {
  detectPolyphonicPitches,
  type PolyphonicPitchDetection,
} from '@/lib/polyphonic-detector';
import {
  getAutomaticModeCandidate,
  selectDominantPolyphonicPitch,
} from '@/lib/tuner-mode';

export type TunerMode = 'auto' | 'polyphonic' | 'precision';
export type ActiveTunerMode = Exclude<TunerMode, 'auto'>;

export type TunerMeasurement = {
  confidence: number;
  frequency: number;
  measuredAt: number;
  rms: number;
  stability: number;
};

export type PolyphonicMeasurement = PolyphonicPitchDetection & {
  measuredAt: number;
  stability: number;
};

type UseTunerOptions = {
  maxFrequency: number;
  minFrequency: number;
  mode: TunerMode;
  sensitivity: number;
  targetFrequencies: number[];
};

type AudioResources = {
  analyser: AnalyserNode;
  context: AudioContext;
  frameId: number;
  stream: MediaStream;
};

const ANALYSIS_INTERVAL_MS = 46;
const NOTE_WINDOW_SIZE = 9;
const POLYPHONIC_ANALYSIS_INTERVAL_MS = 120;
const POLYPHONIC_FFT_SIZE = 32_768;
const POLYPHONIC_WINDOW_SIZE = 3;
const AUTOMATIC_MODE_CONFIRMATION_FRAMES = 2;

/**
 * Gestisce il ciclo di vita del microfono e stabilizza le misure in semitoni.
 * Filtrare in dominio musicale evita che l'inerzia cambi tra note gravi e acute.
 */
export function useTuner({
  maxFrequency,
  minFrequency,
  mode,
  sensitivity,
  targetFrequencies,
}: UseTunerOptions) {
  const [detection, setDetection] = useState<TunerMeasurement | null>(null);
  const [polyphonicDetections, setPolyphonicDetections] = useState<
    Array<PolyphonicMeasurement | null>
  >([]);
  const [activeMode, setActiveMode] = useState<ActiveTunerMode>('precision');
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const audioResourcesRef = useRef<AudioResources | null>(null);
  const noteWindowRef = useRef<number[]>([]);
  const polyphonicWindowsRef = useRef<number[][]>([]);
  const activeModeRef = useRef<ActiveTunerMode>('precision');
  const automaticModeCandidateRef = useRef<{
    frames: number;
    mode: ActiveTunerMode;
  } | null>(null);
  const smoothedNoteRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const lastSignalAtRef = useRef(0);
  const optionsRef = useRef({
    maxFrequency,
    minFrequency,
    mode,
    sensitivity,
    targetFrequencies,
  });

  useEffect(() => {
    optionsRef.current = {
      maxFrequency,
      minFrequency,
      mode,
      sensitivity,
      targetFrequencies,
    };
  }, [maxFrequency, minFrequency, mode, sensitivity, targetFrequencies]);

  const resetMeasurements = useCallback(() => {
    noteWindowRef.current = [];
    polyphonicWindowsRef.current = [];
    smoothedNoteRef.current = null;
    lastSignalAtRef.current = 0;
    activeModeRef.current = 'precision';
    automaticModeCandidateRef.current = null;
    setDetection(null);
    setPolyphonicDetections([]);
    setActiveMode('precision');
  }, []);

  const resolveAutomaticMode = useCallback((candidate: ActiveTunerMode) => {
    if (candidate === activeModeRef.current) {
      automaticModeCandidateRef.current = null;
      return activeModeRef.current;
    }

    const pending = automaticModeCandidateRef.current;
    const frames = pending?.mode === candidate ? pending.frames + 1 : 1;
    automaticModeCandidateRef.current = { frames, mode: candidate };
    if (frames >= AUTOMATIC_MODE_CONFIRMATION_FRAMES) {
      activeModeRef.current = candidate;
      automaticModeCandidateRef.current = null;
      setActiveMode(candidate);
    }
    return activeModeRef.current;
  }, []);

  const stop = useCallback(() => {
    const resources = audioResourcesRef.current;
    if (resources) {
      cancelAnimationFrame(resources.frameId);
      resources.stream.getTracks().forEach((track) => track.stop());
      void resources.context.close();
      audioResourcesRef.current = null;
    }

    resetMeasurements();
    setIsListening(false);
  }, [resetMeasurements]);

  const start = useCallback(async () => {
    if (audioResourcesRef.current) return;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Questo browser non supporta l’accesso al microfono. Prova una versione recente di Safari, Chrome, Edge o Firefox.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      const context = new AudioContext({ latencyHint: 'interactive' });
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize =
        optionsRef.current.mode !== 'precision' &&
        optionsRef.current.targetFrequencies.length > 1
        ? POLYPHONIC_FFT_SIZE
        : 8192;
      analyser.smoothingTimeConstant = 0;
      context.createMediaStreamSource(stream).connect(analyser);

      audioResourcesRef.current = { analyser, context, frameId: 0, stream };
      setIsListening(true);

      function analysePrecisionFrame(
        samples: Float32Array,
        timestamp: number,
        currentOptions: UseTunerOptions,
      ) {
        const precisionSamples = samples.length === 8192
          ? samples
          : samples.slice(samples.length - 8192);
        const gate = 0.0018 + ((100 - currentOptions.sensitivity) / 70) * 0.012;
        const result = detectPitch(precisionSamples, context.sampleRate, {
          maxFrequency: currentOptions.maxFrequency,
          minFrequency: currentOptions.minFrequency,
          minRms: gate,
        });

        if (result && result.confidence >= 0.55) {
          return publishPrecisionMeasurement(result, timestamp);
        } else if (timestamp - lastSignalAtRef.current > 360) {
          noteWindowRef.current = [];
          smoothedNoteRef.current = null;
          setDetection(null);
        }
        return false;
      }

      function publishPrecisionMeasurement(
        result: { confidence: number; frequency: number; rms: number },
        timestamp: number,
      ) {
        const rawNote = 69 + 12 * Math.log2(result.frequency / 440);
        const noteWindow = [...noteWindowRef.current, rawNote].slice(-NOTE_WINDOW_SIZE);
        noteWindowRef.current = noteWindow;
        const medianNote = median(noteWindow);
        const previousNote = smoothedNoteRef.current;
        const smoothing = result.confidence > 0.88 ? 0.46 : 0.3;
        const smoothedNote = previousNote === null
          ? medianNote
          : previousNote + (medianNote - previousNote) * smoothing;
        smoothedNoteRef.current = smoothedNote;
        lastSignalAtRef.current = timestamp;

        const spread = standardDeviation(
          noteWindow.map((note) => (note - medianNote) * 100),
        );
        setPolyphonicDetections([]);
        setDetection({
          confidence: result.confidence,
          frequency: 440 * 2 ** ((smoothedNote - 69) / 12),
          measuredAt: timestamp,
          rms: result.rms,
          stability: Math.max(0, 100 - spread * 5.2),
        });
        return true;
      }

      function analyseFrame(timestamp: number) {
        const resources = audioResourcesRef.current;
        if (!resources) return;

        const currentOptions = optionsRef.current;
        const canAnalyzePolyphonic =
          currentOptions.mode !== 'precision' && currentOptions.targetFrequencies.length > 1;
        const requiredFftSize = canAnalyzePolyphonic ? POLYPHONIC_FFT_SIZE : 8192;
        if (resources.analyser.fftSize !== requiredFftSize) {
          resources.analyser.fftSize = requiredFftSize;
          noteWindowRef.current = [];
          polyphonicWindowsRef.current = [];
          smoothedNoteRef.current = null;
        }

        const analysisInterval = canAnalyzePolyphonic
          ? POLYPHONIC_ANALYSIS_INTERVAL_MS
          : ANALYSIS_INTERVAL_MS;
        if (timestamp - lastFrameAtRef.current >= analysisInterval) {
          lastFrameAtRef.current = timestamp;
          const samples = new Float32Array(resources.analyser.fftSize);
          resources.analyser.getFloatTimeDomainData(samples);
          const gate = 0.0018 + ((100 - currentOptions.sensitivity) / 70) * 0.012;

          if (canAnalyzePolyphonic) {
            const results = detectPolyphonicPitches(
              samples,
              resources.context.sampleRate,
              currentOptions.targetFrequencies,
              { minRms: gate },
            );
            const measurements = results.map((result, index) => {
              if (!result || result.confidence < 0.28) {
                polyphonicWindowsRef.current[index] = [];
                return null;
              }

              const centWindow = [
                ...(polyphonicWindowsRef.current[index] ?? []),
                result.cents,
              ].slice(-POLYPHONIC_WINDOW_SIZE);
              polyphonicWindowsRef.current[index] = centWindow;
              const smoothedCents = median(centWindow);
              return {
                ...result,
                cents: smoothedCents,
                frequency: result.targetFrequency * 2 ** (smoothedCents / 1200),
                measuredAt: timestamp,
                stability: Math.max(
                  0,
                  100 - standardDeviation(centWindow) * 7,
                ),
              };
            });

            const detectedStringCount = measurements.filter(Boolean).length;
            let precisionWasAnalyzed = false;
            let resolvedMode: ActiveTunerMode = 'polyphonic';
            if (currentOptions.mode === 'auto') {
              const dominantPitch = selectDominantPolyphonicPitch(measurements);
              let hasDominantNote = Boolean(dominantPitch);
              const requiredPolyphonicStringCount = Math.min(
                4,
                currentOptions.targetFrequencies.length,
              );
              if (detectedStringCount < requiredPolyphonicStringCount) {
                precisionWasAnalyzed = true;
                hasDominantNote = detectedStringCount > 1 && dominantPitch
                  ? publishPrecisionMeasurement(
                      {
                        confidence: dominantPitch.confidence,
                        frequency: dominantPitch.frequency,
                        rms: calculateRms(samples),
                      },
                      timestamp,
                    )
                  : analysePrecisionFrame(samples, timestamp, currentOptions);
              }
              const automaticCandidate = getAutomaticModeCandidate(
                detectedStringCount,
                currentOptions.targetFrequencies.length,
                hasDominantNote,
              );
              resolvedMode = automaticCandidate
                ? resolveAutomaticMode(automaticCandidate)
                : activeModeRef.current;
            }

            if (resolvedMode === 'polyphonic') {
              if (detectedStringCount > 0) {
                lastSignalAtRef.current = timestamp;
                setDetection(null);
                setPolyphonicDetections(measurements);
              } else if (timestamp - lastSignalAtRef.current > 1800) {
                polyphonicWindowsRef.current = [];
                setPolyphonicDetections([]);
              }
            } else {
              if (!precisionWasAnalyzed) {
                analysePrecisionFrame(samples, timestamp, currentOptions);
              }
            }
          } else {
            analysePrecisionFrame(samples, timestamp, currentOptions);
          }
        }

        // Il callback si auto-programma finché `stop` non rimuove le risorse audio.
        // oxlint-disable-next-line react/react-compiler
        resources.frameId = requestAnimationFrame(analyseFrame);
      }

      audioResourcesRef.current.frameId = requestAnimationFrame(analyseFrame);
    } catch (cause) {
      const isDenied = cause instanceof DOMException && cause.name === 'NotAllowedError';
      setError(
        isDenied
          ? 'Permesso microfono negato. Abilitalo nelle impostazioni del browser e riprova.'
          : 'Non riesco ad aprire il microfono. Verifica che non sia già occupato da un’altra applicazione.',
      );
      stop();
    }
  }, [resolveAutomaticMode, stop]);

  useEffect(() => {
    return () => {
      const resources = audioResourcesRef.current;
      if (!resources) return;
      cancelAnimationFrame(resources.frameId);
      resources.stream.getTracks().forEach((track) => track.stop());
      void resources.context.close();
    };
  }, []);

  return {
    activeMode,
    detection,
    error,
    isListening,
    polyphonicDetections,
    resetMeasurements,
    start,
    stop,
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function calculateRms(samples: Float32Array) {
  const power = samples.reduce((sum, sample) => sum + sample * sample, 0);
  return Math.sqrt(power / samples.length);
}
