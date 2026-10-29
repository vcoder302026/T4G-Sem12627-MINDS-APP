// Overseas trips: participants with per-trip medical/dietary notes,
// registration status, logistics checklist and expenses on one page.

import { api } from '../api.js';
import {
  button,
  chip,
  el,
  emptyState,
  errorNotice,
  field,
  formatDate,
  formatMoney,
  loadingState,
  notice,
  parseMoneyInput,
  selectInput,
  setBusy,
  table,
  textInput,
  textareaInput,
  dateInput,
  todayInSingapore,
} from '../ui.js';

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function renderTripList(view, { navigate }) {
  view.appendChild(el('h1', {}, 'Overseas Trips'));
  view.appendChild(
    el('p', { class: 'muted' }, 'Plan trips, register participants and track logistics and expenses.')
  );

  const noticeArea = el('div', {});
  const addNotice = (kind, message) => {
    noticeArea.replaceChildren(notice(kind, message));
    if (kind === 'ok') setTimeout(() => noticeArea.replaceChildren(), 4000);
  };

  const today = todayInSingapore();
  const titleInput = textInput('title', { required: true, placeholder: 'e.g. Regional exchange' });
  const destinationInput = textInput('destination', { required: true, placeholder: 'e.g. Demo City' });
  const startField = dateInput('startDate', { value: addDays(today, 7), required: true });
  const endField = dateInput('endDate', { value: addDays(today, 10), required: true });
  const notesInput = textareaInput('notes', { rows: 2, placeholder: 'optional' });
  const addSubmit = button('Create trip', { kind: 'primary', type: 'submit' });
  const addForm = el(
    'form',
    { class: 'card inline-form' },
    field('Title', titleInput),
    field('Destination', destinationInput),
    field('Start date', startField),
    field('End date', endField),
    field('Notes', notesInput, { wide: true }),
    addSubmit
  );
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(addSubmit, true, 'Saving…');
    try {
      await api.post('/api/trips', {
        title: titleInput.value,
        destination: destinationInput.value,
        startDate: startField.value,
        endDate: endField.value,
        notes: notesInput.value,
      });
      addNotice('ok', 'Trip created.');
      titleInput.value = '';
      destinationInput.value = '';
      notesInput.value = '';
      await refresh();
    } catch (err) {
      addNotice('error', err.message);
    } finally {
      setBusy(addSubmit, false);
    }
  });

  const listHost = el('div', {});
  async function refresh() {
    listHost.replaceChildren(loadingState());
    try {
      const trips = await api.get('/api/trips');
      listHost.replaceChildren();
      listHost.appendChild(el('h2', {}, 'Trips'));
      if (trips.length === 0) {
        listHost.appendChild(emptyState('No trips yet.'));
        return;
      }
      listHost.appendChild(
        table(
          ['Title', 'Destination', 'Dates', ''],
          trips.map((trip) => [
            trip.title,
            trip.destination,
            `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`,
            el('a', { href: `#/trips/${trip.id}` }, 'Open'),
          ])
        )
      );
    } catch (err) {
      listHost.replaceChildren(errorNotice(err));
    }
  }

  view.append(addForm, noticeArea, listHost);
  await refresh();
}

