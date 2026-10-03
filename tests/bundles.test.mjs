import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { generate, validate, readFiles, publish, check, root, install } from '../lib/bundles.mjs';

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tlo-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

function cli(args, directory, project = root) {
  return spawnSync(process.execPath, [path.join(project, 'bin/tlo.mjs'), ...args], {
    cwd: project, encoding: 'utf8',
    env: { ...process.env, THREELIGHT_ORCHESTRATOR_DATA_DIR: path.join(directory, 'data') },
  });
}

async function fixture(t) {
  const temporaryRoot = await temporary(t);
  const project = path.join(temporaryRoot, 'project');
  await fs.mkdir(project);
  for (const entry of ['src', 'lib', 'bin', 'package.json', 'LICENSE', 'skills']) {
    await fs.cp(path.join(root, entry), path.join(project, entry), { recursive: true });
  }
  return { temporaryRoot, project };
}

function modify(bundle, name, content) {
  const files = new Map(bundle.files);
  files.set(name, content);
  const manifest = JSON.parse(files.get('bundle.json'));
  manifest.files[name] = createHash('sha256').update(content).digest('hex');
  files.set('bundle.json', JSON.stringify(manifest));
  return files;
}

test('profiles contain the intended execution resources without the other host', async () => {
  const codex = await generate('codex');
  const zcode = await generate('zcode');
  assert.equal(validate(codex.files).name, 'threelight-orchestrator-codex');
  assert.equal(validate(zcode.files).name, 'threelight-orchestrator-zcode');
  for (const file of ['references/operating.md', 'references/records.md', 'references/measurement-and-scheduling.md', 'references/subagents.md']) {
    assert.equal(codex.files.get(file), zcode.files.get(file));
  }
  assert.ok(codex.files.has('references/sessions.md'));
  assert.ok(codex.files.has('references/model-selection.md'));
  assert.ok(codex.files.has('agents/openai.yaml'));
  assert.ok(!codex.files.has('references/zcode.md'));
  assert.ok(zcode.files.has('references/zcode.md'));
  assert.ok(!zcode.files.has('references/codex.md'));
  assert.ok(!zcode.files.has('references/sessions.md'));
  assert.ok(!zcode.files.has('references/model-selection.md'));
  assert.ok(!zcode.files.has('agents/openai.yaml'));
});

test('generation is deterministic and committed bundles match the source', async () => {
  assert.deepEqual(await generate('codex'), await generate('codex'));
  assert.equal((await check()).length, 2);
});

test('unknown targets fail instead of guessing an environment', async () => {
  await assert.rejects(generate('auto'), /Unknown target/);
});

test('validator detects broken references even with valid checksums', async () => {
  const bundle = await generate('zcode');
  const files = modify(bundle, 'SKILL.md', bundle.files.get('SKILL.md') + '\n[Missing](references/missing.md)\n');
  assert.throws(() => validate(files), /Broken reference/);
});

test('validator rejects placeholders, unsafe links, invalid metadata and edited files', async () => {
  const bundle = await generate('zcode');
  assert.throws(() => validate(modify(bundle, 'references/zcode.md', '{{unfinished}}')), /placeholder/);
  assert.throws(() => validate(modify(bundle, 'references/zcode.md', '[Escape](../../outside.md)')), /Unsafe relative file/);
  assert.throws(() => validate(modify(bundle, 'SKILL.md', 'missing frontmatter')), /frontmatter/);
  const changed = new Map(bundle.files);
  changed.set('references/zcode.md', 'Edited after generation.');
  assert.throws(() => validate(changed), /checksum/);
});

test('source changes make bundles stale and broken source fails before publication', async t => {
  const { project, temporaryRoot } = await fixture(t);
  await fs.appendFile(path.join(project, 'src/common/records.md'), '\nAdditional record guidance.\n');
  await assert.rejects(check(project), /stale/);
  const rootBefore = await readFiles(path.join(project, 'skills'));
  await fs.unlink(path.join(project, 'src/modes/subagents.md'));
  const result = cli(['install', '--target', 'codex', '--dest', path.join(temporaryRoot, 'installed')], temporaryRoot, project);
  assert.notEqual(result.status, 0);
  await assert.rejects(fs.access(path.join(temporaryRoot, 'installed')));
  assert.deepEqual(await readFiles(path.join(project, 'skills')), rootBefore);
});

