'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';

import type { TunerMode } from '@/hooks/use-tuner';
import { INSTRUMENT_PRESETS } from '@/lib/music';

type TunerSettings = {
  mode: TunerMode;
  presetId: string;
  referencePitch: number;
  sensitivity: number;
};

type UseTunerWebMcpOptions = TunerSettings & {
  setMode: (mode: TunerMode) => void;
  setPresetId: (presetId: string) => void;
  setReferencePitch: Dispatch<SetStateAction<number>>;
  setSensitivity: Dispatch<SetStateAction<number>>;
};

type WebMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  execute(input: unknown): TunerSettings | Promise<TunerSettings>;
};

type ModelContext = {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void>;
};

/**
 * Espone soltanto la configurazione già disponibile nell'interfaccia. Il microfono
 * resta escluso perché il suo consenso deve avvenire tramite un gesto esplicito.
 */
export function useTunerWebMcp({
  mode,
  presetId,
  referencePitch,
  sensitivity,
  setMode,
  setPresetId,
  setReferencePitch,
  setSensitivity,
}: UseTunerWebMcpOptions) {
  const settingsRef = useRef<TunerSettings>({ mode, presetId, referencePitch, sensitivity });

  useEffect(() => {
    settingsRef.current = { mode, presetId, referencePitch, sensitivity };
  }, [mode, presetId, referencePitch, sensitivity]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    const supportedPresetIds = INSTRUMENT_PRESETS.map((preset) => preset.id);
    const register = (tool: WebMcpTool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => undefined);
      } catch {
        // Un browser con implementazione parziale non deve compromettere l'accordatore.
      }
    };

    register({
      name: 'set_tuner_configuration',
      title: 'Configura accordatore',
      description:
        'Imposta modalità, preset dello strumento, riferimento A4 e sensibilità, aggiornando gli stessi controlli visibili nell’accordatore.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['auto', 'precision', 'polyphonic'] },
          presetId: { type: 'string', enum: supportedPresetIds },
          referencePitch: { type: 'integer', minimum: 415, maximum: 466 },
          sensitivity: { type: 'integer', minimum: 30, maximum: 100 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const next = validateConfiguration(input, settingsRef.current, supportedPresetIds);
        setPresetId(next.presetId);
        setMode(next.mode);
        setReferencePitch(next.referencePitch);
        setSensitivity(next.sensitivity);
        settingsRef.current = next;
        await waitForVisibleUpdate();
        return next;
      },
    });

    register({
      name: 'read_tuner_configuration',
      title: 'Leggi configurazione accordatore',
      description:
        'Restituisce modalità, preset, riferimento A4 e sensibilità attualmente visibili nell’accordatore.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!isPlainObject(input) || Object.keys(input).length > 0) {
          throw new Error('Il comando di lettura non accetta parametri.');
        }
        return settingsRef.current;
      },
    });

    return () => lifecycle.abort();
  }, [setMode, setPresetId, setReferencePitch, setSensitivity]);
}

function validateConfiguration(
  input: unknown,
  current: TunerSettings,
  supportedPresetIds: string[],
): TunerSettings {
  if (!isPlainObject(input)) {
    throw new Error('La configurazione deve essere un oggetto JSON.');
  }

  const allowedKeys = new Set(['mode', 'presetId', 'referencePitch', 'sensitivity']);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new Error('La configurazione contiene proprietà non supportate.');
  }

  const requestedMode = input.mode ?? current.mode;
  const presetId = input.presetId ?? current.presetId;
  const referencePitch = input.referencePitch ?? current.referencePitch;
  const sensitivity = input.sensitivity ?? current.sensitivity;

  if (
    requestedMode !== 'auto' &&
    requestedMode !== 'precision' &&
    requestedMode !== 'polyphonic'
  ) {
    throw new Error('La modalità deve essere “auto”, “precision” oppure “polyphonic”.');
  }
  if (typeof presetId !== 'string' || !supportedPresetIds.includes(presetId)) {
    throw new Error('Preset non riconosciuto.');
  }
  if (
    typeof referencePitch !== 'number' ||
    !Number.isInteger(referencePitch) ||
    referencePitch < 415 ||
    referencePitch > 466
  ) {
    throw new Error('Il riferimento A4 deve essere un intero tra 415 e 466 Hz.');
  }
  if (
    typeof sensitivity !== 'number' ||
    !Number.isInteger(sensitivity) ||
    sensitivity < 30 ||
    sensitivity > 100
  ) {
    throw new Error('La sensibilità deve essere un intero tra 30 e 100.');
  }

  const selectedPreset = INSTRUMENT_PRESETS.find((preset) => preset.id === presetId);
  const mode = requestedMode === 'polyphonic' && (selectedPreset?.strings.length ?? 0) < 2
    ? 'precision'
    : requestedMode;

  return {
    mode,
    presetId,
    referencePitch,
    sensitivity,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function waitForVisibleUpdate() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