export async function renderTripDetail(view, { id, navigate }) {
  view.appendChild(el('a', { class: 'back-link', href: '#/trips' }, '← Back to overseas trips'));

  const noticeArea = el('div', {});
  const addNotice = (kind, message) => {
    noticeArea.replaceChildren(notice(kind, message));
    if (kind === 'ok') setTimeout(() => noticeArea.replaceChildren(), 4000);
  };

  const headHost = el('div', { class: 'page-head' });
  const participantsHost = el('div', {});
  const logisticsHost = el('div', {});
  const expensesHost = el('div', {});
  view.append(headHost, noticeArea, participantsHost, logisticsHost, expensesHost);

  async function refresh() {
    headHost.replaceChildren(loadingState());
    let detail;
    try {
      detail = await api.get(`/api/trips/${id}`);
    } catch (err) {
      if (err.status === 404) {
        view.replaceChildren(
          el('h1', {}, 'Overseas Trips'),
          errorNotice(err),
          el('p', {}, el('a', { href: '#/trips' }, '← Back to overseas trips'))
        );
        return;
      }
      throw err;
    }
    const { trip, participants, logistics, expenses, totalExpenseCents } = detail;
    headHost.replaceChildren(
      el('h1', {}, trip.title),
      el(
        'p',
        { class: 'muted' },
        `${trip.destination} • ${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`
      )
    );
    if (trip.notes) headHost.appendChild(el('p', {}, trip.notes));

    await drawParticipants(participants);
    drawLogistics(logistics);
    drawExpenses(expenses, totalExpenseCents);
  }

  async function drawParticipants(participants) {
    const [trainees, volunteers] = await Promise.all([
      api.get('/api/trainees'),
      api.get('/api/volunteers'),
    ]);

    const host = el('div', { class: 'card' });
    host.appendChild(el('h3', {}, 'Participants'));

    const traineeSelect = selectInput('traineeId', [
      { value: '', label: '— Choose trainee —' },
      ...trainees.map((trainee) => ({ value: String(trainee.id), label: trainee.name })),
    ]);
    const volunteerSelect = selectInput('volunteerId', [
      { value: '', label: '— Unassigned —' },
      ...volunteers.map((volunteer) => ({ value: String(volunteer.id), label: volunteer.name })),
    ]);
    const addBtn = button('Add participant', { kind: 'primary', type: 'submit' });
    const form = el(
      'form',
      { class: 'inline-form' },
      field('Trainee', traineeSelect),
      field('Volunteer (optional)', volunteerSelect),
      addBtn
    );
    form.appendChild(
      el(
        'p',
        { class: 'help-text' },
        'Medical and dietary notes are copied from the trainee profile when the participant is added; edits here only affect this trip.'
      )
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const traineeId = Number(traineeSelect.value);
      if (!traineeId) {
        addNotice('error', 'Choose a trainee.');
        return;
      }
      setBusy(addBtn, true, 'Saving…');
      try {
        await api.post(`/api/trips/${id}/participants`, {
          traineeId,
          volunteerId: volunteerSelect.value ? Number(volunteerSelect.value) : null,
        });
        addNotice('ok', 'Participant added.');
        await refresh();
      } catch (err) {
        addNotice('error', err.message);
      } finally {
        setBusy(addBtn, false);
      }
    });
    host.appendChild(form);

    const section = el('div', {});
    host.appendChild(section);
    if (participants.length === 0) {
      section.appendChild(emptyState('No participants yet.'));
      participantsHost.replaceChildren(host);
      return;
    }

    const volunteerOptions = [
      { value: '', label: '— Unassigned —' },
      ...volunteers.map((volunteer) => ({ value: String(volunteer.id), label: volunteer.name })),
    ];
    const rows = participants.map((participant) => {
      const volunteerSelect = selectInput('volunteerId', volunteerOptions, {
        value: participant.volunteerId ?? '',
      });
      const statusSelect = selectInput(
        'registrationStatus',
        [
          { value: 'pending', label: 'Pending' },
          { value: 'confirmed', label: 'Confirmed' },
        ],
        { value: participant.registrationStatus }
      );
      const medicalInput = textareaInput('medicalNotes', { rows: 2 });
      medicalInput.value = participant.medicalNotes;
      const dietaryInput = textareaInput('dietaryNotes', { rows: 2 });
      dietaryInput.value = participant.dietaryNotes;
      const saveBtn = button('Save', { kind: 'primary', small: true });
      saveBtn.addEventListener('click', async () => {
        setBusy(saveBtn, true);
        try {
          await api.patch(`/api/trip-participants/${participant.id}`, {
            volunteerId: volunteerSelect.value ? Number(volunteerSelect.value) : null,
            registrationStatus: statusSelect.value,
            medicalNotes: medicalInput.value,
            dietaryNotes: dietaryInput.value,
          });
          addNotice('ok', `Saved ${participant.traineeName}.`);
          await refresh();
        } catch (err) {
          addNotice('error', err.message);
          setBusy(saveBtn, false);
        }
      });
      return [
        participant.traineeName,
        volunteerSelect,
        statusSelect,
        medicalInput,
        dietaryInput,
        saveBtn,
      ];
    });
    section.appendChild(
      table(
        ['Trainee', 'Volunteer', 'Registration', 'Medical notes (this trip)', 'Dietary notes (this trip)', ''],
        rows
      )
    );
    participantsHost.replaceChildren(host);
  }

  function drawLogistics(logistics) {
    const host = el('div', { class: 'card' });
    host.appendChild(el('h3', {}, 'Logistics checklist'));

    const descriptionInput = textInput('description', { required: true, placeholder: 'e.g. Book accessible coach' });
    const addBtn = button('Add task', { kind: 'primary', type: 'submit' });
    const form = el('form', { class: 'inline-form' }, field('Task', descriptionInput, { wide: true }), addBtn);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setBusy(addBtn, true, 'Saving…');
      try {
        await api.post(`/api/trips/${id}/logistics`, { description: descriptionInput.value });
        addNotice('ok', 'Task added.');
        descriptionInput.value = '';
        await refresh();
      } catch (err) {
        addNotice('error', err.message);
      } finally {
        setBusy(addBtn, false);
      }
    });
    host.appendChild(form);

    if (logistics.length === 0) {
      host.appendChild(emptyState('No logistics tasks yet.'));
    } else {
      const rows = logistics.map((item) => {
        const toggle = button(item.status === 'done' ? 'Mark pending' : 'Mark done', { small: true });
        toggle.addEventListener('click', async () => {
          setBusy(toggle, true);
          try {
            await api.patch(`/api/trip-logistics/${item.id}`, {
              status: item.status === 'done' ? 'pending' : 'done',
            });
            await refresh();
          } catch (err) {
            addNotice('error', err.message);
            setBusy(toggle, false);
          }
        });
        return [
          item.description,
          item.status === 'done' ? chip('Done', 'chip-ok') : chip('Pending', 'chip-warn'),
          toggle,
        ];
      });
      host.appendChild(table(['Task', 'Status', ''], rows));
    }
    logisticsHost.replaceChildren(host);
  }

  function drawExpenses(expenses, totalExpenseCents) {
    const host = el('div', { class: 'card' });
    host.appendChild(el('h3', {}, 'Expenses'));

    const descriptionInput = textInput('description', { required: true, placeholder: 'e.g. Coach rental' });
    const amountInput = textInput('amount', { required: true, placeholder: 'e.g. 120.50' });
    const addBtn = button('Add expense', { kind: 'primary', type: 'submit' });
    const form = el(
      'form',
      { class: 'inline-form' },
      field('Description', descriptionInput, { wide: true }),
      field('Amount (SGD)', amountInput),
      addBtn
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const amountCents = parseMoneyInput(amountInput.value);
      if (amountCents === null) {
        addNotice('error', 'Amount must be a positive value with at most two decimal places, e.g. 120.50.');
        return;
      }
      setBusy(addBtn, true, 'Saving…');
      try {
        await api.post(`/api/trips/${id}/expenses`, {
          description: descriptionInput.value,
          amountCents,
        });
        addNotice('ok', 'Expense added.');
        descriptionInput.value = '';
        amountInput.value = '';
        await refresh();
      } catch (err) {
        addNotice('error', err.message);
      } finally {
        setBusy(addBtn, false);
      }
    });
    host.appendChild(form);

    if (expenses.length === 0) {
      host.appendChild(emptyState('No expenses recorded yet.'));
    } else {
      host.appendChild(
        table(
          ['Description', 'Amount'],
          expenses.map((expense) => [expense.description, formatMoney(expense.amountCents)])
        )
      );
    }
    host.appendChild(
      el('p', { class: 'total-line' }, 'Total expenses: ', el('strong', {}, formatMoney(totalExpenseCents)))
    );
    expensesHost.replaceChildren(host);
  }

  await refresh();
}