test('CLI builds and installs both profiles in a custom path containing spaces', async t => {
  const temporaryRoot = await temporary(t);
  const output = path.join(temporaryRoot, 'generated bundles');
  const destination = path.join(temporaryRoot, 'custom skills');
  for (const target of ['codex', 'zcode']) {
    const built = cli(['build', '--target', target, '--out', output], temporaryRoot);
    assert.equal(built.status, 0, built.stderr);
    const installed = cli(['install', '--target', target, '--dest', destination], temporaryRoot);
    assert.equal(installed.status, 0, installed.stderr);
    const name = `threelight-orchestrator-${target}`;
    assert.deepEqual(await readFiles(path.join(output, name)), await readFiles(path.join(destination, name)));
  }
  assert.deepEqual((await fs.readdir(destination)).sort(), ['threelight-orchestrator-codex', 'threelight-orchestrator-zcode']);
});

test('dry-run creates no directory, lock, staging area or backup', async t => {
  const temporaryRoot = await temporary(t);
  const before = await fs.readdir(temporaryRoot);
  const result = cli(['install', '--target', 'zcode', '--dest', path.join(temporaryRoot, 'not-yet-created'), '--dry-run'], temporaryRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).dryRun, true);
  assert.deepEqual(await fs.readdir(temporaryRoot), before);
});

test('default destination is the shared user skills root, inspected without mutation', async () => {
  const result = await install('zcode', { dryRun: true, replace: true });
  assert.equal(result.destination, path.join(os.homedir(), '.agents/skills/threelight-orchestrator-zcode'));
});

test('existing installation is not overwritten without --replace', async t => {
  const temporaryRoot = await temporary(t);
  const destination = path.join(temporaryRoot, 'skills');
  assert.equal(cli(['install', '--target', 'codex', '--dest', destination], temporaryRoot).status, 0);
  const original = await readFiles(destination);
  const result = cli(['install', '--target', 'codex', '--dest', destination], temporaryRoot);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Already exists/);
  assert.deepEqual(await readFiles(destination), original);
});

test('replacement backs up the exact previous files, including local edits', async t => {
  const temporaryRoot = await temporary(t);
  const destination = path.join(temporaryRoot, 'skills');
  const name = 'threelight-orchestrator-codex';
  assert.equal(cli(['install', '--target', 'codex', '--dest', destination], temporaryRoot).status, 0);
  await fs.writeFile(path.join(destination, name, 'personal-notes.txt'), 'Keep this local customization.');
  await fs.writeFile(path.join(destination, name, 'custom-asset.bin'), Buffer.from([0, 255, 254, 128]));
  await fs.appendFile(path.join(destination, name, 'SKILL.md'), '\nUser edit.\n');
  const original = await readFiles(path.join(destination, name));
  const dryRun = cli(['install', '--target', 'codex', '--dest', destination, '--replace', '--dry-run'], temporaryRoot);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.deepEqual(await readFiles(path.join(destination, name)), original);
  await assert.rejects(fs.access(path.join(temporaryRoot, 'data')));
  const result = cli(['install', '--target', 'codex', '--dest', destination, '--replace'], temporaryRoot);
  assert.equal(result.status, 0, result.stderr);
  const backup = JSON.parse(result.stdout).backup;
  assert.ok(backup.startsWith(await fs.realpath(path.join(temporaryRoot, 'data/backups'))));
  assert.deepEqual(await readFiles(backup), original);
  assert.deepEqual(await fs.readFile(path.join(backup, 'custom-asset.bin')), Buffer.from([0, 255, 254, 128]));
  assert.deepEqual(await readFiles(path.join(destination, name)), (await generate('codex')).files);
});

