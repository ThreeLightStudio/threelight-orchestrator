import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const targets = ['codex', 'zcode'];
const marker = 'bundle.json';
const digest = value => createHash('sha256').update(value).digest('hex');

function relativeFile(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)
      || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe relative file: ${value}`);
  }
  return value;
}

export async function generate(target, projectRoot = root) {
  if (!targets.includes(target)) throw new Error(`Unknown target: ${target}. Choose codex or zcode.`);
  const profiles = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/profiles.json'), 'utf8'));
  const profile = profiles[target];
  if (!profile || !/^[a-z0-9-]{1,64}$/.test(profile.name)) throw new Error('Invalid profile name.');
  const version = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8')).version;
  const template = await fs.readFile(path.join(projectRoot, 'src/entry.md'), 'utf8');
  const substitutions = {
    name: profile.name,
    description: JSON.stringify(profile.description),
    environment: profile.environment,
    execution: profile.execution,
    references: profile.references.map(([file, label, when]) => `- [${label}](references/${relativeFile(file)}) — ${when}`).join('\n'),
  };
  const files = new Map([['SKILL.md', template.replace(/\{\{(\w+)\}\}/g, (match, key) => substitutions[key] ?? match)]]);
  files.set('LICENSE', await fs.readFile(path.join(projectRoot, 'LICENSE'), 'utf8'));
  for (const [source, destination] of Object.entries(profile.sources)) {
    const filename = `references/${relativeFile(destination)}`;
    if (files.has(filename)) throw new Error(`Duplicate generated path: ${filename}`);
    const input = path.join(projectRoot, 'src', relativeFile(source));
    if (!(await fs.lstat(input)).isFile()) throw new Error(`Source must be a regular file: ${source}`);
    files.set(filename, await fs.readFile(input, 'utf8'));
  }
  if (target === 'codex') {
    files.set('agents/openai.yaml', [
      'interface:',
      `  display_name: ${JSON.stringify('ThreeLight Orchestrator — Codex')}`,
      `  short_description: ${JSON.stringify('별도 세션과 서브에이전트 작업의 실행·검토·재개')}`,
      `  default_prompt: ${JSON.stringify(`$${profile.name}로 작업 범위를 먼저 논의하고, 실행을 요청하면 세션과 보조 서브에이전트를 조정해 주세요.`)}`,
      'policy:',
      '  allow_implicit_invocation: true',
      '',
    ].join('\n'));
  }
  const ordered = [...files].sort(([a], [b]) => a.localeCompare(b, 'en'));
  files.set(marker, JSON.stringify({
    format: 1, target, name: profile.name, version,
    files: Object.fromEntries(ordered.map(([name, content]) => [name, digest(content)])),
  }, null, 2) + '\n');
  validate(files);
  return { name: profile.name, target, version, files };
}

export function validate(files) {
  const skill = files.get('SKILL.md');
  if (!skill) throw new Error('Missing SKILL.md.');
  const frontmatter = /^---\nname: ([a-z0-9-]{1,64})\ndescription: ("[^\n]+")\n---\n/.exec(skill);
  if (!frontmatter || !JSON.parse(frontmatter[2]).trim()) throw new Error('Invalid skill frontmatter.');
  const manifest = JSON.parse(files.get(marker) ?? 'null');
  if (!manifest || manifest.format !== 1 || !targets.includes(manifest.target) || manifest.name !== frontmatter[1]
      || manifest.name !== `threelight-orchestrator-${manifest.target}`
      || !/^\d+\.\d+\.\d+$/.test(manifest.version) || !manifest.files || Array.isArray(manifest.files)) {
    throw new Error('Invalid bundle manifest.');
  }
  const names = [...files.keys()].filter(name => name !== marker).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error('Bundle inventory mismatch.');
  for (const [name, content] of files) {
    relativeFile(name);
    if (typeof content !== 'string' || !content.trim()) throw new Error(`Empty file: ${name}`);
    if (name !== marker && digest(content) !== manifest.files[name]) throw new Error(`Bundle checksum mismatch: ${name}`);
    if (content.includes('{{') || content.includes('<<ccr:')) throw new Error(`Unresolved placeholder: ${name}`);
    if (!name.endsWith('.md')) continue;
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = match[1];
      if (/^(?:https?:|mailto:|#)/.test(link)) continue;
      const file = link.split('#')[0];
      if (!file) continue;
      const referenced = path.posix.normalize(path.posix.join(path.posix.dirname(name), file));
      relativeFile(referenced);
      if (!files.has(referenced)) throw new Error(`Broken reference: ${name} -> ${link}`);
    }
  }
  return manifest;
}

export async function readFiles(directory, { binary = false } = {}) {
  const files = new Map();
  async function visit(dir, prefix = '') {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not supported in bundles: ${relative}`);
      if (entry.isDirectory()) await visit(path.join(dir, entry.name), relative + '/');
      else if (entry.isFile()) files.set(relative, await fs.readFile(path.join(dir, entry.name), binary ? undefined : 'utf8'));
      else throw new Error(`Unsupported file: ${relative}`);
    }
  }
  await visit(directory);
  return files;
}

