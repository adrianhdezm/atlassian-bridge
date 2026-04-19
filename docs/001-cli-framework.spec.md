# CLI Framework

Hand-rolled command framework — no Commander, Yargs, or similar dependencies. Lives in `src/cli/` with Zod as the single runtime dependency.

## Module Map

```
src/cli/
├── cli-models.ts   Zod schemas + inferred TS types (deps: shared/app-error)
├── syntax.ts       Syntax parsers + Zod schema builders (deps: cli-models)
├── parser.ts       Argv tokenizer, positional mapper, option resolver (deps: cli-models)
├── help.ts         Help text formatters for all levels (deps: cli-models)
├── command.ts      Subcommand + Command builders (deps: cli-models, syntax)
├── namespace.ts    Namespace builder (deps: cli-models, command)
└── program.ts      CLI orchestrator — dispatch + help (deps: all above, parser, help)
```

## Module Exports

### cli-models.ts

Re-exports `AppError` from `src/shared/app-error.ts`. Defines Zod schemas and inferred types:

- `ArgumentDefSchema` / `ArgumentDef`
- `OptionDefSchema` / `OptionDef`
- `type Action = (args: Record<string, unknown>, opts: Record<string, unknown>) => void | Promise<void>`
- `type OutputWriter = (message: string) => void`

### syntax.ts

Parses syntax strings into partial definition objects. Callers attach `description` and `defaultValue`.

```ts
parseArgumentSyntax(syntax: string): Pick<ArgumentDef, 'name' | 'required' | 'variadic'>
parseOptionSyntax(syntax: string): Pick<OptionDef, 'short' | 'long' | 'valueName'>
buildArgsSchema(argDefs: readonly ArgumentDef[]): ZodObject
buildOptsSchema(optDefs: readonly OptionDef[]): ZodObject
validate(schema: ZodType, data: unknown): Record<string, unknown>
```

`buildArgsSchema` defaults variadic args to `[]`. `buildOptsSchema` defaults boolean flags to `false` and applies `defaultValue` when present. `validate` throws `AppError` on failure — the error message includes all Zod issues joined by `, `.

Argument-order validation (`required` after `optional`, anything after `variadic`) is **not** exported — it is inlined in `Subcommand.argument()` in `command.ts`.

### parser.ts

Single exported function. Tokenizes, maps positionals, and resolves options in one pass.

```ts
parseTokens(
  tokens: string[],
  argDefs: readonly ArgumentDef[],
  optDefs: readonly OptionDef[]
): { args: Record<string, unknown>; opts: Record<string, unknown> }
```

No separate `tokenizeArgv`, `mapPositionals`, or `resolveOptions` functions.

Throws `AppError` for structural token errors (unknown options, missing option values, unexpected positionals, `--flag=value` on boolean flags). Missing required arguments are caught by Zod validation downstream, not by the parser.

### help.ts

All formatters take decomposed primitives — no `Meta` wrapper objects.

```ts
formatVersion(name: string, version: string): string
formatRootHelp(name, description, commands: Entry[], namespaces: Entry[], globalOptions: OptionDef[]): string
formatNamespaceHelp(binName, nsName, nsDescription, commands: Entry[]): string
formatCommandHelp(binName, prefix, cmdName, cmdDescription, subcommands: Entry[]): string
formatSubcommandHelp(binName, prefix, cmdName, subName, subDescription, args: ArgumentDef[], subOptions: OptionDef[], globalOptions: OptionDef[]): string
```

`Entry` is a local interface: `{ name: string; description: string }`.

### command.ts

```ts
export class Subcommand   // fluent builder, holds args + options + action
export class Command       // holds name, description, Map<string, Subcommand>
```

`Subcommand` exposes `get meta` (getter, not method) returning `{ name, description, arguments, options }`, `execute(args, opts)` to run the registered action, and `readonly name`. `Command` exposes `get meta` returning `{ name, description, subcommands: Map }` and `getSubcommand(name): Subcommand | undefined`.

### namespace.ts

```ts
export class Namespace     // holds name, description, Map<string, Command>
```

`get meta` returns `{ name, description, commands: Map }`. `getCommand(name): Command | undefined` retrieves a command by name.

### program.ts

```ts
export class Program       // top-level orchestrator
```

`Program` does not expose a `meta` accessor.

## API Surface

Commands live at two levels:

- **Top-level commands** — registered directly on the program (e.g. `program.command('auth')`)
- **Namespaced commands** — grouped under a namespace (e.g. `program.namespace('jira').command('issues')`)

```
USAGE
  <bin> <command> <subcommand> [flags]
  <bin> <namespace> <command> <subcommand> [flags]
```

### Program

```ts
const program = new Program();

program.name('<bin>').description('...').version('0.1.0');
program.option('-v, --verbose', 'Enable verbose output');
program.parse(process.argv, optionalOutputWriter);
```

### Top-level Command

```ts
const auth = program.command('auth').description('...');

auth
  .subcommand('login')
  .description('...')
  .option('-t, --token <token>', 'API token')
  .action(async (args, opts) => {
    /* opts.token, opts.verbose */
  });
```

