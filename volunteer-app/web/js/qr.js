// Loads the two small third-party libraries on demand (with CDN fallbacks),
// draws a volunteer's QR code, and runs the leader's camera scanner.

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

/**
 * Starts the rear camera inside the element with id `elementId` and calls
 * onCode(text) for each QR read. The same code is ignored for 4 seconds and
 * nothing is reported while the previous scan is still being saved.
 */
export async function startScanner(elementId, onCode) {
  await loadScript('scanner');
  const { Html5Qrcode, Html5QrcodeSupportedFormats } = window;
  if (!Html5Qrcode) throw new Error('Scanner library failed to start.');
  const scanner = new Html5Qrcode(elementId, {
    verbose: false,
    formatsToSupport: Html5QrcodeSupportedFormats ? [Html5QrcodeSupportedFormats.QR_CODE] : undefined,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  });
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
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.72); return { width: s, height: s }; } },
      handle,
      () => {}
    );
  } catch (err) {
    const msg = String(err && (err.name || err.message || err));
    if (/NotAllowed|Permission/i.test(msg)) throw new Error('Camera permission was blocked. Allow camera access for this site in your browser settings, then try again.');
    if (/NotFound|Overconstrained/i.test(msg)) throw new Error('No camera was found on this device.');
    throw new Error('The camera could not start. Close other apps using the camera and try again.');
  }
  return {
    async stop() {
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        // already stopped
      }
    },
  };
}
