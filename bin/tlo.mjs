#!/usr/bin/env node
import { build, check, install } from '../lib/bundles.mjs';

const help = `ThreeLight Orchestrator (Node.js 22+)

  node bin/tlo.mjs build --target codex|zcode --out <directory>
  node bin/tlo.mjs check
  node bin/tlo.mjs install --target codex|zcode [--dest <skills-root>] [--dry-run] [--replace]

Targets are explicit. Installation defaults to ~/.agents/skills.
--replace backs up the existing install outside the skills directory.
No npm install, model API key, or external dependencies are required.
`;

async function main(args) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
  if (!args.length || args[0] === '--help' || args[0] === '-h') { console.log(help); return; }
  const command = args.shift();
  const permitted = {
    build: ['--target', '--out'],
    check: [],
    install: ['--target', '--dest', '--dry-run', '--replace'],
  }[command];
  if (!permitted) throw new Error(`Unknown command: ${command}`);
  const options = {};
  while (args.length) {
    const flag = args.shift();
    if (!permitted.includes(flag) || Object.hasOwn(options, flag)) throw new Error(`Unknown or duplicate option: ${flag}`);
    if (flag === '--dry-run' || flag === '--replace') options[flag] = true;
    else {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      options[flag] = value;
    }
  }
  if (command === 'check') { console.log(JSON.stringify(await check(), null, 2)); return; }
  if (!options['--target']) throw new Error('--target is required; choose codex or zcode.');
  if (command === 'build') {
    if (!options['--out']) throw new Error('--out is required.');
    console.log(JSON.stringify(await build(options['--target'], options['--out']), null, 2));
  } else {
    console.log(JSON.stringify(await install(options['--target'], {
      dest: options['--dest'], replace: Boolean(options['--replace']), dryRun: Boolean(options['--dry-run']),
    }), null, 2));
  }
}

main(process.argv.slice(2)).catch(error => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
