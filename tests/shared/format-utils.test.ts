import { describe, it, expect } from 'vitest';
import { stripKeys, stripPaths } from '../../src/shared/format-utils.js';

describe('format-utils', () => {
  describe('stripKeys', () => {
    const keys = new Set(['self', '_links']);

    it('returns primitives unchanged', () => {
      expect(stripKeys('hello', keys)).toBe('hello');
      expect(stripKeys(42, keys)).toBe(42);
      expect(stripKeys(true, keys)).toBe(true);
      expect(stripKeys(null, keys)).toBeNull();
      expect(stripKeys(undefined, keys)).toBeUndefined();
    });

    it('strips matching keys from a flat object', () => {
      const result = stripKeys({ id: '1', self: 'https://example.com', name: 'Test' }, keys);
      expect(result).toEqual({ id: '1', name: 'Test' });
    });

    it('strips matching keys recursively', () => {
      const input = {
        id: '1',
        self: 'https://top.com',
        nested: { id: '2', self: 'https://nested.com', _links: { webui: '/page' } }
      };
      expect(stripKeys(input, keys)).toEqual({
        id: '1',
        nested: { id: '2' }
      });
    });

    it('strips matching keys inside arrays', () => {
      const input = [
        { id: '1', self: 'https://a.com' },
        { id: '2', self: 'https://b.com' }
      ];
      expect(stripKeys(input, keys)).toEqual([{ id: '1' }, { id: '2' }]);
    });

    it('preserves objects when no keys match', () => {
      const input = { id: '1', name: 'Test' };
      expect(stripKeys(input, keys)).toEqual({ id: '1', name: 'Test' });
    });

    it('handles deeply nested structures', () => {
      const input = { a: { b: { c: { self: 'x', value: 1 } } } };
      expect(stripKeys(input, keys)).toEqual({ a: { b: { c: { value: 1 } } } });
    });
  });

  describe('stripPaths', () => {
    it('removes a top-level path', () => {
      const input = { id: '1', name: 'Test', self: 'https://example.com' };
      expect(stripPaths(input, ['self'])).toEqual({ id: '1', name: 'Test' });
    });

    it('removes a nested path', () => {
      const input = { fields: { issuetype: { id: '10', name: 'Bug', description: 'A bug' } } };
      expect(stripPaths(input, ['fields.issuetype.description'])).toEqual({
        fields: { issuetype: { id: '10', name: 'Bug' } }
      });
    });

    it('removes multiple paths', () => {
      const input = {
        fields: {
          issuetype: { id: '10', name: 'Bug', description: 'A bug' },
          priority: { id: '1', name: 'High', description: 'Urgent' }
        }
      };
      expect(stripPaths(input, ['fields.issuetype.description', 'fields.priority.description'])).toEqual({
        fields: {
          issuetype: { id: '10', name: 'Bug' },
          priority: { id: '1', name: 'High' }
        }
      });
    });

    it('ignores paths that do not exist', () => {
      const input = { id: '1', name: 'Test' };
      expect(stripPaths(input, ['fields.issuetype.description'])).toEqual({ id: '1', name: 'Test' });
    });

    it('ignores paths when an intermediate segment is a primitive', () => {
      const input = { fields: 'not-an-object' };
      expect(stripPaths(input, ['fields.issuetype.description'])).toEqual({ fields: 'not-an-object' });
    });

    it('does not mutate the original object', () => {
      const input = { fields: { issuetype: { id: '10', description: 'A bug' } } };
      stripPaths(input, ['fields.issuetype.description']);
      expect(input.fields.issuetype.description).toBe('A bug');
    });

    it('returns primitives unchanged', () => {
      expect(stripPaths('hello', ['a.b'])).toBe('hello');
      expect(stripPaths(42, ['a.b'])).toBe(42);
      expect(stripPaths(null, ['a.b'])).toBeNull();
    });

    it('handles an empty paths array', () => {
      const input = { id: '1', name: 'Test' };
      expect(stripPaths(input, [])).toEqual({ id: '1', name: 'Test' });
    });
  });
});
