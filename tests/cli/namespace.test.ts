import { describe, it, expect } from 'vitest';
import { Namespace } from '../../src/cli/namespace.js';
import { Command } from '../../src/cli/command.js';
import { AppError } from '../../src/cli/cli-models.js';

describe('namespace', () => {
  describe('Namespace', () => {
    it('returns this from description()', () => {
      const ns = new Namespace('jira');

      expect(ns.description('Jira operations')).toBe(ns);
    });

    it('creates and returns a command', () => {
      const ns = new Namespace('jira');

      const cmd = ns.command('issues');

      expect(cmd).toBeInstanceOf(Command);
      expect(cmd.name).toBe('issues');
    });

    it('throws on duplicate command names', () => {
      const ns = new Namespace('jira');
      ns.command('issues');

      expect(() => ns.command('issues')).toThrow(AppError);
    });

    it('getCommand returns the registered command', () => {
      const ns = new Namespace('jira');
      const cmd = ns.command('issues');

      expect(ns.getCommand('issues')).toBe(cmd);
    });

    it('getCommand returns undefined for unknown name', () => {
      const ns = new Namespace('jira');

      expect(ns.getCommand('nope')).toBeUndefined();
    });

    it('exposes meta with name, description, and commands map', () => {
      const ns = new Namespace('jira');
      ns.description('Jira operations');
      ns.command('issues');
      ns.command('boards');

      expect(ns.meta.name).toBe('jira');
      expect(ns.meta.description).toBe('Jira operations');
      expect(ns.meta.commands.size).toBe(2);
      expect(ns.meta.commands.has('issues')).toBe(true);
      expect(ns.meta.commands.has('boards')).toBe(true);
    });
  });
});
