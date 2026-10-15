// Editing a person's details: volunteers edit their own (Me → Edit my details),
// leaders edit anyone, volunteers and other leaders, from People.

import { call } from '../api.js';
import {
  backLink, badge, busy, el, errorBlock, field, fmtDay, fmtHours, formData, icon, initials, loading, mount, section, toast,
  todaySG,
} from '../ui.js';

const FIELDS = ['name', 'birthday', 'email', 'phone', 'telegram', 'emergencyName', 'emergencyPhone', 'emergencyRelation'];

const REQUIRED = {
  name: 'Enter a full name.',
  birthday: 'Enter a birthday.',
  email: 'Enter an email.',
  phone: 'Enter a phone number.',
  emergencyName: 'Enter an emergency contact name.',
  emergencyPhone: 'Enter an emergency contact phone number.',
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
      field('phone', 'Phone', { type: 'tel', value: person.phone, placeholder: '+65 9123 4567' }),
      field('telegram', 'Telegram handle', { optional: true, autocapitalize: 'none', value: person.telegram ? `@${person.telegram}` : '', placeholder: '@yourhandle' })),
    section('Emergency contact', 'red',
      field('emergencyName', 'Name', { value: person.emergencyName }),
      field('emergencyPhone', 'Phone', { type: 'tel', value: person.emergencyPhone, placeholder: '+65 9123 4567' }),
      field('emergencyRelation', self ? 'Relationship to you' : 'Relationship', { optional: true, value: person.emergencyRelation, placeholder: 'e.g. Mother' })),
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
    return v;
  };
  const changes = () => {
    const d = formData(form);
    const missing = Object.keys(REQUIRED).find((k) => !d[k]);
    if (missing) throw new Error(REQUIRED[missing]);
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

/* ---------------- volunteers (and leaders) editing their own details ---------------- */

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
      el('p', { class: 'mb-6 mt-1 muted' }, 'Keep these up to date so leaders can reach you, or your emergency contact, on the day.'),
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

/* ---------------- leaders: one person's page ---------------- */

export function renderPerson(root, app, ctx, userId) {
  const draw = (d) => {
    const p = d.person;
    const isMe = app.user && p.userId === app.user.userId;
    const apply = (res) => {
      app.updatePerson(res.person);
      if (isMe) app.updateUser(res.person);
      toast(res.message);
      draw({ ...d, person: res.person });
    };

    const save = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Save details');
    const { form, changes, showError } = detailsForm(p, { self: false, submit: save });
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
      if (payload.email && !confirm(`${p.name} will sign in with ${payload.email} from now on. Continue?`)) return;
      busy(save, 'Saving…', async () => {
        try {
          apply(await call('updatePerson', { userId: p.userId, ...payload }));
        } catch (err) {
          showError(err.message);
        }
      });
    });

    const action = (label, iconName, cls, question, payload) => {
      const btn = el('button', { type: 'button', class: `btn btn-sm ${cls}` }, icon(iconName, 'size-4'), label);
      btn.addEventListener('click', () => {
        if (question && !confirm(question)) return;
        busy(btn, 'Saving…', async () => apply(await call('updatePerson', { userId: p.userId, ...payload })));
      });
      return btn;
    };
    const roleBtn = p.role === 'admin'
      ? (isMe ? null : action('Remove leader access', 'shield', 'btn-secondary', `Remove leader access from ${p.name}? They will become a volunteer.`, { role: 'volunteer' }))
      : action('Make volunteer leader', 'shield', 'btn-secondary',
        `Make ${p.name} a volunteer leader? They will be able to create sessions, scan passes, see volunteer contact details and edit people.`, { role: 'admin' });
    const statusBtn = isMe ? null : p.status === 'inactive'
      ? action('Reactivate account', 'refresh', 'btn-success', null, { status: 'active' })
      : action('Deactivate account', 'x', 'btn-danger',
        `Deactivate ${p.name}? They will be signed out and cannot sign in until a leader reactivates them. Their hours stay in the sheet.`, { status: 'inactive' });

    const resetOut = el('div', {});
    let resetBtn = null;
    if (p.hasAccount && !isMe) {
      resetBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('refresh', 'size-4'), 'Reset password');
      resetBtn.addEventListener('click', () => {
        if (!confirm(`Reset ${p.name}'s password? They will be signed out on all their devices.`)) return;
        busy(resetBtn, 'Resetting…', async () => {
          const res = await call('resetPassword', { userId: p.userId });
          const copy = el('button', { class: 'btn btn-secondary btn-sm', onclick: () => navigator.clipboard?.writeText(res.tempPassword).then(() => toast('Copied.')) }, 'Copy');
          mount(resetOut, el('div', { class: 'alert alert-warn mt-3' },
            el('p', {}, `Give ${p.name} this temporary password. They can change it under Me.`),
            el('div', { class: 'mt-2 flex items-center justify-between gap-3' },
              el('code', { class: 'font-mono text-lg font-bold' }, res.tempPassword), copy)));
        });
      });
    }

    const contact = (href, iconName, text, danger) => el('a', { href, class: `btn btn-secondary btn-sm ${danger ? 'text-red-600 dark:text-red-400' : ''}` }, icon(iconName, 'size-4'), text);
    const stat = (value, label, tone) => el('div', { class: 'card p-3 text-center' },
      el('p', { class: `text-2xl font-extrabold ${tone}` }, value),
      el('p', { class: 'text-[11px] font-bold uppercase tracking-wider muted' }, label));

    mount(root,
      backLink('#/people', 'People'),
      el('div', { class: 'card flex items-center gap-4 p-5' },
        el('div', { class: 'flex size-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-xl font-extrabold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' }, initials(p.name)),
        el('div', { class: 'min-w-0' },
          el('h1', { class: 'truncate text-xl font-extrabold text-slate-900 dark:text-white' }, p.name, isMe ? el('span', { class: 'font-medium muted' }, ' (you)') : null),
          el('p', { class: 'truncate font-mono text-xs muted' }, p.email),
          el('div', { class: 'mt-1.5 flex flex-wrap gap-1' },
            p.role === 'admin' ? badge('Volunteer leader', 'purple', 'shield') : badge('Volunteer', 'indigo'),
            p.status === 'inactive' ? badge('Deactivated', 'red') : null,
            p.hasAccount ? null : badge('No app account yet')))),
      el('div', { class: 'mt-3 flex flex-wrap gap-2' },
        p.phone ? contact(`tel:${String(p.phone).replace(/\s/g, '')}`, 'phone', 'Call') : null,
        p.telegram ? contact(`https://t.me/${p.telegram}`, 'send', 'Telegram') : null,
        p.emergencyPhone ? contact(`tel:${String(p.emergencyPhone).replace(/\s/g, '')}`, 'phone', 'Emergency contact', true) : null),
      el('div', { class: 'mt-3 grid grid-cols-3 gap-2' },
        stat(fmtHours(d.stats.hours), 'Hours', 'text-indigo-600 dark:text-indigo-400'),
        stat(String(d.stats.sessions), 'Sessions', 'text-emerald-600 dark:text-emerald-400'),
        stat(String(d.stats.upcoming), 'Booked', 'text-slate-900 dark:text-white')),
      d.recent.length ? [
        el('h2', { class: 'group-label' }, 'Recent sessions'),
        el('div', { class: 'card divide-y divide-slate-100 overflow-hidden dark:divide-neutral-900' }, d.recent.map((r) => el('div', { class: 'flex items-center justify-between gap-3 p-3 text-sm' },
          el('span', { class: 'min-w-0 truncate' }, el('span', { class: 'font-bold' }, r.title), el('span', { class: 'muted' }, `, ${fmtDay(r.date)}`)),
          badge(fmtHours(r.hours), 'indigo')))),
      ] : null,
      el('h2', { class: 'group-label' }, 'Access'),
      el('div', { class: 'card p-4' },
        el('div', { class: 'flex flex-wrap gap-2' }, roleBtn, resetBtn, statusBtn),
        isMe ? el('p', { class: 'hint mt-2' }, 'Another leader has to change your own role or deactivate your account.') : null,
        resetOut),
      el('h2', { class: 'group-label' }, 'Edit details'),
      form,
      p.updatedBy ? el('p', { class: 'mt-3 text-center text-xs muted' }, `Last edited by ${p.updatedBy}, ${String(p.updatedAt).slice(0, 16)}`) : null);
  };

  const cached = app.cachedPersonDetail(userId);
  if (cached) draw(cached);
  else mount(root, loading());
  return call('personDetail', { userId }).then((d) => {
    app.cachePersonDetail(userId, d);
    if (ctx.alive() && (!cached || !root.contains(document.activeElement))) draw(d);
  }).catch((err) => {
    if (!ctx.alive()) return;
    if (!cached) mount(root, backLink('#/people', 'People'), errorBlock(err, () => app.rerender()));
    else toast(err.message, 'error');
  });
}
