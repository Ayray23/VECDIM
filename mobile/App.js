import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import { syncPendingRecords, checkBackendHealth } from './src/apiSync.js';

const DRAFT_KEY = '@vecdim/draft-v2';
const RECORDS_KEY = '@vecdim/records-v1';

const LGA_REFERENCE = {
  Lagos: { Ikorodu: [6.62, 3.51], Alimosho: [6.6, 3.25], Epe: [6.58, 3.98], Badagry: [6.43, 2.88], 'Eti-Osa': [6.45, 3.6] },
  Kano: { Dala: [12.0, 8.52], Nasarawa: [12.0, 8.55], Gwale: [11.98, 8.49], Tarauni: [11.97, 8.54], Ungogo: [12.05, 8.48] },
  Osun: { Osogbo: [7.77, 4.56], 'Ife Central': [7.48, 4.56], 'Ilesa East': [7.62, 4.73], Iwo: [7.63, 4.18], 'Ede North': [7.74, 4.43] },
};

const STATE_BOUNDS = { Lagos: [6.3, 6.8, 2.7, 4.4], Kano: [11.5, 12.6, 8.0, 9.2], Osun: [7.0, 8.2, 4.0, 5.0] };
const SPECIES = ['An. gambiae s.s.', 'An. coluzzii', 'An. arabiensis', 'An. funestus'];
const INSECTICIDES = ['Permethrin', 'Deltamethrin', 'Alphacypermethrin', 'Pirimiphos-methyl'];
const STATES = Object.keys(LGA_REFERENCE);

function makeUuidV4() {
  return Crypto.randomUUID();
}

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

function makeRecord() {
  return { recordId: makeUuidV4(), state: '', lga: '', ward: '', collectionDate: today(), species: '', insecticide: '', exposed: '', dead: '', larvalDensity: '', urban: '', irsCovered: false, itnUsePercent: '', latitude: '', longitude: '', gpsAccuracyM: '', status: 'draft', capturedAt: new Date().toISOString() };
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

function TextField({ label, value, onChangeText, placeholder, keyboardType = 'default', required = false, editable = true }) {
  return <View style={styles.field}><Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} editable={editable} style={[styles.input, !editable && styles.inputDisabled]} placeholder={placeholder || `Enter ${label.toLowerCase()}`} placeholderTextColor="#8b948c" accessibilityLabel={label} /></View>;
}

function SelectField({ label, value, options, onSelect, required = false, disabled = false }) {
  const [open, setOpen] = useState(false);
  return <View style={styles.field}><Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text><Pressable disabled={disabled} onPress={() => setOpen(true)} style={[styles.input, styles.selectButton, disabled && styles.inputDisabled]}><Text style={value ? styles.selectText : styles.placeholderText}>{value || `Select ${label.toLowerCase()}`}</Text><Text style={styles.chevron}>⌄</Text></Pressable><Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}><View style={styles.modalCard}><Text style={styles.modalTitle}>Select {label}</Text><ScrollView>{options.map((option) => <Pressable key={option} style={styles.option} onPress={() => { onSelect(option); setOpen(false); }}><Text style={styles.optionText}>{option}</Text></Pressable>)}</ScrollView></View></Pressable></Modal></View>;
}

function SectionHeading({ number, title, detail }) {
  return <View style={styles.sectionHeading}><Text style={styles.sectionNumber}>{number}</Text><View style={styles.sectionTitleGroup}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionDetail}>{detail}</Text></View></View>;
}

