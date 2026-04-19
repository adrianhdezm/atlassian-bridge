import type { Issue } from './jira-models.js';

const STRIPPED_KEYS: ReadonlySet<string> = new Set(['self', 'avatarUrls', 'iconUrl']);

function stripKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripKeys);
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!STRIPPED_KEYS.has(k)) {
        result[k] = stripKeys(v);
      }
    }
    return result;
  }
  return value;
}

export function formatIssue(issue: Issue): Record<string, unknown> {
  return stripKeys(issue) as Record<string, unknown>;
}
