import type { Issue } from './jira-models.js';
import { stripKeys } from '../shared/strip-keys.js';

const STRIPPED_KEYS: ReadonlySet<string> = new Set(['self', 'avatarUrls', 'iconUrl']);

export function formatIssue(issue: Issue): Record<string, unknown> {
  return stripKeys(issue, STRIPPED_KEYS) as Record<string, unknown>;
}