export default function App() {
  const [record, setRecord] = useState(makeRecord); const [records, setRecords] = useState([]); const [draftLoaded, setDraftLoaded] = useState(false); const [dirty, setDirty] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('Location not captured'); const [gpsBusy, setGpsBusy] = useState(false); const [saveStatus, setSaveStatus] = useState('Draft saves automatically'); const [showDatePicker, setShowDatePicker] = useState(false);
  const watchRef = useRef(null); const debounceRef = useRef(null);

  useEffect(() => {
    (async () => {
      const [draftValue, recordsValue] = await Promise.all([AsyncStorage.getItem(DRAFT_KEY), AsyncStorage.getItem(RECORDS_KEY)]);
      if (recordsValue) { try { setRecords(JSON.parse(recordsValue)); } catch { setRecords([]); } }
      if (draftValue) {
        try {
          const draft = JSON.parse(draftValue);
          Alert.alert('Unfinished record', 'You have an unfinished record. Resume it or discard it.', [
            { text: 'Discard', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem(DRAFT_KEY); setDraftLoaded(true); } },
            { text: 'Resume', onPress: () => { setRecord(draft); setDirty(true); setDraftLoaded(true); } },
          ], { cancelable: false });
        } catch { setDraftLoaded(true); }
      } else setDraftLoaded(true);
    })();
    return () => { if (watchRef.current) watchRef.current.remove(); if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const runBackendSync = async () => {
    try {
      await checkBackendHealth();
      const result = await syncPendingRecords();
      if (result.attempted > 0) {
        const refreshed = await AsyncStorage.getItem(RECORDS_KEY);
        if (refreshed) setRecords(JSON.parse(refreshed));
        setSaveStatus(result.rejected > 0 ? 'Some records were rejected by the backend' : 'Records synced to backend');
      }
    } catch {
      setSaveStatus('Offline · records remain safely on this device');
    }
  };

  useEffect(() => {
    runBackendSync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') runBackendSync();
    });
    const timer = setInterval(runBackendSync, 30000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);

  const persistDraft = async (nextRecord) => { await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ ...nextRecord, status: 'draft' })); setSaveStatus('Draft saved automatically on this device'); };
  useEffect(() => { if (!draftLoaded || !dirty) return undefined; if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => persistDraft(record).catch(() => setSaveStatus('Could not autosave draft')), 600); return () => clearTimeout(debounceRef.current); }, [record, draftLoaded, dirty]);
  useEffect(() => { const subscription = AppState.addEventListener('change', (state) => { if (state === 'background' && dirty) persistDraft(record).catch(() => {}); }); return () => subscription.remove(); }, [record, dirty]);

  const update = (field, value) => { setRecord((current) => ({ ...current, [field]: value })); setDirty(true); setSaveStatus('Saving draft…'); };
  const mortality = useMemo(() => { const exposed = Number(record.exposed); const dead = Number(record.dead); if (!Number.isFinite(exposed) || exposed <= 0 || !Number.isFinite(dead)) return null; return Math.round((dead / exposed) * 1000) / 10; }, [record.exposed, record.dead]);
  const classification = mortality === null ? 'Not calculated' : mortality >= 98 ? 'Susceptible' : mortality >= 90 ? 'Possible resistance' : 'Resistant';
  const lgas = record.state ? Object.keys(LGA_REFERENCE[record.state]) : []; const wards = record.lga ? Array.from({ length: 6 }, (_, index) => `${record.lga} Ward ${index + 1}`) : [];
  const distance = getLgaDistance(record); const previewFlags = validateRecord(record, records); const blockingFlags = previewFlags.filter((flag) => flag.severity === 'Block'); const warningFlags = previewFlags.filter((flag) => flag.severity === 'Warn');

  const captureGps = async () => {
    try {
      setGpsBusy(true); setGpsStatus('Capturing the most accurate fix…');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') { setGpsStatus('Location permission denied'); return; }
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const firstAccuracy = first.coords.accuracy;
      update('latitude', String(first.coords.latitude)); update('longitude', String(first.coords.longitude)); update('gpsAccuracyM', String(firstAccuracy ?? ''));
      if (firstAccuracy !== null && firstAccuracy <= 10) { setGpsStatus(`Accepted · ${Math.round(firstAccuracy)} m accuracy`); return; }
      setGpsStatus('Waiting for a better GPS signal. Move to open sky.');
      let best = first;
      await new Promise((resolve) => {
        let timer;
        let localSubscription = null;
        let finished = false;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          if (localSubscription) {
            localSubscription.remove();
            localSubscription = null;
          }
          if (watchRef.current) {
            watchRef.current.remove();
            watchRef.current = null;
          }
        };
        const finish = () => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve();
        };

        timer = setTimeout(finish, 60000);
        Location.watchPositionAsync({ accuracy: Location.Accuracy.Highest, distanceInterval: 0, timeInterval: 1500 }, (position) => {
          if ((position.coords.accuracy ?? Infinity) < (best.coords.accuracy ?? Infinity)) {
            best = position; update('latitude', String(position.coords.latitude)); update('longitude', String(position.coords.longitude)); update('gpsAccuracyM', String(position.coords.accuracy ?? ''));
            if ((position.coords.accuracy ?? Infinity) <= 10) finish();
          }
        }).then((subscription) => {
          localSubscription = subscription;
          watchRef.current = subscription;
          if (finished) {
            cleanup();
          }
        }).catch(() => finish());
      });
      const accuracy = Number(best.coords.accuracy); setGpsStatus(accuracy <= 10 ? `Accepted · ${Math.round(accuracy)} m accuracy` : `Best fix · ${Math.round(accuracy)} m accuracy; recapture if possible`);
    } catch { setGpsStatus('Could not capture location. Try again in an open area.'); } finally { setGpsBusy(false); }
  };

  const saveRecord = async () => {
    const flags = validateRecord(record, records); const blocks = flags.filter((flag) => flag.severity === 'Block');
    if (blocks.length) { Alert.alert('Cannot save yet', blocks.map((flag) => `• ${flag.message}`).join('\n\n')); return; }
    const saved = { ...record, status: 'pending_sync', validationFlags: flags, savedAt: new Date().toISOString() };
    const next = [...records.filter((item) => item.recordId !== saved.recordId), saved];
    await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(next)); await AsyncStorage.removeItem(DRAFT_KEY);
    setRecords(next); setRecord(makeRecord()); setDirty(false); setSaveStatus('Record saved offline · waiting to sync'); Keyboard.dismiss();
    Alert.alert('Saved offline', warningFlags.length ? `Record saved with ${warningFlags.length} warning(s). It will be synced later.` : 'Record is stored on this device and is ready for later sync.');
  };

  const discardDraft = async () => Alert.alert('Discard draft?', 'All values in this unfinished record will be removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem(DRAFT_KEY); setRecord(makeRecord()); setDirty(false); setSaveStatus('Draft saves automatically'); } }]);
  const resetForNewRecord = () => { setRecord(makeRecord()); setDirty(false); setSaveStatus('Draft saves automatically'); setGpsStatus('Location not captured'); };

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
    <View style={styles.topBar}><Text style={styles.brand}>VECDIM <Text style={styles.brandLight}>/ FIELD</Text></Text><View style={styles.offlineTag}><View style={styles.statusDot} /><Text style={styles.offlineText}>OFFLINE READY</Text></View></View>
    <View style={styles.hero}><Text style={styles.eyebrow}>ENTOMOLOGY · FIELD FORM</Text><Text style={styles.title}>New record</Text><Text style={styles.subtitle}>Capture a collection and bioassay observation, even without internet.</Text><View style={styles.recordMeta}><Text style={styles.recordMetaLabel}>RECORD ID</Text><Text style={styles.id}>{record.recordId}</Text></View></View>

    <View style={styles.formSection}><SectionHeading number="01" title="Collection site" detail="Choose the site and capture its GPS location." /><View style={styles.fieldGrid}>
      <SelectField label="State" value={record.state} options={STATES} required onSelect={(value) => { update('state', value); update('lga', ''); update('ward', ''); }} />
      <SelectField label="LGA" value={record.lga} options={lgas} required disabled={!record.state} onSelect={(value) => { update('lga', value); update('ward', ''); }} />
      <SelectField label="Ward" value={record.ward} options={wards} required disabled={!record.lga} onSelect={(value) => update('ward', value)} />
      <View style={styles.field}><Text style={styles.label}>Collection date<Text style={styles.required}> *</Text></Text><Pressable style={styles.input} onPress={() => setShowDatePicker(true)}><Text style={styles.selectText}>{record.collectionDate}</Text></Pressable>{showDatePicker ? <DateTimePicker value={new Date(`${record.collectionDate}T12:00:00`)} mode="date" maximumDate={new Date()} onChange={(event, date) => { setShowDatePicker(false); if (event.type === 'set' && date) update('collectionDate', date.toISOString().slice(0, 10)); }} /> : null}</View>
    </View>
    <Pressable style={styles.locationButton} onPress={captureGps} disabled={gpsBusy}><View style={styles.locationMark}><Text style={styles.locationMarkText}>GPS</Text></View><View style={styles.locationCopy}><Text style={styles.locationTitle}>{record.latitude ? 'Location attached' : 'Capture site location'}</Text><Text style={styles.locationDetail}>{gpsStatus}</Text></View>{gpsBusy ? <ActivityIndicator /> : <Text style={styles.locationAction}>{record.latitude ? 'RECAPTURE' : 'CAPTURE'}</Text>}</Pressable>
    {record.latitude ? <Text style={styles.coordinates}>{record.latitude}, {record.longitude} · ±{record.gpsAccuracyM || '—'} m</Text> : null}
    {warningFlags.filter((f) => f.ruleId.startsWith('GPS_')).map((flag) => <View key={flag.ruleId} style={styles.warningBox}><Text style={styles.warningTitle}>Warning · {flag.ruleId}</Text><Text style={styles.warningText}>{flag.message}</Text></View>)}
    {distance !== null ? <Text style={styles.distanceText}>Distance from {record.lga}: {distance.toFixed(1)} km</Text> : null}</View>

    <View style={styles.formSection}><SectionHeading number="02" title="Specimen & assay" detail="Record the test population and outcome." /><View style={styles.fieldGrid}><SelectField label="Mosquito species" value={record.species} options={SPECIES} required onSelect={(value) => update('species', value)} /><SelectField label="Insecticide" value={record.insecticide} options={INSECTICIDES} required onSelect={(value) => update('insecticide', value)} /></View><View style={styles.countGrid}><TextField label="Exposed" value={record.exposed} onChangeText={(value) => update('exposed', value.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="1–500" required /><TextField label="Dead" value={record.dead} onChangeText={(value) => update('dead', value.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="0–exposed" required /></View><View style={[styles.result, mortality !== null && mortality < 90 ? styles.resultAlert : null]}><View><Text style={styles.resultLabel}>BIOASSAY MORTALITY</Text><Text style={styles.classification}>{classification}</Text></View><Text style={styles.resultValue}>{mortality === null ? '—' : `${mortality}%`}</Text></View><TextField label="Larval density" value={record.larvalDensity} onChangeText={(value) => update('larvalDensity', value.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="Larvae per dip" required /></View>

    <View style={styles.formSection}><SectionHeading number="03" title="Site conditions" detail="Environmental and intervention context." /><Text style={styles.label}>Settlement type *</Text><View style={styles.segmented}>{['Urban', 'Rural'].map((option) => <Pressable key={option} onPress={() => update('urban', option)} style={[styles.segment, record.urban === option && styles.segmentSelected]}><Text style={[styles.segmentText, record.urban === option && styles.segmentTextSelected]}>{option}</Text></Pressable>)}</View><TextField label="ITN use (%)" value={record.itnUsePercent} onChangeText={(value) => update('itnUsePercent', value.replace(/[^0-9.]/g, ''))} keyboardType="numeric" placeholder="0–100" required /><Pressable style={styles.toggleRow} onPress={() => update('irsCovered', !record.irsCovered)} accessibilityRole="switch" accessibilityState={{ checked: record.irsCovered }}><View style={styles.toggleCopy}><Text style={styles.label}>Indoor residual spraying *</Text><Text style={styles.toggleHint}>Was the area covered by IRS in the last 12 months?</Text></View><View style={[styles.switchTrack, record.irsCovered && styles.switchTrackOn]}><View style={[styles.switchThumb, record.irsCovered && styles.switchThumbOn]} /></View></Pressable></View>

    {blockingFlags.length ? <View style={styles.blockBox}><Text style={styles.blockTitle}>Fix before saving</Text>{blockingFlags.map((flag, index) => <Text key={`${flag.ruleId}-${index}`} style={styles.blockText}>• {flag.message}</Text>)}</View> : null}
    {warningFlags.length ? <View style={styles.warningSummary}><Text style={styles.warningTitle}>Warnings</Text>{warningFlags.map((flag, index) => <Text key={`${flag.ruleId}-${index}`} style={styles.warningText}>• {flag.message}</Text>)}</View> : null}

    <View style={styles.formSection}><SectionHeading number="04" title="Saved offline" detail="Records stay on this device until a later sync stage uploads them." />{records.length ? records.map((item) => <View key={item.recordId} style={styles.savedRecord}><View style={{ flex: 1 }}><Text style={styles.savedId}>{item.recordId}</Text><Text style={styles.savedMeta}>{item.state} · {item.lga} · {item.collectionDate}</Text></View><Text style={styles.savedStatus}>{item.status === 'pending_sync' ? 'PENDING SYNC' : item.status.toUpperCase()}</Text></View>) : <Text style={styles.emptyText}>No saved field records yet.</Text>}</View>

    <View style={styles.footer}><Text style={styles.saveStatus}>{saveStatus}</Text><Pressable style={styles.primaryButton} onPress={saveRecord}><Text style={styles.buttonText}>Save field record</Text><Text style={styles.buttonArrow}>→</Text></Pressable><Pressable style={styles.resetButton} onPress={discardDraft}><Text style={styles.resetText}>Discard this draft</Text></Pressable><Pressable style={styles.secondaryButton} onPress={resetForNewRecord}><Text style={styles.secondaryText}>Start a new blank record</Text></Pressable></View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f5f0' }, container: { paddingHorizontal: 22, paddingBottom: 36, maxWidth: 720, width: '100%', alignSelf: 'center' }, topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#dfe4dc' }, brand: { color: '#193f31', fontSize: 13, fontWeight: '900' }, brandLight: { color: '#778379', fontWeight: '600' }, offlineTag: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#e3eee4', paddingHorizontal: 10, paddingVertical: 7 }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#478659' }, offlineText: { color: '#356548', fontSize: 10, fontWeight: '800' },
  hero: { paddingTop: 27, paddingBottom: 25, borderBottomWidth: 1, borderColor: '#dfe4dc' }, eyebrow: { color: '#567663', fontSize: 10, fontWeight: '800' }, title: { color: '#172f26', fontSize: 34, fontWeight: '800', marginTop: 7 }, subtitle: { color: '#65736a', fontSize: 14, marginTop: 5 }, recordMeta: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12 }, recordMetaLabel: { color: '#7c887e', fontSize: 9, fontWeight: '800' }, id: { color: '#354a3d', fontSize: 11 }, formSection: { paddingVertical: 25, borderBottomWidth: 1, borderColor: '#dfe4dc' }, sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, marginBottom: 20 }, sectionNumber: { color: '#4a795d', fontSize: 11, fontWeight: '900', paddingTop: 3 }, sectionTitleGroup: { flex: 1 }, sectionTitle: { color: '#20392d', fontSize: 18, fontWeight: '800' }, sectionDetail: { color: '#758077', fontSize: 12, marginTop: 4 }, fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }, field: { width: '48.3%', marginBottom: 15 }, label: { color: '#39483d', fontWeight: '700', fontSize: 12, marginBottom: 7 }, required: { color: '#bb6048' }, input: { minHeight: 46, borderWidth: 1, borderColor: '#d5dcd3', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, color: '#25392f', fontSize: 14 }, inputDisabled: { backgroundColor: '#e9ede8' }, selectButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectText: { color: '#25392f', fontSize: 14, flex: 1 }, placeholderText: { color: '#8b948c', fontSize: 14, flex: 1 }, chevron: { color: '#557060', fontSize: 18 },
  locationButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8eee6', minHeight: 66, paddingHorizontal: 12, marginTop: 1 }, locationMark: { width: 37, height: 37, backgroundColor: '#28523d', alignItems: 'center', justifyContent: 'center' }, locationMarkText: { color: '#fff', fontSize: 9, fontWeight: '900' }, locationCopy: { flex: 1, marginLeft: 11 }, locationTitle: { color: '#294334', fontSize: 13, fontWeight: '800' }, locationDetail: { color: '#68786b', fontSize: 11, marginTop: 4 }, locationAction: { color: '#426d50', fontSize: 9, fontWeight: '900', marginLeft: 8 }, coordinates: { color: '#647269', fontSize: 10, marginTop: 8 }, distanceText: { color: '#68786b', fontSize: 11, marginTop: 8 }, warningBox: { backgroundColor: '#f7eee3', padding: 11, marginTop: 10 }, warningTitle: { color: '#7a5b32', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }, warningText: { color: '#765c3a', fontSize: 12, marginTop: 4, lineHeight: 17 },
  countGrid: { flexDirection: 'row', justifyContent: 'space-between' }, result: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#e5eee4', paddingHorizontal: 15, paddingVertical: 13, marginBottom: 16 }, resultAlert: { backgroundColor: '#f6e9e2' }, resultLabel: { color: '#54705b', fontSize: 9, fontWeight: '900' }, classification: { color: '#415b48', fontSize: 12, fontWeight: '700', marginTop: 5 }, resultValue: { color: '#234b34', fontSize: 28, fontWeight: '800' }, segmented: { flexDirection: 'row', backgroundColor: '#e6eae3', marginBottom: 15 }, segment: { flex: 1, paddingVertical: 12, alignItems: 'center' }, segmentSelected: { backgroundColor: '#28523d' }, segmentText: { color: '#667268', fontWeight: '700', fontSize: 12 }, segmentTextSelected: { color: '#fff' }, toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 }, toggleCopy: { flex: 1 }, toggleHint: { color: '#7a847c', fontSize: 11, marginTop: 3 }, switchTrack: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#d5dcd4', padding: 3 }, switchTrackOn: { backgroundColor: '#4d8060' }, switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }, switchThumbOn: { transform: [{ translateX: 20 }] },
  blockBox: { backgroundColor: '#f8e7e3', padding: 14, marginTop: 20 }, blockTitle: { color: '#8b4436', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }, blockText: { color: '#75493f', fontSize: 12, marginTop: 6, lineHeight: 17 }, warningSummary: { backgroundColor: '#f7eee3', padding: 14, marginTop: 12 }, savedRecord: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#e0e5de' }, savedId: { color: '#354a3d', fontSize: 10, fontWeight: '800' }, savedMeta: { color: '#7a847c', fontSize: 10, marginTop: 3 }, savedStatus: { color: '#557060', fontSize: 9, fontWeight: '900' }, emptyText: { color: '#7a847c', fontSize: 12 }, footer: { paddingTop: 25 }, saveStatus: { color: '#6f7b72', fontSize: 11, marginBottom: 10 }, primaryButton: { minHeight: 52, backgroundColor: '#244c38', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17 }, buttonText: { color: '#fff', fontSize: 13, fontWeight: '800' }, buttonArrow: { color: '#dfece2', fontSize: 20 }, resetButton: { alignItems: 'center', paddingVertical: 14 }, resetText: { color: '#8c4b40', fontSize: 11, fontWeight: '800' }, secondaryButton: { alignItems: 'center', paddingVertical: 10 }, secondaryText: { color: '#4c6d59', fontSize: 11, fontWeight: '800' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 }, modalCard: { backgroundColor: '#fff', maxHeight: '75%', padding: 18 }, modalTitle: { color: '#20392d', fontSize: 18, fontWeight: '800', marginBottom: 10 }, option: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#edf0eb' }, optionText: { color: '#304338', fontSize: 14 },
});
