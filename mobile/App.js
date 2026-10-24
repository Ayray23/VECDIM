import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const DRAFT_KEY = '@vecdim/draft-v1';

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  const [gpsStatus, setGpsStatus] = useState('Not captured');

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

  const update = (field, value) => setRecord((current) => ({ ...current, [field]: value }));

  const captureGps = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setGpsStatus('Location permission denied');
      return;
    }

    setGpsStatus('Capturing...');
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    update('latitude', String(position.coords.latitude));
    update('longitude', String(position.coords.longitude));
    update('gpsAccuracyM', String(position.coords.accuracy ?? ''));
    setGpsStatus(`Captured (${Math.round(position.coords.accuracy ?? 0)}m accuracy)`);
  };

  const saveRecord = () => {
    if (!record.state || !record.lga || !record.ward || !record.species || !record.insecticide) {
      Alert.alert('Incomplete record', 'State, LGA, Ward, species and insecticide are required.');
      return;
    }
    Alert.alert('Draft ready', 'The record is stored locally. Sync will be implemented in the next stage.');
  };

  const resetDraft = async () => {
    await AsyncStorage.removeItem(DRAFT_KEY);
    setRecord({
      recordId: makeId(), state: '', lga: '', ward: '',
      collectionDate: new Date().toISOString().slice(0, 10), species: '', insecticide: '',
      exposed: '', dead: '', larvalDensity: '', urban: '', irsCovered: false,
      itnUsePercent: '', latitude: '', longitude: '', gpsAccuracyM: '',
    });
    setGpsStatus('Not captured');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>VECDIM FIELD</Text>
        <Text style={styles.title}>New field observation</Text>
        <Text style={styles.subtitle}>Stage 1 mobile foundation · offline draft enabled</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Record ID</Text>
          <Text style={styles.id}>{record.recordId}</Text>

          {[
            ['state', 'State'], ['lga', 'LGA'], ['ward', 'Ward'],
            ['collectionDate', 'Collection date (YYYY-MM-DD)'],
            ['species', 'Mosquito species'], ['insecticide', 'Insecticide'],
            ['exposed', 'Mosquitoes exposed'], ['dead', 'Mosquitoes dead'],
            ['larvalDensity', 'Larval density'], ['urban', 'Urban / Rural'],
            ['itnUsePercent', 'ITN use %'],
          ].map(([field, label]) => (
            <View key={field} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                value={record[field]}
                onChangeText={(value) => update(field, value)}
                keyboardType={['exposed', 'dead', 'larvalDensity', 'itnUsePercent'].includes(field) ? 'numeric' : 'default'}
                style={styles.input}
                placeholder={`Enter ${label.toLowerCase()}`}
              />
            </View>
          ))}

          <View style={styles.result}>
            <Text style={styles.label}>Mortality</Text>
            <Text style={styles.resultValue}>{mortality === null ? '—' : `${mortality}%`}</Text>
            <Text>{classification}</Text>
          </View>

          <Pressable style={styles.secondaryButton} onPress={captureGps}>
            <Text style={styles.buttonText}>{gpsStatus}</Text>
          </Pressable>

          <Text style={styles.gpsText}>Latitude: {record.latitude || '—'}</Text>
          <Text style={styles.gpsText}>Longitude: {record.longitude || '—'}</Text>
          <Text style={styles.gpsText}>Accuracy: {record.gpsAccuracyM ? `${record.gpsAccuracyM}m` : '—'}</Text>

          <Pressable style={styles.primaryButton} onPress={saveRecord}>
            <Text style={styles.buttonText}>Save locally</Text>
          </Pressable>
          <Pressable style={styles.resetButton} onPress={resetDraft}>
            <Text>Discard draft</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7f4' },
  container: { padding: 20, paddingBottom: 48 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 6 },
  subtitle: { color: '#5d665f', marginTop: 4, marginBottom: 18 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  field: { marginBottom: 14 },
  label: { fontWeight: '700', marginBottom: 6 },
  id: { fontSize: 12, color: '#5d665f', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#d7ddd8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  result: { padding: 14, borderRadius: 12, backgroundColor: '#eef4ed', marginBottom: 14 },
  resultValue: { fontSize: 25, fontWeight: '800', marginBottom: 3 },
  secondaryButton: { backgroundColor: '#39483c', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  primaryButton: { backgroundColor: '#1e5b36', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 14 },
  resetButton: { padding: 14, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '700' },
  gpsText: { color: '#5d665f', marginTop: 3 },
});
