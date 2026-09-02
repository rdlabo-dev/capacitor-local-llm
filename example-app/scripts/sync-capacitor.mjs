import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('npx', ['cap', 'sync', ...process.argv.slice(2)], {
  cwd: appDirectory,
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const platform = process.argv[2];
if (platform && platform !== 'ios') process.exit(0);

const packagePath = path.join(appDirectory, 'ios/App/CapApp-SPM/Package.swift');
const source = await readFile(packagePath, 'utf8');
const minimum = 'platforms: [.iOS("18.4")]';

if (source.includes(minimum)) process.exit(0);

const generatedDefault = 'platforms: [.iOS(.v18)]';
if (!source.includes(generatedDefault)) {
  throw new Error(`Unexpected iOS platform declaration in ${packagePath}`);
}

await writeFile(packagePath, source.replace(generatedDefault, minimum));
console.log('Set the generated iOS deployment target to 18.4.');
