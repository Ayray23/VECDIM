
import { Platform } from 'react-native';

// Physical Android phone: replace with your computer's IPv4 address.
// Android emulator: use http://10.0.2.2:4000
// Web/browser on the computer: use http://localhost:4000
// const API_BASE_URL =
//   Platform.OS === 'android'
//     ? 'http://YOUR_COMPUTER_IP:4000/api'
//     : 'http://localhost:4000/api';

    const API_BASE_URL = 'http://10.143.115.204:4000/api';
export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || `API request failed: ${response.status}`
    );
  }

  return data;
}

export async function checkBackend() {
  const response = await fetch(
    `${API_BASE_URL.replace(/\/api$/, '')}/health`
  );

  if (!response.ok) {
    throw new Error('Backend health check failed');
  }

  return response.json();
}
