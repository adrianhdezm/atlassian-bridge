#!/usr/bin/env node

import { buildProgram } from './atl-cli.js';

process.on('unhandledRejection', (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`error: ${message}`);
  process.exit(1);
});

buildProgram().parse(process.argv);
