import { z } from 'zod';

export const JiraTokenPaginationSchema = z.object({
  maxResults: z.number().optional(),
  isLast: z.boolean().optional(),
  nextPageToken: z.string().optional()
});

export const JiraOffsetPaginationSchema = z.object({
  startAt: z.number(),
  maxResults: z.number(),
  total: z.number()
});

export const StatusCategorySchema = z.looseObject({
  id: z.number(),
  key: z.string(),
  name: z.string(),
  colorName: z.string()
});

export type StatusCategory = z.infer<typeof StatusCategorySchema>;

export const IssueLinkSchema = z.looseObject({
  id: z.string(),
  type: z.looseObject({
    id: z.string(),
    name: z.string(),
    inward: z.string(),
    outward: z.string()
  }),
  inwardIssue: z.looseObject({ id: z.string(), key: z.string(), self: z.string() }).optional(),
  outwardIssue: z.looseObject({ id: z.string(), key: z.string(), self: z.string() }).optional()
});

export type IssueLink = z.infer<typeof IssueLinkSchema>;

export const AttachmentSchema = z.looseObject({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  created: z.string(),
  self: z.string(),
  content: z.string()
});

export type Attachment = z.infer<typeof AttachmentSchema>;

export const TransitionSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  to: z.looseObject({ id: z.string(), name: z.string() })
});

export type Transition = z.infer<typeof TransitionSchema>;

export const IssueSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  self: z.string(),
  fields: z.looseObject({
    summary: z.string(),
    status: z.looseObject({ id: z.string(), name: z.string(), statusCategory: StatusCategorySchema }),
    statusCategory: StatusCategorySchema.optional(),
    assignee: z.looseObject({ accountId: z.string(), displayName: z.string() }).nullable(),
    reporter: z.looseObject({ accountId: z.string(), displayName: z.string() }),
    creator: z.looseObject({ accountId: z.string(), displayName: z.string() }),
    priority: z.looseObject({ id: z.string(), name: z.string() }).optional(),
    issuetype: z.looseObject({ id: z.string(), name: z.string() }),
    project: z.looseObject({ id: z.string(), key: z.string(), name: z.string() }),
    description: z.unknown().nullable().optional(),
    created: z.string(),
    updated: z.string(),
    statuscategorychangedate: z.string().nullable().optional(),
    lastViewed: z.string().nullable().optional(),
    duedate: z.string().nullable().optional(),
    labels: z.array(z.string()).optional(),
    issuelinks: z.array(IssueLinkSchema).optional(),
    attachment: z.array(AttachmentSchema).optional(),
    subtasks: z
      .array(
        z.looseObject({
          id: z.string(),
          key: z.string(),
          self: z.string(),
          fields: z.looseObject({
            summary: z.string(),
            status: z.looseObject({ id: z.string(), name: z.string() }),
            issuetype: z.looseObject({ id: z.string(), name: z.string() })
          })
        })
      )
      .optional()
  }),
  transitions: z.array(TransitionSchema).optional()
});

export type Issue = z.infer<typeof IssueSchema>;

export const CreatedIssueSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  self: z.string()
});

export type CreatedIssue = z.infer<typeof CreatedIssueSchema>;

export const IssueSearchResultSchema = JiraTokenPaginationSchema.extend({
  issues: z.array(IssueSchema)
});

export type IssueSearchResult = z.infer<typeof IssueSearchResultSchema>;

export const ProjectSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  projectTypeKey: z.string()
});

export type Project = z.infer<typeof ProjectSchema>;

export const PaginatedProjectsSchema = JiraOffsetPaginationSchema.extend({
  values: z.array(ProjectSchema)
});

export type PaginatedProjects = z.infer<typeof PaginatedProjectsSchema>;
