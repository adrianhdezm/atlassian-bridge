import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { JiraClient } from '../../src/jira/jira-client.js';
import { JiraTokenPaginationSchema, JiraOffsetPaginationSchema } from '../../src/jira/jira-models.js';

const BASE_URL = 'https://test.atlassian.net';
const API = `${BASE_URL}/rest/api/3`;

const validAdf = {
  version: 1,
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }]
};

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: '10001',
    key: 'PROJ-1',
    self: `${API}/issue/10001`,
    fields: {
      summary: 'Test issue',
      status: { id: '1', name: 'To Do' },
      assignee: { accountId: 'user1', displayName: 'User One' },
      reporter: { accountId: 'user2', displayName: 'User Two' },
      priority: { id: '3', name: 'Medium' },
      issuetype: { id: '10', name: 'Task' },
      project: { id: '100', key: 'PROJ', name: 'Project' },
      description: null,
      created: '2024-01-01T00:00:00.000+0000',
      updated: '2024-01-02T00:00:00.000+0000',
      labels: []
    },
    ...overrides
  };
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: '100',
    key: 'PROJ',
    name: 'Project',
    projectTypeKey: 'software',
    ...overrides
  };
}

function makeTransition(overrides: Record<string, unknown> = {}) {
  return {
    id: '31',
    name: 'Done',
    to: { id: '3', name: 'Done' },
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
  return new JiraClient({
    baseUrl: BASE_URL,
    email: 'user@example.com',
    apiToken: 'token123'
  });
}

describe('JiraTokenPaginationSchema', () => {
  it('parses token pagination metadata with all fields', () => {
    const input = { maxResults: 50, isLast: false, nextPageToken: 'abc123' };

    const result = JiraTokenPaginationSchema.parse(input);

    expect(result.maxResults).toBe(50);
    expect(result.isLast).toBe(false);
    expect(result.nextPageToken).toBe('abc123');
  });

  it('parses with all optional fields omitted', () => {
    const result = JiraTokenPaginationSchema.parse({});

    expect(result.maxResults).toBeUndefined();
    expect(result.isLast).toBeUndefined();
    expect(result.nextPageToken).toBeUndefined();
  });

  it('extends with custom item arrays', () => {
    const ItemSchema = z.object({ id: z.string() });
    const ExtendedSchema = JiraTokenPaginationSchema.extend({ items: z.array(ItemSchema) });

    const result = ExtendedSchema.parse({
      items: [{ id: '1' }],
      nextPageToken: 'next'
    });

    expect(result.items).toEqual([{ id: '1' }]);
    expect(result.nextPageToken).toBe('next');
  });
});

describe('JiraOffsetPaginationSchema', () => {
  it('parses offset pagination metadata', () => {
    const input = { startAt: 0, maxResults: 50, total: 100 };

    const result = JiraOffsetPaginationSchema.parse(input);

    expect(result.startAt).toBe(0);
    expect(result.maxResults).toBe(50);
    expect(result.total).toBe(100);
  });

  it('extends with custom item arrays', () => {
    const ItemSchema = z.object({ name: z.string() });
    const ExtendedSchema = JiraOffsetPaginationSchema.extend({ values: z.array(ItemSchema) });

    const result = ExtendedSchema.parse({
      startAt: 0,
      maxResults: 25,
      total: 50,
      values: [{ name: 'Test' }]
    });

    expect(result.values).toEqual([{ name: 'Test' }]);
  });

  it('rejects when required fields are missing', () => {
    expect(() => JiraOffsetPaginationSchema.parse({ startAt: 0 })).toThrow();
  });
});

describe('jira-client', () => {
  let client: JiraClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createClient();
  });

  describe('constructor', () => {
    it('builds Basic auth header from email and token', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(makeIssue()));

      void client.getIssue('PROJ-1');

      const headers = fetchSpy.mock.calls[0][1]!.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Basic ${btoa('user@example.com:token123')}`);
    });

    it('builds API URL prefix from baseUrl', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(makeIssue()));

      await client.getIssue('PROJ-1');

      expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/issue/PROJ-1`);
    });
  });

  describe('getIssue', () => {
    it('fetches an issue by key', async () => {
      const issue = makeIssue({ key: 'PROJ-42' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(issue));

      const result = await client.getIssue('PROJ-42');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/issue/PROJ-42`);
      expect(result.key).toBe('PROJ-42');
    });
  });

  describe('createIssue', () => {
    it('sends correct request body with required fields', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ id: '10001', key: 'PROJ-1', self: `${API}/issue/10001` }));

      await client.createIssue({ projectKey: 'PROJ', issueTypeName: 'Task', summary: 'New task' });

      const call = fetchSpy.mock.calls[0];
      expect(call[0]).toBe(`${API}/issue`);
      expect(call[1]!.method).toBe('POST');
      const body = JSON.parse(call[1]!.body as string) as Record<string, unknown>;
      const fields = body['fields'] as Record<string, unknown>;
      expect(fields['project']).toEqual({ key: 'PROJ' });
      expect(fields['issuetype']).toEqual({ name: 'Task' });
      expect(fields['summary']).toBe('New task');
      expect(fields['parent']).toBeUndefined();
      expect(fields['description']).toBeUndefined();
      expect(fields['labels']).toBeUndefined();
    });

    it('includes optional fields when provided', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ id: '10001', key: 'PROJ-1', self: `${API}/issue/10001` }));

      await client.createIssue({
        projectKey: 'PROJ',
        issueTypeName: 'Task',
        summary: 'New task',
        description: validAdf,
        parentKey: 'PROJ-10',
        labels: ['backend']
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string) as Record<string, unknown>;
      const fields = body['fields'] as Record<string, unknown>;
      expect(fields['description']).toEqual(validAdf);
      expect(fields['parent']).toEqual({ key: 'PROJ-10' });
      expect(fields['labels']).toEqual(['backend']);
    });

    it('validates ADF description before sending request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await expect(
        client.createIssue({
          projectKey: 'PROJ',
          issueTypeName: 'Task',
          summary: 'Bad',
          description: { invalid: true }
        })
      ).rejects.toThrow();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns CreatedIssue reference', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: '10001', key: 'PROJ-1', self: `${API}/issue/10001` }));

      const result = await client.createIssue({ projectKey: 'PROJ', issueTypeName: 'Task', summary: 'New task' });

      expect(result).toEqual({ id: '10001', key: 'PROJ-1', self: `${API}/issue/10001` });
    });
  });

  describe('updateIssue', () => {
    it('sends partial update with only provided fields', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204, statusText: 'No Content' }));

      await client.updateIssue('PROJ-1', { summary: 'Updated title' });

      const call = fetchSpy.mock.calls[0];
      expect(call[0]).toBe(`${API}/issue/PROJ-1`);
      expect(call[1]!.method).toBe('PUT');
      const body = JSON.parse(call[1]!.body as string) as Record<string, unknown>;
      const fields = body['fields'] as Record<string, unknown>;
      expect(fields['summary']).toBe('Updated title');
      expect(fields['description']).toBeUndefined();
      expect(fields['labels']).toBeUndefined();
    });

    it('validates ADF description before sending request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await expect(client.updateIssue('PROJ-1', { description: { invalid: true } })).rejects.toThrow();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns void on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204, statusText: 'No Content' }));

      await expect(client.updateIssue('PROJ-1', { summary: 'Updated' })).resolves.toBeUndefined();
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 400, statusText: 'Bad Request' }));

      await expect(client.updateIssue('PROJ-1', { summary: 'Bad' })).rejects.toThrow('Request failed with status 400 | Bad Request');
    });
  });

  describe('deleteIssue', () => {
    it('sends DELETE and succeeds on 204', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204, statusText: 'No Content' }));

      await expect(client.deleteIssue('PROJ-1')).resolves.toBeUndefined();

      expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/issue/PROJ-1`);
      expect(fetchSpy.mock.calls[0][1]!.method).toBe('DELETE');
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403, statusText: 'Forbidden' }));

      await expect(client.deleteIssue('PROJ-1')).rejects.toThrow('Request failed with status 403 | Forbidden');
    });
  });

  describe('getTransitions', () => {
    it('fetches and unwraps transitions array', async () => {
      const transitions = [makeTransition({ id: '21', name: 'In Progress' }), makeTransition({ id: '31', name: 'Done' })];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ transitions }));

      const result = await client.getTransitions('PROJ-1');

      expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/issue/PROJ-1/transitions`);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('In Progress');
      expect(result[1].name).toBe('Done');
    });
  });

  describe('transitionIssue', () => {
    it('sends correct request body', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204, statusText: 'No Content' }));

      await client.transitionIssue('PROJ-1', { transitionId: '31' });

      const call = fetchSpy.mock.calls[0];
      expect(call[0]).toBe(`${API}/issue/PROJ-1/transitions`);
      expect(call[1]!.method).toBe('POST');
      const body = JSON.parse(call[1]!.body as string) as Record<string, unknown>;
      expect(body['transition']).toEqual({ id: '31' });
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 400, statusText: 'Bad Request' }));

      await expect(client.transitionIssue('PROJ-1', { transitionId: '99' })).rejects.toThrow(
        'Request failed with status 400 | Bad Request'
      );
    });
  });

  describe('searchIssues', () => {
    it('URL-encodes JQL and sends default fields', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ issues: [], maxResults: 50, isLast: true }));

      await client.searchIssues({ jql: 'project = "PROJ" AND status = "To Do"' });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain(`${API}/search/jql?`);
      expect(url).toContain('jql=');
      expect(url).toContain('fields=summary');
      expect(url).toContain('status');
      expect(url).toContain('assignee');
    });

    it('passes pagination params when provided', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ issues: [], maxResults: 10, isLast: false, nextPageToken: 'abc' }));

      await client.searchIssues({ jql: 'project = PROJ', maxResults: 10, nextPageToken: 'abc' });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('maxResults=10');
      expect(url).toContain('nextPageToken=abc');
    });

    it('allows custom fields override', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ issues: [] }));

      await client.searchIssues({ jql: 'project = PROJ', fields: ['summary', 'status'] });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('fields=summary%2Cstatus');
    });

    it('returns parsed search results', async () => {
      const issues = [makeIssue({ key: 'PROJ-1' }), makeIssue({ key: 'PROJ-2' })];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ issues, maxResults: 50, isLast: true }));

      const result = await client.searchIssues({ jql: 'project = PROJ' });

      expect(result.issues).toHaveLength(2);
      expect(result.isLast).toBe(true);
    });
  });

  describe('getProjects', () => {
    it('fetches projects with no params', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ startAt: 0, maxResults: 50, total: 1, values: [makeProject()] }));

      const result = await client.getProjects();

      expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/project/search`);
      expect(result.values).toHaveLength(1);
    });

    it('passes query filter when provided', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ startAt: 0, maxResults: 50, total: 0, values: [] }));

      await client.getProjects({ query: 'Backend' });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('query=Backend');
    });

    it('passes pagination params', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ startAt: 10, maxResults: 25, total: 50, values: [] }));

      await client.getProjects({ startAt: 10, maxResults: 25 });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('startAt=10');
      expect(url).toContain('maxResults=25');
    });
  });

  describe('getProject', () => {
    it('fetches a project by key', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(makeProject({ key: 'BACK' })));

      const result = await client.getProject('BACK');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/project/BACK`);
      expect(result.key).toBe('BACK');
    });

    it('fetches a project by numeric ID', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(makeProject({ id: '999' })));

      const result = await client.getProject('999');

      expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/project/999`);
      expect(result.id).toBe('999');
    });
  });

  describe('getChildIssues', () => {
    it('fetches child issues with correct JQL', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ issues: [makeIssue()], maxResults: 100, isLast: true }));

      const result = await client.getChildIssues('PROJ-1');

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('jql=parent%3DPROJ-1');
      expect(url).toContain('maxResults=100');
      expect(result).toHaveLength(1);
    });

    it('auto-paginates until all children are collected', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          jsonResponse({ issues: [makeIssue({ key: 'PROJ-2' })], maxResults: 100, isLast: false, nextPageToken: 'page2' })
        )
        .mockResolvedValue(jsonResponse({ issues: [makeIssue({ key: 'PROJ-3' })], maxResults: 100, isLast: true }));

      const result = await client.getChildIssues('PROJ-1');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const secondUrl = fetchSpy.mock.calls[1][0] as string;
      expect(secondUrl).toContain('nextPageToken=page2');
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('PROJ-2');
      expect(result[1].key).toBe('PROJ-3');
    });
  });
});
