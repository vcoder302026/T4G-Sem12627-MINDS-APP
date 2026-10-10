// Outings: list/create outings and manage the trainee/volunteer roster with
// group, bus and manual boarding flags.

import { api } from '../api.js';
import {
  button,
  chip,
  el,
  emptyState,
  errorNotice,
  field,
  formatDate,
  loadingState,
  notice,
  selectInput,
  setBusy,
  table,
  textInput,
  dateInput,
  todayInSingapore,
  textareaInput,
} from '../ui.js';

export async function renderOutingList(view, { navigate }) {
  view.appendChild(el('h1', {}, 'Outings'));
  view.appendChild(
    el('p', { class: 'muted' }, 'Plan outings and manage trainee/volunteer assignments and boarding.')
  );

  const noticeArea = el('div', {});
  const addNotice = (kind, message) => {
    noticeArea.replaceChildren(notice(kind, message));
    if (kind === 'ok') setTimeout(() => noticeArea.replaceChildren(), 4000);
  };

  const titleInput = textInput('title', { required: true, placeholder: 'e.g. East Coast Park outing' });
  const dateField = dateInput('date', { value: todayInSingapore(), required: true });
  const venueInput = textInput('venue', { placeholder: 'optional' });
  const notesInput = textareaInput('notes', { rows: 2, placeholder: 'optional' });
  const addSubmit = button('Create outing', { kind: 'primary', type: 'submit' });
  const addForm = el(
    'form',
    { class: 'card inline-form' },
    field('Title', titleInput),
    field('Date', dateField),
    field('Venue', venueInput),
    field('Notes', notesInput, { wide: true }),
    addSubmit
  );
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(addSubmit, true, 'Saving…');
    try {
      await api.post('/api/outings', {
        title: titleInput.value,
        date: dateField.value,
        venue: venueInput.value,
        notes: notesInput.value,
      });
      addNotice('ok', 'Outing created.');
      titleInput.value = '';
      venueInput.value = '';
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
      const outings = await api.get('/api/outings');
      listHost.replaceChildren();
      listHost.appendChild(el('h2', {}, 'Upcoming and past outings'));
      if (outings.length === 0) {
        listHost.appendChild(emptyState('No outings yet.'));
        return;
      }
      listHost.appendChild(
        table(
          ['Title', 'Date', 'Venue', ''],
          outings.map((outing) => [
            outing.title,
            formatDate(outing.date),
            outing.venue || '—',
            el('a', { href: `#/outings/${outing.id}` }, 'Open'),
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

export async function renderOutingDetail(view, { id, navigate }) {
  view.appendChild(el('a', { class: 'back-link', href: '#/outings' }, '← Back to outings'));

  const noticeArea = el('div', {});
  const addNotice = (kind, message) => {
    noticeArea.replaceChildren(notice(kind, message));
    if (kind === 'ok') setTimeout(() => noticeArea.replaceChildren(), 4000);
  };

  const headHost = el('div', { class: 'page-head' });
  const assignHost = el('div', {});
  const rosterHost = el('div', {});
  view.append(headHost, noticeArea, assignHost, rosterHost);

  async function refresh() {
    headHost.replaceChildren(loadingState());
    let detail;
    try {
      detail = await api.get(`/api/outings/${id}`);
    } catch (err) {
      if (err.status === 404) {
        view.replaceChildren(
          el('h1', {}, 'Outings'),
          errorNotice(err),
          el('p', {}, el('a', { href: '#/outings' }, '← Back to outings'))
        );
        return;
      }
      throw err;
    }
    const { outing, assignments } = detail;
    const boardedCount = assignments.filter((assignment) => assignment.boarded).length;
    headHost.replaceChildren(
      el('h1', {}, outing.title),
      el(
        'p',
        { class: 'muted' },
        `${formatDate(outing.date)}${outing.venue ? ` • ${outing.venue}` : ''} • Boarded ${boardedCount} of ${assignments.length} trainees`
      )
    );
    if (outing.notes) {
      headHost.appendChild(el('p', {}, outing.notes));
    }
    await drawAssignForm();
    drawRoster(assignments);
  }

  async function drawAssignForm() {
    const [trainees, volunteers] = await Promise.all([
      api.get('/api/trainees'),
      api.get('/api/volunteers'),
    ]);
    const host = el('div', { class: 'card' });
    host.appendChild(el('h3', {}, 'Assign trainee to volunteer'));

    const traineeSelect = selectInput('traineeId', [
      { value: '', label: '— Choose trainee —' },
      ...trainees.map((trainee) => ({ value: String(trainee.id), label: trainee.name })),
    ]);
    const volunteerSelect = selectInput('volunteerId', [
      { value: '', label: '— Choose volunteer —' },
      ...volunteers.map((volunteer) => ({ value: String(volunteer.id), label: volunteer.name })),
    ]);
    const groupInput = textInput('groupName', { placeholder: 'e.g. Group 2' });
    const busInput = textInput('busName', { placeholder: 'e.g. Bus B' });
    const assignBtn = button('Assign', { kind: 'primary', type: 'submit' });
    const form = el(
      'form',
      { class: 'inline-form' },
      field('Trainee', traineeSelect),
      field('Volunteer', volunteerSelect),
      field('Group', groupInput),
      field('Bus', busInput),
      assignBtn
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const traineeId = Number(traineeSelect.value);
      const volunteerId = volunteerSelect.value ? Number(volunteerSelect.value) : null;
      if (!traineeId || !volunteerId) {
        addNotice('error', 'Choose both a trainee and a volunteer.');
        return;
      }
      setBusy(assignBtn, true, 'Saving…');
      try {
        await api.post(`/api/outings/${id}/assignments`, {
          traineeId,
          volunteerId,
          groupName: groupInput.value,
          busName: busInput.value,
        });
        addNotice('ok', 'Assignment added.');
        groupInput.value = '';
        busInput.value = '';
        await refresh();
      } catch (err) {
        addNotice('error', err.message);
      } finally {
        setBusy(assignBtn, false);
      }
    });
    host.appendChild(form);
    assignHost.replaceChildren(host);
  }

  function drawRoster(assignments) {
    const host = el('div', {});
    host.appendChild(el('h2', {}, 'Assignments'));
    if (assignments.length === 0) {
      host.appendChild(emptyState('No trainees assigned yet.'));
      rosterHost.replaceChildren(host);
      return;
    }

    api
      .get('/api/volunteers')
      .then((volunteers) => {
        const rows = assignments.map((assignment) => {
          const volunteerSelect = selectInput(
            'volunteerId',
            [
              { value: '', label: '— Unassigned —' },
              ...volunteers.map((volunteer) => ({
                value: String(volunteer.id),
                label: volunteer.name,
              })),
            ],
            { value: assignment.volunteerId ?? '' }
          );
          const groupInput = textInput('groupName', { value: assignment.groupName });
          const busInput = textInput('busName', { value: assignment.busName });
          const boardedInput = el('input', { type: 'checkbox' });
          boardedInput.checked = assignment.boarded;
          boardedInput.setAttribute('aria-label', `Boarded: ${assignment.traineeName}`);
          const saveBtn = button('Save', { kind: 'primary', small: true });
          saveBtn.addEventListener('click', async () => {
            setBusy(saveBtn, true);
            try {
              await api.patch(`/api/outing-assignments/${assignment.id}`, {
                volunteerId: volunteerSelect.value ? Number(volunteerSelect.value) : null,
                groupName: groupInput.value,
                busName: busInput.value,
                boarded: boardedInput.checked,
              });
              addNotice('ok', `Saved assignment for ${assignment.traineeName}.`);
              await refresh();
            } catch (err) {
              addNotice('error', err.message);
              setBusy(saveBtn, false);
            }
          });
          return [
            assignment.traineeName,
            volunteerSelect,
            groupInput,
            busInput,
            el('label', {}, boardedInput, ' boarded'),
            saveBtn,
          ];
        });
        host.appendChild(
          table(['Trainee', 'Volunteer', 'Group', 'Bus', 'Boarded', ''], rows)
        );
      })
      .catch((err) => addNotice('error', err.message));

    rosterHost.replaceChildren(host);
  }

  await refresh();
}
