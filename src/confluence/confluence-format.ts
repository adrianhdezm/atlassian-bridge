import type { Page, Space } from './confluence-models.js';
import { stripKeys, stripPaths } from '../shared/format-utils.js';

const STRIPPED_KEYS: ReadonlySet<string> = new Set(['_links']);

const STRIPPED_PAGE_PATHS: ReadonlyArray<string> = [];

const STRIPPED_SPACE_PATHS: ReadonlyArray<string> = [];

export function formatPage(page: Page): Record<string, unknown> {
  return stripPaths(stripKeys(page, STRIPPED_KEYS), STRIPPED_PAGE_PATHS) as Record<string, unknown>;
}

export function formatSpace(space: Space): Record<string, unknown> {
  return stripPaths(stripKeys(space, STRIPPED_KEYS), STRIPPED_SPACE_PATHS) as Record<string, unknown>;
}
