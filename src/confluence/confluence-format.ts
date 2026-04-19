import type { Page } from './confluence-models.js';
import { stripKeys } from '../shared/strip-keys.js';

const STRIPPED_KEYS: ReadonlySet<string> = new Set(['_links']);

export function formatPage(page: Page): Record<string, unknown> {
  return stripKeys(page, STRIPPED_KEYS) as Record<string, unknown>;
}
