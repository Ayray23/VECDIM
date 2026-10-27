import assert from 'node:assert/strict';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('Malformed CSV: unterminated quoted field.');
  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => value !== '')) rows.push(row);
  }
  if (rows.length === 0) throw new Error('CSV is empty.');

  const [rawHeader, ...data] = rows;
  const header = rawHeader.map((value, index) => index === 0 ? value.replace(/^\uFEFF/, '') : value);
  if (new Set(header).size !== header.length) throw new Error('CSV contains duplicate column names.');

  return data.map((values, rowIndex) => {
    if (values.length > header.length) throw new Error(`CSV row ${rowIndex + 2} has more fields than the header.`);
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? '']));
  });
}

function parseFlagValue(value, rowLabel, rule) {
  if (typeof value !== 'string') throw new Error(`Missing boolean value for ${rule} at ${rowLabel}.`);
  switch (value.trim().toUpperCase()) {
    case 'TRUE':
    case 'T':
    case '1':
      return true;
    case 'FALSE':
    case 'F':
    case '0':
      return false;
    default:
      throw new Error(`Invalid boolean value "${value}" for ${rule} at ${rowLabel}.`);
  }
}

function indexById(rows, idField, label) {
  const index = new Map();
  rows.forEach((row, rowNumber) => {
    const id = row[idField];
    if (id === undefined || id === '') throw new Error(`${label} row ${rowNumber + 1} has no ${idField}.`);
    if (index.has(id)) throw new Error(`${label} contains duplicate ${idField} "${id}".`);
    index.set(id, { row, rowNumber });
  });
  return index;
}

export function compareParity({ inputRows, expectedRows, ruleIds, validateRow, idField = 'record_id', maxExamples = 20 }) {
  assert.equal(inputRows.length, expectedRows.length, 'Input and reference row counts differ.');
  const inputHasId = inputRows.every((row) => Object.hasOwn(row, idField));
  const expectedHasId = expectedRows.every((row) => Object.hasOwn(row, idField));
  if (inputHasId !== expectedHasId) throw new Error(`Both CSV files must include ${idField}, or neither may include it.`);

  for (const rule of ruleIds) {
    if (!expectedRows.length || !Object.hasOwn(expectedRows[0], rule)) {
      throw new Error(`Reference CSV is missing rule column "${rule}".`);
    }
  }

  const expectedById = inputHasId ? indexById(expectedRows, idField, 'Reference CSV') : null;
  const inputById = inputHasId ? indexById(inputRows, idField, 'Input CSV') : null;
  const counts = Object.fromEntries(ruleIds.map((rule) => [rule, 0]));
  const examples = [];
  let mismatches = 0;
  let actualFlaggedRecords = 0;
  let expectedFlaggedRecords = 0;

  inputRows.forEach((inputRow, index) => {
    const id = inputHasId ? inputRow[idField] : null;
    const expectedEntry = inputHasId ? expectedById.get(id) : { row: expectedRows[index], rowNumber: index };
    if (!expectedEntry) throw new Error(`Reference CSV is missing ${idField} "${id}".`);
    const actualFlags = new Set(validateRow(inputRow, index).map((flag) => flag.ruleId));
    const rowLabel = inputHasId ? `${idField}=${id}` : `row=${index + 1}`;
    let expectedHasFlag = false;

    for (const rule of ruleIds) {
      const actual = actualFlags.has(rule);
      const expected = parseFlagValue(expectedEntry.row[rule], rowLabel, rule);
      if (actual) counts[rule] += 1;
      if (expected) expectedHasFlag = true;
      if (actual !== expected) {
        mismatches += 1;
        if (examples.length < maxExamples) {
          examples.push({ row: rowLabel, rule, expected, actual, referenceRow: expectedEntry.rowNumber + 2 });
        }
      }
    }
    if (ruleIds.some((rule) => actualFlags.has(rule))) actualFlaggedRecords += 1;
    if (expectedHasFlag) expectedFlaggedRecords += 1;
  });

  if (inputById && [...expectedById.keys()].some((id) => !inputById.has(id))) {
    throw new Error(`Reference CSV contains ${idField} values not present in the input CSV.`);
  }

  return {
    counts,
    mismatches,
    examples,
    alignment: inputHasId ? idField : 'row order',
    actualFlaggedRecords,
    actualCleanedRecords: inputRows.length - actualFlaggedRecords,
    expectedFlaggedRecords,
    expectedCleanedRecords: inputRows.length - expectedFlaggedRecords
  };
}