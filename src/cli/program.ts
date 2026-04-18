import type { OptionDef, OutputWriter } from './cli-models.js';
import { AppError } from './cli-models.js';
import { parseOptionSyntax, buildArgsSchema, buildOptsSchema, validate } from './syntax.js';
import { parseTokens } from './parser.js';
import { formatVersion, formatRootHelp, formatNamespaceHelp, formatCommandHelp, formatSubcommandHelp } from './help.js';
import { Command } from './command.js';
import { Namespace } from './namespace.js';

export class Program {
  private _name = '';
  private _description = '';
  private _version = '';
  private _globalOptions: OptionDef[] = [];
  private _commands = new Map<string, Command>();
  private _namespaces = new Map<string, Namespace>();

  name(n: string): this {
    this._name = n;
    return this;
  }

  description(desc: string): this {
    this._description = desc;
    return this;
  }

  version(ver: string): this {
    this._version = ver;
    return this;
  }

  option(syntax: string, desc: string): this {
    const parsed = parseOptionSyntax(syntax);

    if (this._globalOptions.some((o) => o.long === parsed.long)) {
      throw new AppError(`Duplicate option: --${parsed.long}`);
    }

    if (parsed.short && this._globalOptions.some((o) => o.short === parsed.short)) {
      throw new AppError(`Duplicate option: -${parsed.short}`);
    }

    this._globalOptions.push({ ...parsed, description: desc });
    return this;
  }

  command(name: string): Command {
    if (this._commands.has(name)) {
      throw new AppError(`Duplicate command: ${name}`);
    }
    const cmd = new Command(name);
    this._commands.set(name, cmd);
    return cmd;
  }

  namespace(name: string): Namespace {
    if (this._namespaces.has(name)) {
      throw new AppError(`Duplicate namespace: ${name}`);
    }
    const ns = new Namespace(name);
    this._namespaces.set(name, ns);
    return ns;
  }

  parse(argv: string[], writer?: OutputWriter): void {
    const write = writer ?? console.log;
    const tokens = argv.slice(2);

    try {
      if (tokens.includes('--version')) {
        write(formatVersion(this._name, this._version));
        return;
      }

      if (tokens.length === 0 || tokens[0] === '--help') {
        write(
          formatRootHelp(
            this._name,
            this._description,
            [...this._commands.values()].map((c) => c.meta),
            [...this._namespaces.values()].map((n) => n.meta),
            this._globalOptions
          )
        );
        return;
      }

      const first = tokens[0]!;
      let command: Command | undefined;
      let nsName = '';
      let idx = 1;

      command = this._commands.get(first);

      if (!command) {
        const ns = this._namespaces.get(first);
        if (!ns) {
          throw new AppError(`Unknown command: ${first}`);
        }
        nsName = first;

        if (tokens.length < 2 || tokens[1] === '--help') {
          write(
            formatNamespaceHelp(
              this._name,
              ns.name,
              ns.meta.description,
              [...ns.meta.commands.values()].map((c) => c.meta)
            )
          );
          return;
        }

        const cmdName = tokens[1]!;
        command = ns.getCommand(cmdName);
        if (!command) {
          throw new AppError(`Unknown command: ${cmdName}`);
        }
        idx = 2;
      }

      if (tokens.length <= idx || tokens[idx] === '--help') {
        write(
          formatCommandHelp(
            this._name,
            nsName,
            command.name,
            command.meta.description,
            [...command.meta.subcommands.values()].map((s) => s.meta)
          )
        );
        return;
      }

      const subName = tokens[idx]!;
      const subcommand = command.getSubcommand(subName);
      if (!subcommand) {
        throw new AppError(`Unknown subcommand: ${subName}`);
      }
      idx++;

      const remaining = tokens.slice(idx);
      if (remaining.includes('--help')) {
        write(
          formatSubcommandHelp(
            this._name,
            nsName,
            command.name,
            subcommand.name,
            subcommand.meta.description,
            [...subcommand.meta.arguments],
            [...subcommand.meta.options],
            this._globalOptions
          )
        );
        return;
      }

      const allOptions = [...this._globalOptions, ...subcommand.meta.options];
      const { args, opts } = parseTokens(remaining, subcommand.meta.arguments, allOptions);
      const validatedArgs = validate(buildArgsSchema(subcommand.meta.arguments), args);
      const validatedOpts = validate(buildOptsSchema(allOptions), opts);

      void subcommand.execute(validatedArgs, validatedOpts);
    } catch (e) {
      if (e instanceof AppError) {
        write(`error: ${e.message}`);
        process.exit(1);
      } else {
        throw e;
      }
    }
  }
}
