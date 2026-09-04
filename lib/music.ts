export type InstrumentString = {
  midi: number;
  note: string;
};

export type InstrumentPreset = {
  id: string;
  name: string;
  strings: InstrumentString[];
};

export type NoteInfo = {
  cents: number;
  label: string;
  midi: number;
  octave: number;
};

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  {
    id: 'guitar-standard',
    name: 'Chitarra · Standard E A D G B E',
    strings: makeStrings([40, 45, 50, 55, 59, 64]),
  },
  {
    id: 'guitar-drop-d',
    name: 'Chitarra · Drop D',
    strings: makeStrings([38, 45, 50, 55, 59, 64]),
  },
  {
    id: 'guitar-half-step',
    name: 'Chitarra · Mezzo tono sotto',
    strings: makeStrings([39, 44, 49, 54, 58, 63]),
  },
  {
    id: 'guitar-drop-c',
    name: 'Chitarra · Drop C',
    strings: makeStrings([36, 43, 48, 53, 57, 62]),
  },
  {
    id: 'guitar-dadgad',
    name: 'Chitarra · DADGAD',
    strings: makeStrings([38, 45, 50, 55, 57, 62]),
  },
  {
    id: 'guitar-open-g',
    name: 'Chitarra · Open G',
    strings: makeStrings([38, 43, 50, 55, 59, 62]),
  },
  {
    id: 'guitar-seven',
    name: 'Chitarra 7 corde · Standard',
    strings: makeStrings([35, 40, 45, 50, 55, 59, 64]),
  },
  {
    id: 'bass-four',
    name: 'Basso 4 corde · Standard',
    strings: makeStrings([28, 33, 38, 43]),
  },
  {
    id: 'bass-five',
    name: 'Basso 5 corde · Standard',
    strings: makeStrings([23, 28, 33, 38, 43]),
  },
  {
    id: 'ukulele-standard',
    name: 'Ukulele · G C E A',
    strings: makeStrings([67, 60, 64, 69]),
  },
  {
    id: 'violin-standard',
    name: 'Violino · G D A E',
    strings: makeStrings([55, 62, 69, 76]),
  },
  {
    id: 'mandolin-standard',
    name: 'Mandolino · G D A E',
    strings: makeStrings([55, 62, 69, 76]),
  },
  { id: 'chromatic', name: 'Cromatico · Qualsiasi nota', strings: [] },
];

/** Converte un numero MIDI nella frequenza coerente con il riferimento A4 scelto. */
export function midiToFrequency(midi: number, referencePitch = 440) {
  return referencePitch * 2 ** ((midi - 69) / 12);
}

/** Restituisce nota temperata e deviazione residua in cent. */
export function frequencyToNote(frequency: number, referencePitch = 440): NoteInfo {
  const exactMidi = 69 + 12 * Math.log2(frequency / referencePitch);
  const midi = Math.round(exactMidi);
  const noteIndex = ((midi % 12) + 12) % 12;
  return {
    cents: (exactMidi - midi) * 100,
    label: NOTE_NAMES[noteIndex],
    midi,
    octave: Math.floor(midi / 12) - 1,
  };
}

export function centsBetween(frequency: number, targetFrequency: number) {
  return 1200 * Math.log2(frequency / targetFrequency);
}

/** Seleziona la corda più vicina in cent, non semplicemente in hertz. */
export function getClosestString(
  frequency: number,
  preset: InstrumentPreset,
  referencePitch = 440,
) {
  if (preset.strings.length === 0) return null;

  return preset.strings.reduce<{
    cents: number;
    index: number;
    string: InstrumentString;
  } | null>((closest, string, index) => {
    const cents = centsBetween(frequency, midiToFrequency(string.midi, referencePitch));
    if (!closest || Math.abs(cents) < Math.abs(closest.cents)) {
      return { cents, index, string };
    }
    return closest;
  }, null);
}

export function getPresetFrequencyRange(preset: InstrumentPreset) {
  if (preset.strings.length === 0) return { min: 32, max: 2100 };
  const midiValues = preset.strings.map((string) => string.midi);
  const lowest = Math.min(...midiValues);
  const highest = Math.max(...midiValues);
  return {
    min: Math.max(20, Math.round(midiToFrequency(lowest) * 0.72)),
    max: Math.min(2400, Math.round(midiToFrequency(highest) * 2.4)),
  };
}

function makeStrings(midiValues: number[]): InstrumentString[] {
  return midiValues.map((midi) => {
    const noteIndex = ((midi % 12) + 12) % 12;
    return { midi, note: `${NOTE_NAMES[noteIndex]}${Math.floor(midi / 12) - 1}` };
  });
}
