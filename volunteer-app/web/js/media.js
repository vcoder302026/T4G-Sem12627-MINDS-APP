// Photos, pictures and PDFs: shown from the private Drive folder through the
// API (getFile), and uploaded by admins. Photos are shrunk on the phone before
// upload (max 1280 px, JPEG), so they upload quickly on mobile data.

import { call } from './api.js';
import { el, initials, mount, toast } from './ui.js';

const cache = new Map(); // fileId → Promise<{ name, mimeType, data, url }>

/** Fetches a file once per page load. Resolves to { name, mimeType, url } (url is a data/blob URL). */
export function loadFile(fileId) {
  if (!fileId) return Promise.reject(new Error('No file.'));
  if (!cache.has(fileId)) {
    const p = call('getFile', { fileId }).then((f) => {
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: f.mimeType }));
      return { name: f.name, mimeType: f.mimeType, url };
    });
    p.catch(() => cache.delete(fileId));
    cache.set(fileId, p);
  }
  return cache.get(fileId);
}

export function forgetFile(fileId) {
  cache.delete(fileId);
}

/** Round photo (or initials while it loads / when there is none). */
export function photo(fileId, name, cls = 'size-14') {
  const shape = /\brounded-/.test(cls) ? '' : 'rounded-2xl';
  const box = el('span', { class: `inline-flex shrink-0 items-center justify-center overflow-hidden ${shape} bg-emerald-100 font-extrabold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 ${cls}` }, initials(name));
  if (fileId) {
    loadFile(fileId).then((f) => {
      mount(box, el('img', { src: f.url, alt: `Photo of ${name}`, class: 'size-full object-cover', loading: 'lazy' }));
    }).catch(() => {});
  }
  return box;
}

/** A picture from Drive as a full-width image. */
export function picture(fileId, alt) {
  const host = el('div', { class: 'flex min-h-24 items-center justify-center rounded-xl bg-slate-100 text-sm muted dark:bg-neutral-900' }, 'Loading picture…');
  loadFile(fileId).then((f) => {
    mount(host, el('img', { src: f.url, alt, class: 'w-full rounded-xl border border-slate-200 bg-white dark:border-neutral-800' }));
    host.className = '';
  }).catch((err) => { host.textContent = err.message; });
  return host;
}

/** Opens a PDF from Drive in a new tab. */
export async function openPdf(fileId) {
  const w = window.open('', '_blank'); // opened now, so the pop-up blocker allows it
  try {
    const f = await loadFile(fileId);
    if (w) w.location.href = f.url;
    else window.location.href = f.url;
  } catch (err) {
    if (w) w.close();
    toast(err.message, 'error');
  }
}

const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Could not read the file.'));
  r.readAsDataURL(blob);
});

async function shrinkImage(file, maxSide = 1280) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('This picture could not be opened.'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 600 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Lets an admin choose a file. Resolves to { name, mimeType, data (base64) }, or null if cancelled.
 * accept: e.g. 'image/*' or 'image/*,application/pdf'.
 */
export function chooseUpload(accept, maxMb = 5) {
  return new Promise((resolve, reject) => {
    const input = el('input', { type: 'file', accept, class: 'hidden' });
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) { resolve(null); return; }
      try {
        const ready = file.type.startsWith('image/') ? await shrinkImage(file) : file;
        if (ready.size > maxMb * 1024 * 1024) throw new Error(`That file is ${(ready.size / 1048576).toFixed(1)} MB. Files can be up to ${maxMb} MB.`);
        const dataUrl = await readAsDataUrl(ready);
        resolve({ name: ready.name || 'file', mimeType: ready.type, data: dataUrl.slice(dataUrl.indexOf(',') + 1) });
      } catch (err) {
        reject(err);
      }
    });
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });
    document.body.append(input);
    input.click();
  });
}
