import { z } from 'zod';

export const IssueSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  self: z.string(),
  fields: z.looseObject({
    summary: z.string(),
    status: z.looseObject({ id: z.string(), name: z.string() }),
    assignee: z.looseObject({ accountId: z.string(), displayName: z.string() }).nullable(),
    reporter: z.looseObject({ accountId: z.string(), displayName: z.string() }),
    priority: z.looseObject({ id: z.string(), name: z.string() }).optional(),
    issuetype: z.looseObject({ id: z.string(), name: z.string() }),
    project: z.looseObject({ id: z.string(), key: z.string(), name: z.string() }),
    description: z.unknown().nullable().optional(),
    created: z.string(),
    updated: z.string(),
    labels: z.array(z.string()).optional()
  })
});

export type Issue = z.infer<typeof IssueSchema>;

export const CreatedIssueSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  self: z.string()
});

export type CreatedIssue = z.infer<typeof CreatedIssueSchema>;

export const TransitionSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  to: z.looseObject({ id: z.string(), name: z.string() })
});

export type Transition = z.infer<typeof TransitionSchema>;

export const IssueSearchResultSchema = z.object({
  issues: z.array(IssueSchema),
  maxResults: z.number().optional(),
  isLast: z.boolean().optional(),
  nextPageToken: z.string().optional()
});

export type IssueSearchResult = z.infer<typeof IssueSearchResultSchema>;

export const ProjectSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  projectTypeKey: z.string()
});

export type Project = z.infer<typeof ProjectSchema>;

export const PaginatedProjectsSchema = z.object({
  startAt: z.number(),
  maxResults: z.number(),
  total: z.number(),
  values: z.array(ProjectSchema)
});

export type PaginatedProjects = z.infer<typeof PaginatedProjectsSchema>;