### Namespaced Command

```ts
const ns = program.namespace('jira').description('...');
const cmd = ns.command('issues').description('...');

cmd
  .subcommand('create')
  .description('...')
  .argument('<title>', 'Issue title')
  .option('-p, --priority <level>', 'Priority level', 'medium')
  .action(async (args, opts) => {
    /* args.title, opts.priority, opts.verbose */
  });
```

### Help Output

Running `<bin> <namespace> <command> <subcommand> --help`:

```
Create a new issue

USAGE
  <bin> jira issues create <title> [flags]

ARGUMENTS
  <title>    Issue title

FLAGS
  -p, --priority <level>    Priority level (default: "medium")
  -v, --verbose             Enable verbose output
      --help                Show help
```

Each level (`<bin>`, `<bin> <ns>`, `<bin> <ns> <cmd>`) prints contextual help listing its children.

## Argument & Option Syntax

- **Arguments:** `<name>` required, `[name]` optional, `[name...]` variadic. Required cannot follow optional. Nothing can follow variadic.
- **Options:** `"-s, --status <name>"` takes a value, `"--verbose"` is a boolean flag. No `--no-<flag>` negation syntax. Value-taking long flags accept `--flag=value` as equivalent to `--flag value`. Using `=` with a boolean flag is an error.

### Parsed Definitions

Syntax strings are parsed into typed definition objects used by the rest of the framework.

```ts
// ArgumentDef
{ name: string; required: boolean; variadic: boolean; description: string }

// OptionDef
{ long: string; short?: string; valueName?: string; description: string; defaultValue?: string }
```

`valueName` replaces a boolean `takesValue` flag — its presence means the option takes a value, and the string itself is the placeholder shown in help (e.g. `"level"` from `--priority <level>`). Absence means the option is a boolean flag.

## Parse Lifecycle

```
argv
 │
 ├─ strip node + script
 ├─ tokens.includes('--version')? → help.ts: format, print, return
 ├─ tokens[0] === '--help' or empty? → help.ts: root help, return
 │
 ├─ token[0] matches command? ──→ resolve command (step 4)
 ├─ token[0] matches namespace?
 │    ├─ token[1] is --help or absent → help.ts: namespace help, return
 │    └─ token[1] matches command? → resolve command (step 4)
 │         └─ unknown → error, process.exit(1)
 │
 ├─ (step 4) --help or no subcommand? → help.ts: command help, return
 ├─ resolve subcommand (unknown → error, process.exit(1))
 ├─ --help? → help.ts: subcommand help, return
 │
 ├─ merge global + subcommand options
 ├─ parser.ts: tokenize remaining argv, map positionals, resolve options
 ├─ syntax.ts: validate with Zod
 └─ invoke action(args, opts)
```

`--version` is checked via `tokens.includes()` so it triggers from any position (e.g. `atl auth --version`). `--help` at root only fires when it is the first token; deeper `--help` is handled at each dispatch level.

Top-level commands take priority over namespaces when names collide.

## Contracts & Invariants

### Error Handling

All validation and dispatch errors throw `AppError` (from `src/shared/app-error.ts`). `Program.parse()` catches `AppError`, writes `error: <message>` via the output writer, and calls `process.exit(1)`. Non-`AppError` exceptions re-throw. See `docs/000-shared.spec.md` for the class definition.

### Output Writer

`Program.parse()` accepts an optional `OutputWriter` (defaults to `console.log`). All output — help, version, errors — goes through it. Tests inject `vi.fn()` as a spy.

```ts
type OutputWriter = (message: string) => void;
```

### Builder Safety

Builder methods throw `AppError` immediately on misuse:

- Duplicate subcommand, command, or namespace names
- Duplicate argument names or option long/short names
- `.argument()` called after `.action()` is set
- Required argument following an optional argument
- Any argument following a variadic argument

### Zod Validation

After `parser.ts` tokenizes argv and maps positionals, `syntax.ts` builds Zod schemas dynamically from argument/option definitions and validates before invoking the action. Invalid data throws `AppError`.

### Async Actions

`parse()` is synchronous. If an action returns a `Promise`, it is fire-and-forget. The caller handles top-level error handling on async actions.

## Testing

Tests in `tests/cli/`, one file per module:

| File                 | Covers                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `cli-models.test.ts` | Schema parsing, validation, rejection of invalid shapes                                            |
| `syntax.test.ts`     | Syntax parsers, argument order, Zod schema builders, Zod validation                                |
| `parser.test.ts`     | Argv tokenization, positional mapping, option resolution, `--` separator, `--flag=value` splitting |
| `help.test.ts`       | Help output formatting for all levels (root, namespace, command, subcommand)                       |
| `command.test.ts`    | Builder invariants, fluent chaining, subcommand registration, duplicate detection                  |
| `namespace.test.ts`  | Namespace builder, command registration, meta accessor                                             |
| `program.test.ts`    | Dispatch, built-in flags (`--version`, `--help`), error handling, command-over-namespace priority  |
