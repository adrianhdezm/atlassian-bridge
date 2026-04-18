import { describe, it, expect } from 'vitest';
import { Subcommand, Command } from '../../src/cli/command.js';
import { AppError } from '../../src/cli/cli-models.js';

describe('command', () => {
  describe('Subcommand', () => {
    it('returns this from fluent methods', () => {
      const sub = new Subcommand('login');

      expect(sub.description('Log in')).toBe(sub);
      expect(sub.option('-t, --token <token>', 'API token')).toBe(sub);
      expect(sub.argument('<user>', 'Username')).toBe(sub);
      expect(sub.action(() => {})).toBe(sub);
    });

    it('exposes meta with name, description, arguments, and options', () => {
      const sub = new Subcommand('create');
      sub.description('Create issue').argument('<title>', 'Title').option('-p, --priority <level>', 'Priority', 'medium');

      expect(sub.meta.name).toBe('create');
      expect(sub.meta.description).toBe('Create issue');
      expect(sub.meta.arguments).toHaveLength(1);
      expect(sub.meta.arguments[0]).toHaveProperty('name', 'title');
      expect(sub.meta.options).toHaveLength(1);
      expect(sub.meta.options[0]).toHaveProperty('long', 'priority');
      expect(sub.meta.options[0]).toHaveProperty('defaultValue', 'medium');
    });

    it('throws on duplicate argument names', () => {
      const sub = new Subcommand('test');
      sub.argument('<title>', 'Title');

      expect(() => sub.argument('<title>', 'Again')).toThrow(AppError);
    });

    it('throws on duplicate option long names', () => {
      const sub = new Subcommand('test');
      sub.option('--verbose', 'Verbose');

      expect(() => sub.option('--verbose', 'Again')).toThrow(AppError);
    });

    it('throws on duplicate option short names', () => {
      const sub = new Subcommand('test');
      sub.option('-v, --verbose', 'Verbose');

      expect(() => sub.option('-v, --very', 'Very')).toThrow(AppError);
    });

    it('throws when adding argument after action is set', () => {
      const sub = new Subcommand('test');
      sub.action(() => {});

      expect(() => sub.argument('<title>', 'Title')).toThrow(AppError);
    });

    it('throws when required argument follows optional', () => {
      const sub = new Subcommand('test');
      sub.argument('[optional]', 'Optional');

      expect(() => sub.argument('<required>', 'Required')).toThrow(AppError);
    });

    it('throws when argument follows variadic', () => {
      const sub = new Subcommand('test');
      sub.argument('[files...]', 'Files');

      expect(() => sub.argument('[more]', 'More')).toThrow(AppError);
    });

    it('execute invokes the action', () => {
      let called = false;
      const sub = new Subcommand('run');
      sub.action(() => {
        called = true;
      });

      void sub.execute({}, {});

      expect(called).toBe(true);
    });

    it('execute throws if no action is set', () => {
      const sub = new Subcommand('run');

      expect(() => sub.execute({}, {})).toThrow(AppError);
    });
  });

  describe('Command', () => {
    it('returns this from description()', () => {
      const cmd = new Command('auth');

      expect(cmd.description('Auth')).toBe(cmd);
    });

    it('creates and returns a subcommand', () => {
      const cmd = new Command('auth');

      const sub = cmd.subcommand('login');

      expect(sub).toBeInstanceOf(Subcommand);
      expect(sub.name).toBe('login');
    });

    it('throws on duplicate subcommand names', () => {
      const cmd = new Command('auth');
      cmd.subcommand('login');

      expect(() => cmd.subcommand('login')).toThrow(AppError);
    });

    it('getSubcommand returns the registered subcommand', () => {
      const cmd = new Command('auth');
      const sub = cmd.subcommand('login');

      expect(cmd.getSubcommand('login')).toBe(sub);
    });

    it('getSubcommand returns undefined for unknown name', () => {
      const cmd = new Command('auth');

      expect(cmd.getSubcommand('nope')).toBeUndefined();
    });

    it('exposes meta with name, description, and subcommands map', () => {
      const cmd = new Command('auth');
      cmd.description('Authentication');
      cmd.subcommand('login');
      cmd.subcommand('logout');

      expect(cmd.meta.name).toBe('auth');
      expect(cmd.meta.description).toBe('Authentication');
      expect(cmd.meta.subcommands.size).toBe(2);
      expect(cmd.meta.subcommands.has('login')).toBe(true);
    });
  });
});
