// House visits: record visit observations against a trainee and volunteer,
// with an append-only history and trainee filter.

import { api } from '../api.js';
import {
  button,
  el,
  emptyState,
  errorNotice,
  field,
  formatDate,
  formatSGTimestamp,
  loadingState,
  notice,
  selectInput,
  setBusy,
  textareaInput,
  dateInput,
  todayInSingapore,
} from '../ui.js';

export async function renderVisits(view, { navigate }) {
  view.appendChild(el('h1', {}, 'House Visits'));
  view.appendChild(
    el('p', { class: 'muted' }, 'Record and review home visit observations. History is append-only.')
  );

  const noticeArea = el('div', {});
  const addNotice = (kind, message) => {
    noticeArea.replaceChildren(notice(kind, message));
    if (kind === 'ok') setTimeout(() => noticeArea.replaceChildren(), 4000);
  };

  const [trainees, volunteers] = await Promise.all([
    api.get('/api/trainees'),
    api.get('/api/volunteers'),
  ]);

  // ---- new visit form ----
  const traineeSelect = selectInput(
    'traineeId',
    [
      { value: '', label: '— Choose trainee —' },
      ...trainees.map((trainee) => ({ value: String(trainee.id), label: trainee.name })),
    ]
  );
  const volunteerSelect = selectInput(
    'volunteerId',
    [
      { value: '', label: '— Choose volunteer —' },
      ...volunteers.map((volunteer) => ({ value: String(volunteer.id), label: volunteer.name })),
    ]
  );
  const dateField = dateInput('visitDate', { value: todayInSingapore(), required: true });
  const familyInput = textareaInput('familyNotes', { rows: 2, placeholder: 'Family circumstances…' });
  const dailyInput = textareaInput('dailyLivingNotes', { rows: 2, placeholder: 'Daily living skills…' });
  const socialInput = textareaInput('socialNotes', { rows: 2, placeholder: 'Social skills…' });
  const healthInput = textareaInput('healthNotes', { rows: 2, placeholder: 'Health observations…' });
  const followUpInput = textareaInput('followUp', { rows: 2, placeholder: 'Follow-up actions…' });
  const submitBtn = button('Record visit', { kind: 'primary', type: 'submit' });

  const form = el(
    'form',
    { class: 'card' },
    el('h3', {}, 'Record a house visit'),
    el(
      'div',
      { class: 'inline-form' },
      field('Trainee', traineeSelect),
      field('Volunteer', volunteerSelect),
      field('Visit date', dateField)
    ),
    el(
      'div',
      { class: 'inline-form' },
      field('Family circumstances', familyInput, { wide: true }),
      field('Daily living', dailyInput, { wide: true })
    ),
    el(
      'div',
      { class: 'inline-form' },
      field('Social skills', socialInput, { wide: true }),
      field('Health', healthInput, { wide: true })
    ),
    el('div', { class: 'inline-form' }, field('Follow-up', followUpInput, { wide: true })),
    submitBtn
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const traineeId = Number(traineeSelect.value);
    const volunteerId = Number(volunteerSelect.value);
    if (!traineeId || !volunteerId) {
      addNotice('error', 'Choose both a trainee and a volunteer.');
      return;
    }
    if (!dateField.value) {
      addNotice('error', 'Visit date is required.');
      return;
    }
    setBusy(submitBtn, true, 'Saving…');
    try {
      await api.post('/api/visits', {
        traineeId,
        volunteerId,
        visitDate: dateField.value,
        familyNotes: familyInput.value,
        dailyLivingNotes: dailyInput.value,
        socialNotes: socialInput.value,
        healthNotes: healthInput.value,
        followUp: followUpInput.value,
      });
      addNotice('ok', 'Visit recorded.');
      for (const input of [familyInput, dailyInput, socialInput, healthInput, followUpInput]) {
        input.value = '';
      }
      await refreshHistory();
    } catch (err) {
      addNotice('error', err.message);
    } finally {
      setBusy(submitBtn, false);
    }
  });

  // ---- filter + history ----
  const filterSelect = selectInput(
    'traineeFilter',
    [{ value: '', label: 'All trainees' }, ...trainees.map((t) => ({ value: String(t.id), label: t.name }))]
  );
  const historyHost = el('div', {});

  async function refreshHistory() {
    historyHost.replaceChildren(loadingState());
    try {
      const traineeId = filterSelect.value;
      const visits = await api.get(`/api/visits${traineeId ? `?traineeId=${traineeId}` : ''}`);
      drawHistory(visits);
    } catch (err) {
      historyHost.replaceChildren(errorNotice(err));
    }
  }

  function drawHistory(visits) {
    const host = el('div', {});
    host.appendChild(el('h2', {}, 'Visit history'));
    if (visits.length === 0) {
      host.appendChild(emptyState('No visits recorded yet.'));
      historyHost.replaceChildren(host);
      return;
    }
    for (const visit of visits) {
      const card = el('div', { class: 'visit-card' });
      card.appendChild(
        el(
          'div',
          { class: 'visit-head' },
          el('strong', {}, `${visit.traineeName} — ${formatDate(visit.visitDate)}`),
          el(
            'span',
            { class: 'muted' },
            `Volunteer: ${visit.volunteerName} • Recorded ${formatSGTimestamp(visit.createdAt)}`
          )
        )
      );
      const dl = el('dl', {});
      const entries = [
        ['Family circumstances', visit.familyNotes],
        ['Daily living', visit.dailyLivingNotes],
        ['Social skills', visit.socialNotes],
        ['Health', visit.healthNotes],
        ['Follow-up', visit.followUp],
      ];
      for (const [label, value] of entries) {
        dl.appendChild(el('dt', {}, label));
        dl.appendChild(el('dd', {}, value || '—'));
      }
      card.appendChild(dl);
      host.appendChild(card);
    }
    historyHost.replaceChildren(host);
  }

  filterSelect.addEventListener('change', refreshHistory);

  view.append(form, noticeArea);
  view.appendChild(el('h2', {}, 'Visit history'));
  view.appendChild(el('div', { class: 'search-row' }, field('Filter by trainee', filterSelect)));
  view.appendChild(historyHost);
  await refreshHistory();
}
