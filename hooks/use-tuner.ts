'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { detectPitch } from '@/lib/pitch-detector';

export type TunerMeasurement = {
  confidence: number;
  frequency: number;
  measuredAt: number;
  rms: number;
  stability: number;
};

type UseTunerOptions = {
  maxFrequency: number;
  minFrequency: number;
  sensitivity: number;
};

type AudioResources = {
  analyser: AnalyserNode;
  context: AudioContext;
  frameId: number;
  stream: MediaStream;
};

const ANALYSIS_INTERVAL_MS = 46;
const NOTE_WINDOW_SIZE = 9;

/**
 * Gestisce il ciclo di vita del microfono e stabilizza le misure in semitoni.
 * Filtrare in dominio musicale evita che l'inerzia cambi tra note gravi e acute.
 */
export function useTuner({ maxFrequency, minFrequency, sensitivity }: UseTunerOptions) {
  const [detection, setDetection] = useState<TunerMeasurement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const audioResourcesRef = useRef<AudioResources | null>(null);
  const noteWindowRef = useRef<number[]>([]);
  const smoothedNoteRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const lastSignalAtRef = useRef(0);
  const optionsRef = useRef({ maxFrequency, minFrequency, sensitivity });

  useEffect(() => {
    optionsRef.current = { maxFrequency, minFrequency, sensitivity };
  }, [maxFrequency, minFrequency, sensitivity]);

  const stop = useCallback(() => {
    const resources = audioResourcesRef.current;
    if (resources) {
      cancelAnimationFrame(resources.frameId);
      resources.stream.getTracks().forEach((track) => track.stop());
      void resources.context.close();
      audioResourcesRef.current = null;
    }

    noteWindowRef.current = [];
    smoothedNoteRef.current = null;
    setDetection(null);
    setIsListening(false);
  }, []);

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
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0;
      context.createMediaStreamSource(stream).connect(analyser);

      audioResourcesRef.current = { analyser, context, frameId: 0, stream };
      setIsListening(true);

      function analyseFrame(timestamp: number) {
        const resources = audioResourcesRef.current;
        if (!resources) return;

        if (timestamp - lastFrameAtRef.current >= ANALYSIS_INTERVAL_MS) {
          lastFrameAtRef.current = timestamp;
          const samples = new Float32Array(resources.analyser.fftSize);
          resources.analyser.getFloatTimeDomainData(samples);
          const currentOptions = optionsRef.current;
          const gate = 0.0018 + ((100 - currentOptions.sensitivity) / 70) * 0.012;
          const result = detectPitch(samples, resources.context.sampleRate, {
            maxFrequency: currentOptions.maxFrequency,
            minFrequency: currentOptions.minFrequency,
            minRms: gate,
          });

          if (result && result.confidence >= 0.55) {
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
            setDetection({
              confidence: result.confidence,
              frequency: 440 * 2 ** ((smoothedNote - 69) / 12),
              measuredAt: timestamp,
              rms: result.rms,
              stability: Math.max(0, 100 - spread * 5.2),
            });
          } else if (timestamp - lastSignalAtRef.current > 360) {
            noteWindowRef.current = [];
            smoothedNoteRef.current = null;
            setDetection(null);
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
  }, [stop]);

  useEffect(() => {
    return () => {
      const resources = audioResourcesRef.current;
      if (!resources) return;
      cancelAnimationFrame(resources.frameId);
      resources.stream.getTracks().forEach((track) => track.stop());
      void resources.context.close();
    };
  }, []);

  return { detection, error, isListening, start, stop };
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