test('rename failure restores existing installation and keeps a verified backup', async t => {
  const temporaryRoot = await temporary(t);
  const destination = path.join(temporaryRoot, 'skills', 'threelight-orchestrator-zcode');
  const bundle = await generate('zcode');
  await publish(bundle, destination);
  await fs.writeFile(path.join(destination, 'notes.txt'), 'Original data.');
  const original = await readFiles(destination);
  const backupRoot = path.join(temporaryRoot, 'backups');
  await assert.rejects(publish(bundle, destination, {
    replace: true, backupRoot,
    rename: async (from, to) => {
      if (from.includes('-stage-')) throw new Error('Simulated commit failure');
      await fs.rename(from, to);
    },
  }), /Simulated commit failure/);
  assert.deepEqual(await readFiles(destination), original);
  assert.deepEqual(await fs.readdir(path.dirname(destination)), ['threelight-orchestrator-zcode']);
  const [backup] = await fs.readdir(backupRoot);
  assert.deepEqual(await readFiles(path.join(backupRoot, backup)), original);
});

test('invalid generated content does not touch an existing installation', async t => {
  const temporaryRoot = await temporary(t);
  const destination = path.join(temporaryRoot, 'threelight-orchestrator-codex');
  const bundle = await generate('codex');
  await publish(bundle, destination);
  const original = await readFiles(destination);
  await assert.rejects(publish({ ...bundle, files: modify(bundle, 'SKILL.md', 'invalid') }, destination, { replace: true }), /frontmatter/);
  assert.deepEqual(await readFiles(destination), original);
});

test('failure to move the old installation leaves it intact without attempting bogus restoration', async t => {
  const temporaryRoot = await temporary(t);
  const bundle = await generate('zcode');
  const destination = path.join(temporaryRoot, bundle.name);
  await publish(bundle, destination);
  const original = await readFiles(destination, { binary: true });
  await assert.rejects(publish(bundle, destination, {
    replace: true, backupRoot: path.join(temporaryRoot, 'backups'),
    rename: async () => { throw new Error('Old directory is busy'); },
  }), /Old directory is busy/);
  assert.deepEqual(await readFiles(destination, { binary: true }), original);
});

test('active operation lock prevents a second installation', async t => {
  const temporaryRoot = await temporary(t);
  const bundle = await generate('zcode');
  await fs.writeFile(path.join(temporaryRoot, '.threelight-orchestrator-zcode.lock'), '');
  await assert.rejects(publish(bundle, path.join(temporaryRoot, bundle.name)), /Another operation/);
  await assert.rejects(fs.access(path.join(temporaryRoot, bundle.name)));
});

test('symlink destinations and source-overlapping outputs are refused', async t => {
  const temporaryRoot = await temporary(t);
  const bundle = await generate('codex');
  const original = path.join(temporaryRoot, 'original');
  const destination = path.join(temporaryRoot, bundle.name);
  await fs.mkdir(original);
  await fs.writeFile(path.join(original, 'important.txt'), 'keep');
  await fs.symlink(original, destination);
  await assert.rejects(publish(bundle, destination, { replace: true }), /symlink/);
  assert.equal(await fs.readFile(path.join(original, 'important.txt'), 'utf8'), 'keep');
  await assert.rejects(publish(bundle, path.join(root, 'src', bundle.name)), /overlaps/);
  await fs.symlink(path.join(root, 'src'), path.join(temporaryRoot, 'source-link'));
  await assert.rejects(publish(bundle, path.join(temporaryRoot, 'source-link', bundle.name)), /overlaps/);
});

test('build refuses to replace an unrecognized directory', async t => {
  const temporaryRoot = await temporary(t);
  const destination = path.join(temporaryRoot, 'threelight-orchestrator-zcode');
  await fs.mkdir(destination);
  await fs.writeFile(path.join(destination, 'important.txt'), 'not a generated bundle');
  const result = cli(['build', '--target', 'zcode', '--out', temporaryRoot], temporaryRoot);
  assert.notEqual(result.status, 0);
  assert.equal(await fs.readFile(path.join(destination, 'important.txt'), 'utf8'), 'not a generated bundle');
});

test('CLI validates required, duplicate, unsupported and unknown arguments', async t => {
  const temporaryRoot = await temporary(t);
  for (const args of [
    ['install'], ['install', '--target', 'auto'], ['build', '--target', 'codex'],
    ['install', '--target'], ['check', '--target', 'codex'],
    ['install', '--target', 'codex', '--target', 'zcode'], ['unknown'],
  ]) assert.notEqual(cli(args, temporaryRoot).status, 0, args.join(' '));
  assert.equal(cli(['--help'], temporaryRoot).status, 0);
});
