import { z } from 'zod';
import { fetchJsonObject } from '../http-client/http-client.js';
import { AdfSchema } from '../shared/adf-schema.js';
import { AppError } from '../shared/app-error.js';
import {
  PageSchema,
  PaginatedPagesSchema,
  PaginatedDescendantsSchema,
  SearchResultSchema,
  SpaceLookupSchema,
  SpaceSchema
} from './confluence-models.js';
import type { Page, PaginatedPages, PaginatedDescendants, SearchResult, DescendantPage, Space } from './confluence-models.js';

const RawSearchSchema = z.object({
  results: z.array(
    z.object({
      content: z.object({ id: z.string() }),
      title: z.string(),
      excerpt: z.string(),
      url: z.string()
    })
  ),
  _links: z.object({
    next: z.string().optional()
  })
});

export interface ConfluenceClientConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface GetPagesOptions {
  spaceIdOrKey?: string;
  title?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export interface CreatePageAttrs {
  spaceIdOrKey: string;
  title: string;
  parentId?: string;
  body: string;
}

export interface UpdatePageAttrs {
  title: string;
  body: string;
}

export interface SearchPagesOptions {
  cql: string;
  limit?: number;
  cursor?: string;
}

export interface GetDescendantsOptions {
  depth?: number;
  limit?: number;
}

export interface GetSpaceTreeOptions {
  depth?: number;
}

export class ConfluenceClient {
  private readonly baseUrl: string;
  private readonly v2Url: string;
  private readonly v1Url: string;
  private readonly headers: Record<string, string>;
  private readonly spaceKeyCache = new Map<string, string>();

  constructor(config: ConfluenceClientConfig) {
    this.baseUrl = config.baseUrl;
    this.v2Url = `${config.baseUrl}/wiki/api/v2`;
    this.v1Url = `${config.baseUrl}/wiki/rest/api`;
    this.headers = {
      Authorization: `Basic ${btoa(`${config.email}:${config.apiToken}`)}`,
      'Content-Type': 'application/json'
    };
  }

  async getSpace(spaceIdOrKey: string): Promise<Space> {
    const spaceId = await this.resolveSpaceId(spaceIdOrKey);
    return fetchJsonObject(SpaceSchema, `${this.v2Url}/spaces/${spaceId}`, {
      headers: this.headers
    });
  }

  async getPage(pageId: string): Promise<Page> {
    return fetchJsonObject(PageSchema, `${this.v2Url}/pages/${pageId}?body-format=atlas_doc_format`, {
      headers: this.headers
    });
  }

  async getPages(options?: GetPagesOptions): Promise<PaginatedPages> {
    const params = new URLSearchParams({ 'body-format': 'atlas_doc_format' });

    if (options?.spaceIdOrKey !== undefined) {
      const spaceId = await this.resolveSpaceId(options.spaceIdOrKey);
      params.set('space-id', spaceId);
    }
    if (options?.title !== undefined) {
      params.set('title', options.title);
    }
    if (options?.status !== undefined) {
      params.set('status', options.status);
    }
    if (options?.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options?.cursor !== undefined) {
      return fetchJsonObject(PaginatedPagesSchema, `${this.baseUrl}${options.cursor}`, { headers: this.headers });
    }

    return fetchJsonObject(PaginatedPagesSchema, `${this.v2Url}/pages?${params.toString()}`, {
      headers: this.headers
    });
  }

  async createPage(input: CreatePageAttrs): Promise<Page> {
    const adf = JSON.parse(input.body) as unknown;
    AdfSchema.parse(adf);

    const spaceId = await this.resolveSpaceId(input.spaceIdOrKey);

    const body: Record<string, unknown> = {
      spaceId,
      status: 'current',
      title: input.title,
      body: {
        representation: 'atlas_doc_format',
        value: input.body
      }
    };
    if (input.parentId !== undefined) {
      body['parentId'] = input.parentId;
    }

    return fetchJsonObject(PageSchema, `${this.v2Url}/pages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body)
    });
  }

  async updatePage(pageId: string, input: UpdatePageAttrs): Promise<Page> {
    const adf = JSON.parse(input.body) as unknown;
    AdfSchema.parse(adf);

    const current = await this.getPage(pageId);

    return fetchJsonObject(PageSchema, `${this.v2Url}/pages/${pageId}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({
        id: pageId,
        status: 'current',
        title: input.title,
        body: {
          representation: 'atlas_doc_format',
          value: input.body
        },
        version: {
          number: current.version.number + 1,
          message: 'Updated via CLI'
        }
      })
    });
  }

