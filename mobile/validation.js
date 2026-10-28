const LGA_REFERENCE = {
  Lagos: { Ikorodu: [6.62, 3.51], Alimosho: [6.6, 3.25], Epe: [6.58, 3.98], Badagry: [6.43, 2.88], 'Eti-Osa': [6.45, 3.6] },
  Kano: { Dala: [12.0, 8.52], Nasarawa: [12.0, 8.55], Gwale: [11.98, 8.49], Tarauni: [11.97, 8.54], Ungogo: [12.05, 8.48] },
  Osun: { Osogbo: [7.77, 4.56], 'Ife Central': [7.48, 4.56], 'Ilesa East': [7.62, 4.73], Iwo: [7.63, 4.18], 'Ede North': [7.74, 4.43] },
};

const STATE_BOUNDS = { Lagos: [6.3, 6.8, 2.7, 4.4], Kano: [11.5, 12.6, 8.0, 9.2], Osun: [7.0, 8.2, 4.0, 5.0] };
const SPECIES = ['An. gambiae s.s.', 'An. coluzzii', 'An. arabiensis', 'An. funestus'];
const INSECTICIDES = ['Permethrin', 'Deltamethrin', 'Alphacypermethrin', 'Pirimiphos-methyl'];
const STATES = Object.keys(LGA_REFERENCE);

const today = () => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

function asFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLgaDistance(record) {
  if (!record.lga || !record.state || !record.latitude || !record.longitude) return null;
  const ref = LGA_REFERENCE[record.state]?.[record.lga];
  if (!ref) return null;
  return haversineKm(Number(record.latitude), Number(record.longitude), ref[0], ref[1]);
}

function validateRecord(record, existingRecords = []) {
  const flags = [];
  const add = (ruleId, severity, field, message) => flags.push({ ruleId, severity, field, message });
  const lat = asFiniteNumber(record.latitude);
  const lon = asFiniteNumber(record.longitude);
  const accuracy = asFiniteNumber(record.gpsAccuracyM);
  const exposed = asFiniteNumber(record.exposed);
  const dead = asFiniteNumber(record.dead);
  const larval = asFiniteNumber(record.larvalDensity);
  const itn = asFiniteNumber(record.itnUsePercent);

  if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    add('GPS_missing_location', 'Block', 'latitude', 'Capture a valid GPS location before saving.');
  } else if (lat < 4 || lat > 14 || lon < 2.5 || lon > 15) {
    add('GPS_outside_nigeria', 'Block', 'latitude', 'The GPS point is outside Nigeria. Recapture the location.');
  }

  if (Number.isFinite(lat) && Number.isFinite(lon) && lat === 0 && lon === 0) {
    add('GPS_zero_zero', 'Block', 'latitude', 'The GPS location is 0,0. Recapture the location.');
  }

  const bounds = STATE_BOUNDS[record.state];
  if (!record.state) {
    add('state_required', 'Block', 'state', 'Choose a state before saving.');
  } else if (bounds && Number.isFinite(lat) && Number.isFinite(lon) && (lat < bounds[0] || lat > bounds[1] || lon < bounds[2] || lon > bounds[3])) {
    add('GPS_state_mismatch', 'Block', 'latitude', `The GPS point is outside ${record.state}. Check the state or recapture the location.`);
  }

  const distance = getLgaDistance(record);
  if (distance !== null && distance > 25) add('GPS_far_from_lga', 'Warn', 'lga', `Your location is ${distance.toFixed(1)} km from ${record.lga}. Check the LGA or recapture the location.`);
  if (accuracy === null || !Number.isFinite(accuracy) || accuracy > 50) add('GPS_accuracy_unusable', 'Block', 'gpsAccuracyM', 'GPS accuracy is unusable. Move to open sky and recapture the location.');
  else if (accuracy > 10) add('GPS_accuracy_poor', 'Warn', 'gpsAccuracyM', `GPS accuracy is ${Math.round(accuracy)} m. A fix of 10 m or better is preferred.`);

  if (exposed === null) add('missing_core', 'Block', 'exposed', 'Enter the number of exposed mosquitoes.');
  else if (exposed < 1 || exposed > 500 || !Number.isInteger(exposed)) add('n_exposed_range', 'Block', 'exposed', 'Exposed mosquitoes must be a whole number from 1 to 500.');

  if (dead === null) add('missing_core', 'Block', 'dead', 'Enter the number of dead mosquitoes.');
  else if (dead < 0 || !Number.isInteger(dead)) add('n_dead_range', 'Block', 'dead', 'Dead mosquitoes must be a whole number of 0 or more.');

  if (dead !== null && exposed !== null && dead > exposed) add('n_dead_gt_n_exposed', 'Block', 'dead', 'Dead mosquitoes cannot exceed exposed mosquitoes. Correct the dead count.');

  if (larval === null) add('missing_core', 'Block', 'larvalDensity', 'Enter larval density.');
  else if (!Number.isInteger(larval) || larval < 0) add('larval_density_range', 'Block', 'larvalDensity', 'Larval density must be a whole number of 0 or more.');

  if (itn === null) add('missing_core', 'Block', 'itnUsePercent', 'Enter ITN use percentage.');
  else if (!Number.isFinite(itn) || itn < 0 || itn > 100) add('itn_use_range', 'Block', 'itnUsePercent', 'ITN use must be a number from 0 to 100.');

  if (!record.state || !STATES.includes(record.state)) add('missing_core', 'Block', 'state', 'Choose Lagos, Kano or Osun.');
  if (!record.lga || !LGA_REFERENCE[record.state]?.[record.lga]) add('missing_core', 'Block', 'lga', 'Choose an LGA from the selected state.');
  if (!record.ward) add('missing_core', 'Block', 'ward', 'Choose a ward.');
  if (!record.species || !SPECIES.includes(record.species)) add('missing_core', 'Block', 'species', 'Choose a mosquito species.');
  if (!record.insecticide || !INSECTICIDES.includes(record.insecticide)) add('missing_core', 'Block', 'insecticide', 'Choose an insecticide.');
  if (!record.collectionDate) add('missing_core', 'Block', 'collectionDate', 'Choose a collection date.');
  if (record.collectionDate && record.collectionDate > today()) add('future_date', 'Block', 'collectionDate', 'Collection date cannot be in the future.');
  if (!record.urban) add('missing_core', 'Block', 'urban', 'Choose Urban or Rural.');
  if (typeof record.irsCovered !== 'boolean') add('missing_core', 'Block', 'irsCovered', 'Choose whether IRS covered the area.');

  const duplicate = existingRecords.find((item) => item.recordId !== record.recordId && item.status !== 'rejected' && item.ward === record.ward && item.collectionDate === record.collectionDate && item.species === record.species && item.insecticide === record.insecticide && Number(item.exposed) === exposed && Number(item.dead) === dead);
  if (duplicate) add('duplicate', 'Warn', 'recordId', 'A matching field record already exists on this device. Check that this is intentional.');
  return flags;
}


export { asFiniteNumber, getLgaDistance, haversineKm, today, validateRecord };
