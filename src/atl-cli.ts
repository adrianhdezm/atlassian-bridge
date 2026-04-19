#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Program } from './cli/program.js';
import { AppError } from './shared/app-error.js';
import { CredentialStorage } from './auth/credential-storage.js';
import { JiraClient } from './jira/jira-client.js';
import { ConfluenceClient } from './confluence/confluence-client.js';
import type { Credentials } from './auth/credential-storage.js';

const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };

export function buildProgram(configDir?: string): Program {
  const credentialStorage = new CredentialStorage(configDir);

  function loadCredentials(): Credentials {
    try {
      return credentialStorage.load();
    } catch (err) {
      if (err instanceof AppError) {
        throw new AppError(`${err.message} — run \`atl auth login\` or set the environment variable`);
      }
      throw err;
    }
  }

  const program = new Program();
  program.name('atl').description('Atlassian Bridge — Jira & Confluence from the terminal').version(version);
  program.option('-v, --verbose', 'Enable verbose output');

  // ── auth ──────────────────────────────────────────────────────

  const auth = program.command('auth').description('Manage authentication');

  auth
    .subcommand('login')
    .description('Save credentials')
    .option('--base-url <url>', 'Atlassian instance URL')
    .option('--email <email>', 'Account email')
    .option('--token <token>', 'API token')
    .action((_args, opts) => {
      const baseUrl = opts['base-url'] as string | undefined;
      const email = opts['email'] as string | undefined;
      const token = opts['token'] as string | undefined;
      if (!baseUrl || !email || !token) {
        throw new AppError('--base-url, --email, and --token are all required');
      }
      credentialStorage.save({ baseUrl, email, apiToken: token });
      console.log('Credentials saved.');
    });

  auth
    .subcommand('status')
    .description('Show current credentials')
    .action(() => {
      const creds = loadCredentials();
      console.log(`Base URL:  ${creds.baseUrl}`);
      console.log(`Email:     ${creds.email}`);
      console.log(`Token:     ${creds.apiToken.length > 4 ? '****' + creds.apiToken.slice(-4) : '****'}`);
    });

  auth
    .subcommand('logout')
    .description('Remove stored credentials')
    .action(() => {
      const removed = credentialStorage.clear();
      console.log(removed ? 'Credentials removed.' : 'No stored credentials found.');
    });

  // ── confluence ────────────────────────────────────────────────

  const confluence = program.namespace('confluence').description('Confluence operations');

  // confluence pages

  const pages = confluence.command('pages').description('Manage pages');

  pages
    .subcommand('get')
    .description('Get a page by ID')
    .argument('<pageId>', 'Page ID')
    .action(async (args) => {
      const creds = loadCredentials();
      const client = new ConfluenceClient(creds);
      const result = await client.getPage(args['pageId'] as string);
      console.log(JSON.stringify(result, null, 2));
    });

  pages
    .subcommand('list')
    .description('List pages')
    .option('--space <id>', 'Filter by space ID or key')
    .option('--title <title>', 'Filter by title')
    .option('--status <status>', 'Filter by status')
    .option('--limit <n>', 'Max results', '25')
    .option('--cursor <cursor>', 'Pagination cursor')
    .action(async (_args, opts) => {
      const creds = loadCredentials();
      const client = new ConfluenceClient(creds);
      const space = opts['space'] as string | undefined;
      const title = opts['title'] as string | undefined;
      const status = opts['status'] as string | undefined;
      const cursor = opts['cursor'] as string | undefined;
      const result = await client.getPages({
        ...(space !== undefined ? { spaceIdOrKey: space } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(status !== undefined ? { status } : {}),
        limit: Number(opts['limit']),
        ...(cursor !== undefined ? { cursor } : {})
      });
      console.log(JSON.stringify(result, null, 2));
    });

  pages
    .subcommand('create')
    .description('Create a new page')
    .argument('<title>', 'Page title')
    .option('--space <id>', 'Space ID or key')
    .option('--parent-id <id>', 'Parent page ID')
    .option('--body <adf>', 'ADF JSON body string')
    .action(async (args, opts) => {
      const creds = loadCredentials();
      const client = new ConfluenceClient(creds);
      const space = opts['space'] as string | undefined;
      if (!space) {
        throw new AppError('--space is required');
      }
      const parentId = opts['parent-id'] as string | undefined;
      const body = (opts['body'] as string | undefined) ?? '{"version":1,"type":"doc","content":[]}';
      const result = await client.createPage({
        spaceIdOrKey: space,
        title: args['title'] as string,
        ...(parentId !== undefined ? { parentId } : {}),
        body
      });
      console.log(JSON.stringify(result, null, 2));
    });

  pages
    .subcommand('update')
    .description('Update a page')
    .argument('<pageId>', 'Page ID')
    .option('--title <title>', 'New title')
    .option('--body <adf>', 'New ADF body')
    .action(async (args, opts) => {
      const creds = loadCredentials();
      const client = new ConfluenceClient(creds);
      const pageId = args['pageId'] as string;
      const titleOpt = opts['title'] as string | undefined;
      const bodyOpt = opts['body'] as string | undefined;

      let title: string;
      let body: string;

      if (titleOpt === undefined || bodyOpt === undefined) {
        const current = await client.getPage(pageId);
        title = titleOpt ?? current.title;
        body = bodyOpt ?? current.body?.atlas_doc_format?.value ?? '{"version":1,"type":"doc","content":[]}';
      } else {
        title = titleOpt;
        body = bodyOpt;
      }

      const result = await client.updatePage(pageId, { title, body });
      console.log(JSON.stringify(result, null, 2));
    });

  pages
    .subcommand('delete')
    .description('Delete a page')
    .argument('<pageId>', 'Page ID')
    .action(async (args) => {
      const creds = loadCredentials();
      const client = new ConfluenceClient(creds);
      await client.deletePage(args['pageId'] as string);
      console.log('Done.');
    });

  pages
    .subcommand('descendants')
    .description('Get page descendants')
    .argument('<pageId>', 'Page ID')
    .option('--depth <n>', 'Tree depth', '5')
    .option('--limit <n>', 'Per-page fetch limit', '250')
    .action(async (args, opts) => {
      const creds = loadCredentials();
      const client = new ConfluenceClient(creds);
      const result = await client.getDescendants(args['pageId'] as string, {
        depth: Number(opts['depth']),
        limit: Number(opts['limit'])
      });
      console.log(JSON.stringify(result, null, 2));
    });

  pages
    .subcommand('search')
    .description('Search pages via CQL')
    .argument('<cql>', 'CQL query')
    .option('--limit <n>', 'Max results', '25')
    .option('--cursor <cursor>', 'Pagination cursor')
    .action(async (args, opts) => {
      const creds = loadCredentials();
      const client = new ConfluenceClient(creds);
      const cursor = opts['cursor'] as string | undefined;
      const result = await client.searchPages({
        cql: args['cql'] as string,
        limit: Number(opts['limit']),
        ...(cursor !== undefined ? { cursor } : {})
      });
      console.log(JSON.stringify(result, null, 2));
    });

  // confluence spaces

  const spaces = confluence.command('spaces').description('Manage spaces');

  spaces
    .subcommand('get')
    .description('Get a space by ID or key')
    .argument('<spaceIdOrKey>', 'Space ID or key')
    .action(async (args) => {
      const creds = loadCredentials();
      const client = new ConfluenceClient(creds);
      const result = await client.getSpace(args['spaceIdOrKey'] as string);
      console.log(JSON.stringify(result, null, 2));
    });

  spaces
    .subcommand('tree')
    .description('Get space page tree')
    .argument('<spaceIdOrKey>', 'Space ID or key')
    .option('--depth <n>', 'Descendant depth', '2')
    .action(async (args, opts) => {
      const creds = loadCredentials();
      const client = new ConfluenceClient(creds);
      const result = await client.getSpaceTree(args['spaceIdOrKey'] as string, {
        depth: Number(opts['depth'])
      });
      console.log(JSON.stringify(result, null, 2));
    });

  // ── jira ──────────────────────────────────────────────────────

  const jira = program.namespace('jira').description('Jira operations');

  // jira issues

  const issues = jira.command('issues').description('Manage issues');

  issues
    .subcommand('get')
    .description('Get an issue by key')
    .argument('<issueKey>', 'Issue key')
    .action(async (args) => {
      const creds = loadCredentials();
      const client = new JiraClient(creds);
      const result = await client.getIssue(args['issueKey'] as string);
      console.log(JSON.stringify(result, null, 2));
    });

  issues
    .subcommand('create')
    .description('Create a new issue')
    .argument('<summary>', 'Issue summary')
    .option('--project <key>', 'Project key')
    .option('--type <name>', 'Issue type name')
    .option('--description <adf>', 'ADF JSON object as string')
    .option('--parent <key>', 'Parent issue key')
    .option('--labels <labels>', 'Comma-separated labels')
    .action(async (args, opts) => {
      const creds = loadCredentials();
      const client = new JiraClient(creds);
      const project = opts['project'] as string | undefined;
      const type = opts['type'] as string | undefined;
      if (!project || !type) {
        throw new AppError('--project and --type are required');
      }
      const description = opts['description'] as string | undefined;
      const parent = opts['parent'] as string | undefined;
      const labels = opts['labels'] as string | undefined;
      const result = await client.createIssue({
        projectKey: project,
        issueTypeName: type,
        summary: args['summary'] as string,
        ...(description !== undefined ? { description: JSON.parse(description) as object } : {}),
        ...(parent !== undefined ? { parentKey: parent } : {}),
        ...(labels !== undefined ? { labels: labels.split(',') } : {})
      });
      console.log(JSON.stringify(result, null, 2));
    });

  issues
    .subcommand('update')
    .description('Update an issue')
    .argument('<issueKey>', 'Issue key')
    .option('--summary <text>', 'New summary')
    .option('--description <adf>', 'ADF JSON object as string')
    .option('--labels <labels>', 'Comma-separated labels')
    .action(async (args, opts) => {
      const creds = loadCredentials();
      const client = new JiraClient(creds);
      const summary = opts['summary'] as string | undefined;
      const description = opts['description'] as string | undefined;
      const labels = opts['labels'] as string | undefined;
      const result = await client.updateIssue(args['issueKey'] as string, {
        ...(summary !== undefined ? { summary } : {}),
        ...(description !== undefined ? { description: JSON.parse(description) as object } : {}),
        ...(labels !== undefined ? { labels: labels.split(',') } : {})
      });
      console.log(JSON.stringify(result, null, 2));
    });

  issues
    .subcommand('delete')
    .description('Delete an issue')
    .argument('<issueKey>', 'Issue key')
    .action(async (args) => {
      const creds = loadCredentials();
      const client = new JiraClient(creds);
      await client.deleteIssue(args['issueKey'] as string);
      console.log('Done.');
    });

  issues
    .subcommand('transitions')
    .description('List available transitions')
    .argument('<issueKey>', 'Issue key')
    .action(async (args) => {
      const creds = loadCredentials();
      const client = new JiraClient(creds);
      const result = await client.getTransitions(args['issueKey'] as string);
      console.log(JSON.stringify(result, null, 2));
    });

  issues
    .subcommand('transition')
    .description('Execute a workflow transition')
    .argument('<issueKey>', 'Issue key')
    .argument('<transitionId>', 'Transition ID')
    .action(async (args) => {
      const creds = loadCredentials();
      const client = new JiraClient(creds);
      await client.transitionIssue(args['issueKey'] as string, { transitionId: args['transitionId'] as string });
      console.log('Done.');
    });

  issues
    .subcommand('search')
    .description('Search issues via JQL')
    .argument('<jql>', 'JQL query')
    .option('--next-page-token <token>', 'Cursor token for next page')
    .option('--max-results <n>', 'Max results per page', '50')
    .option('--fields <fields>', 'Comma-separated field names')
    .action(async (args, opts) => {
      const creds = loadCredentials();
      const client = new JiraClient(creds);
      const nextPageToken = opts['next-page-token'] as string | undefined;
      const fields = opts['fields'] as string | undefined;
      const result = await client.searchIssues({
        jql: args['jql'] as string,
        ...(nextPageToken !== undefined ? { nextPageToken } : {}),
        maxResults: Number(opts['max-results']),
        ...(fields !== undefined ? { fields: fields.split(',') } : {})
      });
      console.log(JSON.stringify(result, null, 2));
    });

  issues
    .subcommand('children')
    .description('Get child issues')
    .argument('<issueKey>', 'Issue key')
    .action(async (args) => {
      const creds = loadCredentials();
      const client = new JiraClient(creds);
      const result = await client.getChildIssues(args['issueKey'] as string);
      console.log(JSON.stringify(result, null, 2));
    });

  // jira projects

  const projects = jira.command('projects').description('Manage projects');

  projects
    .subcommand('get')
    .description('Get a project by key or ID')
    .argument('<projectKeyOrId>', 'Project key or ID')
    .action(async (args) => {
      const creds = loadCredentials();
      const client = new JiraClient(creds);
      const result = await client.getProject(args['projectKeyOrId'] as string);
      console.log(JSON.stringify(result, null, 2));
    });

  projects
    .subcommand('list')
    .description('List projects')
    .option('--start-at <n>', 'Offset', '0')
    .option('--max-results <n>', 'Max results', '50')
    .option('--query <q>', 'Filter by name')
    .action(async (_args, opts) => {
      const creds = loadCredentials();
      const client = new JiraClient(creds);
      const query = opts['query'] as string | undefined;
      const result = await client.getProjects({
        startAt: Number(opts['start-at']),
        maxResults: Number(opts['max-results']),
        ...(query !== undefined ? { query } : {})
      });
      console.log(JSON.stringify(result, null, 2));
    });

  return program;
}
