// After deploying the Apps Script (Deploy → New deployment → Web app), paste the
// Web app URL here. It ends in /exec. Pages served over plain http (the local
// mock server, `npm run dev`) talk to the mock API instead.
const DEPLOYED_API_URL = 'https://script.google.com/macros/s/PASTE_YOUR_DEPLOYMENT_ID_HERE/exec';

const isLocal = location.protocol === 'http:' || ['localhost', '127.0.0.1'].includes(location.hostname);
let override = null;
try {
  override = localStorage.getItem('minds.apiUrl'); // lets you point a local copy at the real API
} catch {
  // storage unavailable; ignore
}

export const CONFIG = {
  API_URL: override || (isLocal ? '/api' : DEPLOYED_API_URL),
  REQUEST_TIMEOUT_MS: 30000,
  // Pinned versions; each list is tried in order if a CDN is unreachable.
  LIBS: {
    qrcode: [
      'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
      'https://unpkg.com/qrcode-generator@1.4.4/qrcode.js',
    ],
    scanner: [
      'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
      'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    ],
  },
};
