const STATE_BOUNDS = {
  Lagos: [6.3, 6.8, 2.7, 4.4],
  Kano: [11.5, 12.6, 8.0, 9.2],
  Osun: [7.0, 8.2, 4.0, 5.0],
};

const LGA_REFERENCE = {
  Lagos: { Ikorodu: [6.62, 3.51], Alimosho: [6.6, 3.25], Epe: [6.58, 3.98], Badagry: [6.43, 2.88], 'Eti-Osa': [6.45, 3.6] },
  Kano: { Dala: [12.0, 8.52], Nasarawa: [12.0, 8.55], Gwale: [11.98, 8.49], Tarauni: [11.97, 8.54], Ungogo: [12.05, 8.48] },
  Osun: { Osogbo: [7.77, 4.56], 'Ife Central': [7.48, 4.56], 'Ilesa East': [7.62, 4.73], Iwo: [7.63, 4.18], 'Ede North': [7.74, 4.43] },
};

export const RULE_IDS = [
  'GPS_outside_nigeria',
  'GPS_zero_zero',
  'GPS_state_mismatch',
  'GPS_far_from_lga',
  'n_dead_gt_n_exposed',
  'positivity_out_range',
  'future_date',
  'temp_implausible',
  'rainfall_implausible',
  'duplicate',
  'missing_core',
];

export const DEVICE_RULE_IDS = [
  'GPS_outside_nigeria',
  'GPS_zero_zero',
  'GPS_state_mismatch',
  'GPS_far_from_lga',
  'n_dead_gt_n_exposed',
  'future_date',
  'duplicate',
  'missing_core',
];

export function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function missing(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return normalized === '' || /^(?:NA|N\/A|NULL)$/i.test(normalized);
}

