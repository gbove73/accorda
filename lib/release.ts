import packageMetadata from '../package.json';

/** Metadati aggiornati per ogni pubblicazione e mostrati nell'interfaccia. */
export const RELEASE = {
  dateIso: '2026-09-09',
  dateLabel: '09/09/2026',
  version: `v${packageMetadata.version}`,
} as const;
