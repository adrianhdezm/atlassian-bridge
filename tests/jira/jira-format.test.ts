import { describe, it, expect } from 'vitest';
import { formatIssue } from '../../src/jira/jira-format.js';
import type { Issue } from '../../src/jira/jira-models.js';

describe('jira-format', () => {
  describe('formatIssue', () => {
    const baseIssue: Issue = {
      id: '10001',
      key: 'PROJ-1',
      self: 'https://example.atlassian.net/rest/api/3/issue/10001',
      fields: {
        summary: 'Test issue',
        status: { id: '1', name: 'To Do', statusCategory: { id: 1, key: 'new', name: 'To Do', colorName: 'blue-gray' } },
        assignee: { accountId: '123', displayName: 'Alice' },
        reporter: { accountId: '456', displayName: 'Bob' },
        creator: { accountId: '456', displayName: 'Bob' },
        issuetype: { id: '10000', name: 'Task' },
        project: { id: '1', key: 'PROJ', name: 'Project' },
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-02T00:00:00.000Z'
      }
    };

    it('strips top-level self', () => {
      const result = formatIssue(baseIssue);
      expect(result).not.toHaveProperty('self');
    });

    it('preserves id and key at top level', () => {
      const result = formatIssue(baseIssue);
      expect(result['id']).toBe('10001');
      expect(result['key']).toBe('PROJ-1');
    });

    it('strips self from nested objects', () => {
      const issue: Issue = {
        ...baseIssue,
        fields: {
          ...baseIssue.fields,
          issuelinks: [
            {
              id: '1',
              type: { id: '1', name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
              inwardIssue: { id: '2', key: 'PROJ-2', self: 'https://example.atlassian.net/rest/api/3/issue/2' }
            }
          ]
        }
      };
      const result = formatIssue(issue);
      const fields = result['fields'] as Record<string, unknown>;
      const issuelinks = fields['issuelinks'] as Record<string, unknown>[];
      const link = issuelinks[0];
      expect(link).not.toHaveProperty('self');
      const inward = link['inwardIssue'] as Record<string, unknown>;
      expect(inward).not.toHaveProperty('self');
    });

    it('strips avatarUrls from nested objects', () => {
      const issue = {
        ...baseIssue,
        fields: {
          ...baseIssue.fields,
          assignee: {
            accountId: '123',
            displayName: 'Alice',
            avatarUrls: { '48x48': 'https://example.com/avatar.png' }
          }
        }
      } as Issue;
      const result = formatIssue(issue);
      const fields = result['fields'] as Record<string, unknown>;
      const assignee = fields['assignee'] as Record<string, unknown>;
      expect(assignee).not.toHaveProperty('avatarUrls');
      expect(assignee['displayName']).toBe('Alice');
    });

    it('strips iconUrl from nested objects', () => {
      const issue = {
        ...baseIssue,
        fields: {
          ...baseIssue.fields,
          issuetype: { id: '10000', name: 'Task', iconUrl: 'https://example.com/icon.png' }
        }
      } as Issue;
      const result = formatIssue(issue);
      const fields = result['fields'] as Record<string, unknown>;
      const issuetype = fields['issuetype'] as Record<string, unknown>;
      expect(issuetype).not.toHaveProperty('iconUrl');
      expect(issuetype['name']).toBe('Task');
    });

    it('preserves null and undefined values', () => {
      const issue: Issue = {
        ...baseIssue,
        fields: { ...baseIssue.fields, assignee: null, description: undefined }
      };
      const result = formatIssue(issue);
      const fields = result['fields'] as Record<string, unknown>;
      expect(fields['assignee']).toBeNull();
    });

    it('preserves array fields', () => {
      const issue: Issue = {
        ...baseIssue,
        fields: { ...baseIssue.fields, labels: ['bug', 'urgent'] }
      };
      const result = formatIssue(issue);
      const fields = result['fields'] as Record<string, unknown>;
      expect(fields['labels']).toEqual(['bug', 'urgent']);
    });

    it('handles subtasks with nested self', () => {
      const issue: Issue = {
        ...baseIssue,
        fields: {
          ...baseIssue.fields,
          subtasks: [
            {
              id: '10002',
              key: 'PROJ-2',
              self: 'https://example.atlassian.net/rest/api/3/issue/10002',
              fields: {
                summary: 'Subtask',
                status: { id: '1', name: 'To Do' },
                issuetype: { id: '10001', name: 'Sub-task' }
              }
            }
          ]
        }
      };
      const result = formatIssue(issue);
      const fields = result['fields'] as Record<string, unknown>;
      const subtasks = fields['subtasks'] as Record<string, unknown>[];
      const subtask = subtasks[0];
      expect(subtask['key']).toBe('PROJ-2');
      expect(subtask).not.toHaveProperty('self');
    });
  });
});
