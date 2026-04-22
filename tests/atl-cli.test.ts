import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProgram } from '../src/atl-cli.js';
import { AppError } from '../src/shared/app-error.js';

// ── SDK mocks ───────────────────────────────────────────────────

const { mockConfluence, mockJira, mockExecSync, mockKeychain } = vi.hoisted(() => ({
  mockConfluence: {
    getPage: vi.fn(),
    getPages: vi.fn(),
    createPage: vi.fn(),
    updatePage: vi.fn(),
    deletePage: vi.fn(),
    getDescendants: vi.fn(),
    searchPages: vi.fn(),
    resolvePageId: vi.fn(),
    getSpace: vi.fn(),
    getSpaceTree: vi.fn()
  },
  mockJira: {
    getIssue: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    deleteIssue: vi.fn(),
    getTransitions: vi.fn(),
    transitionIssue: vi.fn(),
    searchIssues: vi.fn(),
    getChildIssues: vi.fn(),
    getProject: vi.fn(),
    getProjects: vi.fn()
  },
  mockExecSync: vi.fn(),
  mockKeychain: {
    isMacOS: vi.fn(() => false),
    keychainSet: vi.fn(),
    keychainGet: vi.fn(() => null as string | null),
    keychainDelete: vi.fn(() => false),
    KEYCHAIN_SERVICE: 'atl-cli',
    KEYCHAIN_ACCOUNT: 'api-token'
  }
}));

vi.mock('../src/confluence/confluence-client.js', () => ({
  ConfluenceClient: class {
    getPage = mockConfluence.getPage;
    getPages = mockConfluence.getPages;
    createPage = mockConfluence.createPage;
    updatePage = mockConfluence.updatePage;
    deletePage = mockConfluence.deletePage;
    getDescendants = mockConfluence.getDescendants;
    searchPages = mockConfluence.searchPages;
    resolvePageId = mockConfluence.resolvePageId;
    getSpace = mockConfluence.getSpace;
    getSpaceTree = mockConfluence.getSpaceTree;
  }
}));

vi.mock('../src/jira/jira-client.js', () => ({
  JiraClient: class {
    getIssue = mockJira.getIssue;
    createIssue = mockJira.createIssue;
    updateIssue = mockJira.updateIssue;
    deleteIssue = mockJira.deleteIssue;
    getTransitions = mockJira.getTransitions;
    transitionIssue = mockJira.transitionIssue;
    searchIssues = mockJira.searchIssues;
    getChildIssues = mockJira.getChildIssues;
    getProject = mockJira.getProject;
    getProjects = mockJira.getProjects;
  }
}));

vi.mock('node:child_process', () => ({
  execSync: mockExecSync
}));

vi.mock('../src/auth/keychain.js', () => mockKeychain);

// ── helpers ─────────────────────────────────────────────────────

let tmpDir: string;
let envBackup: Record<string, string | undefined>;

function setCredentialEnv() {
  process.env['ATLASSIAN_BASE_URL'] = 'https://test.atlassian.net';
  process.env['ATLASSIAN_EMAIL'] = 'user@example.com';
  process.env['ATLASSIAN_API_TOKEN'] = 'tok-abcd';
}

function clearCredentialEnv() {
  delete process.env['ATLASSIAN_BASE_URL'];
  delete process.env['ATLASSIAN_EMAIL'];
  delete process.env['ATLASSIAN_API_TOKEN'];
}

async function run(argv: string[]) {
  const writer = vi.fn();
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

  let rejection: unknown;
  const handler = (reason: unknown) => {
    rejection = reason;
  };
  process.on('unhandledRejection', handler);

  buildProgram(tmpDir).parse(['node', 'atl', ...argv], writer);
  await new Promise((r) => setTimeout(r, 0));

  process.removeListener('unhandledRejection', handler);
  exitSpy.mockRestore();

  const logs = logSpy.mock.calls.map((c) => String(c[0]));
  logSpy.mockRestore();

  return { writer, logs, rejection };
}

// ── setup / teardown ────────────────────────────────────────────

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-cli-test-'));
  envBackup = {
    ATLASSIAN_BASE_URL: process.env['ATLASSIAN_BASE_URL'],
    ATLASSIAN_EMAIL: process.env['ATLASSIAN_EMAIL'],
    ATLASSIAN_API_TOKEN: process.env['ATLASSIAN_API_TOKEN']
  };
  setCredentialEnv();
  vi.clearAllMocks();
});

