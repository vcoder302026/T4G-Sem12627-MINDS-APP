// The registration form's other questions (after name, birthday, email, phone
// and Telegram), as MINDS's Google Form asks them. The list comes from the
// server (Config.gs → REGISTRATION, action registrationForm), so changing the
// form needs no app code. Used by Register and Edit my details.
//
//   questionSections(form, values)   coloured sections with one control per question
//   readAnswers(form, fields)        { answers, problem } from the controls

import { el, isEmail, PHONE_HINT, section, sgPhone } from '../ui.js';

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

// Typed answers: the keyboard to show on phones, and a quick check (the server checks too).
const INPUTS = {
  email: { type: 'email', inputmode: 'email', autocapitalize: 'none' },
  phone: { type: 'tel', inputmode: 'tel' },
  year: { inputmode: 'numeric', maxlength: 4 },
  nric4: { autocapitalize: 'characters', maxlength: 4 },
  matric: { autocapitalize: 'characters', maxlength: 12 },
};
const THIS_YEAR = new Date().getFullYear();
const CHECKS = {
  email: (v) => (isEmail(v) ? '' : 'should look like name@example.com.'),
  phone: (v) => (sgPhone(v) ? '' : PHONE_HINT),
  year: (v) => (/^\d{4}$/.test(v) && Number(v) >= 1970 && Number(v) <= THIS_YEAR ? '' : `a year like ${THIS_YEAR}.`),
  nric4: (v) => (/^\d{3}[A-Za-z]$/.test(v.replace(/\s/g, '')) ? '' : 'should be 3 digits and a letter.'),
  matric: (v) => (/^[A-Za-z0-9]{5,12}$/.test(v.replace(/\s/g, '')) ? '' : 'letters and numbers only, e.g. U2312345A.'),
};

/** Whether a question is asked, given the current answers (showIf, e.g. the RSPID-only questions). */
function applies(f, answerOf) {
  if (!f.showIf) return true;
  return String(answerOf(f.showIf.key) || '').toLowerCase().startsWith(String(f.showIf.startsWith).toLowerCase());
}
const privateNote = () => null; // private questions are still only shown to the volunteer and admins

function questionControl(f, value) {
  const id = `f-${nameOf(f)}`;
  if (f.type === 'choice' || f.type === 'multi' || f.type === 'yesno') {
    return el('fieldset', {},
      el('legend', { class: 'label' }, f.label, optional(f), f.type === 'multi' ? el('span', { class: 'font-normal text-slate-400' }, ' (tick all that apply)') : null),
      choiceControl(f, value),
      f.hint ? el('p', { class: 'hint' }, f.hint) : null,
      privateNote(f));
  }
  const control = f.type === 'textarea'
    ? el('textarea', { id, name: nameOf(f), class: 'input min-h-[90px]', rows: 3, maxlength: 5000 })
    : el('input', { id, name: nameOf(f), class: 'input', maxlength: 200, placeholder: f.placeholder || null, ...(INPUTS[f.type] || {}) });
  control.value = value || '';
  if (f.type === 'phone') control.addEventListener('blur', () => { const n = sgPhone(control.value); if (n) control.value = n; });
  if (f.type === 'nric4' || f.type === 'matric') control.addEventListener('blur', () => { control.value = control.value.replace(/\s/g, '').toUpperCase(); });
  return el('div', {},
    el('label', { class: 'label', for: id }, f.label, optional(f)),
    control,
    f.hint ? el('p', { class: 'hint' }, f.hint) : null,
    privateNote(f));
}

/**
 * Shows or hides the questions that depend on another answer (showIf), now and
 * whenever that answer changes. Call once the sections are in the form.
 */
export function wireConditions(formEl, fields) {
  const conditional = (fields || []).filter((f) => f.showIf);
  if (!conditional.length) return;
  const answerOf = (key) => {
    const picked = formEl.querySelector(`input[name="q-${key}"]:checked`);
    if (picked) return picked.value;
    const input = formEl.querySelector(`[name="q-${key}"]:not([type=radio]):not([type=checkbox])`);
    return input ? input.value : '';
  };
  const update = () => conditional.forEach((f) => {
    const box = formEl.querySelector(`[data-question="${f.key}"]`);
    if (box) box.hidden = !applies(f, answerOf);
  });
  formEl.addEventListener('change', update);
  update();
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
  return groups.map((g, i) => section(g.title, TONES[i % TONES.length], g.fields.map((f) => {
    const box = questionControl(f, values[f.key]);
    box.dataset.question = f.key; // wireConditions shows or hides it
    return box;
  })));
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
    const box = formEl.querySelector(`[data-question="${f.key}"]`);
    if (box && box.hidden) {
      answers[f.key] = ''; // not asked (e.g. RSPID-only questions for West End)
      return;
    }
    answers[f.key] = value;
    if (!problem && f.required && (Array.isArray(value) ? !value.length : !value)) problem = `Please answer: ${f.label}`;
    const check = CHECKS[f.type];
    if (!problem && check && value) {
      const why = check(String(value));
      if (why) problem = `${f.label}: ${why}`;
    }
  });
  return { answers, problem };
}

/** The same answer as stored ("A, B"), to tell whether it changed. */
export const answerText = (v) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).trim();
