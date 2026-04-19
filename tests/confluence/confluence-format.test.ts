import { describe, it, expect } from 'vitest';
import { formatPage } from '../../src/confluence/confluence-format.js';
import type { Page } from '../../src/confluence/confluence-models.js';

describe('confluence-format', () => {
  describe('formatPage', () => {
    const basePage: Page = {
      id: '12345',
      status: 'current',
      title: 'Test Page',
      spaceId: '100',
      parentId: null,
      authorId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      version: { number: 1, message: '', authorId: 'user-1' },
      _links: { webui: '/spaces/TEST/pages/12345' }
    };

    it('strips _links from the page', () => {
      const result = formatPage(basePage);
      expect(result).not.toHaveProperty('_links');
    });

    it('preserves all other fields', () => {
      const result = formatPage(basePage);
      expect(result['id']).toBe('12345');
      expect(result['title']).toBe('Test Page');
      expect(result['status']).toBe('current');
      expect(result['spaceId']).toBe('100');
    });

    it('preserves nested objects like version', () => {
      const result = formatPage(basePage);
      const version = result['version'] as Record<string, unknown>;
      expect(version['number']).toBe(1);
      expect(version['authorId']).toBe('user-1');
    });

    it('preserves body when present', () => {
      const page: Page = {
        ...basePage,
        body: { atlas_doc_format: { value: '{"type":"doc"}', representation: 'atlas_doc_format' } }
      };
      const result = formatPage(page);
      const body = result['body'] as Record<string, unknown>;
      expect(body['atlas_doc_format']).toBeDefined();
    });

    it('preserves null parentId', () => {
      const result = formatPage(basePage);
      expect(result['parentId']).toBeNull();
    });
  });
});
