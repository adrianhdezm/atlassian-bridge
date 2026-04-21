import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { ConfluenceClient } from '../../src/confluence/confluence-client.js';
import { confluencePaginatedSchema } from '../../src/confluence/confluence-models.js';
import { AppError } from '../../src/shared/app-error.js';

const BASE_URL = 'https://test.atlassian.net';
const V2 = `${BASE_URL}/wiki/api/v2`;

const validAdf = JSON.stringify({
  version: 1,
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }]
});

function makePage(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    status: 'current',
    title: 'Test Page',
    spaceId: '100',
    parentId: null,
    authorId: 'user1',
    createdAt: '2024-01-01T00:00:00Z',
    version: { number: 1, message: '', authorId: 'user1' },
    body: { atlas_doc_format: { value: validAdf, representation: 'atlas_doc_format' } },
    _links: { webui: '/wiki/spaces/TEST/pages/1' },
    ...overrides
  };
}

function makeDescendant(overrides: Record<string, unknown> = {}) {
  return {
    id: '10',
    status: 'current',
    title: 'Child',
    type: 'page',
    parentId: '1',
    depth: 1,
    childPosition: 0,
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' }
  });
}

function createClient() {
  return new ConfluenceClient({
    baseUrl: BASE_URL,
    email: 'user@example.com',
    apiToken: 'token123'
  });
}

describe('confluencePaginatedSchema', () => {
  const ItemSchema = z.object({ id: z.string(), name: z.string() });
  const PaginatedSchema = confluencePaginatedSchema(ItemSchema);

  it('parses a response with results and next link', () => {
    const input = {
      results: [{ id: '1', name: 'Item 1' }],
      _links: { next: '/wiki/api/v2/items?cursor=abc' }
    };

    const result = PaginatedSchema.parse(input);

    expect(result.results).toEqual([{ id: '1', name: 'Item 1' }]);
    expect(result._links.next).toBe('/wiki/api/v2/items?cursor=abc');
  });

  it('parses a response with empty results and no next link', () => {
    const input = { results: [], _links: {} };

    const result = PaginatedSchema.parse(input);

    expect(result.results).toEqual([]);
    expect(result._links.next).toBeUndefined();
  });

  it('rejects invalid item shapes', () => {
    const input = { results: [{ id: 123 }], _links: {} };

    expect(() => PaginatedSchema.parse(input)).toThrow();
  });
});

