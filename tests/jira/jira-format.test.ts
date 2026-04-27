import { describe, it, expect } from 'vitest';
import { formatComment, formatIssue, formatProject } from '../../src/jira/jira-format.js';
import type { Comment, Issue, Project } from '../../src/jira/jira-models.js';

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

  describe('formatProject', () => {
    const baseProject: Project = {
      id: '1',
      key: 'PROJ',
      name: 'Project',
      projectTypeKey: 'software',
      self: 'https://example.atlassian.net/rest/api/3/project/1',
      avatarUrls: { '48x48': 'https://example.com/avatar.png' }
    };

    it('strips self from project', () => {
      const result = formatProject(baseProject);
      expect(result).not.toHaveProperty('self');
    });

    it('strips avatarUrls from project', () => {
      const result = formatProject(baseProject);
      expect(result).not.toHaveProperty('avatarUrls');
    });

    it('preserves id, key, and name', () => {
      const result = formatProject(baseProject);
      expect(result['id']).toBe('1');
      expect(result['key']).toBe('PROJ');
      expect(result['name']).toBe('Project');
    });

    it('preserves extra fields from loose schema', () => {
      const project = { ...baseProject, style: 'next-gen' } as Project;
      const result = formatProject(project);
      expect(result['style']).toBe('next-gen');
    });

    it('strips expand, simplified, isPrivate, and roles', () => {
      const project = {
        ...baseProject,
        expand: 'description,lead',
        simplified: false,
        isPrivate: false,
        roles: { Developers: 'https://example.com/role/1' }
      } as Project;
      const result = formatProject(project);
      expect(result).not.toHaveProperty('expand');
      expect(result).not.toHaveProperty('simplified');
      expect(result).not.toHaveProperty('isPrivate');
      expect(result).not.toHaveProperty('roles');
    });

    it('strips projectCategory.description but preserves other fields', () => {
      const project = {
        ...baseProject,
        projectCategory: { id: '1', name: 'Internal', description: 'Internal projects' }
      } as Project;
      const result = formatProject(project);
      const category = result['projectCategory'] as Record<string, unknown>;
      expect(category['id']).toBe('1');
      expect(category['name']).toBe('Internal');
      expect(category).not.toHaveProperty('description');
    });

    it('strips avatarId from issueTypes array items', () => {
      const project = {
        ...baseProject,
        issueTypes: [
          { id: '1', name: 'Bug', avatarId: 10303 },
          { id: '2', name: 'Task', avatarId: 10318 }
        ]
      } as Project;
      const result = formatProject(project);
      const issueTypes = result['issueTypes'] as Record<string, unknown>[];
      expect(issueTypes[0]).toEqual({ id: '1', name: 'Bug' });
      expect(issueTypes[1]).toEqual({ id: '2', name: 'Task' });
    });
  });

  describe('formatComment', () => {
    const baseComment: Comment = {
      id: '10000',
      self: 'https://example.atlassian.net/rest/api/3/issue/10001/comment/10000',
      author: { accountId: '123', displayName: 'Alice' },
      body: { version: 1, type: 'doc', content: [] },
      updateAuthor: { accountId: '456', displayName: 'Bob' },
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-02T00:00:00.000Z'
    };

    it('strips self from comment', () => {
      const result = formatComment(baseComment);
      expect(result).not.toHaveProperty('self');
    });

    it('preserves id, created, and updated', () => {
      const result = formatComment(baseComment);
      expect(result['id']).toBe('10000');
      expect(result['created']).toBe('2026-01-01T00:00:00.000Z');
      expect(result['updated']).toBe('2026-01-02T00:00:00.000Z');
    });

    it('strips accountId from author but preserves displayName', () => {
      const result = formatComment(baseComment);
      const author = result['author'] as Record<string, unknown>;
      expect(author).not.toHaveProperty('accountId');
      expect(author['displayName']).toBe('Alice');
    });

    it('strips accountId from updateAuthor but preserves displayName', () => {
      const result = formatComment(baseComment);
      const updateAuthor = result['updateAuthor'] as Record<string, unknown>;
      expect(updateAuthor).not.toHaveProperty('accountId');
      expect(updateAuthor['displayName']).toBe('Bob');
    });

    it('strips accountType from author and updateAuthor when present', () => {
      const comment = {
        ...baseComment,
        author: { accountId: '123', displayName: 'Alice', accountType: 'atlassian' },
        updateAuthor: { accountId: '456', displayName: 'Bob', accountType: 'atlassian' }
      } as Comment;
      const result = formatComment(comment);
      const author = result['author'] as Record<string, unknown>;
      const updateAuthor = result['updateAuthor'] as Record<string, unknown>;
      expect(author).not.toHaveProperty('accountType');
      expect(updateAuthor).not.toHaveProperty('accountType');
    });

    it('preserves body content', () => {
      const result = formatComment(baseComment);
      expect(result['body']).toEqual({ version: 1, type: 'doc', content: [] });
    });
  });
});
