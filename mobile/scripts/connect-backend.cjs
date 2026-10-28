const fs = require('node:fs');
const path = require('node:path');

const appPath = path.join(__dirname, '..', 'App.js');
let source = fs.readFileSync(appPath, 'utf8');

if (!source.includes("from './src/apiSync.js'")) {
  source = source.replace(
    "import DateTimePicker from '@react-native-community/datetimepicker';",
    "import DateTimePicker from '@react-native-community/datetimepicker';\nimport { syncPendingRecords, checkBackendHealth } from './src/apiSync.js';"
  );
}

const marker = "  const persistDraft = async (nextRecord) =>";
const syncBlock = `  const runBackendSync = async () => {\n    try {\n      await checkBackendHealth();\n      const result = await syncPendingRecords();\n      if (result.attempted > 0) {\n        const refreshed = await AsyncStorage.getItem(RECORDS_KEY);\n        if (refreshed) setRecords(JSON.parse(refreshed));\n        setSaveStatus(result.rejected > 0 ? 'Some records were rejected by the backend' : 'Records synced to backend');\n      }\n    } catch {\n      setSaveStatus('Offline · records remain safely on this device');\n    }\n  };\n\n  useEffect(() => {\n    runBackendSync();\n    const subscription = AppState.addEventListener('change', (state) => {\n      if (state === 'active') runBackendSync();\n    });\n    const timer = setInterval(runBackendSync, 30000);\n    return () => { subscription.remove(); clearInterval(timer); };\n  }, []);\n\n`;

if (!source.includes('const runBackendSync = async () =>')) {
  const index = source.indexOf(marker);
  if (index === -1) throw new Error('Could not find the App.js draft persistence section.');
  source = source.slice(0, index) + syncBlock + source.slice(index);
}

fs.writeFileSync(appPath, source, 'utf8');
console.log('Backend sync wiring applied to mobile/App.js.');
