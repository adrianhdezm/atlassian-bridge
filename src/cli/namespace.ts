import { AppError } from './cli-models.js';
import { Command } from './command.js';

export class Namespace {
  readonly name: string;
  private _description = '';
  private _commands = new Map<string, Command>();

  constructor(name: string) {
    this.name = name;
  }

  description(desc: string): this {
    this._description = desc;
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

  getCommand(name: string): Command | undefined {
    return this._commands.get(name);
  }

  get meta() {
    return {
      name: this.name,
      description: this._description,
      commands: this._commands as ReadonlyMap<string, Command>
    };
  }
}
