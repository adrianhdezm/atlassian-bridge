import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { AdfSchema } from '../../src/shared/adf-schema.js';

describe('adf-schema', () => {
  describe('AdfSchema', () => {
    describe('valid documents', () => {
      it('accepts a simple paragraph', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }]
        };
        expect(() => AdfSchema.parse(doc)).not.toThrow();
      });

      it('accepts emoji inline nodes', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'emoji', attrs: { shortName: ':smile:', id: '1f604', text: '😄' } }]
            }
          ]
        };
        expect(() => AdfSchema.parse(doc)).not.toThrow();
      });

      it('accepts status inline nodes', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'status', attrs: { text: 'IN PROGRESS', color: 'blue', localId: 'abc-123' } }]
            }
          ]
        };
        expect(() => AdfSchema.parse(doc)).not.toThrow();
      });

      it('accepts mediaSingle with media child', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'mediaSingle',
              attrs: { layout: 'center' },
              content: [{ type: 'media', attrs: { id: 'abc-123', type: 'file', collection: 'my-collection' } }]
            }
          ]
        };
        expect(() => AdfSchema.parse(doc)).not.toThrow();
      });

      it('accepts annotation marks (inline comments)', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'annotated',
                  marks: [{ type: 'annotation', attrs: { id: 'c-1', annotationType: 'inlineComment' } }]
                }
              ]
            }
          ]
        };
        expect(() => AdfSchema.parse(doc)).not.toThrow();
      });

      it('accepts table with header and cell rows', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'table',
              attrs: { isNumberColumnEnabled: false, layout: 'default', localId: 'tbl-1' },
              content: [
                {
                  type: 'tableRow',
                  content: [
                    {
                      type: 'tableHeader',
                      attrs: {},
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header' }] }]
                    }
                  ]
                },
                {
                  type: 'tableRow',
                  content: [
                    {
                      type: 'tableCell',
                      attrs: {},
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }]
                    }
                  ]
                }
              ]
            }
          ]
        };
        expect(() => AdfSchema.parse(doc)).not.toThrow();
      });

      it('accepts expand nodes', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'expand',
              attrs: { title: 'Click to expand' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hidden content' }] }]
            }
          ]
        };
        expect(() => AdfSchema.parse(doc)).not.toThrow();
      });

      it('accepts a document mixing emoji, status, and annotation', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'emoji', attrs: { shortName: ':check:', id: '2705', text: '✅' } },
                { type: 'text', text: ' Task is ' },
                { type: 'status', attrs: { text: 'DONE', color: 'green', localId: 'st-1' } },
                {
                  type: 'text',
                  text: ' with comment',
                  marks: [{ type: 'annotation', attrs: { id: 'c-1', annotationType: 'inlineComment' } }]
                }
              ]
            }
          ]
        };
        expect(() => AdfSchema.parse(doc)).not.toThrow();
      });

      it('accepts bulletList and orderedList with nested content', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bullet' }] }]
                }
              ]
            },
            {
              type: 'orderedList',
              attrs: { order: 1 },
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'numbered' }] }]
                }
              ]
            }
          ]
        };
        expect(() => AdfSchema.parse(doc)).not.toThrow();
      });

      it('preserves extra fields like localId on passthrough', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              attrs: { localId: 'abc-123' },
              content: [{ type: 'text', text: 'hello' }]
            }
          ]
        };
        const result = AdfSchema.parse(doc);
        expect((result.content[0] as Record<string, unknown>).attrs).toEqual({ localId: 'abc-123' });
      });

      it('accepts an empty document', () => {
        const doc = { version: 1, type: 'doc', content: [] };
        expect(() => AdfSchema.parse(doc)).not.toThrow();
      });
    });

    describe('invalid documents', () => {
      it('rejects a document missing version', () => {
        const doc = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }]
        };
        expect(() => AdfSchema.parse(doc)).toThrow(z.ZodError);
      });

      it('rejects a document with unknown top-level node type', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [{ type: 'madeUpNode', content: [] }]
        };
        expect(() => AdfSchema.parse(doc)).toThrow(z.ZodError);
      });

      it('rejects a text node missing the text field', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text' }] }]
        };
        expect(() => AdfSchema.parse(doc)).toThrow(z.ZodError);
      });

      it('rejects a node with an unknown mark type', () => {
        const doc = {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'bad', marks: [{ type: 'madeUpMark' }] }]
            }
          ]
        };
        expect(() => AdfSchema.parse(doc)).toThrow(z.ZodError);
      });

      it('rejects a non-object as document', () => {
        expect(() => AdfSchema.parse('not an object')).toThrow(z.ZodError);
        expect(() => AdfSchema.parse(null)).toThrow(z.ZodError);
        expect(() => AdfSchema.parse(42)).toThrow(z.ZodError);
      });
    });
  });
});
