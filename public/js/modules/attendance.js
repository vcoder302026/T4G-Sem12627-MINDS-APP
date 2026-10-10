// Attendance: session list/creation, manual clock in/out with hours
// summary. This is the desktop replacement for QR-based attendance.

import { api } from '../api.js';
import {
  button,
  chip,
  el,
  emptyState,
  errorNotice,
  field,
  formatDate,
  formatHours,
  formatSGTimestamp,
  loadingState,
  notice,
  selectInput,
  setBusy,
  table,
  textInput,
  dateInput,
  todayInSingapore,
} from '../ui.js';

function recordsLink(id, navigate) {
  const link = el('a', { href: `#/attendance/${id}` }, 'Open');
  return link;
}

export async function renderAttendanceList(view, { navigate }) {
  view.appendChild(el('h1', {}, 'Attendance'));
  view.appendChild(
    el('p', { class: 'muted' }, 'Create sessions and clock volunteers in and out manually.')
  );

  const noticeArea = el('div', {});
  const addNotice = (kind, message) => {
    noticeArea.replaceChildren(notice(kind, message));
    if (kind === 'ok') setTimeout(() => noticeArea.replaceChildren(), 4000);
  };

  // ---- new session form ----
  const titleInput = textInput('title', { required: true, placeholder: 'e.g. Saturday Programme' });
  const dateField = dateInput('date', { value: todayInSingapore(), required: true });
  const venueInput = textInput('venue', { placeholder: 'optional' });
  const addSubmit = button('Create session', { kind: 'primary', type: 'submit' });
  const addForm = el(
    'form',
    { class: 'card inline-form' },
    field('Title', titleInput),
    field('Date', dateField),
    field('Venue', venueInput),
    addSubmit
  );
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(addSubmit, true, 'Saving…');
    try {
      await api.post('/api/attendance/sessions', {
        title: titleInput.value,
        date: dateField.value,
        venue: venueInput.value,
      });
      addNotice('ok', 'Session created.');
      titleInput.value = '';
      venueInput.value = '';
      await refreshAll();
    } catch (err) {
      addNotice('error', err.message);
    } finally {
      setBusy(addSubmit, false);
    }
  });

  const summaryHost = el('div', {});
  const sessionsHost = el('div', {});

  async function refreshAll() {
    sessionsHost.replaceChildren(loadingState());
    summaryHost.replaceChildren(loadingState());
    try {
      const [sessions, summary] = await Promise.all([
        api.get('/api/attendance/sessions'),
        api.get('/api/attendance/summary'),
      ]);
      drawSummary(summary);
      drawSessions(sessions);
    } catch (err) {
      sessionsHost.replaceChildren(errorNotice(err));
      summaryHost.replaceChildren();
    }
  }

  function drawSummary(summary) {
    const host = el('div', { class: 'card' });
    host.appendChild(el('h3', {}, 'Volunteer hours summary'));
    host.appendChild(
      el('p', { class: 'help-text' }, 'Completed hours only; records still in progress are excluded.')
    );
    if (summary.length === 0) {
      host.appendChild(emptyState('No volunteers yet.'));
    } else {
      host.appendChild(
        table(
          ['Volunteer', 'Completed sessions', 'Hours'],
          summary.map((row) => [row.volunteerName, String(row.completedSessions), formatHours(row.hours)])
        )
      );
    }
    summaryHost.replaceChildren(host);
  }

  function drawSessions(sessions) {
    const host = el('div', {});
    host.appendChild(el('h2', {}, 'Sessions'));
    if (sessions.length === 0) {
      host.appendChild(emptyState('No attendance sessions yet.'));
    } else {
      host.appendChild(
        table(
          ['Title', 'Date', 'Venue', ''],
          sessions.map((session) => [
            session.title,
            formatDate(session.date),
            session.venue || '—',
            recordsLink(session.id, navigate),
          ])
        )
      );
    }
    sessionsHost.replaceChildren(host);
  }

  view.append(addForm, noticeArea);
  view.appendChild(el('h2', {}, 'Hours summary'));
  view.appendChild(summaryHost);
  view.appendChild(sessionsHost);
  await refreshAll();
}

