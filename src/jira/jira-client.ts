import { z } from 'zod';
import { fetchJsonObject } from '../http-client/http-client.js';
import { AdfSchema } from '../shared/adf-schema.js';
import {
  IssueSchema,
  CreatedIssueSchema,
  TransitionSchema,
  IssueSearchResultSchema,
  PaginatedProjectsSchema,
  ProjectSchema
} from './jira-models.js';
import type { Issue, CreatedIssue, Transition, IssueSearchResult, PaginatedProjects, Project } from './jira-models.js';

const TransitionsResponseSchema = z.object({
  transitions: z.array(TransitionSchema)
});

const DEFAULT_ISSUE_FIELDS = [
  'summary',
  'status',
  'assignee',
  'reporter',
  'priority',
  'issuetype',
  'project',
  'description',
  'created',
  'updated',
  'labels'
];

export interface JiraClientConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface CreateIssueAttrs {
  projectKey: string;
  issueTypeName: string;
  summary: string;
  description?: object;
  parentKey?: string;
  labels?: string[];
}

export interface UpdateIssueAttrs {
  summary?: string;
  description?: object;
  labels?: string[];
}

export interface TransitionIssueAttrs {
  transitionId: string;
}

export interface SearchIssuesOptions {
  jql: string;
  nextPageToken?: string;
  maxResults?: number;
  fields?: string[];
}

export interface GetProjectsOptions {
  startAt?: number;
  maxResults?: number;
  query?: string;
}

export class JiraClient {
  private readonly apiUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: JiraClientConfig) {
    this.apiUrl = `${config.baseUrl}/rest/api/3`;
    this.headers = {
      Authorization: `Basic ${btoa(`${config.email}:${config.apiToken}`)}`,
      'Content-Type': 'application/json'
    };
  }

  async getIssue(issueIdOrKey: string): Promise<Issue> {
    return fetchJsonObject(IssueSchema, `${this.apiUrl}/issue/${issueIdOrKey}`, {
      headers: this.headers
    });
  }

  async createIssue(input: CreateIssueAttrs): Promise<CreatedIssue> {
    if (input.description) {
      AdfSchema.parse(input.description);
    }

    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      issuetype: { name: input.issueTypeName },
      summary: input.summary
    };
    if (input.description !== undefined) {
      fields['description'] = input.description;
    }
    if (input.parentKey !== undefined) {
      fields['parent'] = { key: input.parentKey };
    }
    if (input.labels !== undefined) {
      fields['labels'] = input.labels;
    }

    return fetchJsonObject(CreatedIssueSchema, `${this.apiUrl}/issue`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ fields })
    });
  }

  async updateIssue(issueIdOrKey: string, input: UpdateIssueAttrs): Promise<void> {
    if (input.description) {
      AdfSchema.parse(input.description);
    }

    const fields: Record<string, unknown> = {};
    if (input.summary !== undefined) {
      fields['summary'] = input.summary;
    }
    if (input.description !== undefined) {
      fields['description'] = input.description;
    }
    if (input.labels !== undefined) {
      fields['labels'] = input.labels;
    }

    const response = await fetch(`${this.apiUrl}/issue/${issueIdOrKey}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ fields })
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status} | ${response.statusText}`);
    }
  }

  async deleteIssue(issueIdOrKey: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/issue/${issueIdOrKey}`, {
      method: 'DELETE',
      headers: this.headers
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status} | ${response.statusText}`);
    }
  }

  async getTransitions(issueIdOrKey: string): Promise<Transition[]> {
    const result = await fetchJsonObject(TransitionsResponseSchema, `${this.apiUrl}/issue/${issueIdOrKey}/transitions`, {
      headers: this.headers
    });
    return result.transitions;
  }

  async transitionIssue(issueIdOrKey: string, input: TransitionIssueAttrs): Promise<void> {
    const response = await fetch(`${this.apiUrl}/issue/${issueIdOrKey}/transitions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ transition: { id: input.transitionId } })
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status} | ${response.statusText}`);
    }
  }

  async searchIssues(options: SearchIssuesOptions): Promise<IssueSearchResult> {
    const params = new URLSearchParams({ jql: options.jql });
    params.set('fields', (options.fields ?? DEFAULT_ISSUE_FIELDS).join(','));
    if (options.nextPageToken !== undefined) {
      params.set('nextPageToken', options.nextPageToken);
    }
    if (options.maxResults !== undefined) {
      params.set('maxResults', String(options.maxResults));
    }

    return fetchJsonObject(IssueSearchResultSchema, `${this.apiUrl}/search/jql?${params.toString()}`, {
      headers: this.headers
    });
  }

  async getProject(projectKeyOrId: string): Promise<Project> {
    return fetchJsonObject(ProjectSchema, `${this.apiUrl}/project/${projectKeyOrId}`, {
      headers: this.headers
    });
  }

  async getProjects(options?: GetProjectsOptions): Promise<PaginatedProjects> {
    const params = new URLSearchParams();
    if (options?.startAt !== undefined) {
      params.set('startAt', String(options.startAt));
    }
    if (options?.maxResults !== undefined) {
      params.set('maxResults', String(options.maxResults));
    }
    if (options?.query !== undefined) {
      params.set('query', options.query);
    }

    const qs = params.toString();
    return fetchJsonObject(PaginatedProjectsSchema, `${this.apiUrl}/project/search${qs ? `?${qs}` : ''}`, {
      headers: this.headers
    });
  }

  async getChildIssues(issueIdOrKey: string): Promise<Issue[]> {
    const allIssues: Issue[] = [];
    let nextPageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        jql: `parent=${issueIdOrKey}`,
        maxResults: '100',
        fields: DEFAULT_ISSUE_FIELDS.join(',')
      });
      if (nextPageToken !== undefined) {
        params.set('nextPageToken', nextPageToken);
      }

      const result = await fetchJsonObject(IssueSearchResultSchema, `${this.apiUrl}/search/jql?${params.toString()}`, {
        headers: this.headers
      });
      allIssues.push(...result.issues);
      nextPageToken = result.nextPageToken;
    } while (nextPageToken !== undefined);

    return allIssues;
  }
}
