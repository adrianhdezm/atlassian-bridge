import { z } from 'zod';

export const PageSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  title: z.string(),
  spaceId: z.string(),
  parentId: z.string().nullable(),
  authorId: z.string(),
  createdAt: z.string(),
  version: z.looseObject({
    number: z.number(),
    message: z.string(),
    authorId: z.string()
  }),
  body: z
    .object({
      atlas_doc_format: z
        .object({
          value: z.string(),
          representation: z.literal('atlas_doc_format')
        })
        .optional()
    })
    .optional(),
  _links: z.looseObject({ webui: z.string() })
});

export type Page = z.infer<typeof PageSchema>;

export const PaginatedPagesSchema = z.object({
  results: z.array(PageSchema),
  _links: z.object({
    next: z.string().optional()
  })
});

export type PaginatedPages = z.infer<typeof PaginatedPagesSchema>;

export const SearchResultItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  excerpt: z.string(),
  url: z.string()
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchResultSchema = z.object({
  results: z.array(SearchResultItemSchema),
  _links: z.object({
    next: z.string().optional()
  })
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const DescendantPageSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  title: z.string(),
  type: z.string(),
  parentId: z.string(),
  depth: z.number(),
  childPosition: z.number()
});

export type DescendantPage = z.infer<typeof DescendantPageSchema>;

export const PaginatedDescendantsSchema = z.object({
  results: z.array(DescendantPageSchema),
  _links: z.object({
    next: z.string().optional()
  })
});

export type PaginatedDescendants = z.infer<typeof PaginatedDescendantsSchema>;

export const SpaceLookupSchema = z.object({
  results: z.array(z.object({ id: z.string() }))
});

export const SpaceSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.string()
});

export type Space = z.infer<typeof SpaceSchema>;