afterEach(() => {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── tests ───────────────────────────────────────────────────────

describe('atl-cli', () => {
  // ── auth login ──────────────────────────────────────────────

  describe('auth login', () => {
    it('saves credentials and prints confirmation', async () => {
      const { logs } = await run(['auth', 'login', '--base-url', 'https://x.atlassian.net', '--email', 'a@b.com', '--token', 'secret']);

      expect(logs).toContain('Credentials saved.');
      const file = JSON.parse(fs.readFileSync(path.join(tmpDir, 'credentials.json'), 'utf-8')) as Record<string, string>;
      expect(file['baseUrl']).toBe('https://x.atlassian.net');
      expect(file['email']).toBe('a@b.com');
      expect(file['apiToken']).toBe('secret');
    });

    it('throws on missing flags', async () => {
      const { writer } = await run(['auth', 'login']);

      expect(writer).toHaveBeenCalledWith(expect.stringContaining('--base-url, --email, and --token are all required'));
    });

    it('throws when only some flags provided', async () => {
      const { writer } = await run(['auth', 'login', '--base-url', 'https://x.atlassian.net']);

      expect(writer).toHaveBeenCalledWith(expect.stringContaining('--base-url, --email, and --token are all required'));
    });
  });

  // ── auth status ─────────────────────────────────────────────

  describe('auth status', () => {
    it('displays credentials with masked token', async () => {
      const { logs } = await run(['auth', 'status']);

      expect(logs).toContain('Base URL:  https://test.atlassian.net');
      expect(logs).toContain('Email:     user@example.com');
      expect(logs).toContain('Token:     ****abcd');
    });

    it('throws with remediation hint when unconfigured', async () => {
      clearCredentialEnv();

      const { writer } = await run(['auth', 'status']);

      expect(writer).toHaveBeenCalledWith(expect.stringContaining('run `atl auth login`'));
    });
  });

  // ── auth logout ─────────────────────────────────────────────

  describe('auth logout', () => {
    it('removes stored credentials file', async () => {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'credentials.json'), '{"baseUrl":"u","email":"e","apiToken":"t"}');

      const { logs } = await run(['auth', 'logout']);

      expect(logs).toContain('Credentials removed.');
      expect(fs.existsSync(path.join(tmpDir, 'credentials.json'))).toBe(false);
    });

    it('handles missing file gracefully', async () => {
      const { logs } = await run(['auth', 'logout']);

      expect(logs).toContain('No stored credentials found.');
    });
  });

  // ── confluence pages get ────────────────────────────────────

  describe('confluence pages get', () => {
    it('fetches by ID when argument is numeric', async () => {
      mockConfluence.resolvePageId.mockResolvedValue('123');
      mockConfluence.getPage.mockResolvedValue({ id: '123', title: 'Hello' });

      const { logs } = await run(['confluence', 'pages', 'get', '123']);

      expect(mockConfluence.resolvePageId).toHaveBeenCalledWith('123', undefined);
      expect(mockConfluence.getPage).toHaveBeenCalledWith('123');
      expect(logs[0]).toContain('"id": "123"');
    });

    it('resolves title via resolvePageId when argument is not numeric', async () => {
      mockConfluence.resolvePageId.mockResolvedValue('42');
      mockConfluence.getPage.mockResolvedValue({ id: '42', title: 'My Page' });

      await run(['confluence', 'pages', 'get', 'My Page']);

      expect(mockConfluence.resolvePageId).toHaveBeenCalledWith('My Page', undefined);
      expect(mockConfluence.getPage).toHaveBeenCalledWith('42');
    });

    it('passes --space to resolvePageId', async () => {
      mockConfluence.resolvePageId.mockResolvedValue('42');
      mockConfluence.getPage.mockResolvedValue({ id: '42', title: 'My Page' });

      await run(['confluence', 'pages', 'get', 'My Page', '--space', 'DEV']);

      expect(mockConfluence.resolvePageId).toHaveBeenCalledWith('My Page', 'DEV');
    });

    it('propagates resolvePageId errors', async () => {
      mockConfluence.resolvePageId.mockRejectedValue(new AppError('No page found with title "Missing"'));

      const { rejection } = await run(['confluence', 'pages', 'get', 'Missing']);

      expect(rejection).toBeInstanceOf(AppError);
      expect((rejection as AppError).message).toContain('No page found with title "Missing"');
    });

    it('includes remediation hint on missing credentials', async () => {
      clearCredentialEnv();

      const { rejection } = await run(['confluence', 'pages', 'get', '123']);

      expect(rejection).toBeInstanceOf(AppError);
      expect((rejection as AppError).message).toContain('run `atl auth login`');
    });
  });

  // ── confluence pages create ─────────────────────────────────

  describe('confluence pages create', () => {
    it('creates a page with all options', async () => {
      mockConfluence.createPage.mockResolvedValue({ id: '1' });
      const body = '{"version":1,"type":"doc","content":[]}';

      await run(['confluence', 'pages', 'create', 'My Page', '--space', 'DEV', '--parent', '99', '--body', body]);

      expect(mockConfluence.createPage).toHaveBeenCalledWith({
        spaceIdOrKey: 'DEV',
        title: 'My Page',
        parentId: '99',
        body
      });
    });

    it('throws when --space is missing', async () => {
      const { rejection } = await run(['confluence', 'pages', 'create', 'Title']);

      expect(rejection).toBeInstanceOf(AppError);
      expect((rejection as AppError).message).toContain('--space is required');
    });
  });

  // ── confluence pages update ─────────────────────────────────

  describe('confluence pages update', () => {
    it('merges current values when flags omitted', async () => {
      mockConfluence.getPage.mockResolvedValue({
        id: '10',
        title: 'Original',
        body: { atlas_doc_format: { value: '{"version":1,"type":"doc","content":[]}', representation: 'atlas_doc_format' } }
      });
      mockConfluence.updatePage.mockResolvedValue({ id: '10' });

      await run(['confluence', 'pages', 'update', '10', '--title', 'Updated']);

      expect(mockConfluence.getPage).toHaveBeenCalledWith('10');
      expect(mockConfluence.updatePage).toHaveBeenCalledWith('10', {
        title: 'Updated',
        body: '{"version":1,"type":"doc","content":[]}'
      });
    });

    it('skips fetch when both flags provided', async () => {
      mockConfluence.updatePage.mockResolvedValue({ id: '10' });
      const body = '{"version":1,"type":"doc","content":[]}';

      await run(['confluence', 'pages', 'update', '10', '--title', 'New', '--body', body]);

      expect(mockConfluence.getPage).not.toHaveBeenCalled();
      expect(mockConfluence.updatePage).toHaveBeenCalledWith('10', { title: 'New', body });
    });

    it('passes --parent as parentId', async () => {
      mockConfluence.updatePage.mockResolvedValue({ id: '10' });
      const body = '{"version":1,"type":"doc","content":[]}';

      await run(['confluence', 'pages', 'update', '10', '--title', 'New', '--body', body, '--parent', '99']);

      expect(mockConfluence.updatePage).toHaveBeenCalledWith('10', { title: 'New', body, parentId: '99' });
    });
  });

  // ── confluence pages delete / children / search ──────────

  describe('confluence pages delete', () => {
    it('deletes and prints Done', async () => {
      mockConfluence.deletePage.mockResolvedValue(undefined);

      const { logs } = await run(['confluence', 'pages', 'delete', '55']);

      expect(mockConfluence.deletePage).toHaveBeenCalledWith('55');
      expect(logs).toContain('Done.');
    });
  });

  describe('confluence pages children', () => {
    it('forwards options with defaults when given numeric ID', async () => {
      mockConfluence.resolvePageId.mockResolvedValue('10');
      mockConfluence.getDescendants.mockResolvedValue([]);

      await run(['confluence', 'pages', 'children', '10']);

      expect(mockConfluence.resolvePageId).toHaveBeenCalledWith('10', undefined);
      expect(mockConfluence.getDescendants).toHaveBeenCalledWith('10', { depth: 5 });
    });

    it('forwards custom depth', async () => {
      mockConfluence.resolvePageId.mockResolvedValue('10');
      mockConfluence.getDescendants.mockResolvedValue([]);

      await run(['confluence', 'pages', 'children', '10', '--depth', '3']);

      expect(mockConfluence.getDescendants).toHaveBeenCalledWith('10', { depth: 3 });
    });

    it('resolves title to ID when argument is not numeric', async () => {
      mockConfluence.resolvePageId.mockResolvedValue('42');
      mockConfluence.getDescendants.mockResolvedValue([]);

      await run(['confluence', 'pages', 'children', 'My Page']);

      expect(mockConfluence.resolvePageId).toHaveBeenCalledWith('My Page', undefined);
      expect(mockConfluence.getDescendants).toHaveBeenCalledWith('42', { depth: 5 });
    });

    it('passes --space to resolvePageId', async () => {
      mockConfluence.resolvePageId.mockResolvedValue('42');
      mockConfluence.getDescendants.mockResolvedValue([]);

      await run(['confluence', 'pages', 'children', 'My Page', '--space', 'DEV']);

      expect(mockConfluence.resolvePageId).toHaveBeenCalledWith('My Page', 'DEV');
      expect(mockConfluence.getDescendants).toHaveBeenCalledWith('42', { depth: 5 });
    });

    it('propagates resolvePageId errors', async () => {
      mockConfluence.resolvePageId.mockRejectedValue(new AppError('No page found with title "Missing"'));

      const { rejection } = await run(['confluence', 'pages', 'children', 'Missing']);

      expect(rejection).toBeInstanceOf(AppError);
      expect((rejection as AppError).message).toContain('No page found with title "Missing"');
    });
  });

  describe('confluence pages search', () => {
    it('forwards CQL and options', async () => {
      mockConfluence.searchPages.mockResolvedValue({ results: [] });

      await run(['confluence', 'pages', 'search', 'type=page', '--limit', '10', '--cursor', 'xyz']);

      expect(mockConfluence.searchPages).toHaveBeenCalledWith({
        cql: 'type=page',
        limit: 10,
        cursor: 'xyz'
      });
    });
  });

  // ── confluence spaces ───────────────────────────────────────

  describe('confluence spaces get', () => {
    it('fetches space by key', async () => {
      mockConfluence.getSpace.mockResolvedValue({ id: '1', key: 'DEV', _links: { webui: '/spaces/DEV' } });

      const { logs } = await run(['confluence', 'spaces', 'get', 'DEV']);

      expect(mockConfluence.getSpace).toHaveBeenCalledWith('DEV');
      expect(logs[0]).toContain('"key": "DEV"');
      expect(logs[0]).not.toContain('_links');
    });
  });

  describe('confluence spaces tree', () => {
    it('forwards depth option', async () => {
      mockConfluence.getSpaceTree.mockResolvedValue([]);

      await run(['confluence', 'spaces', 'tree', 'DEV', '--depth', '4']);

      expect(mockConfluence.getSpaceTree).toHaveBeenCalledWith('DEV', { depth: 4 });
    });

    it('uses default depth', async () => {
      mockConfluence.getSpaceTree.mockResolvedValue([]);

      await run(['confluence', 'spaces', 'tree', 'DEV']);

      expect(mockConfluence.getSpaceTree).toHaveBeenCalledWith('DEV', { depth: 2 });
    });
  });

  // ── jira issues get ─────────────────────────────────────────

  describe('jira issues get', () => {
    it('prints issue JSON', async () => {
      mockJira.getIssue.mockResolvedValue({ id: '1', key: 'PROJ-1' });

      const { logs } = await run(['jira', 'issues', 'get', 'PROJ-1']);

      expect(mockJira.getIssue).toHaveBeenCalledWith('PROJ-1');
      expect(logs[0]).toContain('"key": "PROJ-1"');
    });
  });

  // ── jira issues create ──────────────────────────────────────

  describe('jira issues create', () => {
    it('creates issue with all options', async () => {
      mockJira.createIssue.mockResolvedValue({ id: '1', key: 'PROJ-1' });
      const desc = '{"type":"doc","content":[]}';

      await run([
        'jira',
        'issues',
        'create',
        'My Issue',
        '--project',
        'PROJ',
        '--type',
        'Task',
        '--description',
        desc,
        '--parent',
        'PROJ-0',
        '--labels',
        'backend,frontend'
      ]);

      expect(mockJira.createIssue).toHaveBeenCalledWith({
        projectKey: 'PROJ',
        issueTypeName: 'Task',
        summary: 'My Issue',
        description: JSON.parse(desc) as object,
        parentKey: 'PROJ-0',
        labels: ['backend', 'frontend']
      });
    });

    it('throws when --project is missing', async () => {
      const { rejection } = await run(['jira', 'issues', 'create', 'Sum', '--type', 'Bug']);

      expect(rejection).toBeInstanceOf(AppError);
      expect((rejection as AppError).message).toContain('--project and --type are required');
    });

    it('throws when --type is missing', async () => {
      const { rejection } = await run(['jira', 'issues', 'create', 'Sum', '--project', 'P']);

      expect(rejection).toBeInstanceOf(AppError);
      expect((rejection as AppError).message).toContain('--project and --type are required');
    });
  });

  // ── jira issues update ──────────────────────────────────────

  describe('jira issues update', () => {
    it('sends partial update with description parse and prints updated issue', async () => {
      mockJira.updateIssue.mockResolvedValue({ id: '1', key: 'PROJ-1', fields: { summary: 'New' } });
      const desc = '{"type":"doc","content":[]}';

      const { logs } = await run([
        'jira',
        'issues',
        'update',
        'PROJ-1',
        '--summary',
        'New',
        '--description',
        desc,
        '--parent',
        'PROJ-10',
        '--labels',
        'a,b'
      ]);

      expect(mockJira.updateIssue).toHaveBeenCalledWith('PROJ-1', {
        summary: 'New',
        description: JSON.parse(desc) as object,
        parentKey: 'PROJ-10',
        labels: ['a', 'b']
      });
      expect(logs[0]).toContain('"key": "PROJ-1"');
    });

    it('sends only provided fields', async () => {
      mockJira.updateIssue.mockResolvedValue({ id: '1', key: 'PROJ-1', fields: { summary: 'Changed' } });

      const { logs } = await run(['jira', 'issues', 'update', 'PROJ-1', '--summary', 'Changed']);

      expect(mockJira.updateIssue).toHaveBeenCalledWith('PROJ-1', { summary: 'Changed' });
      expect(logs[0]).toContain('"key": "PROJ-1"');
    });

    it('resolves --status transition name to ID and transitions before field update', async () => {
      mockJira.getIssue.mockResolvedValue({
        id: '1',
        key: 'PROJ-1',
        transitions: [
          { id: '31', name: 'In Progress', to: { id: '3', name: 'In Progress' } },
          { id: '41', name: 'Done', to: { id: '4', name: 'Done' } }
        ]
      });
      mockJira.transitionIssue.mockResolvedValue(undefined);
      mockJira.updateIssue.mockResolvedValue({ id: '1', key: 'PROJ-1', fields: { summary: 'Updated' } });

      const { logs } = await run(['jira', 'issues', 'update', 'PROJ-1', '--status', 'Done', '--summary', 'Updated']);

      expect(mockJira.getIssue).toHaveBeenCalledWith('PROJ-1');
      expect(mockJira.transitionIssue).toHaveBeenCalledWith('PROJ-1', { transitionId: '41' });
      expect(mockJira.updateIssue).toHaveBeenCalledWith('PROJ-1', { summary: 'Updated' });
      expect(logs[0]).toContain('"key": "PROJ-1"');
    });

    it('resolves --status case-insensitively and picks first match', async () => {
      mockJira.getIssue.mockResolvedValue({
        id: '1',
        key: 'PROJ-1',
        transitions: [
          { id: '31', name: 'done', to: { id: '3', name: 'Done' } },
          { id: '41', name: 'Done', to: { id: '4', name: 'Done' } }
        ]
      });
      mockJira.transitionIssue.mockResolvedValue(undefined);

      await run(['jira', 'issues', 'update', 'PROJ-1', '--status', 'DONE']);

      expect(mockJira.transitionIssue).toHaveBeenCalledWith('PROJ-1', { transitionId: '31' });
    });

    it('fetches post-transition issue when --status is the only flag', async () => {
      const postTransitionIssue = { id: '1', key: 'PROJ-1', fields: { status: { name: 'Done' } } };
      mockJira.getIssue
        .mockResolvedValueOnce({
          id: '1',
          key: 'PROJ-1',
          transitions: [{ id: '41', name: 'Done', to: { id: '4', name: 'Done' } }]
        })
        .mockResolvedValueOnce(postTransitionIssue);
      mockJira.transitionIssue.mockResolvedValue(undefined);

      const { logs } = await run(['jira', 'issues', 'update', 'PROJ-1', '--status', 'Done']);

      expect(mockJira.getIssue).toHaveBeenCalledTimes(2);
      expect(mockJira.updateIssue).not.toHaveBeenCalled();
      expect(logs[0]).toContain('"key": "PROJ-1"');
    });

    it('throws AppError when --status does not match any transition', async () => {
      mockJira.getIssue.mockResolvedValue({
        id: '1',
        key: 'PROJ-1',
        transitions: [{ id: '31', name: 'In Progress', to: { id: '3', name: 'In Progress' } }]
      });

      const { rejection } = await run(['jira', 'issues', 'update', 'PROJ-1', '--status', 'NoSuch']);

      expect(rejection).toBeInstanceOf(AppError);
      expect((rejection as AppError).message).toContain('No transition matching "NoSuch"');
      expect((rejection as AppError).message).toContain('In Progress');
      expect(mockJira.transitionIssue).not.toHaveBeenCalled();
    });
  });

  // ── jira issues delete ──────────────────────────────────────

  describe('jira issues delete', () => {
    it('deletes and prints Done', async () => {
      mockJira.deleteIssue.mockResolvedValue(undefined);

      const { logs } = await run(['jira', 'issues', 'delete', 'PROJ-1']);

      expect(mockJira.deleteIssue).toHaveBeenCalledWith('PROJ-1');
      expect(logs).toContain('Done.');
    });
  });

  // ── jira issues search ──────────────────────────────────────

  describe('jira issues search', () => {
    it('forwards JQL and pagination params', async () => {
      mockJira.searchIssues.mockResolvedValue({ issues: [] });

      await run(['jira', 'issues', 'search', 'project=PROJ', '--limit', '10', '--cursor', 'tok', '--fields', 'summary,status']);

      expect(mockJira.searchIssues).toHaveBeenCalledWith({
        jql: 'project=PROJ',
        maxResults: 10,
        nextPageToken: 'tok',
        fields: ['summary', 'status']
      });
    });

    it('uses default limit', async () => {
      mockJira.searchIssues.mockResolvedValue({ issues: [] });

      await run(['jira', 'issues', 'search', 'project=PROJ']);

      expect(mockJira.searchIssues).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 50 }));
    });
  });

  // ── jira issues children ────────────────────────────────────

  describe('jira issues children', () => {
    it('delegates to getChildIssues', async () => {
      mockJira.getChildIssues.mockResolvedValue([]);

      const { logs } = await run(['jira', 'issues', 'children', 'PROJ-1']);

      expect(mockJira.getChildIssues).toHaveBeenCalledWith('PROJ-1');
      expect(logs[0]).toBe('[]');
    });
  });

  // ── jira projects get ───────────────────────────────────────

  describe('jira projects get', () => {
    it('fetches project by key', async () => {
      mockJira.getProject.mockResolvedValue({ id: '1', key: 'PROJ' });

      const { logs } = await run(['jira', 'projects', 'get', 'PROJ']);

      expect(mockJira.getProject).toHaveBeenCalledWith('PROJ');
      expect(logs[0]).toContain('"key": "PROJ"');
    });
  });

  // ── jira projects list ──────────────────────────────────────

  describe('jira projects list', () => {
    it('forwards default options', async () => {
      mockJira.getProjects.mockResolvedValue({ values: [] });

      await run(['jira', 'projects', 'list']);

      expect(mockJira.getProjects).toHaveBeenCalledWith({ startAt: 0, maxResults: 50 });
    });

    it('forwards query filter', async () => {
      mockJira.getProjects.mockResolvedValue({ values: [] });

      await run(['jira', 'projects', 'list', '--query', 'web', '--cursor', '5', '--limit', '10']);

      expect(mockJira.getProjects).toHaveBeenCalledWith({ startAt: 5, maxResults: 10, query: 'web' });
    });
  });

  // ── pkg upgrade ────────────────────────────────────────────────

  describe('pkg upgrade', () => {
    it('skips update when already on latest', async () => {
      const { logs } = await run(['pkg', 'upgrade']);

      expect(logs).toContainEqual(expect.stringMatching(/Already on the latest version \(\d+\.\d+\.\d+\)\./));
      expect(mockExecSync).toHaveBeenCalledOnce();
      expect(mockExecSync).toHaveBeenCalledWith('npm outdated -g @ai-foundry/atlassian-bridge', { stdio: 'ignore' });
    });

    it('runs npm update when outdated', async () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('exit code 1');
      });

      const { logs } = await run(['pkg', 'upgrade']);

      expect(logs).toContain('Upgrading @ai-foundry/atlassian-bridge...');
      expect(mockExecSync).toHaveBeenCalledTimes(2);
      expect(mockExecSync).toHaveBeenNthCalledWith(1, 'npm outdated -g @ai-foundry/atlassian-bridge', { stdio: 'ignore' });
      expect(mockExecSync).toHaveBeenNthCalledWith(2, 'npm update -g @ai-foundry/atlassian-bridge', { stdio: 'inherit' });
    });
  });
});
