import { describe, it, expect } from 'vitest';
import { stripKeys } from '../../src/shared/strip-keys.js';

describe('strip-keys', () => {
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
});
