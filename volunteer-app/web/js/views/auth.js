// Landing / sign-in and registration.
// Landing follows Overseas Trip Planner (Welcome + "Join" card + "Secure Login"
// card); the form follows CSL Attendance's login card; registration follows
// Trainee House Visit (coloured sections, fixed Submit bar at the bottom).

import { call } from '../api.js';
import {
  backLink, busy, el, field, formData, icon, isEmail, loading, mount, PHONE_HINT, section, sgPhone, todaySG,
} from '../ui.js';
import { questionSections, readAnswers } from './questions.js';

export function renderLogin(root, app) {
  const error = el('div', { class: 'alert alert-error', role: 'alert', hidden: true });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full py-3.5' }, 'Sign in');
  const form = el('form', { novalidate: true, class: 'space-y-4' },
    error,
    field('email', 'Email', { type: 'email', autocomplete: 'username', inputmode: 'email', placeholder: 'you@example.com' }),
    field('password', 'Password', { type: 'password', autocomplete: 'current-password', placeholder: '••••••••' }),
    submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    error.hidden = true;
    const d = formData(form);
    if (!d.email || !form.password.value) {
      error.textContent = 'Enter your email and password.';
      error.hidden = false;
      return;
    }
    busy(submit, 'Signing in…', async () => {
      try {
        app.signedIn(await call('login', { email: d.email, password: form.password.value }));
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    });
  });

  mount(root, el('div', { class: 'mx-auto mt-4 max-w-md space-y-4' },
    el('div', { class: 'mb-6 flex flex-col items-center text-center' },
      el('div', { class: 'mb-4 flex size-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' }, icon('qr', 'size-8')),
      el('h1', { class: 'mb-1 text-3xl font-extrabold text-slate-900 dark:text-white' }, 'Welcome'),
      el('p', { class: 'font-medium muted' }, 'Book sessions, show your QR pass and track your hours.')),

    el('div', { class: 'card border-t-4 border-t-emerald-500 p-6 text-center shadow-md' },
      el('h2', { class: 'mb-1 text-xl font-bold text-slate-900 dark:text-white' }, 'New volunteer?'),
      el('p', { class: 'mb-5 text-sm muted' }, 'Create an account to book your first session.'),
      el('a', { href: '#/register', class: 'btn btn-success w-full text-lg' }, icon('userPlus'), 'Register now')),

    el('div', { class: 'card rounded-3xl p-6 shadow-md sm:p-8' },
      el('div', { class: 'mb-6 flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-neutral-800' },
        icon('shield', 'size-5 text-indigo-600 dark:text-indigo-400'),
        el('h2', { class: 'text-xl font-black tracking-tight text-slate-900 dark:text-white' }, 'Secure Login')),
      form,
      el('p', { class: 'mt-4 text-center text-xs muted' }, 'Forgot your password? Ask an admin to reset it.'))));
}

/**
 * Registration follows MINDS's volunteer Google Form: the account details, then
 * the form's other questions, fetched from the server (Config.gs → REGISTRATION).
 */
export function renderRegister(root, app) {
  mount(root, backLink('#/login', 'Back to sign in'), loading('Loading the form…'));
  return call('registrationForm').catch(() => null).then((questions) => {
    if (location.hash.replace(/^#\/?/, '').split('/')[0] === 'register') drawRegister(root, app, questions);
  });
}

function drawRegister(root, app, questions) {
  const error = el('div', { class: 'alert alert-error', role: 'alert', hidden: true });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Create account');
  const consent = el('input', { type: 'checkbox', name: 'consent', class: 'mt-0.5 size-5 shrink-0 accent-indigo-600' });

  const form = el('form', { novalidate: true, class: 'space-y-6' },
    error,
    section('Your account', 'blue',
      field('name', 'Full name (as in NRIC)', { autocomplete: 'name' }),
      field('birthday', 'Birthday', { type: 'date', max: todaySG(), autocomplete: 'bday' }),
      field('email', 'Email', { type: 'email', autocomplete: 'email', inputmode: 'email', hint: "You'll use this to sign in." }),
      field('phone', 'Phone', { type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: '+65 91234567', hint: PHONE_HINT }),
      field('telegram', 'Telegram handle', { optional: true, autocapitalize: 'none', placeholder: '@yourhandle', hint: 'Admins message volunteers on Telegram.' })),
    questionSections(questions),
    section('Password and consent', 'indigo',
      field('password', 'Password', { type: 'password', autocomplete: 'new-password', hint: 'At least 8 characters.' }),
      field('password2', 'Type it again', { type: 'password', autocomplete: 'new-password' }),
      el('label', { class: 'flex items-start gap-3 text-sm' }, consent,
        el('span', {}, 'I agree that MINDS may collect and use these details to arrange volunteering, record my hours, and contact me if needed, in line with the Personal Data Protection Act.'))),
    el('div', { class: 'action-bar' }, el('div', { class: 'mx-auto max-w-2xl' }, submit)));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    error.hidden = true;
    const d = formData(form);
    const extra = readAnswers(form, questions ? questions.fields : []);
    const problem =
      (!d.name && 'Enter your full name.') ||
      (!d.birthday && 'Enter your birthday.') ||
      (!d.email && 'Enter your email.') ||
      (!isEmail(d.email) && 'Check your email address: it should look like name@example.com.') ||
      (!d.phone && 'Enter your phone number.') ||
      (!sgPhone(d.phone) && `Phone: ${PHONE_HINT}`) ||
      extra.problem ||
      (form.password.value.length < 8 && 'Choose a password with at least 8 characters.') ||
      (form.password.value !== form.password2.value && "The two passwords don't match.") ||
      (!consent.checked && 'Tick the box to agree to the personal data notice.');
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
          password: form.password.value,
          consent: true,
          ...(questions ? { answers: extra.answers } : {}),
        });
        app.signedIn(res, 'Welcome! Start with this short guide, then book your first session.', '#/guide');
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        error.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  mount(root,
    backLink('#/login', 'Back to sign in'),
    el('h1', { class: 'page-title' }, 'Volunteer Registration'),
    el('p', { class: 'mb-6 mt-1 muted' }, 'It takes about three minutes. Then read the short guide and say which sessions you\'re coming to.'),
    form,
    el('div', { class: 'h-24' }));
}
