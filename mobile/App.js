import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Keyboard, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import { isPending, resolveApiUrl, statusLabel, syncPending } from './sync';

import { asFiniteNumber, getLgaDistance, today, validateRecord, LGA_REFERENCE, SPECIES, INSECTICIDES, STATES } from '../packages/validation/mobile.js';
const DRAFT_KEY = '@vecdim/draft-v2';
const RECORDS_KEY = '@vecdim/records-v1';
const DEVICE_ID_KEY = '@vecdim/device-id';
// Backend base URL: EXPO_PUBLIC_API_URL if set, otherwise the computer running `expo start`
// (same Wi-Fi), otherwise the Android emulator's alias for the host machine.
const API_URL = resolveApiUrl({ envUrl: process.env.EXPO_PUBLIC_API_URL, hostUri: Constants.expoConfig?.hostUri });



function makeUuidV4() {
  return Crypto.randomUUID();
}

function makeRecord() {
  return { recordId: makeUuidV4(), state: '', lga: '', ward: '', collectionDate: today(), species: '', insecticide: '', exposed: '', dead: '', larvalDensity: '', urban: '', irsCovered: false, itnUsePercent: '', latitude: '', longitude: '', gpsAccuracyM: '', status: 'draft', capturedAt: new Date().toISOString() };
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
  const recordsRef = useRef([]); const syncingRef = useRef(false);
  const [syncing, setSyncing] = useState(false); const [syncMessage, setSyncMessage] = useState('Not synced yet');

  // recordsRef always holds the latest saved list, so a sync that finishes while the
  // user saves another record merges into the current list instead of overwriting it.
  const commitRecords = (next) => { recordsRef.current = next; setRecords(next); };
  const persistRecords = () => AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(recordsRef.current));
  const getDeviceId = async () => {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) { id = Crypto.randomUUID(); await AsyncStorage.setItem(DEVICE_ID_KEY, id); }
    return id;
  };
  const runSync = async () => {
    if (syncingRef.current || !recordsRef.current.some(isPending)) return;
    syncingRef.current = true; setSyncing(true); setSyncMessage('Syncing…');
    try {
      const result = await syncPending({ records: recordsRef.current, deviceId: await getDeviceId(), baseUrl: API_URL, fetchImpl: fetch });
      if (Object.keys(result.updated).length) {
        commitRecords(recordsRef.current.map((item) => result.updated[item.recordId] ?? item));
        await persistRecords();
      }
      if (result.error) setSyncMessage(`${result.error} (${API_URL})`);
      else if (result.rejected || result.deferred) setSyncMessage(`${result.synced} synced · ${result.rejected} need fixing${result.deferred ? ` · ${result.deferred} will retry` : ''}`);
      else setSyncMessage(`${result.synced} synced just now`);
    } catch { setSyncMessage('Sync failed. Records stay on this device.'); } finally { syncingRef.current = false; setSyncing(false); }
  };

  useEffect(() => {
    (async () => {
      const [draftValue, recordsValue] = await Promise.all([AsyncStorage.getItem(DRAFT_KEY), AsyncStorage.getItem(RECORDS_KEY)]);
      if (recordsValue) { try { commitRecords(JSON.parse(recordsValue)); } catch { commitRecords([]); } }
      if (draftValue) {
        try {
          const draft = JSON.parse(draftValue);
          Alert.alert('Unfinished record', 'You have an unfinished record. Resume it or discard it.', [
            { text: 'Discard', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem(DRAFT_KEY); setDraftLoaded(true); } },
            { text: 'Resume', onPress: () => { setRecord(draft); setDirty(true); setDraftLoaded(true); } },
          ], { cancelable: false });
        } catch { setDraftLoaded(true); }
      } else setDraftLoaded(true);
      runSync();
    })();
    return () => { if (watchRef.current) watchRef.current.remove(); if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const persistDraft = async (nextRecord) => { await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ ...nextRecord, status: 'draft' })); setSaveStatus('Draft saved automatically on this device'); };
  useEffect(() => { if (!draftLoaded || !dirty) return undefined; if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => persistDraft(record).catch(() => setSaveStatus('Could not autosave draft')), 600); return () => clearTimeout(debounceRef.current); }, [record, draftLoaded, dirty]);
  useEffect(() => { const subscription = AppState.addEventListener('change', (state) => { if (state === 'background' && dirty) persistDraft(record).catch(() => {}); }); return () => subscription.remove(); }, [record, dirty]);
  useEffect(() => { const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') runSync(); }); return () => subscription.remove(); }, []);

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
    const next = [...recordsRef.current.filter((item) => item.recordId !== saved.recordId), saved];
    commitRecords(next);
    await persistRecords(); await AsyncStorage.removeItem(DRAFT_KEY);
    setRecord(makeRecord()); setDirty(false); setSaveStatus('Record saved on this device · uploads when the server is reachable'); Keyboard.dismiss();
    Alert.alert('Saved on this device', warningFlags.length ? `Record saved with ${warningFlags.length} warning(s). It will upload when the server is reachable.` : 'Record is stored on this device and will upload when the server is reachable.');
    runSync();
  };

  const discardDraft = async () => Alert.alert('Discard draft?', 'All values in this unfinished record will be removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem(DRAFT_KEY); setRecord(makeRecord()); setDirty(false); setSaveStatus('Draft saves automatically'); } }]);
  const resetForNewRecord = () => { setRecord(makeRecord()); setDirty(false); setSaveStatus('Draft saves automatically'); setGpsStatus('Location not captured'); };
  const pendingCount = records.filter(isPending).length;

  // Loads a rejected record back into the form under the same record ID, so saving it
  // again resubmits it and the server replaces the rejected version.
  const loadForEditing = (item) => {
    const open = () => {
      const { rejectionReason, serverFlags, syncError, syncWarnings, syncedAt, validationFlags, savedAt, ...fields } = item;
      setRecord({ ...fields, status: 'draft' }); setDirty(true);
      setSaveStatus('Fix the issues, then save to resubmit this record.');
    };
    if (!dirty) { open(); return; }
    Alert.alert('Replace the current draft?', 'The unfinished record in the form will be replaced by the rejected record.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Load record', onPress: open }]);
  };

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

    <View style={styles.formSection}><SectionHeading number="04" title="Saved records" detail="Records are stored on this device first and upload when the server is reachable." />
      <View style={styles.syncRow}><Text style={styles.syncMessage}>{syncMessage}</Text><Pressable style={[styles.syncButton, (syncing || pendingCount === 0) && styles.syncButtonDisabled]} onPress={runSync} disabled={syncing || pendingCount === 0} accessibilityRole="button" accessibilityLabel="Sync now">{syncing ? <ActivityIndicator /> : <Text style={styles.syncButtonText}>SYNC NOW{pendingCount ? ` (${pendingCount})` : ''}</Text>}</Pressable></View>
      {records.length ? records.map((item) => <View key={item.recordId} style={styles.savedRecord}><View style={{ flex: 1 }}><Text style={styles.savedId}>{item.recordId}</Text><Text style={styles.savedMeta}>{item.state} · {item.lga} · {item.collectionDate}</Text>{item.status === 'rejected' && item.rejectionReason ? <Text style={styles.rejectedText}>{item.rejectionReason}</Text> : null}{item.status === 'pending_sync' && item.syncError ? <Text style={styles.savedMeta}>{item.syncError}</Text> : null}{item.syncWarnings?.length ? <Text style={styles.savedMeta}>Warnings: {item.syncWarnings.join(' ')}</Text> : null}{item.status === 'rejected' ? <Pressable onPress={() => loadForEditing(item)} accessibilityRole="button"><Text style={styles.fixLink}>FIX AND RESUBMIT</Text></Pressable> : null}</View><Text style={[styles.savedStatus, item.status === 'rejected' && styles.savedStatusRejected, item.status === 'synced' && styles.savedStatusSynced]}>{statusLabel(item.status)}</Text></View>) : <Text style={styles.emptyText}>No saved field records yet.</Text>}</View>

    <View style={styles.footer}><Text style={styles.saveStatus}>{saveStatus}</Text><Pressable style={styles.primaryButton} onPress={saveRecord}><Text style={styles.buttonText}>Save field record</Text><Text style={styles.buttonArrow}>→</Text></Pressable><Pressable style={styles.resetButton} onPress={discardDraft}><Text style={styles.resetText}>Discard this draft</Text></Pressable><Pressable style={styles.secondaryButton} onPress={resetForNewRecord}><Text style={styles.secondaryText}>Start a new blank record</Text></Pressable></View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f5f0' }, container: { paddingHorizontal: 22, paddingBottom: 36, maxWidth: 720, width: '100%', alignSelf: 'center' }, topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#dfe4dc' }, brand: { color: '#193f31', fontSize: 13, fontWeight: '900' }, brandLight: { color: '#778379', fontWeight: '600' }, offlineTag: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#e3eee4', paddingHorizontal: 10, paddingVertical: 7 }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#478659' }, offlineText: { color: '#356548', fontSize: 10, fontWeight: '800' },
  hero: { paddingTop: 27, paddingBottom: 25, borderBottomWidth: 1, borderColor: '#dfe4dc' }, eyebrow: { color: '#567663', fontSize: 10, fontWeight: '800' }, title: { color: '#172f26', fontSize: 34, fontWeight: '800', marginTop: 7 }, subtitle: { color: '#65736a', fontSize: 14, marginTop: 5 }, recordMeta: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12 }, recordMetaLabel: { color: '#7c887e', fontSize: 9, fontWeight: '800' }, id: { color: '#354a3d', fontSize: 11 }, formSection: { paddingVertical: 25, borderBottomWidth: 1, borderColor: '#dfe4dc' }, sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, marginBottom: 20 }, sectionNumber: { color: '#4a795d', fontSize: 11, fontWeight: '900', paddingTop: 3 }, sectionTitleGroup: { flex: 1 }, sectionTitle: { color: '#20392d', fontSize: 18, fontWeight: '800' }, sectionDetail: { color: '#758077', fontSize: 12, marginTop: 4 }, fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }, field: { width: '48.3%', marginBottom: 15 }, label: { color: '#39483d', fontWeight: '700', fontSize: 12, marginBottom: 7 }, required: { color: '#bb6048' }, input: { minHeight: 46, borderWidth: 1, borderColor: '#d5dcd3', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, color: '#25392f', fontSize: 14 }, inputDisabled: { backgroundColor: '#e9ede8' }, selectButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectText: { color: '#25392f', fontSize: 14, flex: 1 }, placeholderText: { color: '#8b948c', fontSize: 14, flex: 1 }, chevron: { color: '#557060', fontSize: 18 },
  locationButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8eee6', minHeight: 66, paddingHorizontal: 12, marginTop: 1 }, locationMark: { width: 37, height: 37, backgroundColor: '#28523d', alignItems: 'center', justifyContent: 'center' }, locationMarkText: { color: '#fff', fontSize: 9, fontWeight: '900' }, locationCopy: { flex: 1, marginLeft: 11 }, locationTitle: { color: '#294334', fontSize: 13, fontWeight: '800' }, locationDetail: { color: '#68786b', fontSize: 11, marginTop: 4 }, locationAction: { color: '#426d50', fontSize: 9, fontWeight: '900', marginLeft: 8 }, coordinates: { color: '#647269', fontSize: 10, marginTop: 8 }, distanceText: { color: '#68786b', fontSize: 11, marginTop: 8 }, warningBox: { backgroundColor: '#f7eee3', padding: 11, marginTop: 10 }, warningTitle: { color: '#7a5b32', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }, warningText: { color: '#765c3a', fontSize: 12, marginTop: 4, lineHeight: 17 },
  countGrid: { flexDirection: 'row', justifyContent: 'space-between' }, result: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#e5eee4', paddingHorizontal: 15, paddingVertical: 13, marginBottom: 16 }, resultAlert: { backgroundColor: '#f6e9e2' }, resultLabel: { color: '#54705b', fontSize: 9, fontWeight: '900' }, classification: { color: '#415b48', fontSize: 12, fontWeight: '700', marginTop: 5 }, resultValue: { color: '#234b34', fontSize: 28, fontWeight: '800' }, segmented: { flexDirection: 'row', backgroundColor: '#e6eae3', marginBottom: 15 }, segment: { flex: 1, paddingVertical: 12, alignItems: 'center' }, segmentSelected: { backgroundColor: '#28523d' }, segmentText: { color: '#667268', fontWeight: '700', fontSize: 12 }, segmentTextSelected: { color: '#fff' }, toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 }, toggleCopy: { flex: 1 }, toggleHint: { color: '#7a847c', fontSize: 11, marginTop: 3 }, switchTrack: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#d5dcd4', padding: 3 }, switchTrackOn: { backgroundColor: '#4d8060' }, switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }, switchThumbOn: { transform: [{ translateX: 20 }] },
  blockBox: { backgroundColor: '#f8e7e3', padding: 14, marginTop: 20 }, blockTitle: { color: '#8b4436', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }, blockText: { color: '#75493f', fontSize: 12, marginTop: 6, lineHeight: 17 }, warningSummary: { backgroundColor: '#f7eee3', padding: 14, marginTop: 12 }, savedRecord: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#e0e5de' }, savedId: { color: '#354a3d', fontSize: 10, fontWeight: '800' }, savedMeta: { color: '#7a847c', fontSize: 10, marginTop: 3 }, savedStatus: { color: '#557060', fontSize: 9, fontWeight: '900' }, emptyText: { color: '#7a847c', fontSize: 12 }, footer: { paddingTop: 25 }, saveStatus: { color: '#6f7b72', fontSize: 11, marginBottom: 10 }, primaryButton: { minHeight: 52, backgroundColor: '#244c38', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17 }, buttonText: { color: '#fff', fontSize: 13, fontWeight: '800' }, buttonArrow: { color: '#dfece2', fontSize: 20 }, resetButton: { alignItems: 'center', paddingVertical: 14 }, resetText: { color: '#8c4b40', fontSize: 11, fontWeight: '800' }, secondaryButton: { alignItems: 'center', paddingVertical: 10 }, secondaryText: { color: '#4c6d59', fontSize: 11, fontWeight: '800' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 }, modalCard: { backgroundColor: '#fff', maxHeight: '75%', padding: 18 }, modalTitle: { color: '#20392d', fontSize: 18, fontWeight: '800', marginBottom: 10 }, option: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#edf0eb' }, optionText: { color: '#304338', fontSize: 14 },
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }, syncMessage: { flex: 1, color: '#68786b', fontSize: 11, lineHeight: 16 }, syncButton: { minWidth: 112, minHeight: 38, backgroundColor: '#28523d', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, syncButtonDisabled: { backgroundColor: '#b9c4bb' }, syncButtonText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  rejectedText: { color: '#8b4436', fontSize: 11, marginTop: 4, lineHeight: 16 }, fixLink: { color: '#426d50', fontSize: 10, fontWeight: '900', marginTop: 8 }, savedStatusRejected: { color: '#8b4436' }, savedStatusSynced: { color: '#2f7a4a' },
});
