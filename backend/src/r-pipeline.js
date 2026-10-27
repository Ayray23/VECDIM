import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_RSCRIPT = process.env.RSCRIPT_PATH || 'Rscript';

/**
 * Runs the supplied VECDIM R pipeline without reimplementing its analytics.
 *
 * The candidate pack defines the invocation as:
 *   Rscript R/run_all.R <input_csv> <output_dir>
 *
 * The R files themselves are intentionally not copied or modified here.
 */
export async function runRAnalysis({
  inputFile,
  outputDir,
  workingDir,
  rscriptPath = DEFAULT_RSCRIPT,
  timeoutMs = 10 * 60 * 1000,
  spawnImpl = spawn
}) {
  if (!inputFile) throw new Error('inputFile is required');
  if (!outputDir) throw new Error('outputDir is required');
  if (!workingDir) throw new Error('workingDir is required');

  const resolvedInput = path.resolve(workingDir, inputFile);
  const resolvedOutput = path.resolve(workingDir, outputDir);
  const pipeline = path.join(workingDir, 'R', 'run_all.R');

  await access(resolvedInput);
  await access(pipeline);

  return new Promise((resolve, reject) => {
    const child = spawnImpl(
      rscriptPath,
      ['R/run_all.R', resolvedInput, resolvedOutput],
      { cwd: workingDir, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(reject, new Error(`R analysis timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      finish(reject, error);
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        finish(resolve, { code, signal, stdout, stderr, outputDir: resolvedOutput });
        return;
      }

      const detail = stderr.trim() || stdout.trim() || `signal=${signal ?? 'none'}`;
      finish(reject, new Error(`R analysis failed with exit code ${code}: ${detail}`));
    });
  });
}
