'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AudioLines,
  Check,
  Expand,
  Gauge,
  LockKeyhole,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  Volume2,
  Waves,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { useTuner } from '@/hooks/use-tuner';
import { useTunerWebMcp } from '@/hooks/use-tuner-webmcp';
import {
  frequencyToNote,
  getClosestString,
  getPresetFrequencyRange,
  INSTRUMENT_PRESETS,
  midiToFrequency,
} from '@/lib/music';

const DIAL_TICKS = Array.from({ length: 21 }, (_, index) => index);
const HISTORY_CAPACITY = 56;

type HoldState = {
  index: number;
  startedAt: number;
};

/**
 * Superficie principale dell'accordatore. Tutta l'elaborazione audio resta nel browser:
 * il componente riceve soltanto misure numeriche prodotte dall'hook dedicato.
 */
export default function Home() {
  const [presetId, setPresetId] = useState('guitar-standard');
  const [referencePitch, setReferencePitch] = useState(440);
  const [sensitivity, setSensitivity] = useState(72);
  const [tunedStrings, setTunedStrings] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<number[]>([]);
  const holdStateRef = useRef<HoldState | null>(null);
  const handlePresetChange = useCallback((nextPresetId: string) => {
    setPresetId(nextPresetId);
    setTunedStrings(new Set());
    setHistory([]);
    holdStateRef.current = null;
  }, []);

  useTunerWebMcp({
    presetId,
    referencePitch,
    sensitivity,
    setPresetId: handlePresetChange,
    setReferencePitch,
    setSensitivity,
  });

  const preset = useMemo(
    () =>
      INSTRUMENT_PRESETS.find((candidate) => candidate.id === presetId) ??
      INSTRUMENT_PRESETS[0],
    [presetId],
  );
  const frequencyRange = useMemo(
    () => getPresetFrequencyRange(preset),
    [preset],
  );
  const { detection, error, isListening, start, stop } = useTuner({
    maxFrequency: frequencyRange.max,
    minFrequency: frequencyRange.min,
    sensitivity,
  });

  const chromaticNote = detection
    ? frequencyToNote(detection.frequency, referencePitch)
    : null;
  const closestString = detection
    ? getClosestString(detection.frequency, preset, referencePitch)
    : null;
  const assistedTarget =
    closestString && Math.abs(closestString.cents) <= 120
      ? closestString
      : null;
  const displayedNote = assistedTarget
    ? {
        cents: assistedTarget.cents,
        label: assistedTarget.string.note.slice(0, -1),
        octave: Number(assistedTarget.string.note.slice(-1)),
      }
    : chromaticNote;
  const cents = displayedNote?.cents ?? 0;
  const detectedFrequency = detection?.frequency;
  const detectedCents = displayedNote?.cents;
  const isInTune = Boolean(
    detection && Math.abs(cents) <= 4 && detection.stability >= 64,
  );
  const dialAngle = Math.max(-50, Math.min(50, cents)) * 1.02;
  const historyPoints = history
    .map((value, index) => {
      const x = (index / Math.max(1, HISTORY_CAPACITY - 1)) * 100;
      const y = 50 - Math.max(-50, Math.min(50, value));
      return `${x},${y}`;
    })
    .join(' ');

  useEffect(() => {
    if (detectedFrequency === undefined || detectedCents === undefined) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      setHistory((current) => [...current, detectedCents].slice(-HISTORY_CAPACITY));
    });
    return () => cancelAnimationFrame(frameId);
  }, [detectedCents, detectedFrequency]);

  useEffect(() => {
    if (!detection || !assistedTarget) {
      holdStateRef.current = null;
      return;
    }

    if (tunedStrings.has(assistedTarget.index)) {
      holdStateRef.current = null;
      return;
    }

    const qualifies =
      Math.abs(assistedTarget.cents) <= 4 &&
      detection.confidence >= 0.72 &&
      detection.stability >= 64;
    if (!qualifies) {
      holdStateRef.current = null;
      return;
    }

    const now = detection.measuredAt;
    const currentHold = holdStateRef.current;
    if (!currentHold || currentHold.index !== assistedTarget.index) {
      holdStateRef.current = { index: assistedTarget.index, startedAt: now };
      return;
    }

    if (now - currentHold.startedAt >= 650) {
      setTunedStrings((current) => {
        // Restituire lo stesso insieme evita un nuovo render quando la corda è già confermata.
        if (current.has(assistedTarget.index)) return current;
        return new Set(current).add(assistedTarget.index);
      });
      holdStateRef.current = null;
    }
  }, [assistedTarget, detection, tunedStrings]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.matches('input, select, textarea, button')) {
        return;
      }

      event.preventDefault();
      if (isListening) {
        stop();
      } else {
        void start();
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [isListening, start, stop]);

  const status = getTuningStatus({ cents, hasSignal: Boolean(detection), isInTune });
  const selectedTone = assistedTarget?.string ?? preset.strings[0] ?? null;

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Aurelia Tuner, torna all'inizio">
          <span className="brand-mark" aria-hidden="true">
            <AudioLines />
          </span>
          <span>
            <strong>AURELIA</strong>
            <small>precision tuner</small>
          </span>
        </a>
        <div className="privacy-chip">
          <LockKeyhole aria-hidden="true" />
          <span>Audio privato · elaborato sul dispositivo</span>
        </div>
      </header>

      <section className="intro" id="top">
        <div>
          <p className="eyebrow">Studio accuracy · Zero latency feel</p>
          <h1>Accorda il suono, non lo schermo.</h1>
        </div>
        <p>
          Un accordatore cromatico ad alta precisione che distingue la fondamentale
          dalle armoniche e stabilizza la lettura senza nascondere il movimento reale
          della nota.
        </p>
      </section>

      <section className="tuner-workspace" aria-label="Accordatore">
        <aside className="control-panel instrument-panel">
          <div className="panel-heading">
            <span className="panel-icon"><Waves /></span>
            <div>
              <p className="overline">Configurazione</p>
              <h2>Strumento</h2>
            </div>
          </div>

          <label className="field-label" htmlFor="instrument-preset">
            Accordatura
          </label>
          <NativeSelect
            className="w-full"
            id="instrument-preset"
            value={presetId}
            onChange={(event) => handlePresetChange(event.target.value)}
          >
            {INSTRUMENT_PRESETS.map((candidate) => (
              <NativeSelectOption key={candidate.id} value={candidate.id}>
                {candidate.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <div className="string-list" aria-label="Corde dell'accordatura selezionata">
            {preset.strings.length > 0 ? (
              preset.strings.map((string, index) => {
                const frequency = midiToFrequency(string.midi, referencePitch);
                const isActive = assistedTarget?.index === index;
                const isComplete = tunedStrings.has(index);
                return (
                  <button
                    className={`string-row${isActive ? ' is-active' : ''}${isComplete ? ' is-complete' : ''}`}
                    key={`${string.note}-${index}`}
                    type="button"
                    onClick={() => playReferenceTone(frequency)}
                    aria-label={`Riproduci la corda ${string.note}, ${frequency.toFixed(2)} hertz`}
                  >
                    <span className="string-state" aria-hidden="true">
                      {isComplete ? <Check /> : index + 1}
                    </span>
                    <strong>{string.note}</strong>
                    <span>{frequency.toFixed(2)} Hz</span>
                    <Volume2 aria-hidden="true" />
                  </button>
                );
              })
            ) : (
              <div className="chromatic-card">
                <Sparkles aria-hidden="true" />
                <p><strong>Modalità cromatica</strong><br />Riconosce qualsiasi nota da C1 a C7.</p>
              </div>
            )}
          </div>

          {preset.strings.length > 0 && (
            <div className="tuning-progress">
              <div>
                <span>Sessione</span>
                <strong>{tunedStrings.size}/{preset.strings.length} corde</strong>
              </div>
              <Progress value={(tunedStrings.size / preset.strings.length) * 100} />
              <button type="button" onClick={() => setTunedStrings(new Set())}>
                <RotateCcw aria-hidden="true" /> Azzera controllo
              </button>
            </div>
          )}
        </aside>

        <article className={`tuner-stage tone-${status.tone}`}>
          <div className="stage-topline">
            <div className="signal-state">
              <span className={`signal-dot${isListening ? ' is-live' : ''}`} />
              {isListening ? (detection ? 'Segnale acquisito' : 'In ascolto…') : 'Microfono inattivo'}
            </div>
            <button type="button" className="fullscreen-button" onClick={toggleFullscreen}>
              <Expand aria-hidden="true" /> Schermo intero
            </button>
          </div>

          <div className="note-readout" aria-live="polite" aria-atomic="true">
            <p>{status.label}</p>
            <div className="note-line">
              <span>{displayedNote?.label ?? '—'}</span>
              {displayedNote && <sup>{displayedNote.octave}</sup>}
            </div>
            <strong>{detection ? `${formatSigned(cents)} cent` : 'Suona una nota pulita e sostenuta'}</strong>
          </div>

          <div className="dial" aria-label={`Deviazione ${formatSigned(cents)} cent`}>
            <div className="dial-aura" />
            <div className="dial-ticks" aria-hidden="true">
              {DIAL_TICKS.map((tick) => (
                <i key={tick} style={{ transform: `rotate(${-51 + tick * 5.1}deg)` }} />
              ))}
            </div>
            <span className="dial-zone" aria-hidden="true" />
            <span
              className="dial-needle"
              style={{ transform: `translateX(-50%) rotate(${dialAngle}deg)` }}
              aria-hidden="true"
            />
            <span className="dial-pivot" aria-hidden="true" />
            <span className="dial-label dial-flat">♭ BASSA</span>
            <span className="dial-label dial-center">0</span>
            <span className="dial-label dial-sharp">ALTA ♯</span>
          </div>

          <div className="strobe" aria-hidden="true">
            <div
              className={`strobe-track${detection ? ' is-moving' : ''}`}
              style={{
                animationDirection: cents < 0 ? 'reverse' : 'normal',
                animationDuration: `${Math.max(0.28, 2.2 - Math.min(50, Math.abs(cents)) * 0.035)}s`,
                animationPlayState: isInTune || !detection ? 'paused' : 'running',
              }}
            />
          </div>

          <div className="history-card">
            <div className="history-heading">
              <span><Activity aria-hidden="true" /> Traccia intonazione</span>
              <span>−50 <b>0</b> +50</span>
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="0" y1="50" x2="100" y2="50" />
              <line className="limit-line" x1="0" y1="46" x2="100" y2="46" />
              <line className="limit-line" x1="0" y1="54" x2="100" y2="54" />
              {historyPoints && <polyline points={historyPoints} />}
            </svg>
          </div>

          {error && <p className="error-message" role="alert">{error}</p>}

          <Button
            className={`listen-button${isListening ? ' is-stopping' : ''}`}
            size="lg"
            onClick={() => (isListening ? stop() : void start())}
          >
            {isListening ? <MicOff /> : <Mic />}
            {isListening ? 'Interrompi ascolto' : 'Attiva il microfono'}
            <kbd>spazio</kbd>
          </Button>
        </article>

        <aside className="control-panel analysis-panel">
          <div className="panel-heading">
            <span className="panel-icon"><Gauge /></span>
            <div>
              <p className="overline">Telemetria</p>
              <h2>Analisi</h2>
            </div>
          </div>

          <div className="metrics-grid">
            <Metric label="Frequenza" value={detection ? detection.frequency.toFixed(2) : '—'} unit="Hz" />
            <Metric label="Deviazione" value={detection ? formatSigned(cents) : '—'} unit="cent" tone={status.tone} />
            <Metric label="Affidabilità" value={detection ? Math.round(detection.confidence * 100).toString() : '—'} unit="%" />
            <Metric label="Stabilità" value={detection ? Math.round(detection.stability).toString() : '—'} unit="%" />
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="reference-pitch">Riferimento A4</label>
              <output>{referencePitch} Hz</output>
            </div>
            <Slider
              id="reference-pitch"
              min={415}
              max={466}
              step={1}
              value={[referencePitch]}
              onValueChange={(value) =>
                setReferencePitch(typeof value === 'number' ? value : (value[0] ?? 440))
              }
              aria-label="Frequenza di riferimento del La quattro"
            />
            <div className="preset-buttons" aria-label="Riferimenti rapidi">
              {[432, 440, 442].map((value) => (
                <button
                  className={referencePitch === value ? 'is-selected' : ''}
                  key={value}
                  type="button"
                  onClick={() => setReferencePitch(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="sensitivity">Sensibilità</label>
              <output>{sensitivity}%</output>
            </div>
            <Slider
              id="sensitivity"
              min={30}
              max={100}
              step={1}
              value={[sensitivity]}
              onValueChange={(value) =>
                setSensitivity(typeof value === 'number' ? value : (value[0] ?? 72))
              }
              aria-label="Sensibilità del rilevamento audio"
            />
            <p className="control-help">Aumentala per strumenti delicati; riducila in ambienti rumorosi.</p>
          </div>

          <div className="algorithm-card">
            <span><Sparkles aria-hidden="true" /> AURELIA HYBRID YIN</span>
            <p>
              Periodicità normalizzata, verifica armonica, interpolazione sub-campione
              e filtro adattivo in dominio cent.
            </p>
            <div>
              <span>Range</span>
              <strong>{frequencyRange.min}–{frequencyRange.max} Hz</strong>
            </div>
          </div>

          {selectedTone && (
            <button
              className="tone-button"
              type="button"
              onClick={() => playReferenceTone(midiToFrequency(selectedTone.midi, referencePitch))}
            >
              <span><Volume2 aria-hidden="true" /></span>
              <span><small>Tono guida</small><strong>{selectedTone.note}</strong></span>
              <span>Riproduci</span>
            </button>
          )}
        </aside>
      </section>

      <footer>
        <p><LockKeyhole aria-hidden="true" /> Nessuna registrazione, nessun upload, nessun account.</p>
        <p>Aurelia Tuner · Web Audio API</p>
      </footer>
    </main>
  );
}

function Metric({
  label,
  tone,
  unit,
  value,
}: {
  label: string;
  tone?: 'idle' | 'flat' | 'sharp' | 'perfect';
  unit: string;
  value: string;
}) {
  return (
    <div className={`metric${tone ? ` tone-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{unit}</small>
    </div>
  );
}

function getTuningStatus({
  cents,
  hasSignal,
  isInTune,
}: {
  cents: number;
  hasSignal: boolean;
  isInTune: boolean;
}) {
  if (!hasSignal) return { label: 'Pronto quando lo sei', tone: 'idle' as const };
  if (isInTune) return { label: 'Intonazione centrata', tone: 'perfect' as const };
  if (cents < 0) return { label: 'Alza leggermente', tone: 'flat' as const };
  return { label: 'Abbassa leggermente', tone: 'sharp' as const };
}

function formatSigned(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}

/** Riproduce un riferimento breve con inviluppo morbido per evitare click udibili. */
function playReferenceTone(frequency: number) {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass({ latencyHint: 'interactive' });
  const masterGain = context.createGain();
  const fundamental = context.createOscillator();
  const overtone = context.createOscillator();
  const now = context.currentTime;

  fundamental.type = 'sine';
  fundamental.frequency.value = frequency;
  overtone.type = 'triangle';
  overtone.frequency.value = frequency * 2;

  const overtoneGain = context.createGain();
  overtoneGain.gain.value = 0.14;
  fundamental.connect(masterGain);
  overtone.connect(overtoneGain).connect(masterGain);
  masterGain.connect(context.destination);
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(0.18, now + 0.035);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);

  fundamental.start(now);
  overtone.start(now);
  fundamental.stop(now + 1.4);
  overtone.stop(now + 1.4);
  overtone.onended = () => void context.close();
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen();
  }
}
