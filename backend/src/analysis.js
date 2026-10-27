import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runRAnalysis } from './r-pipeline.js';

export function recordsToCsv(records) {
  if (!Array.isArray(records)) throw new Error('records must be an array');
  const headers = Object.keys(records[0] ?? {});
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers.join(','), ...records.map((record) => headers.map((header) => escape(record[header])).join(','))].join('\n') + '\n';
}

/**
 * Creates an analysis input CSV from already-stored records and invokes the
 * supplied candidate-pack R pipeline. The statistical logic remains in R.
 */
export async function runAnalysis({ records, workingDir, runDir = '.analysis', rscriptPath }) {
  if (!workingDir) throw new Error('workingDir is required');
  const absoluteRunDir = path.resolve(workingDir, runDir);
  await mkdir(absoluteRunDir, { recursive: true });

  const inputFile = path.join(absoluteRunDir, 'input.csv');
  const outputDir = path.join(absoluteRunDir, 'outputs');
  await mkdir(outputDir, { recursive: true });
  await writeFile(inputFile, recordsToCsv(records), 'utf8');

  return runRAnalysis({
    inputFile,
    outputDir,
    workingDir,
    rscriptPath
  });
}