describe('confluence-client', () => {
  let client: ConfluenceClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createClient();
  });

  describe('constructor', () => {
    it('builds Basic auth header from email and token', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(makePage()));

      void client.getPage('1');

      const headers = fetchSpy.mock.calls[0][1]!.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Basic ${btoa('user@example.com:token123')}`);
    });

    it('builds v2 and v1 URL prefixes from baseUrl', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(makePage()));

      await client.getPage('42');

      expect(fetchSpy.mock.calls[0][0]).toBe(`${V2}/pages/42?body-format=atlas_doc_format`);
    });
  });

  describe('getSpace', () => {
    it('fetches a space by numeric ID', async () => {
      const space = { id: '100', key: 'DEV', name: 'Development', type: 'global', status: 'current' };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(space));

      const result = await client.getSpace('100');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe(`${V2}/spaces/100`);
      expect(result.id).toBe('100');
      expect(result.key).toBe('DEV');
    });

    it('resolves space key before fetching', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ results: [{ id: '200' }] }))
        .mockResolvedValue(jsonResponse({ id: '200', key: 'DEV', name: 'Development', type: 'global', status: 'current' }));

      const result = await client.getSpace('DEV');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][0]).toBe(`${V2}/spaces?keys=DEV`);
      expect(fetchSpy.mock.calls[1][0]).toBe(`${V2}/spaces/200`);
      expect(result.id).toBe('200');
    });
  });

  describe('getPage', () => {
    it('fetches a page by ID with body-format=atlas_doc_format', async () => {
      const page = makePage({ id: '42' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(page));

      const result = await client.getPage('42');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe(`${V2}/pages/42?body-format=atlas_doc_format`);
      expect(result.id).toBe('42');
    });
  });

  describe('getPages', () => {
    it('fetches pages with default params', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [makePage()], _links: {} }));

      const result = await client.getPages();

      expect(fetchSpy.mock.calls[0][0]).toContain(`${V2}/pages?`);
      expect(fetchSpy.mock.calls[0][0]).toContain('body-format=atlas_doc_format');
      expect(result.results).toHaveLength(1);
    });

    it('resolves space key before setting space-id param', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ results: [{ id: '200' }] }))
        .mockResolvedValue(jsonResponse({ results: [makePage()], _links: {} }));

      await client.getPages({ spaceIdOrKey: 'DEV' });

      expect(fetchSpy.mock.calls[0][0]).toBe(`${V2}/spaces?keys=DEV`);
      const pagesUrl = fetchSpy.mock.calls[1][0] as string;
      expect(pagesUrl).toContain('space-id=200');
    });

    it('passes title, status, and limit params', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [], _links: {} }));

      await client.getPages({ title: 'My Page', status: 'archived', limit: 10 });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('title=My+Page');
      expect(url).toContain('status=archived');
      expect(url).toContain('limit=10');
    });

    it('follows cursor for pagination', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [makePage()], _links: {} }));

      await client.getPages({ cursor: '/wiki/api/v2/pages?cursor=abc' });

      expect(fetchSpy.mock.calls[0][0]).toBe(`${BASE_URL}/wiki/api/v2/pages?cursor=abc`);
    });
  });

  describe('createPage', () => {
    it('validates ADF body before sending request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await expect(client.createPage({ spaceIdOrKey: '100', title: 'Test', body: '{"invalid": true}' })).rejects.toThrow(z.ZodError);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('resolves space key and sends correct request body', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ results: [{ id: '200' }] }))
        .mockResolvedValue(jsonResponse(makePage()));

      await client.createPage({ spaceIdOrKey: 'DEV', title: 'New Page', body: validAdf, parentId: '5' });

      const call = fetchSpy.mock.calls[1];
      expect(call[0]).toBe(`${V2}/pages`);
      const body = JSON.parse(call[1]!.body as string) as Record<string, unknown>;
      expect(body.spaceId).toBe('200');
      expect(body.status).toBe('current');
      expect(body.title).toBe('New Page');
      expect(body.parentId).toBe('5');
      const envelope = body.body as { representation: string; value: string };
      expect(envelope.representation).toBe('atlas_doc_format');
      expect(JSON.parse(envelope.value)).toEqual(JSON.parse(validAdf));
    });

    it('wraps ADF body in representation envelope', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(makePage()));

      await client.createPage({ spaceIdOrKey: '100', title: 'Test', body: validAdf });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string) as Record<string, unknown>;
      const envelope = body.body as { representation: string; value: string };
      expect(envelope.representation).toBe('atlas_doc_format');
      expect(JSON.parse(envelope.value)).toEqual(JSON.parse(validAdf));
    });
  });

  describe('updatePage', () => {
    it('fetches current version before updating', async () => {
      const currentPage = makePage({ id: '42', version: { number: 3, message: '', authorId: 'user1' } });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse(currentPage))
        .mockResolvedValue(jsonResponse(makePage({ id: '42' })));

      await client.updatePage('42', { title: 'Updated', body: validAdf });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][0]).toBe(`${V2}/pages/42?body-format=atlas_doc_format`);
    });

    it('increments version number and sets message', async () => {
      const currentPage = makePage({ id: '42', version: { number: 5, message: '', authorId: 'user1' } });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse(currentPage))
        .mockResolvedValue(jsonResponse(makePage({ id: '42' })));

      await client.updatePage('42', { title: 'Updated', body: validAdf });

      const body = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string) as Record<string, unknown>;
      expect(body.version).toEqual({ number: 6, message: 'Updated via CLI' });
    });

    it('validates ADF body before any HTTP request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await expect(client.updatePage('42', { title: 'Bad', body: '{"invalid": true}' })).rejects.toThrow(z.ZodError);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('includes parentId in body when provided', async () => {
      const currentPage = makePage({ id: '42', version: { number: 3, message: '', authorId: 'user1' } });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse(currentPage))
        .mockResolvedValue(jsonResponse(makePage({ id: '42' })));

      await client.updatePage('42', { title: 'Updated', body: validAdf, parentId: '99' });

      const body = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string) as Record<string, unknown>;
      expect(body.parentId).toBe('99');
    });

    it('omits parentId from body when not provided', async () => {
      const currentPage = makePage({ id: '42', version: { number: 3, message: '', authorId: 'user1' } });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse(currentPage))
        .mockResolvedValue(jsonResponse(makePage({ id: '42' })));

      await client.updatePage('42', { title: 'Updated', body: validAdf });

      const body = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string) as Record<string, unknown>;
      expect(body).not.toHaveProperty('parentId');
    });
  });

  describe('deletePage', () => {
    it('sends DELETE and succeeds on 204', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204, statusText: 'No Content' }));

      await expect(client.deletePage('42')).resolves.toBeUndefined();

      expect(fetchSpy.mock.calls[0][0]).toBe(`${V2}/pages/42`);
      expect(fetchSpy.mock.calls[0][1]!.method).toBe('DELETE');
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403, statusText: 'Forbidden' }));

      await expect(client.deletePage('42')).rejects.toThrow('Request failed with status 403 | Forbidden');
    });
  });

  describe('searchPages', () => {
    function rawSearchResponse(items: { id: string; title: string }[]) {
      return {
        results: items.map((item) => ({
          id: item.id,
          type: 'page',
          status: 'current',
          title: item.title
        })),
        _links: {}
      };
    }

    it('prepends type = "page" filter and uses v1 endpoint', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(rawSearchResponse([])));

      await client.searchPages({ cql: 'space = "DEV"' });

      const url = new URL(fetchSpy.mock.calls[0][0] as string);
      expect(url.pathname).toBe('/wiki/rest/api/content/search');
      expect(url.searchParams.get('cql')).toBe('type = "page" AND space = "DEV"');
    });

    it('parses v1 content search response', async () => {
      const raw = rawSearchResponse([
        { id: '1', title: 'Page 1' },
        { id: '2', title: 'Page 2' }
      ]);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(raw));

      const result = await client.searchPages({ cql: 'type = page' });

      expect(result.results).toEqual([
        expect.objectContaining({ id: '1', title: 'Page 1' }),
        expect.objectContaining({ id: '2', title: 'Page 2' })
      ]);
    });

    it('passes limit param when provided', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(rawSearchResponse([])));

      await client.searchPages({ cql: 'type = page', limit: 10 });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('limit=10');
    });

    it('follows cursor for pagination', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(rawSearchResponse([])));

      await client.searchPages({ cql: 'type = page', cursor: '/wiki/rest/api/content/search?cursor=abc' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe(`${BASE_URL}/wiki/rest/api/content/search?cursor=abc`);
    });
  });

  describe('resolvePageId', () => {
    function rawSearchResponse(items: { id: string; title: string }[]) {
      return {
        results: items.map((item) => ({
          id: item.id,
          type: 'page',
          status: 'current',
          title: item.title
        })),
        _links: {}
      };
    }

    it('returns value directly when all digits', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const result = await client.resolvePageId('12345');

      expect(result).toBe('12345');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('searches by title and returns the matched page ID', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(rawSearchResponse([{ id: '42', title: 'My Page' }])));

      const result = await client.resolvePageId('My Page');

      expect(result).toBe('42');
    });

    it('scopes CQL to space when provided', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(rawSearchResponse([{ id: '42', title: 'My Page' }])));

      await client.resolvePageId('My Page', 'DEV');

      const url = new URL(fetchSpy.mock.calls[0][0] as string);
      expect(url.searchParams.get('cql')).toContain('space = "DEV"');
    });

    it('throws when no pages match', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(rawSearchResponse([])));

      await expect(client.resolvePageId('Missing')).rejects.toThrow('No page found with title "Missing"');
    });

    it('throws when multiple pages match', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(
          rawSearchResponse([
            { id: '1', title: 'Dup' },
            { id: '2', title: 'Dup' }
          ])
        )
      );

      await expect(client.resolvePageId('Dup')).rejects.toThrow('Multiple pages match title "Dup"');
    });
  });

  describe('getDescendants', () => {
    it('fetches descendants with default depth and limit', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [makeDescendant()], _links: {} }));

      const result = await client.getDescendants('1');

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain(`${V2}/pages/1/descendants`);
      expect(url).toContain('depth=5');
      expect(url).toContain('limit=250');
      expect(result).toHaveLength(1);
    });

    it('auto-paginates by following _links.next', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          jsonResponse({
            results: [makeDescendant({ id: '10' })],
            _links: { next: '/wiki/api/v2/pages/1/descendants?cursor=abc' }
          })
        )
        .mockResolvedValue(jsonResponse({ results: [makeDescendant({ id: '11' })], _links: {} }));

      const result = await client.getDescendants('1');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[1][0]).toBe(`${BASE_URL}/wiki/api/v2/pages/1/descendants?cursor=abc`);
      expect(result).toHaveLength(2);
    });

    it('uses custom depth and limit', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [], _links: {} }));

      await client.getDescendants('1', { depth: 3, limit: 50 });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('depth=3');
      expect(url).toContain('limit=50');
    });
  });

  describe('getSpaceTree', () => {
    it('fetches root pages then descendants in parallel', async () => {
      const root1 = makePage({ id: 'r1', title: 'Root 1', parentId: null });
      const root2 = makePage({ id: 'r2', title: 'Root 2', parentId: null });
      const child1 = makeDescendant({ id: 'c1', parentId: 'r1', depth: 1 });
      const child2 = makeDescendant({ id: 'c2', parentId: 'r2', depth: 1 });
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ results: [root1, root2], _links: {} }))
        .mockResolvedValueOnce(jsonResponse({ results: [child1], _links: {} }))
        .mockResolvedValue(jsonResponse({ results: [child2], _links: {} }));

      const result = await client.getSpaceTree('100');

      expect(result).toHaveLength(4);
      expect(result[0].id).toBe('r1');
      expect(result[0].depth).toBe(0);
      expect(result[1].id).toBe('c1');
      expect(result[2].id).toBe('r2');
      expect(result[2].depth).toBe(0);
      expect(result[3].id).toBe('c2');
    });

    it('auto-paginates root pages across multiple pages', async () => {
      const root1 = makePage({ id: 'r1', title: 'Root 1', parentId: null });
      const root2 = makePage({ id: 'r2', title: 'Root 2', parentId: null });
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ results: [root1], _links: { next: '/wiki/api/v2/spaces/100/pages?cursor=page2' } }))
        .mockResolvedValueOnce(jsonResponse({ results: [root2], _links: {} }))
        .mockResolvedValueOnce(jsonResponse({ results: [], _links: {} }))
        .mockResolvedValue(jsonResponse({ results: [], _links: {} }));

      const result = await client.getSpaceTree('100');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('r1');
      expect(result[1].id).toBe('r2');
    });

    it('returns only roots when depth is 0', async () => {
      const root = makePage({ id: 'r1' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ results: [root], _links: {} }));

      const result = await client.getSpaceTree('100', { depth: 0 });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it('resolves space key before fetching root pages', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ results: [{ id: '200' }] }))
        .mockResolvedValue(jsonResponse({ results: [], _links: {} }));

      await client.getSpaceTree('DEV', { depth: 0 });

      expect(fetchSpy.mock.calls[0][0]).toBe(`${V2}/spaces?keys=DEV`);
      const rootUrl = fetchSpy.mock.calls[1][0] as string;
      expect(rootUrl).toContain(`${V2}/spaces/200/pages`);
      expect(rootUrl).toContain('depth=root');
      expect(rootUrl).toContain('status=current');
    });
  });

  describe('resolveSpaceId', () => {
    it('passes numeric IDs through without API call', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(jsonResponse({ results: [makePage()], _links: {} })));

      await client.getPages({ spaceIdOrKey: '12345' });
      await client.getPages({ spaceIdOrKey: '67890' });

      const urls = fetchSpy.mock.calls.map((c: Parameters<typeof fetch>) => c[0] as string);
      expect(urls.every((u: string) => !u.includes('/spaces?keys='))).toBe(true);
    });

    it('looks up alphabetic space key via API', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ results: [{ id: '200' }] }))
        .mockImplementation(() => Promise.resolve(jsonResponse({ results: [makePage()], _links: {} })));

      await client.getPages({ spaceIdOrKey: 'DEV' });

      expect(fetchSpy.mock.calls[0][0]).toBe(`${V2}/spaces?keys=DEV`);
    });

    it('caches resolved space IDs', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ results: [{ id: '200' }] }))
        .mockImplementation(() => Promise.resolve(jsonResponse({ results: [makePage()], _links: {} })));

      await client.getPages({ spaceIdOrKey: 'DEV' });
      await client.getPages({ spaceIdOrKey: 'DEV' });

      const spaceKeyLookups = fetchSpy.mock.calls.filter((c: Parameters<typeof fetch>) => (c[0] as string).includes('/spaces?keys='));
      expect(spaceKeyLookups).toHaveLength(1);
    });

    it('throws AppError when space key is not found', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse({ results: [] })));

      await expect(client.getPages({ spaceIdOrKey: 'NOPE' })).rejects.toThrow(AppError);
      await expect(client.getPages({ spaceIdOrKey: 'NOPE' })).rejects.toThrow('Space not found: NOPE');
    });
  });
});
