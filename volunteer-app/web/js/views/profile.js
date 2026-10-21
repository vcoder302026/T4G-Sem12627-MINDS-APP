// Editing a person's details: volunteers edit their own (Me → Edit my details),
// admins edit anyone from Admin → Volunteers (admin/js/views/people.js).

import { call } from '../api.js';
import {
  backLink, badge, busy, el, errorBlock, field, fmtDay, fmtHours, formData, icon, initials, isEmail, loading, mount, PHONE_HINT, section, sgPhone, toast, todaySG,
} from '../ui.js';

const FIELDS = ['name', 'birthday', 'email', 'phone', 'telegram']; // no emergency contact: MINDS only needs Telegram

const REQUIRED = {
  name: 'Enter a full name.',
  birthday: 'Enter a birthday.',
  email: 'Enter an email.',
  phone: 'Enter a phone number.',
};

/**
 * The registration fields, filled in with a person's current details.
 * Returns { form, changes() } where changes() lists only the edited fields.
 */
function detailsForm(person, { self, submit, extra }) {
  const error = el('div', { class: 'alert alert-error', role: 'alert', hidden: true });
  const passwordBox = self ? el('div', { hidden: true },
    field('currentPassword', 'Current password', {
      type: 'password', autocomplete: 'current-password',
      hint: 'Needed because you sign in with your email. Your password stays the same.',
    })) : null;
  const form = el('form', { novalidate: true, class: 'space-y-6' },
    error,
    section(self ? 'About you' : 'Details', 'blue',
      field('name', 'Full name', { autocomplete: self ? 'name' : 'off', value: person.name }),
      field('birthday', 'Birthday', { type: 'date', max: todaySG(), value: person.birthday }),
      field('email', 'Email', {
        type: 'email', inputmode: 'email', autocomplete: self ? 'email' : 'off', value: person.email,
        hint: self ? 'You sign in with this email.' : 'They sign in with this email. Let them know if you change it.',
      }),
      passwordBox,
      field('phone', 'Phone', { type: 'tel', inputmode: 'tel', value: person.phone, placeholder: '+65 91234567', hint: PHONE_HINT }),
      field('telegram', 'Telegram handle', { optional: true, autocapitalize: 'none', value: person.telegram ? `@${person.telegram}` : '', placeholder: '@yourhandle' })),
    extra || null,
    submit);

  if (passwordBox) {
    form.email.addEventListener('input', () => {
      passwordBox.hidden = form.email.value.trim().toLowerCase() === String(person.email || '').toLowerCase();
    });
  }

  const normal = (key, value) => {
    const v = String(value ?? '').trim();
    if (key === 'telegram') return v.replace(/^@/, '');
    if (key === 'email') return v.toLowerCase();
    if (key === 'phone') return sgPhone(v) || v; // "9123 4567" is the same number as "+65 91234567"
    return v;
  };
  const changes = () => {
    const d = formData(form);
    const missing = Object.keys(REQUIRED).find((k) => !d[k]);
    if (missing) throw new Error(REQUIRED[missing]);
    if (!isEmail(d.email)) throw new Error('Check the email address: it should look like name@example.com.');
    if (!sgPhone(d.phone)) throw new Error(`Phone: ${PHONE_HINT}`);
    const out = {};
    FIELDS.forEach((k) => {
      if (normal(k, d[k]) !== normal(k, person[k])) out[k] = d[k] || '';
    });
    if (out.email && self) {
      if (!form.currentPassword.value) throw new Error('Enter your current password to change your email.');
      out.currentPassword = form.currentPassword.value;
    }
    return out;
  };
  const showError = (message) => {
    error.textContent = message;
    error.hidden = !message;
    if (message) error.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  return { form, changes, showError };
}

/* ---------------- everyone: editing their own details ---------------- */

export function renderEditMe(root, app, ctx) {
  const draw = (person) => {
    const save = el('button', { type: 'submit', class: 'btn btn-primary flex-1' }, 'Save changes');
    const bar = el('div', { class: 'action-bar' }, el('div', { class: 'mx-auto flex max-w-2xl gap-3' },
      el('a', { href: '#/me', class: 'btn btn-secondary' }, 'Cancel'), save));
    const { form, changes, showError } = detailsForm(person, { self: true, submit: bar });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      showError('');
      let payload;
      try {
        payload = changes();
      } catch (err) {
        showError(err.message);
        return;
      }
      if (!Object.keys(payload).length) {
        toast('Nothing has changed.', 'warn');
        return;
      }
      busy(save, 'Saving…', async () => {
        try {
          const res = await call('updateProfile', payload);
          app.updateUser(res.user);
          toast(res.message);
          app.go('#/me');
        } catch (err) {
          showError(err.message);
        }
      });
    });
    mount(root,
      backLink('#/me', 'Me'),
      el('h1', { class: 'page-title' }, 'Edit my details'),
      el('p', { class: 'mb-6 mt-1 muted' }, 'Keep these up to date so admins can reach you on the day.'),
      form,
      el('div', { class: 'h-24' }));
  };

  if (app.user) draw(app.user);
  else mount(root, loading());
  return call('me').then((res) => {
    if (!ctx.alive()) return;
    app.updateUser(res.user);
    if (!root.contains(document.activeElement)) draw(res.user); // don't redraw under someone typing
  }).catch((err) => { if (ctx.alive() && !app.user) mount(root, errorBlock(err, () => app.rerender())); });
}
