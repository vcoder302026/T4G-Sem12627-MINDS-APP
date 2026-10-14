// =====================================================================
// ENVIRONMENT CONFIGURATION (same convention as the other WERONE apps'
// backend/config.js). Change APP_ENVIRONMENT to switch builds:
//   "Exp"  = Experimentation (purple banner, Exp API)
//   "Dev"  = Testing (red banner, Exp API)
//   "Prod" = Production (no banner, Prod API)
// The GitHub Pages workflow can set these from repository variables.
// =====================================================================
const APP_ENVIRONMENT = 'Exp';

// Apps Script web app URLs (Deploy → Manage deployments → Web app URL, ends in /exec)
const EXP_API_URL = 'https://script.google.com/macros/s/PASTE_EXP_DEPLOYMENT_ID/exec';
const PROD_API_URL = 'https://script.google.com/macros/s/PASTE_PROD_DEPLOYMENT_ID/exec';

// Pages served over plain http (the local mock server, `npm run dev`) use the mock API.
const isLocal = location.protocol === 'http:' || ['localhost', '127.0.0.1'].includes(location.hostname);
let override = null;
try {
  override = localStorage.getItem('minds.apiUrl'); // point a local copy at a real API for debugging
} catch {
  // storage unavailable; ignore
}

export const CONFIG = {
  ENVIRONMENT: isLocal ? 'Dev' : APP_ENVIRONMENT,
  ENV_LABEL: isLocal ? 'Testing (local demo data)' : APP_ENVIRONMENT === 'Dev' ? 'Testing' : APP_ENVIRONMENT === 'Exp' ? 'Experimentation' : '',
  API_URL: override || (isLocal ? '/api' : APP_ENVIRONMENT === 'Prod' ? PROD_API_URL : EXP_API_URL),
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
