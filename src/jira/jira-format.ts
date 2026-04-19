import type { Issue } from './jira-models.js';
import { stripKeys, stripPaths } from '../shared/format-utils.js';

const STRIPPED_KEYS: ReadonlySet<string> = new Set(['self', 'avatarUrls', 'iconUrl']);

const STRIPPED_PATHS: ReadonlyArray<string> = [
  'expand',
  'fields.issuetype.description',
  'fields.issuetype.avatarId',
  'fields.issuetype.entityId',
  'fields.issuetype.subtask',
  'fields.issuetype.hierarchyLevel',
  'fields.creator.accountType',
  'fields.creator.accountId',
  'fields.project.simplified',
  'fields.project.projectCategory',
  'fields.reporter.accountType',
  'fields.reporter.accountId',
  'fields.assignee.accountType',
  'fields.assignee.accountId',
  'fields.status.statusCategory',
  'fields.status.description',
  'fields.attachment.author.accountType',
  'fields.attachment.author.accountId',
  'fields.issuelinks.outwardIssue.fields.status.description',
  'fields.issuelinks.outwardIssue.fields.status.statusCategory',
  'fields.issuelinks.outwardIssue.fields.priority',
  'fields.issuelinks.outwardIssue.fields.issuetype.description',
  'fields.issuelinks.outwardIssue.fields.issuetype.avatarId',
  'fields.issuelinks.outwardIssue.fields.issuetype.entityId',
  'fields.issuelinks.outwardIssue.fields.issuetype.subtask',
  'fields.issuelinks.outwardIssue.fields.issuetype.hierarchyLevel',
  'fields.subtasks.fields.status.description',
  'fields.subtasks.fields.status.statusCategory',
  'fields.subtasks.fields.issuetype.description',
  'fields.subtasks.fields.issuetype.avatarId',
  'fields.subtasks.fields.issuetype.entityId',
  'fields.subtasks.fields.issuetype.hierarchyLevel',
  'fields.subtasks.fields.priority',
  'transitions.to',
  'transitions.hasScreen',
  'transitions.isGlobal',
  'transitions.isInitial',
  'transitions.isConditional',
  'transitions.isLooped'
];

export function formatIssue(issue: Issue): Record<string, unknown> {
  return stripPaths(stripKeys(issue, STRIPPED_KEYS), STRIPPED_PATHS) as Record<string, unknown>;
}