  async deletePage(pageId: string): Promise<void> {
    const response = await fetch(`${this.v2Url}/pages/${pageId}`, {
      method: 'DELETE',
      headers: this.headers
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status} | ${response.statusText}`);
    }
  }

  async searchPages(options: SearchPagesOptions): Promise<SearchResult> {
    const params = new URLSearchParams({ cql: options.cql });
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options.cursor !== undefined) {
      return this.fetchSearchResults(`${this.baseUrl}${options.cursor}`);
    }

    return this.fetchSearchResults(`${this.v1Url}/content/search?${params.toString()}`);
  }

  async getDescendants(pageId: string, options?: GetDescendantsOptions): Promise<DescendantPage[]> {
    const depth = options?.depth ?? 5;
    const limit = options?.limit ?? 250;
    const results: DescendantPage[] = [];

    let url: string | undefined = `${this.v2Url}/pages/${pageId}/descendants?depth=${depth}&limit=${limit}`;
    while (url !== undefined) {
      const resp: PaginatedDescendants = await fetchJsonObject(PaginatedDescendantsSchema, url, { headers: this.headers });
      results.push(...resp.results);
      url = resp._links.next ? `${this.baseUrl}${resp._links.next}` : undefined;
    }

    return results;
  }

  async getSpaceTree(spaceIdOrKey: string, options?: GetSpaceTreeOptions): Promise<DescendantPage[]> {
    const depth = options?.depth ?? 2;
    const spaceId = await this.resolveSpaceId(spaceIdOrKey);

    const rootPages: Page[] = [];
    let url: string | undefined = `${this.v2Url}/spaces/${spaceId}/pages?depth=root&status=current`;
    while (url !== undefined) {
      const resp: PaginatedPages = await fetchJsonObject(PaginatedPagesSchema, url, { headers: this.headers });
      rootPages.push(...resp.results);
      url = resp._links.next ? `${this.baseUrl}${resp._links.next}` : undefined;
    }

    const roots: DescendantPage[] = rootPages.map((p) => ({
      id: p.id,
      status: p.status,
      title: p.title,
      type: 'page',
      parentId: p.parentId ?? '',
      depth: 0,
      childPosition: 0
    }));

    if (depth <= 0) {
      return roots;
    }

    const descendantArrays = await Promise.all(roots.map((root) => this.getDescendants(root.id, { depth })));

    const allPages: DescendantPage[] = [];
    for (let i = 0; i < roots.length; i++) {
      allPages.push(roots[i]!);
      allPages.push(...descendantArrays[i]!);
    }

    return allPages;
  }

  private async resolveSpaceId(spaceIdOrKey: string): Promise<string> {
    if (/^\d+$/.test(spaceIdOrKey)) {
      return spaceIdOrKey;
    }

    const cached = this.spaceKeyCache.get(spaceIdOrKey);
    if (cached !== undefined) {
      return cached;
    }

    const data = await fetchJsonObject(SpaceLookupSchema, `${this.v2Url}/spaces?keys=${encodeURIComponent(spaceIdOrKey)}`, {
      headers: this.headers
    });

    if (data.results.length === 0) {
      throw new AppError(`Space not found: ${spaceIdOrKey}`);
    }

    const id = data.results[0]!.id;
    this.spaceKeyCache.set(spaceIdOrKey, id);
    return id;
  }

  private async fetchSearchResults(url: string): Promise<SearchResult> {
    const raw = await fetchJsonObject(RawSearchSchema, url, { headers: this.headers });

    const mapped = {
      results: raw.results.map((r) => ({
        id: r.content.id,
        title: r.title,
        excerpt: r.excerpt,
        url: r.url
      })),
      _links: raw._links
    };

    return SearchResultSchema.parse(mapped);
  }
}