export async function renderAttendanceDetail(view, { id, navigate }) {
  view.appendChild(el('a', { class: 'back-link', href: '#/attendance' }, '← Back to attendance'));

  const noticeArea = el('div', {});
  const addNotice = (kind, message) => {
    noticeArea.replaceChildren(notice(kind, message));
    if (kind === 'ok') setTimeout(() => noticeArea.replaceChildren(), 4000);
  };

  const headerHost = el('div', { class: 'page-head' });
  const clockHost = el('div', {});
  const recordsHost = el('div', {});
  view.append(headerHost, noticeArea, clockHost, recordsHost);

  async function refresh() {
    recordsHost.replaceChildren(loadingState());
    headerHost.replaceChildren(loadingState());
    let detail;
    try {
      detail = await api.get(`/api/attendance/sessions/${id}`);
    } catch (err) {
      if (err.status === 404) {
        view.replaceChildren(
          el('h1', {}, 'Attendance'),
          errorNotice(err),
          el('p', {}, el('a', { href: '#/attendance' }, '← Back to attendance'))
        );
        return;
      }
      throw err;
    }
    const { session, records } = detail;
    headerHost.replaceChildren(
      el('h1', {}, session.title),
      el(
        'p',
        { class: 'muted' },
        `${formatDate(session.date)}${session.venue ? ` • ${session.venue}` : ''}`
      )
    );
    drawClockIn(records);
    drawRecords(records);
  }

  function drawClockIn(records) {
    const volunteers = api.get('/api/volunteers');
    const host = el('div', { class: 'card' });
    const volunteerSelect = selectInput('volunteerId', []);
    const clockBtn = button('Clock in', { kind: 'primary', type: 'submit' });
    const form = el('form', { class: 'inline-form' }, field('Volunteer', volunteerSelect), clockBtn);
    host.appendChild(el('h3', {}, 'Clock in a volunteer'));
    host.appendChild(form);
    clockHost.replaceChildren(host);

    volunteers
      .then((list) => {
        for (const volunteer of list) {
          volunteerSelect.appendChild(
            el('option', { value: String(volunteer.id) }, volunteer.name)
          );
        }
      })
      .catch((err) => addNotice('error', err.message));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const volunteerId = Number(volunteerSelect.value);
      if (!volunteerId) {
        addNotice('error', 'Choose a volunteer first.');
        return;
      }
      setBusy(clockBtn, true, 'Clocking in…');
      try {
        const record = await api.post(`/api/attendance/sessions/${id}/clock-in`, { volunteerId });
        addNotice('ok', `${record.volunteerName} clocked in.`);
        await refresh();
      } catch (err) {
        addNotice('error', err.message);
      } finally {
        setBusy(clockBtn, false);
      }
    });
  }

  function drawRecords(records) {
    const host = el('div', {});
    host.appendChild(el('h2', {}, 'Attendance records'));
    if (records.length === 0) {
      host.appendChild(emptyState('Nobody has clocked in yet.'));
      recordsHost.replaceChildren(host);
      return;
    }
    const rows = records.map((record) => {
      const cells = [
        record.volunteerName,
        formatSGTimestamp(record.clockIn),
        record.clockOut ? formatSGTimestamp(record.clockOut) : chip('In progress', 'chip-warn'),
        record.hours === null ? chip('In progress', 'chip-warn') : formatHours(record.hours),
      ];
      if (record.clockOut === null) {
        const outBtn = button('Clock out', { kind: 'primary', small: true });
        outBtn.addEventListener('click', async () => {
          setBusy(outBtn, true, 'Clocking out…');
          try {
            const updated = await api.post(`/api/attendance/sessions/${id}/clock-out`, {
              volunteerId: record.volunteerId,
            });
            addNotice('ok', `${updated.volunteerName} clocked out.`);
            await refresh();
          } catch (err) {
            addNotice('error', err.message);
            setBusy(outBtn, false);
          }
        });
        cells.push(outBtn);
      } else {
        cells.push('');
      }
      return cells;
    });
    host.appendChild(table(['Volunteer', 'Clock in (SGT)', 'Clock out (SGT)', 'Hours', ''], rows));
    recordsHost.replaceChildren(host);
  }

  await refresh();
}