const sameFiles = (left, right) => left.size === right.size && [...left].every(([name, content]) => {
  const other = right.get(name);
  return Buffer.isBuffer(content) ? Buffer.isBuffer(other) && content.equals(other) : other === content;
});

export async function check(projectRoot = root) {
  const results = [];
  for (const target of targets) {
    const bundle = await generate(target, projectRoot);
    const actual = await readFiles(path.join(projectRoot, 'skills', bundle.name));
    validate(actual);
    if (!sameFiles(bundle.files, actual)) throw new Error(`Generated bundle is stale: ${bundle.name}. Run npm run build.`);
    results.push({ target, name: bundle.name, files: actual.size });
  }
  return results;
}

async function statOrNull(file) {
  try { return await fs.lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function canonical(file) {
  try { return await fs.realpath(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(file);
    if (parent === file) throw error;
    return path.join(await canonical(parent), path.basename(file));
  }
}

const contains = (parent, child) => child === parent || child.startsWith(parent + path.sep);

async function guard(destination) {
  const resolved = await canonical(path.resolve(destination));
  const project = await canonical(root);
  if (resolved === project || ['src', 'lib', 'bin', 'tests', '.git', '.github', 'docs'].some(name => {
    const protectedDir = path.join(project, name);
    return contains(protectedDir, resolved) || contains(resolved, protectedDir);
  })) throw new Error('Destination overlaps project source or repository metadata.');
  return resolved;
}

export function dataRoot() {
  return path.resolve(process.env.THREELIGHT_ORCHESTRATOR_DATA_DIR || path.join(homedir(), '.local/share/threelight-orchestrator'));
}

export async function publish(bundle, destination, { replace = false, dryRun = false, backup = true, backupRoot = path.join(dataRoot(), 'backups'), rename = fs.rename } = {}) {
  validate(bundle.files);
  const requested = path.resolve(destination);
  const existing = await statOrNull(requested);
  if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) throw new Error('Destination must be a regular directory, not a symlink or file.');
  const final = await guard(requested);
  if (existing && !replace) throw new Error(`Already exists: ${final}. Use --replace to back up and replace it.`);
  const before = existing ? await readFiles(final, { binary: true }) : null;
  if (dryRun) return { target: bundle.target, destination: final, replace: Boolean(existing), backup: Boolean(existing && backup), files: [...bundle.files.keys()].sort(), dryRun: true };

  const parent = path.dirname(final);
  await fs.mkdir(parent, { recursive: true });
  const lock = path.join(parent, `.${path.basename(final)}.lock`);
  let lockHandle;
  try { lockHandle = await fs.open(lock, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`Another operation is active, or a stale lock remains: ${lock}`); throw error; }
  let staged;
  let rollback;
  let savedBackup;
  let installed = false;
  try {
    staged = await fs.mkdtemp(path.join(parent, `.${path.basename(final)}-stage-`));
    for (const [name, content] of bundle.files) {
      const output = path.join(staged, name);
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, content, { flag: 'wx' });
    }
    validate(await readFiles(staged));
    const now = await statOrNull(final);
    if (Boolean(now) !== Boolean(existing) || (now && (now.isSymbolicLink() || !now.isDirectory()
        || !sameFiles(before, await readFiles(final, { binary: true }))))) throw new Error('Destination changed during staging; nothing was replaced.');
    if (existing && backup) {
      const storage = await canonical(path.resolve(backupRoot));
      if (contains(final, storage) || contains(storage, final)) throw new Error('Backup storage must be separate from the install destination.');
      await fs.mkdir(storage, { recursive: true });
      savedBackup = path.join(storage, `${path.basename(final)}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
      await fs.cp(final, savedBackup, { recursive: true, errorOnExist: true, force: false });
      if (!sameFiles(before, await readFiles(savedBackup, { binary: true }))) throw new Error('Backup verification failed; installation was not changed.');
    }
    if (existing) {
      const rollbackPath = path.join(parent, `.${path.basename(final)}-rollback-${randomUUID()}`);
      await rename(final, rollbackPath);
      rollback = rollbackPath;
    }
    await rename(staged, final);
    staged = undefined;
    installed = true;
    if (rollback) { await fs.rm(rollback, { recursive: true }); rollback = undefined; }
    return { target: bundle.target, destination: final, backup: savedBackup ?? null, files: bundle.files.size, dryRun: false };
  } catch (error) {
    if (rollback && !installed) {
      try { await fs.rename(rollback, final); rollback = undefined; }
      catch (restoreError) { throw new Error(`Install failed and automatic restoration failed. Existing files remain at ${rollback}. Backup: ${savedBackup ?? 'none'}.`, { cause: restoreError }); }
    }
    throw error;
  } finally {
    if (staged) await fs.rm(staged, { recursive: true, force: true });
    await lockHandle.close();
    await fs.unlink(lock);
  }
}

export async function build(target, output) {
  const bundle = await generate(target);
  const destination = path.join(path.resolve(output), bundle.name);
  if (await statOrNull(destination)) validate(await readFiles(destination));
  return publish(bundle, destination, { replace: true, backup: false });
}

export async function install(target, { dest = path.join(homedir(), '.agents/skills'), replace = false, dryRun = false } = {}) {
  const bundle = await generate(target);
  return publish(bundle, path.join(path.resolve(dest), bundle.name), { replace, dryRun });
}
