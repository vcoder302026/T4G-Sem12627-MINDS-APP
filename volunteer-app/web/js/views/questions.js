// The registration form's other questions (after name, birthday, email, phone
// and Telegram), as MINDS's Google Form asks them. The list comes from the
// server (Config.gs → REGISTRATION, action registrationForm), so changing the
// form needs no app code. Used by Register and Edit my details.
//
//   questionSections(form, values)   coloured sections with one control per question
//   readAnswers(form, fields)        { answers, problem } from the controls

import { el, section } from '../ui.js';

const TONES = ['blue', 'green', 'purple', 'indigo'];
const OTHER = 'Other';

const nameOf = (f) => `q-${f.key}`;

function optional(f) {
  return f.required ? null : el('span', { class: 'font-normal text-slate-400' }, ' (optional)');
}

/** A choice (one), multi (several) or yes/no question as tappable rows; "Other" gets a box to type in. */
function choiceControl(f, value) {
  const multi = f.type === 'multi';
  const current = multi ? String(value || '').split(/\s*,\s*/).filter(Boolean) : [String(value || '')].filter(Boolean);
  const known = f.options.filter((o) => o !== OTHER);
  const otherText = current.filter((v) => !known.some((o) => o.toLowerCase() === v.toLowerCase())).join(', ');
  const otherBox = f.options.includes(OTHER)
    ? el('input', { type: 'text', name: `${nameOf(f)}-other`, class: 'input mt-1', placeholder: 'Please say', value: otherText, 'aria-label': `${f.label}: other`, hidden: !otherText })
    : null;
  const rows = f.options.map((o) => {
    const checked = o === OTHER ? Boolean(otherText) : current.some((v) => v.toLowerCase() === o.toLowerCase());
    const input = el('input', { type: multi ? 'checkbox' : 'radio', name: nameOf(f), value: o, checked });
    if (otherBox) {
      input.addEventListener('change', () => {
        const otherOn = input.form ? [...input.form.querySelectorAll(`input[name="${nameOf(f)}"]`)].some((x) => x.value === OTHER && x.checked) : false;
        otherBox.hidden = !otherOn;
        if (otherOn && o === OTHER) otherBox.focus();
      });
    }
    return el('label', { class: 'share-opt' }, input, el('span', { class: 'text-sm font-bold' }, o));
  });
  return el('div', { class: f.type === 'yesno' ? 'grid grid-cols-2 gap-2' : 'grid gap-2 sm:grid-cols-2' }, rows, otherBox ? el('div', { class: 'sm:col-span-2' }, otherBox) : null);
}

function questionControl(f, value) {
  const id = `f-${nameOf(f)}`;
  if (f.type === 'choice' || f.type === 'multi' || f.type === 'yesno') {
    return el('fieldset', {},
      el('legend', { class: 'label' }, f.label, optional(f), f.type === 'multi' ? el('span', { class: 'font-normal text-slate-400' }, ' (tick all that apply)') : null),
      choiceControl(f, value),
      f.hint ? el('p', { class: 'hint' }, f.hint) : null);
  }
  const control = f.type === 'textarea'
    ? el('textarea', { id, name: nameOf(f), class: 'input min-h-[90px]', rows: 3, maxlength: 5000 })
    : el('input', { id, name: nameOf(f), class: 'input', maxlength: 200 });
  control.value = value || '';
  return el('div', {},
    el('label', { class: 'label', for: id }, f.label, optional(f)),
    control,
    f.hint ? el('p', { class: 'hint' }, f.hint) : null);
}

/**
 * One coloured section per form section, in the form's order.
 * values: { key: current answer } (Edit my details), or {} (Register).
 */
export function questionSections(form, values = {}) {
  if (!form || !form.fields || !form.fields.length) return [];
  const order = form.sections && form.sections.length ? form.sections : [...new Set(form.fields.map((f) => f.section))];
  const groups = order.map((title) => ({ title, fields: form.fields.filter((f) => (f.section || order[0]) === title) }))
    .concat([{ title: 'More about you', fields: form.fields.filter((f) => f.section && !order.includes(f.section)) }])
    .filter((g) => g.fields.length);
  return groups.map((g, i) => section(g.title, TONES[i % TONES.length], g.fields.map((f) => questionControl(f, values[f.key]))));
}

/** Reads every question. problem: the first unanswered required question, or ''. */
export function readAnswers(formEl, fields) {
  const answers = {};
  let problem = '';
  (fields || []).forEach((f) => {
    let value;
    if (f.type === 'choice' || f.type === 'multi' || f.type === 'yesno') {
      const picked = [...formEl.querySelectorAll(`input[name="${nameOf(f)}"]:checked`)].map((x) => x.value);
      const other = formEl.querySelector(`input[name="${nameOf(f)}-other"]`);
      const typed = other && !other.hidden ? other.value.trim() : '';
      const list = picked.map((v) => (v === OTHER ? typed : v)).filter(Boolean);
      value = f.type === 'multi' ? list : list[0] || '';
    } else {
      const input = formEl.querySelector(`[name="${nameOf(f)}"]`);
      value = input ? input.value.trim() : '';
    }
    answers[f.key] = value;
    if (!problem && f.required && (Array.isArray(value) ? !value.length : !value)) problem = `Please answer: ${f.label}`;
  });
  return { answers, problem };
}

/** The same answer as stored ("A, B"), to tell whether it changed. */
export const answerText = (v) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).trim();
