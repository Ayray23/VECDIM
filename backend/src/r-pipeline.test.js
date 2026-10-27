import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runRAnalysis } from './r-pipeline.js';

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vecdim-r-'));
  await mkdir(path.join(dir, 'R'));
  await writeFile(path.join(dir, 'R', 'run_all.R'), '# supplied pipeline fixture\n');
  await writeFile(path.join(dir, 'input.csv'), 'record_id\n1\n');
  return dir;
}

function fakeSpawn() {
  const stdout = { on() {} };
  const stderr = { on() {} };
  const child = {
    stdout,
    stderr,
    kill() {},
    on(event, callback) {
      if (event === 'close') setImmediate(() => callback(0, null));
      return child;
    }
  };
  return child;
}

test('R runner uses the supplied run_all.R invocation', async () => {
  const workingDir = await fixture();
  let command;
  let args;
  let options;

  const result = await runRAnalysis({
    workingDir,
    inputFile: 'input.csv',
    outputDir: 'outputs',
    rscriptPath: 'Rscript',
    spawnImpl: (nextCommand, nextArgs, nextOptions) => {
      command = nextCommand;
      args = nextArgs;
      options = nextOptions;
      return fakeSpawn();
    }
  });

  assert.equal(command, 'Rscript');
  assert.deepEqual(args, [
    'R/run_all.R',
    path.join(workingDir, 'input.csv'),
    path.join(workingDir, 'outputs')
  ]);
  assert.equal(options.cwd, workingDir);
  assert.equal(result.code, 0);
});

test('R runner rejects a missing input file before starting R', async () => {
  const workingDir = await fixture();
  let spawned = false;

  await assert.rejects(
    runRAnalysis({
      workingDir,
      inputFile: 'missing.csv',
      outputDir: 'outputs',
      spawnImpl: () => {
        spawned = true;
        return fakeSpawn();
      }
    }),
    /ENOENT|no such file/i
  );

  assert.equal(spawned, false);
});
