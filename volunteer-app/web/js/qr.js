// Loads the two small third-party libraries on demand (with CDN fallbacks),
// draws a volunteer's QR code, and runs the admin's camera scanner.

import { CONFIG } from './config.js';

const pending = {};

export function loadScript(name) {
  if (pending[name]) return pending[name];
  const urls = CONFIG.LIBS[name];
  pending[name] = new Promise((resolve, reject) => {
    const tryUrl = (i) => {
      if (i >= urls.length) {
        delete pending[name];
        reject(new Error('Could not load the QR tools. Connect to the internet once so the app can save them.'));
        return;
      }
      const s = document.createElement('script');
      s.src = urls[i];
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        s.remove();
        tryUrl(i + 1);
      };
      document.head.appendChild(s);
    };
    tryUrl(0);
  });
  return pending[name];
}

/** Draws `text` as a QR code on a canvas, crisp at any size (quiet zone included). */
export async function drawQr(canvas, text, cssSize = 260) {
  await loadScript('qrcode');
  if (typeof window.qrcode !== 'function') throw new Error('QR library failed to start.');
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const quiet = 4;
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const cell = Math.max(2, Math.floor((cssSize * ratio) / (modules + quiet * 2)));
  const size = cell * (modules + quiet * 2);
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1d2b36';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    }
  }
}

// QR decoder used when the browser has no built-in one (e.g. iPhone Safari).
// Tried in order; the service worker caches it for offline scanning.
const DECODER_URLS = [
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js',
];
const decoderPending = {};
function loadDecoder() {
  if (!decoderPending.p) {
    decoderPending.p = new Promise((resolve, reject) => {
      const tryUrl = (i) => {
        if (i >= DECODER_URLS.length) {
          delete decoderPending.p;
          reject(new Error('Could not load the QR tools. Connect to the internet once so the app can save them.'));
          return;
        }
        const s = document.createElement('script');
        s.src = DECODER_URLS[i];
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { s.remove(); tryUrl(i + 1); };
        document.head.appendChild(s);
      };
      tryUrl(0);
    });
  }
  return decoderPending.p;
}

/** Returns decode(canvas) → text | null, using the fastest decoder available. */
async function makeDecoder() {
  try {
    if ('BarcodeDetector' in window) {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (canvas) => {
          const found = await detector.detect(canvas);
          return found.length ? found[0].rawValue : null;
        };
      }
    }
  } catch {
    // fall back to jsQR below
  }
  if (!window.jsQR) await loadDecoder();
  if (!window.jsQR) throw new Error('Scanner library failed to start.');
  return async (canvas) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hit = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    return hit ? hit.data : null;
  };
}

/** The square guide drawn over the camera picture. */
function guideFrame() {
  const frame = document.createElement('div');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, {
    position: 'absolute', top: '50%', left: '50%', height: '76%', aspectRatio: '1 / 1',
    transform: 'translate(-50%, -50%)', borderRadius: '20px', pointerEvents: 'none',
    boxShadow: '0 0 0 100vmax rgba(15, 23, 42, 0.38)',
  });
  const corner = (v, h) => {
    const c = document.createElement('div');
    Object.assign(c.style, {
      position: 'absolute', width: '22%', height: '22%', [v]: '0', [h]: '0',
      borderColor: '#fff', borderStyle: 'solid', borderWidth: '0',
      [`border${v[0].toUpperCase() + v.slice(1)}Width`]: '4px',
      [`border${h[0].toUpperCase() + h.slice(1)}Width`]: '4px',
      [`border${v[0].toUpperCase() + v.slice(1)}${h[0].toUpperCase() + h.slice(1)}Radius`]: '20px',
    });
    return c;
  };
  frame.append(corner('top', 'left'), corner('top', 'right'), corner('bottom', 'left'), corner('bottom', 'right'));
  return frame;
}

/**
 * Starts the rear camera inside the element with id `elementId` and calls
 * onCode(text) for each QR read. The same code is ignored for 4 seconds and
 * nothing is reported while the previous scan is still being saved.
 *
 * The camera fills the box and a square guide marks where to hold the pass.
 * Each frame is read twice over: the centre square at full camera resolution
 * (for a small pass, e.g. on a laptop screen a step away) and the whole picture
 * (for a pass held close that overflows the guide). So a pass on a phone or a
 * computer screen reads wherever it sits in view.
 */
export async function startScanner(elementId, onCode) {
  const box = document.getElementById(elementId);
  if (!box) throw new Error('The camera could not start. Reopen the Scan page and try again.');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('This browser cannot use the camera here. Open the app from its https:// link in Safari or Chrome.');
  }
  const decode = await makeDecoder();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (err) {
    const msg = String(err && (err.name || err.message || err));
    if (/NotAllowed|Permission|Security/i.test(msg)) throw new Error('Camera permission was blocked. Allow camera access for this site in your browser settings, then try again.');
    if (/NotFound|Overconstrained/i.test(msg)) throw new Error('No camera was found on this device.');
    throw new Error('The camera could not start. Close other apps using the camera and try again.');
  }

  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.muted = true;
  video.autoplay = true;
  Object.assign(video.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', display: 'block',
  });
  video.srcObject = stream;
  const frame = guideFrame();
  box.append(video, frame);
  try {
    await video.play();
  } catch {
    // iOS may need the stream to start first; the loop below waits for frames.
  }

  let last = { text: '', at: 0 };
  let working = false;
  const handle = async (text) => {
    if (working) return;
    const now = Date.now();
    if (text === last.text && now - last.at < 4000) return;
    last = { text, at: now };
    working = true;
    try {
      await onCode(text);
    } finally {
      working = false;
      last.at = Date.now();
    }
  };

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stopped = false;
  let timer = 0;
  let tick = 0;
  const readFrame = async () => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return null;
    tick += 1;
    if (tick % 2) {
      // Centre square, at up to 720 px: small or distant passes.
      const side = Math.round(Math.min(vw, vh) * 0.8);
      const out = Math.min(side, 720);
      canvas.width = out;
      canvas.height = out;
      ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, out, out);
    } else {
      // Whole picture, scaled to 640 px wide: passes held close.
      const scale = Math.min(1, 640 / Math.max(vw, vh));
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    return decode(canvas);
  };
  const loop = async () => {
    if (stopped) return;
    try {
      if (!working) {
        const text = await readFrame();
        if (text && !stopped) await handle(text);
      }
    } catch {
      // a frame that can't be read is skipped
    }
    if (!stopped) timer = setTimeout(loop, 100); // about 10 reads a second
  };
  loop();

  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      video.remove();
      frame.remove();
    },
  };
}
