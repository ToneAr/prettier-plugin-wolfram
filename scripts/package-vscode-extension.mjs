import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const extensionSrc = join(repoRoot, 'vscode-extension');
const packagedPluginName = '@wrel/prettier-plugin-wolfram';
const extensionNodeModules = resolve(extensionSrc, 'node_modules');
const args = process.argv.slice(2);
const preRelease = args.includes('--pre-release');
const publish = args.includes('--publish');
const forwardedPublishArgs = args.filter(
  (arg) => arg !== '--pre-release' && arg !== '--publish',
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? 'pipe',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }
  return result;
}

const tempDir = mkdtempSync(join(tmpdir(), 'wolfram-prettier-vscode-'));

function shouldCopyExtensionPath(src) {
  return !src.startsWith(extensionNodeModules) && !src.endsWith('.vsix');
}

try {
  const packResult = run('npm', ['pack', '--json', '--pack-destination', tempDir], { cwd: repoRoot });
  const packInfo = JSON.parse(packResult.stdout);
  const tarballName = packInfo[0]?.filename;
  const packagedPluginVersion = packInfo[0]?.version;
  if (!tarballName) throw new Error('Could not determine packed tarball filename');
  if (!packagedPluginVersion) throw new Error('Could not determine packed plugin version');

  const tarballPath = join(tempDir, tarballName);
  const extensionBuildDir = join(tempDir, 'extension');

  cpSync(extensionSrc, extensionBuildDir, {
    recursive: true,
    filter: shouldCopyExtensionPath,
  });

  const pkgPath = join(extensionBuildDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = {
    ...(pkg.dependencies ?? {}),
    prettier: pkg.dependencies?.prettier ?? '^3.4.0',
    [packagedPluginName]: `file:${tarballPath}`,
  };
  delete pkg.dependencies['prettier-plugin-wolfram'];
  delete pkg.publishConfig;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  if (existsSync(join(extensionBuildDir, 'package-lock.json'))) rmSync(join(extensionBuildDir, 'package-lock.json'));
  if (existsSync(join(extensionBuildDir, 'bun.lock'))) rmSync(join(extensionBuildDir, 'bun.lock'));

  run('npm', ['install', '--omit=dev', '--no-package-lock'], { cwd: extensionBuildDir, stdio: 'inherit' });

  pkg.dependencies[packagedPluginName] = `^${packagedPluginVersion}`;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  const outPath = join(repoRoot, 'vscode-extension', `${pkg.name}-${pkg.version}.vsix`);
  const packageArgs = ['exec', '--yes', '@vscode/vsce', '--', 'package', '-o', outPath];
  if (preRelease) packageArgs.push('--pre-release');

  run('npm', packageArgs, {
    cwd: extensionBuildDir,
    stdio: 'inherit',
  });

  console.log(`Packaged standalone VSIX at ${outPath}`);

  if (publish) {
    const publishArgs = [
      'exec',
      '--yes',
      '@vscode/vsce',
      '--',
      'publish',
      '--packagePath',
      outPath,
    ];
    if (preRelease) publishArgs.push('--pre-release');
    publishArgs.push(...forwardedPublishArgs);

    run('npm', publishArgs, {
      cwd: extensionBuildDir,
      stdio: 'inherit',
    });
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
