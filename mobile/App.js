import { useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const DRAFT_KEY = '@vecdim/draft-v1';

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function TextField({ label, value, onChangeText, placeholder, keyboardType = 'default', required = false }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={styles.input}
        placeholder={placeholder || `Enter ${label.toLowerCase()}`}
        placeholderTextColor="#8b948c"
        accessibilityLabel={label}
      />
    </View>
  );
}

function SectionHeading({ number, title, detail }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionNumber}>{number}</Text>
      <View style={styles.sectionTitleGroup}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionDetail}>{detail}</Text>
      </View>
    </View>
  );
}

export default function App() {
  const [record, setRecord] = useState(() => ({
    recordId: makeId(),
    state: '',
    lga: '',
    ward: '',
    collectionDate: new Date().toISOString().slice(0, 10),
    species: '',
    insecticide: '',
    exposed: '',
    dead: '',
    larvalDensity: '',
    urban: '',
    irsCovered: false,
    itnUsePercent: '',
    latitude: '',
    longitude: '',
    gpsAccuracyM: '',
  }));
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('Location not captured');
  const [saveStatus, setSaveStatus] = useState('Draft saves automatically');

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((value) => {
      if (!value) {
        setDraftLoaded(true);
        return;
      }
      try {
        setRecord(JSON.parse(value));
        setDraftLoaded(true);
      } catch {
        setDraftLoaded(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(record)).catch(() => {});
  }, [record, draftLoaded]);

  const mortality = useMemo(() => {
    const exposed = Number(record.exposed);
    const dead = Number(record.dead);
    if (!Number.isFinite(exposed) || exposed <= 0 || !Number.isFinite(dead)) return null;
    return Math.round((dead / exposed) * 1000) / 10;
  }, [record.exposed, record.dead]);

  const classification = mortality === null
    ? 'Not calculated'
    : mortality >= 98
      ? 'Susceptible'
      : mortality >= 90
        ? 'Possible resistance'
        : 'Resistant';

  const update = (field, value) => {
    setRecord((current) => ({ ...current, [field]: value }));
    setSaveStatus('Unsaved changes');
  };

  const captureGps = async () => {
    try {
      setGpsStatus('Capturing location...');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setGpsStatus('Location permission denied');
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      update('latitude', String(position.coords.latitude));
      update('longitude', String(position.coords.longitude));
      update('gpsAccuracyM', String(position.coords.accuracy ?? ''));
      setGpsStatus(`Captured · ${Math.round(position.coords.accuracy ?? 0)} m accuracy`);
    } catch {
      setGpsStatus('Could not capture location');
    }
  };

  const saveRecord = async () => {
    if (!record.state || !record.lga || !record.ward || !record.species || !record.insecticide) {
      Alert.alert('Incomplete record', 'State, LGA, Ward, species and insecticide are required.');
      return;
    }
    try {
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(record));
      setSaveStatus('Draft saved on this device');
      Keyboard.dismiss();
      Alert.alert('Draft saved', 'This record is stored on this device and can be completed later.');
    } catch {
      Alert.alert('Could not save draft', 'Check available device storage and try again.');
    }
  };

  const resetDraft = async () => {
    await AsyncStorage.removeItem(DRAFT_KEY);
    setRecord({
      recordId: makeId(), state: '', lga: '', ward: '',
      collectionDate: new Date().toISOString().slice(0, 10), species: '', insecticide: '',
      exposed: '', dead: '', larvalDensity: '', urban: '', irsCovered: false,
      itnUsePercent: '', latitude: '', longitude: '', gpsAccuracyM: '',
    });
    setGpsStatus('Location not captured');
    setSaveStatus('Draft saves automatically');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Text style={styles.brand}>VECDIM <Text style={styles.brandLight}>/ FIELD</Text></Text>
          <View style={styles.offlineTag}><View style={styles.statusDot} /><Text style={styles.offlineText}>OFFLINE READY</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>ENTOMOLOGY · FIELD FORM</Text>
          <Text style={styles.title}>New record</Text>
          <Text style={styles.subtitle}>Capture a collection and bioassay observation.</Text>
          <View style={styles.recordMeta}>
            <Text style={styles.recordMetaLabel}>RECORD ID</Text>
            <Text style={styles.id}>{record.recordId}</Text>
          </View>
        </View>

        <View style={styles.formSection}>
          <SectionHeading number="01" title="Collection site" detail="Where and when was the sample collected?" />
          <View style={styles.fieldGrid}>
            <TextField label="State" value={record.state} onChangeText={(value) => update('state', value)} required />
            <TextField label="LGA" value={record.lga} onChangeText={(value) => update('lga', value)} required />
            <TextField label="Ward" value={record.ward} onChangeText={(value) => update('ward', value)} required />
            <TextField label="Collection date" value={record.collectionDate} onChangeText={(value) => update('collectionDate', value)} placeholder="YYYY-MM-DD" />
          </View>
          <Pressable style={styles.locationButton} onPress={captureGps} accessibilityRole="button">
            <View style={styles.locationMark}><Text style={styles.locationMarkText}>GPS</Text></View>
            <View style={styles.locationCopy}>
              <Text style={styles.locationTitle}>{record.latitude ? 'Location attached' : 'Capture site location'}</Text>
              <Text style={styles.locationDetail}>{gpsStatus}</Text>
            </View>
            <Text style={styles.locationAction}>{record.latitude ? 'UPDATE' : 'CAPTURE'}</Text>
          </Pressable>
          {record.latitude ? (
            <Text style={styles.coordinates}>{record.latitude}, {record.longitude} · ±{record.gpsAccuracyM || '—'} m</Text>
          ) : null}
        </View>

        <View style={styles.formSection}>
          <SectionHeading number="02" title="Specimen & assay" detail="Record the test population and outcome." />
          <View style={styles.fieldGrid}>
            <TextField label="Mosquito species" value={record.species} onChangeText={(value) => update('species', value)} placeholder="e.g. Anopheles gambiae" required />
            <TextField label="Insecticide" value={record.insecticide} onChangeText={(value) => update('insecticide', value)} required />
          </View>
          <View style={styles.countGrid}>
            <TextField label="Exposed" value={record.exposed} onChangeText={(value) => update('exposed', value)} keyboardType="numeric" placeholder="Count" />
            <TextField label="Dead" value={record.dead} onChangeText={(value) => update('dead', value)} keyboardType="numeric" placeholder="Count" />
          </View>
          <View style={[styles.result, mortality !== null && mortality < 90 ? styles.resultAlert : null]}>
            <View>
              <Text style={styles.resultLabel}>BIOASSAY MORTALITY</Text>
              <Text style={styles.classification}>{classification}</Text>
            </View>
            <Text style={styles.resultValue}>{mortality === null ? '—' : `${mortality}%`}</Text>
          </View>
          <TextField label="Larval density" value={record.larvalDensity} onChangeText={(value) => update('larvalDensity', value)} keyboardType="numeric" placeholder="Enter count or density" />
        </View>

        <View style={styles.formSection}>
          <SectionHeading number="03" title="Site conditions" detail="Environmental and intervention context." />
          <Text style={styles.label}>Settlement type</Text>
          <View style={styles.segmented}>
            {['Urban', 'Rural'].map((option) => (
              <Pressable
                key={option}
                onPress={() => update('urban', option)}
                accessibilityRole="radio"
                accessibilityState={{ selected: record.urban === option }}
                style={[styles.segment, record.urban === option && styles.segmentSelected]}
              >
                <Text style={[styles.segmentText, record.urban === option && styles.segmentTextSelected]}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.fieldGrid}>
            <TextField label="ITN use (%)" value={record.itnUsePercent} onChangeText={(value) => update('itnUsePercent', value)} keyboardType="numeric" placeholder="0–100" />
          </View>
          <Pressable
            style={styles.toggleRow}
            onPress={() => update('irsCovered', !record.irsCovered)}
            accessibilityRole="switch"
            accessibilityState={{ checked: record.irsCovered }}
          >
            <View style={styles.toggleCopy}>
              <Text style={styles.label}>Indoor residual spraying</Text>
              <Text style={styles.toggleHint}>Was the area covered by IRS?</Text>
            </View>
            <View style={[styles.switchTrack, record.irsCovered && styles.switchTrackOn]}>
              <View style={[styles.switchThumb, record.irsCovered && styles.switchThumbOn]} />
            </View>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.saveStatus}>{saveStatus}</Text>
          <Pressable style={styles.primaryButton} onPress={saveRecord} accessibilityRole="button">
            <Text style={styles.buttonText}>Save field record</Text>
            <Text style={styles.buttonArrow}>→</Text>
          </Pressable>
          <Pressable style={styles.resetButton} onPress={resetDraft}>
            <Text style={styles.resetText}>Discard this draft</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f5f0' },
  container: { paddingHorizontal: 22, paddingBottom: 36, maxWidth: 720, width: '100%', alignSelf: 'center' },
  topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#dfe4dc' },
  brand: { color: '#193f31', fontSize: 13, fontWeight: '900', letterSpacing: 0 },
  brandLight: { color: '#778379', fontWeight: '600' },
  offlineTag: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#e3eee4', paddingHorizontal: 10, paddingVertical: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#478659' },
  offlineText: { color: '#356548', fontSize: 10, fontWeight: '800' },
  hero: { paddingTop: 27, paddingBottom: 25, borderBottomWidth: 1, borderColor: '#dfe4dc' },
  eyebrow: { color: '#567663', fontSize: 10, fontWeight: '800' },
  title: { color: '#172f26', fontSize: 34, fontWeight: '800', marginTop: 7 },
  subtitle: { color: '#65736a', fontSize: 14, marginTop: 5 },
  recordMeta: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12 },
  recordMetaLabel: { color: '#7c887e', fontSize: 9, fontWeight: '800' },
  id: { color: '#354a3d', fontSize: 11, fontVariant: ['tabular-nums'] },
  formSection: { paddingVertical: 25, borderBottomWidth: 1, borderColor: '#dfe4dc' },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, marginBottom: 20 },
  sectionNumber: { color: '#4a795d', fontSize: 11, fontWeight: '900', paddingTop: 3 },
  sectionTitleGroup: { flex: 1 },
  sectionTitle: { color: '#20392d', fontSize: 18, fontWeight: '800' },
  sectionDetail: { color: '#758077', fontSize: 12, marginTop: 4 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  field: { width: '48.3%', marginBottom: 15 },
  label: { color: '#39483d', fontWeight: '700', fontSize: 12, marginBottom: 7 },
  required: { color: '#bb6048' },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#d5dcd3', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, color: '#25392f', fontSize: 14 },
  locationButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8eee6', minHeight: 66, paddingHorizontal: 12, marginTop: 1 },
  locationMark: { width: 37, height: 37, backgroundColor: '#28523d', alignItems: 'center', justifyContent: 'center' },
  locationMarkText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  locationCopy: { flex: 1, marginLeft: 11 },
  locationTitle: { color: '#294334', fontSize: 13, fontWeight: '800' },
  locationDetail: { color: '#68786b', fontSize: 11, marginTop: 4 },
  locationAction: { color: '#426d50', fontSize: 9, fontWeight: '900', marginLeft: 8 },
  coordinates: { color: '#647269', fontSize: 10, marginTop: 8 },
  countGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  result: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#e5eee4', paddingHorizontal: 15, paddingVertical: 13, marginBottom: 16 },
  resultAlert: { backgroundColor: '#f6e9e2' },
  resultLabel: { color: '#54705b', fontSize: 9, fontWeight: '900' },
  classification: { color: '#415b48', fontSize: 12, fontWeight: '700', marginTop: 5 },
  resultValue: { color: '#234b34', fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  segmented: { flexDirection: 'row', backgroundColor: '#e6eae3', padding: 3, marginBottom: 18 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: '#28523d' },
  segmentText: { color: '#58665a', fontSize: 13, fontWeight: '700' },
  segmentTextSelected: { color: '#fff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9 },
  toggleCopy: { flex: 1 },
  toggleHint: { color: '#758077', fontSize: 11, marginTop: 1 },
  switchTrack: { width: 44, height: 25, borderRadius: 13, backgroundColor: '#d4dbd2', padding: 3, justifyContent: 'center' },
  switchTrackOn: { backgroundColor: '#478659' },
  switchThumb: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#fff' },
  switchThumbOn: { alignSelf: 'flex-end' },
  footer: { paddingTop: 20 },
  saveStatus: { color: '#748076', fontSize: 11, marginBottom: 10 },
  primaryButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#24523a' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  buttonArrow: { color: '#c4dfbd', fontSize: 20, fontWeight: '700', marginLeft: 10, marginTop: -2 },
  resetButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  resetText: { color: '#8b5e51', fontSize: 12, fontWeight: '700' },
});
