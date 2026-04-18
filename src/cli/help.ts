import type { ArgumentDef, OptionDef } from './cli-models.js';

interface Entry {
  name: string;
  description: string;
}

function alignColumns(items: [string, string][]): string[] {
  if (items.length === 0) {
    return [];
  }
  const maxLen = Math.max(...items.map(([left]) => left.length));
  return items.map(([left, right]) => `  ${left}${' '.repeat(maxLen - left.length + 4)}${right}`);
}

function formatOptionLeft(opt: OptionDef): string {
  const short = opt.short ? `-${opt.short}, ` : '    ';
  const value = opt.valueName ? ` <${opt.valueName}>` : '';
  return `${short}--${opt.long}${value}`;
}

function formatOptionDesc(opt: OptionDef): string {
  if (opt.defaultValue !== undefined) {
    return `${opt.description} (default: "${opt.defaultValue}")`;
  }
  return opt.description;
}

function flagsSection(options: OptionDef[]): string[] {
  const allOpts: OptionDef[] = [...options, { long: 'help', description: 'Show help' }];
  const pairs: [string, string][] = allOpts.map((o) => [formatOptionLeft(o), formatOptionDesc(o)]);
  return ['', 'FLAGS', ...alignColumns(pairs)];
}

export function formatVersion(version: string): string {
  return version;
}

export function formatRootHelp(
  name: string,
  description: string,
  commands: Entry[],
  namespaces: Entry[],
  globalOptions: OptionDef[]
): string {
  const lines: string[] = [description, '', 'USAGE', `  ${name} <command> [flags]`];

  if (commands.length > 0) {
    lines.push('', 'COMMANDS');
    lines.push(...alignColumns(commands.map((c) => [c.name, c.description] as [string, string])));
  }

  if (namespaces.length > 0) {
    lines.push('', 'NAMESPACES');
    lines.push(...alignColumns(namespaces.map((n) => [n.name, n.description] as [string, string])));
  }

  lines.push(...flagsSection(globalOptions));
  return lines.join('\n');
}

export function formatNamespaceHelp(binName: string, nsName: string, nsDescription: string, commands: Entry[]): string {
  const lines: string[] = [nsDescription, '', 'USAGE', `  ${binName} ${nsName} <command> [flags]`];

  if (commands.length > 0) {
    lines.push('', 'COMMANDS');
    lines.push(...alignColumns(commands.map((c) => [c.name, c.description] as [string, string])));
  }

  return lines.join('\n');
}

export function formatCommandHelp(binName: string, prefix: string, cmdName: string, cmdDescription: string, subcommands: Entry[]): string {
  const path = prefix ? `${binName} ${prefix} ${cmdName}` : `${binName} ${cmdName}`;
  const lines: string[] = [cmdDescription, '', 'USAGE', `  ${path} <subcommand> [flags]`];

  if (subcommands.length > 0) {
    lines.push('', 'SUBCOMMANDS');
    lines.push(...alignColumns(subcommands.map((s) => [s.name, s.description] as [string, string])));
  }

  return lines.join('\n');
}

export function formatSubcommandHelp(
  binName: string,
  prefix: string,
  cmdName: string,
  subName: string,
  subDescription: string,
  args: ArgumentDef[],
  subOptions: OptionDef[],
  globalOptions: OptionDef[]
): string {
  const path = prefix ? `${binName} ${prefix} ${cmdName} ${subName}` : `${binName} ${cmdName} ${subName}`;
  const argUsage = args
    .map((a) => {
      if (a.variadic) {
        return `[${a.name}...]`;
      }
      if (a.required) {
        return `<${a.name}>`;
      }
      return `[${a.name}]`;
    })
    .join(' ');

  const usageLine = argUsage ? `  ${path} ${argUsage} [flags]` : `  ${path} [flags]`;
  const lines: string[] = [subDescription, '', 'USAGE', usageLine];

  if (args.length > 0) {
    lines.push('', 'ARGUMENTS');
    const argPairs: [string, string][] = args.map((a) => {
      const display = a.variadic ? `[${a.name}...]` : a.required ? `<${a.name}>` : `[${a.name}]`;
      return [display, a.description];
    });
    lines.push(...alignColumns(argPairs));
  }

  lines.push(...flagsSection([...subOptions, ...globalOptions]));
  return lines.join('\n');
}
