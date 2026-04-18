import type { ArgumentDef, OptionDef, Action } from './cli-models.js';
import { AppError } from './cli-models.js';
import { parseArgumentSyntax, parseOptionSyntax } from './syntax.js';

export class Subcommand {
  readonly name: string;
  private _description = '';
  private _arguments: ArgumentDef[] = [];
  private _options: OptionDef[] = [];
  private _action: Action | undefined;

  constructor(name: string) {
    this.name = name;
  }

  description(desc: string): this {
    this._description = desc;
    return this;
  }

  argument(syntax: string, desc: string): this {
    if (this._action) {
      throw new AppError('Cannot add arguments after action is set');
    }

    const parsed = parseArgumentSyntax(syntax);

    if (this._arguments.some((a) => a.name === parsed.name)) {
      throw new AppError(`Duplicate argument: ${parsed.name}`);
    }

    const last = this._arguments[this._arguments.length - 1];

    if (last?.variadic) {
      throw new AppError('Cannot add argument after variadic argument');
    }

    if (parsed.required && last && !last.required) {
      throw new AppError('Required argument cannot follow optional argument');
    }

    this._arguments.push({ ...parsed, description: desc });
    return this;
  }

  option(syntax: string, desc: string, defaultValue?: string): this {
    const parsed = parseOptionSyntax(syntax);

    if (this._options.some((o) => o.long === parsed.long)) {
      throw new AppError(`Duplicate option: --${parsed.long}`);
    }

    if (parsed.short && this._options.some((o) => o.short === parsed.short)) {
      throw new AppError(`Duplicate option: -${parsed.short}`);
    }

    this._options.push({ ...parsed, description: desc, defaultValue });
    return this;
  }

  action(fn: Action): this {
    this._action = fn;
    return this;
  }

  get meta() {
    return {
      name: this.name,
      description: this._description,
      arguments: this._arguments,
      options: this._options
    };
  }

  execute(args: Record<string, unknown>, opts: Record<string, unknown>): void | Promise<void> {
    if (!this._action) {
      throw new AppError(`No action for subcommand "${this.name}"`);
    }
    return this._action(args, opts);
  }
}

export class Command {
  readonly name: string;
  private _description = '';
  private _subcommands = new Map<string, Subcommand>();

  constructor(name: string) {
    this.name = name;
  }

  description(desc: string): this {
    this._description = desc;
    return this;
  }

  subcommand(name: string): Subcommand {
    if (this._subcommands.has(name)) {
      throw new AppError(`Duplicate subcommand: ${name}`);
    }
    const sub = new Subcommand(name);
    this._subcommands.set(name, sub);
    return sub;
  }

  getSubcommand(name: string): Subcommand | undefined {
    return this._subcommands.get(name);
  }

  get meta() {
    return {
      name: this.name,
      description: this._description,
      subcommands: this._subcommands as ReadonlyMap<string, Subcommand>
    };
  }
}
