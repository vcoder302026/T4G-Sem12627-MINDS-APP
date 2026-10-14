// Sign-in and registration screens.

import { call } from '../api.js';
import { busy, el, formData, mount, todaySG } from '../ui.js';

function brandHeader(subtitle) {
  return el('div', { class: 'mb-6 mt-6' },
    el('img', { src: 'icons/icon-192.png', alt: '', class: 'mb-4 size-14 rounded-2xl' }),
    el('h1', { class: 'text-3xl font-bold leading-tight' }, 'MINDS Volunteers'),
    el('p', { class: 'mt-1 text-ink-soft' }, subtitle));
}

function input(name, label, attrs = {}) {
  const id = `f-${name}`;
  return el('div', { class: 'mb-4' },
    el('label', { class: 'label', for: id }, label, attrs.required ? null : el('span', { class: 'font-normal text-ink-soft' }, ' (optional)')),
    el('input', { id, name, class: 'field', ...attrs }),
    attrs.hint ? el('p', { class: 'mt-1 text-sm text-ink-soft' }, attrs.hint) : null);
}

function formError() {
  return el('p', { class: 'mb-4 rounded-lg bg-stop-tint p-3 font-bold text-stop', role: 'alert', hidden: true });
}

export function renderLogin(root, app) {
  const error = formError();
  const submit = el('button', { type: 'submit', class: 'btn btn-go w-full' }, 'Sign in');
  const form = el('form', {
    novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      error.hidden = true;
      const data = formData(form);
      if (!data.email || !data.password) {
        error.textContent = 'Enter your email and password.';
        error.hidden = false;
        return;
      }
      busy(submit, 'Signing in…', async () => {
        try {
          const res = await call('login', { email: data.email, password: data.password });
          app.signedIn(res);
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
        }
      });
    },
  },
  error,
  input('email', 'Email', { type: 'email', autocomplete: 'username', required: true, inputmode: 'email' }),
  input('password', 'Password', { type: 'password', autocomplete: 'current-password', required: true }),
  submit);

  mount(root, 
    brandHeader('Book sessions, show your pass, and track your hours.'),
    form,
    el('p', { class: 'mt-6 text-center' }, 'New volunteer? ',
      el('a', { href: '#/register', class: 'font-bold text-go underline underline-offset-4' }, 'Create an account')),
    el('p', { class: 'mt-3 text-center text-sm text-ink-soft' }, 'Forgot your password? Ask a volunteer leader to reset it.'));
}

export function renderRegister(root, app) {
  const error = formError();
  const submit = el('button', { type: 'submit', class: 'btn btn-go w-full' }, 'Create account');
  const section = (title, ...children) => el('fieldset', { class: 'mb-2' },
    el('legend', { class: 'section-title mt-2' }, title), ...children);

  const form = el('form', {
    novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      error.hidden = true;
      const d = formData(form);
      const problem =
        (!d.name && 'Enter your full name.') ||
        (!d.birthday && 'Enter your birthday.') ||
        (!d.email && 'Enter your email.') ||
        (!d.phone && 'Enter your phone number.') ||
        (!d.emergencyName && 'Enter an emergency contact name.') ||
        (!d.emergencyPhone && 'Enter an emergency contact phone number.') ||
        ((d.password || '').length < 8 && 'Choose a password with at least 8 characters.') ||
        (d.password !== d.password2 && "The two passwords don't match.") ||
        (!form.consent.checked && 'Tick the box to agree to the personal data notice.');
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        error.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      busy(submit, 'Creating account…', async () => {
        try {
          const res = await call('register', {
            name: d.name,
            birthday: d.birthday,
            email: d.email,
            phone: d.phone,
            telegram: d.telegram,
            emergencyName: d.emergencyName,
            emergencyPhone: d.emergencyPhone,
            emergencyRelation: d.emergencyRelation,
            password: form.password.value,
            consent: true,
          });
          app.signedIn(res, 'Welcome! Pick a session to get started.');
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
          error.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    },
  },
  error,
  section('About you',
    input('name', 'Full name', { required: true, autocomplete: 'name' }),
    input('birthday', 'Birthday', { type: 'date', required: true, max: todaySG(), autocomplete: 'bday' }),
    input('email', 'Email', { type: 'email', required: true, autocomplete: 'email', inputmode: 'email', hint: "You'll use this to sign in." }),
    input('phone', 'Phone', { type: 'tel', required: true, autocomplete: 'tel', placeholder: '+65 9123 4567' }),
    input('telegram', 'Telegram handle', { autocapitalize: 'none', placeholder: '@yourhandle' })),
  section('Emergency contact',
    input('emergencyName', 'Name', { required: true }),
    input('emergencyPhone', 'Phone', { type: 'tel', required: true, placeholder: '+65 9123 4567' }),
    input('emergencyRelation', 'Relationship to you', { placeholder: 'e.g. Mother' })),
  section('Password',
    input('password', 'Password', { type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters.' }),
    input('password2', 'Type it again', { type: 'password', required: true, autocomplete: 'new-password' })),
  el('label', { class: 'mb-6 mt-2 flex items-start gap-3 rounded-lg border border-line bg-white p-3' },
    el('input', { type: 'checkbox', name: 'consent', class: 'mt-1 size-5 accent-go' }),
    el('span', { class: 'text-sm' },
      'I agree that MINDS may collect and use these details to arrange volunteering, record my hours, and contact me or my emergency contact if needed, in line with the Personal Data Protection Act.')),
  submit);

  mount(root, 
    el('a', { href: '#/login', class: 'text-sm font-bold text-go' }, 'Already registered? Sign in'),
    brandHeader('Create your volunteer account. It takes about two minutes.'),
    form);
}
