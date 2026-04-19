import { describe, it, expect, vi } from 'vitest';
import { Program } from '../../src/cli/program.js';
import { AppError } from '../../src/cli/cli-models.js';

function setup() {
  const program = new Program();
  program.name('atl').description('Atlassian Bridge CLI').version('0.1.0');
  program.option('-v, --verbose', 'Enable verbose output');

  const auth = program.command('auth').description('Authentication');
  auth
    .subcommand('login')
    .description('Log in')
    .option('-t, --token <token>', 'API token')
    .action((_args, _opts) => {});

  const ns = program.namespace('jira').description('Jira operations');
  const issues = ns.command('issues').description('Manage issues');
  issues
    .subcommand('create')
    .description('Create a new issue')
    .argument('<title>', 'Issue title')
    .option('-p, --priority <level>', 'Priority level', 'medium')
    .action((_args, _opts) => {});

  return program;
}

function getOutput(write: ReturnType<typeof vi.fn>): string {
  return String(write.mock.calls[0]?.[0] ?? '');
}

describe('program', () => {
  describe('--version', () => {
    it('prints version from any position', () => {
      const program = setup();
      const write = vi.fn();

      program.parse(['node', 'atl', '--version'], write);

      expect(write).toHaveBeenCalledWith('0.1.0');
    });

    it('triggers even after a command token', () => {
      const program = setup();
      const write = vi.fn();

      program.parse(['node', 'atl', 'auth', '--version'], write);

      expect(write).toHaveBeenCalledWith('0.1.0');
    });
  });

  describe('--help', () => {
    it('prints root help with no arguments', () => {
      const program = setup();
      const write = vi.fn();

      program.parse(['node', 'atl'], write);

      expect(write).toHaveBeenCalledOnce();
      const output = getOutput(write);
      expect(output).toContain('Atlassian Bridge CLI');
      expect(output).toContain('COMMANDS');
      expect(output).toContain('auth');
      expect(output).toContain('NAMESPACES');
      expect(output).toContain('jira');
    });

    it('prints root help with --help', () => {
      const program = setup();
      const write = vi.fn();

      program.parse(['node', 'atl', '--help'], write);

      expect(write).toHaveBeenCalledOnce();
      const output = getOutput(write);
      expect(output).toContain('USAGE');
    });

    it('prints namespace help', () => {
      const program = setup();
      const write = vi.fn();

      program.parse(['node', 'atl', 'jira'], write);

      expect(write).toHaveBeenCalledOnce();
      const output = getOutput(write);
      expect(output).toContain('Jira operations');
      expect(output).toContain('issues');
    });

    it('prints namespace help with --help', () => {
      const program = setup();
      const write = vi.fn();

      program.parse(['node', 'atl', 'jira', '--help'], write);

      const output = getOutput(write);
      expect(output).toContain('Jira operations');
    });

    it('prints command help', () => {
      const program = setup();
      const write = vi.fn();

      program.parse(['node', 'atl', 'auth'], write);

      const output = getOutput(write);
      expect(output).toContain('Authentication');
      expect(output).toContain('SUBCOMMANDS');
      expect(output).toContain('login');
    });

    it('prints subcommand help', () => {
      const program = setup();
      const write = vi.fn();

      program.parse(['node', 'atl', 'jira', 'issues', 'create', '--help'], write);

      const output = getOutput(write);
      expect(output).toContain('Create a new issue');
      expect(output).toContain('ARGUMENTS');
      expect(output).toContain('<title>');
      expect(output).toContain('FLAGS');
      expect(output).toContain('--priority');
      expect(output).toContain('--verbose');
    });
  });

  describe('dispatch', () => {
    it('invokes top-level subcommand action', () => {
      const action = vi.fn();
      const program = new Program();
      program.name('atl');
      const cmd = program.command('auth').description('Auth');
      cmd.subcommand('login').description('Log in').action(action);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      program.parse(['node', 'atl', 'auth', 'login'], vi.fn());

      expect(action).toHaveBeenCalledOnce();
      exitSpy.mockRestore();
    });

    it('invokes namespaced subcommand action with parsed args and opts', () => {
      const action = vi.fn();
      const program = new Program();
      program.name('atl').option('-v, --verbose', 'Verbose');
      const ns = program.namespace('jira').description('Jira');
      const cmd = ns.command('issues').description('Issues');
      cmd
        .subcommand('create')
        .description('Create')
        .argument('<title>', 'Title')
        .option('-p, --priority <level>', 'Priority', 'medium')
        .action(action);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      program.parse(['node', 'atl', 'jira', 'issues', 'create', 'My Issue', '-p', 'high', '-v'], vi.fn());

      expect(action).toHaveBeenCalledOnce();
      const args = action.mock.calls[0]?.[0] as Record<string, unknown>;
      const opts = action.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(args).toEqual({ title: 'My Issue' });
      expect(opts).toEqual({ priority: 'high', verbose: true });
      exitSpy.mockRestore();
    });

    it('applies default option values', () => {
      const action = vi.fn();
      const program = new Program();
      program.name('atl').option('-v, --verbose', 'Verbose');
      const cmd = program.command('cmd').description('Cmd');
      cmd.subcommand('sub').description('Sub').option('-p, --priority <level>', 'Priority', 'medium').action(action);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      program.parse(['node', 'atl', 'cmd', 'sub'], vi.fn());

      const opts = action.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(opts).toEqual({ priority: 'medium', verbose: false });
      exitSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('writes error and exits on unknown command', () => {
      const program = setup();
      const write = vi.fn();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      program.parse(['node', 'atl', 'nope'], write);

      expect(write).toHaveBeenCalledWith(expect.stringContaining('error:'));
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('writes error and exits on unknown subcommand', () => {
      const program = setup();
      const write = vi.fn();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      program.parse(['node', 'atl', 'auth', 'nope'], write);

      expect(write).toHaveBeenCalledWith(expect.stringContaining('error:'));
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('re-throws non-AppError exceptions', () => {
      const program = new Program();
      program.name('atl');
      const cmd = program.command('cmd').description('Cmd');
      cmd
        .subcommand('sub')
        .description('Sub')
        .action(() => {
          throw new TypeError('boom');
        });
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      expect(() => program.parse(['node', 'atl', 'cmd', 'sub'], vi.fn())).toThrow(TypeError);

      exitSpy.mockRestore();
    });
  });

  describe('command-over-namespace priority', () => {
    it('dispatches to command when name collides with namespace', () => {
      const cmdAction = vi.fn();
      const nsAction = vi.fn();
      const program = new Program();
      program.name('atl');
      const cmd = program.command('shared').description('Command');
      cmd.subcommand('run').description('Run').action(cmdAction);
      const ns = program.namespace('shared').description('Namespace');
      const nsCmd = ns.command('exec').description('Exec');
      nsCmd.subcommand('go').description('Go').action(nsAction);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      program.parse(['node', 'atl', 'shared', 'run'], vi.fn());

      expect(cmdAction).toHaveBeenCalledOnce();
      expect(nsAction).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });
  });

  describe('builder safety', () => {
    it('throws on duplicate command names', () => {
      const program = new Program();
      program.command('auth');

      expect(() => program.command('auth')).toThrow(AppError);
    });

    it('throws on duplicate namespace names', () => {
      const program = new Program();
      program.namespace('jira');

      expect(() => program.namespace('jira')).toThrow(AppError);
    });

    it('throws on duplicate global option long names', () => {
      const program = new Program();
      program.option('--verbose', 'Verbose');

      expect(() => program.option('--verbose', 'Again')).toThrow(AppError);
    });
  });
});
