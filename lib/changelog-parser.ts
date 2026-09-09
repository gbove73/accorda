export type ChangelogSection = {
  items: string[];
  title: string;
};

export type ChangelogRelease = {
  date: string | null;
  sections: ChangelogSection[];
  version: string;
};

/**
 * Converte il formato Keep a Changelog usato dal progetto in dati adatti alla
 * timeline. Le righe indentate continuano la voce precedente, evitando duplicazioni.
 */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let currentRelease: ChangelogRelease | null = null;
  let currentSection: ChangelogSection | null = null;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    const releaseMatch = line.match(/^## \[([^\]]+)](?: - (\d{4}-\d{2}-\d{2}))?$/);
    if (releaseMatch) {
      currentRelease = {
        date: releaseMatch[2] ?? null,
        sections: [],
        version: releaseMatch[1] ?? '',
      };
      currentSection = null;
      if (currentRelease.version !== 'Unreleased') releases.push(currentRelease);
      continue;
    }

    const sectionMatch = line.match(/^### (.+)$/);
    if (sectionMatch && currentRelease) {
      currentSection = { items: [], title: sectionMatch[1] ?? '' };
      currentRelease.sections.push(currentSection);
      continue;
    }

    if (line.startsWith('- ') && currentSection) {
      currentSection.items.push(line.slice(2));
      continue;
    }

    if (line && currentSection && currentSection.items.length > 0) {
      const lastIndex = currentSection.items.length - 1;
      currentSection.items[lastIndex] = `${currentSection.items[lastIndex]} ${line}`;
    }
  }

  return releases;
}
