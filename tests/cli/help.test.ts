import { describe, it, expect } from 'vitest';
import { formatVersion, formatRootHelp, formatNamespaceHelp, formatCommandHelp, formatSubcommandHelp } from '../../src/cli/help.js';

describe('help', () => {
  describe('formatVersion', () => {
    it('formats version only', () => {
      const result = formatVersion('0.1.0');

      expect(result).toBe('0.1.0');
    });
  });

  describe('formatRootHelp', () => {
    it('includes description, usage, commands, namespaces, and flags', () => {
      const output = formatRootHelp(
        'ab',
        'Atlassian Bridge CLI',
        [{ name: 'auth', description: 'Authentication' }],
        [{ name: 'jira', description: 'Jira operations' }],
        [{ long: 'verbose', description: 'Enable verbose output', short: 'v' }]
      );

      expect(output).toContain('Atlassian Bridge CLI');
      expect(output).toContain('USAGE');
      expect(output).toContain('ab <command> [flags]');
      expect(output).toContain('COMMANDS');
      expect(output).toContain('auth');
      expect(output).toContain('NAMESPACES');
      expect(output).toContain('jira');
      expect(output).toContain('FLAGS');
      expect(output).toContain('--verbose');
      expect(output).toContain('--help');
    });

    it('omits COMMANDS section when empty', () => {
      const output = formatRootHelp('ab', 'desc', [], [{ name: 'jira', description: 'Jira' }], []);

      expect(output).not.toContain('COMMANDS');
    });

    it('omits NAMESPACES section when empty', () => {
      const output = formatRootHelp('ab', 'desc', [{ name: 'auth', description: 'Auth' }], [], []);

      expect(output).not.toContain('NAMESPACES');
    });
  });

  describe('formatNamespaceHelp', () => {
    it('includes description, usage, and commands', () => {
      const output = formatNamespaceHelp('ab', 'jira', 'Jira operations', [{ name: 'issues', description: 'Manage issues' }]);

      expect(output).toContain('Jira operations');
      expect(output).toContain('ab jira <command> [flags]');
      expect(output).toContain('COMMANDS');
      expect(output).toContain('issues');
    });
  });

  describe('formatCommandHelp', () => {
    it('includes description, usage, and subcommands for top-level command', () => {
      const output = formatCommandHelp('ab', '', 'auth', 'Authentication', [{ name: 'login', description: 'Log in' }]);

      expect(output).toContain('Authentication');
      expect(output).toContain('ab auth <subcommand> [flags]');
      expect(output).toContain('SUBCOMMANDS');
      expect(output).toContain('login');
    });

    it('includes namespace in usage for namespaced command', () => {
      const output = formatCommandHelp('ab', 'jira', 'issues', 'Manage issues', [{ name: 'create', description: 'Create issue' }]);

      expect(output).toContain('ab jira issues <subcommand> [flags]');
    });
  });

  describe('formatSubcommandHelp', () => {
    it('formats full subcommand help with arguments, sub options, and global options', () => {
      const output = formatSubcommandHelp(
        'ab',
        'jira',
        'issues',
        'create',
        'Create a new issue',
        [{ name: 'title', description: 'Issue title', required: true, variadic: false }],
        [{ long: 'priority', description: 'Priority level', short: 'p', valueName: 'level', defaultValue: 'medium' }],
        [{ long: 'verbose', description: 'Enable verbose output', short: 'v' }]
      );

      expect(output).toContain('Create a new issue');
      expect(output).toContain('ab jira issues create <title> [flags]');
      expect(output).toContain('ARGUMENTS');
      expect(output).toContain('<title>');
      expect(output).toContain('Issue title');
      expect(output).toContain('FLAGS');
      expect(output).toContain('-p, --priority <level>');
      expect(output).toContain('(default: "medium")');
      expect(output).toContain('-v, --verbose');
      expect(output).toContain('--help');
    });

    it('aligns descriptions to the same column', () => {
      const output = formatSubcommandHelp(
        'ab',
        '',
        'cmd',
        'sub',
        'desc',
        [],
        [{ long: 'long-option-name', description: 'Desc1', short: 'l', valueName: 'val' }],
        [{ long: 'verbose', description: 'Desc2', short: 'v' }]
      );

      const lines = output.split('\n');
      const pos = (marker: string) => lines.find((l) => l.includes(marker))?.indexOf(marker);
      expect(pos('Desc1')).toBeDefined();
      expect(pos('Desc1')).toBe(pos('Desc2'));
      expect(pos('Desc1')).toBe(pos('Show help'));
    });

    it('omits ARGUMENTS when none', () => {
      const output = formatSubcommandHelp('ab', '', 'auth', 'login', 'Log in', [], [], []);

      expect(output).not.toContain('ARGUMENTS');
    });
  });
});
