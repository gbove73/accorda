import changelogMarkdown from '../CHANGELOG.md?raw';
import { parseChangelog } from './changelog-parser';

export const CHANGELOG_RELEASES = parseChangelog(changelogMarkdown);