function asNumber(value) {
  if (missing(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asDateString(value) {
  if (missing(value)) return null;
  return String(value).slice(0, 10);
}

function flag(ruleId, severity, field, message) {
  return { ruleId, severity, field, message };
}

function duplicateKey(record) {
  return [record.ward, record.collection_date ?? record.collectionDate, record.species, record.insecticide, record.n_exposed ?? record.exposed, record.n_dead ?? record.dead].join('|');
}

/** Implements the candidate-pack validation rules. */
export function validateRecord(record, options = {}) {
  const scope = options.scope ?? 'device';
  const refDate = options.refDate ?? new Date().toISOString().slice(0, 10);
  const existingRecords = options.existingRecords ?? [];
  const flags = [];
  const lat = asNumber(record.latitude);
  const lon = asNumber(record.longitude);
  const accuracy = asNumber(record.gps_accuracy_m ?? record.gpsAccuracyM);
  const exposed = asNumber(record.n_exposed ?? record.exposed);
  const dead = asNumber(record.n_dead ?? record.dead);
  const state = record.state;
  const lga = record.lga;
  const add = (ruleId, severity, field, message) => flags.push(flag(ruleId, severity, field, message));

  if (lat !== null && lon !== null) {
    if (lat < 4 || lat > 14 || lon < 2.5 || lon > 15) add('GPS_outside_nigeria', 'Block', 'latitude', 'The GPS point is outside Nigeria. Recapture the location.');
    if (lat === 0 && lon === 0) add('GPS_zero_zero', 'Block', 'latitude', 'The GPS location is 0,0. Recapture the location.');
  } else if (scope === 'device') {
    add('GPS_outside_nigeria', 'Block', 'latitude', 'Capture a valid GPS location before saving.');
  }

  const stateBounds = STATE_BOUNDS[state];
  if (!stateBounds) add('GPS_state_mismatch', 'Block', 'state', 'Choose a valid pilot state before saving.');
  else if (lat !== null && lon !== null && (lat < stateBounds[0] || lat > stateBounds[1] || lon < stateBounds[2] || lon > stateBounds[3])) add('GPS_state_mismatch', 'Block', 'latitude', `The GPS point is outside ${state}. Check the state or recapture the location.`);

  const lgaRef = LGA_REFERENCE[state]?.[lga];
  if (lat !== null && lon !== null && lgaRef) {
    const distance = haversineKm(lat, lon, lgaRef[0], lgaRef[1]);
    if (distance > 25) add('GPS_far_from_lga', 'Warn', 'lga', `Your location is ${distance.toFixed(1)} km from ${lga}. Check the LGA or recapture the location.`);
  } else if (scope === 'server' && (!state || !lgaRef)) {
    add('GPS_far_from_lga', 'Warn', 'lga', 'The selected LGA is unknown, so the location cannot be checked against an LGA reference point.');
  }

  if (scope === 'device' || !missing(accuracy)) {
    if (accuracy === null || accuracy > 50) add('GPS_accuracy_unusable', 'Block', 'gps_accuracy_m', 'GPS accuracy is unusable. Move to open sky and recapture the location.');
    else if (accuracy > 10) add('GPS_accuracy_poor', 'Warn', 'gps_accuracy_m', `GPS accuracy is ${Math.round(accuracy)} m. A fix of 10 m or better is preferred.`);
  }

  if (dead !== null && exposed !== null && dead > exposed) add('n_dead_gt_n_exposed', 'Block', 'n_dead', `n_dead (${dead}) is more than n_exposed (${exposed}). Correct the number of dead mosquitoes.`);

  if (scope === 'server') {
    const positivity = asNumber(record.slide_positivity_pct);
    const temp = asNumber(record.temp_c);
    const rainfall = asNumber(record.rainfall_mm);
    if (positivity !== null && (positivity < 0 || positivity > 100)) add('positivity_out_range', 'Block', 'slide_positivity_pct', 'Slide positivity must be between 0 and 100%.');
    if (temp !== null && (temp < 10 || temp > 50)) add('temp_implausible', 'Block', 'temp_c', 'Temperature must be between 10 and 50 °C.');
    if (rainfall !== null && (rainfall < 0 || rainfall > 1500)) add('rainfall_implausible', 'Block', 'rainfall_mm', 'Rainfall must be between 0 and 1500 mm.');

    // R reference rule: missing_core is based on NDVI, rainfall, ITN use, or species.
    if (missing(record.ndvi) || missing(record.rainfall_mm) || missing(record.itn_use_pct ?? record.itnUsePercent) || missing(record.species)) {
      add('missing_core', 'Block', 'ndvi', 'Core analysis covariates/species are missing.');
    }
  }

  const collectionDate = asDateString(record.collection_date ?? record.collectionDate);
  if (collectionDate && collectionDate > refDate) add('future_date', 'Block', 'collection_date', `Collection date ${collectionDate} is later than the reference date ${refDate}. Choose a valid collection date.`);

  if (scope === 'device') {
    const required = [
      ['state', state, 'Choose a state.'], ['lga', lga, 'Choose an LGA.'], ['ward', record.ward, 'Choose a ward.'],
      ['species', record.species, 'Choose a mosquito species.'], ['insecticide', record.insecticide, 'Choose an insecticide.'],
      ['collection_date', collectionDate, 'Choose a collection date.'], ['n_exposed', exposed, 'Enter the number of exposed mosquitoes.'],
      ['n_dead', dead, 'Enter the number of dead mosquitoes.'], ['larval_density', asNumber(record.larval_density ?? record.larvalDensity), 'Enter larval density.'],
      ['urban', record.urban, 'Choose Urban or Rural.'], ['irs_covered', record.irs_covered ?? record.irsCovered, 'Choose whether IRS covered the area.'],
      ['itn_use_pct', asNumber(record.itn_use_pct ?? record.itnUsePercent), 'Enter ITN use percentage.'],
    ];
    for (const [field, value, message] of required) if (missing(value)) add('missing_core', 'Block', field, message);
    if (exposed !== null && (!Number.isInteger(exposed) || exposed < 1 || exposed > 500)) add('n_exposed_range', 'Block', 'n_exposed', 'Exposed mosquitoes must be a whole number from 1 to 500.');
    if (dead !== null && (!Number.isInteger(dead) || dead < 0)) add('n_dead_range', 'Block', 'n_dead', 'Dead mosquitoes must be a whole number of 0 or more.');
    const larval = asNumber(record.larval_density ?? record.larvalDensity);
    if (larval !== null && (!Number.isInteger(larval) || larval < 0)) add('larval_density_range', 'Block', 'larval_density', 'Larval density must be a whole number of 0 or more.');
    const itn = asNumber(record.itn_use_pct ?? record.itnUsePercent);
    if (itn !== null && (itn < 0 || itn > 100)) add('itn_use_range', 'Block', 'itn_use_pct', 'ITN use must be a number from 0 to 100.');
  }

  // R reference rule: the earliest record_id in a duplicate group is kept;
  // every later record with the same key is flagged. Do not use input order.
  const currentId = String(record.record_id ?? record.recordId ?? '');
  const duplicate = existingRecords
    .filter((item) => String(item.record_id ?? item.recordId ?? '') !== currentId)
    .filter((item) => (item.status ?? '') !== 'rejected')
    .filter((item) => duplicateKey(item) === duplicateKey(record))
    .some((item) => String(item.record_id ?? item.recordId ?? '') < currentId);
  if (duplicate) add('duplicate', 'Warn', 'record_id', 'A matching field record already exists. Check that this is intentional.');

  return flags;
}

export function calculateMortality(exposed, dead) {
  const nExposed = asNumber(exposed);
  const nDead = asNumber(dead);
  if (nExposed === null || nExposed <= 0 || nDead === null) return null;
  return Math.round((100 * nDead / nExposed) * 10) / 10;
}

export function classifyMortality(mortalityPct) {
  if (mortalityPct === null || mortalityPct === undefined || !Number.isFinite(Number(mortalityPct))) return 'Not calculated';
  const mortality = Number(mortalityPct);
  if (mortality >= 98) return 'Susceptible';
  if (mortality >= 90) return 'Possible resistance';
  return 'Resistant';
}

export { LGA_REFERENCE, STATE_BOUNDS };
