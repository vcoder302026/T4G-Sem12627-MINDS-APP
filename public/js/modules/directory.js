// Volunteers and Trainees shared directories: searchable tables, add and
// inline edit forms. The same records feed every module's dropdowns.

import { api } from '../api.js';
import {
  button,
  el,
  emptyState,
  errorNotice,
  field,
  loadingState,
  notice,
  setBusy,
  table,
  textInput,
  textareaInput,
} from '../ui.js';

function buildDirectoryScreen({
  title,
  description,
  endpoint,
  searchLabel,
  searchPlaceholder,
  searchPredicate,
  fields,
  columns,
  addLabel = 'Add',
}) {
  const wrap = el('div', {});
  wrap.appendChild(el('h1', {}, title));
  wrap.appendChild(el('p', { class: 'muted' }, description));

  const noticeArea = el('div', {});
  const addNotice = (kind, message) => {
    noticeArea.replaceChildren(notice(kind, message));
    if (kind === 'ok') setTimeout(() => noticeArea.replaceChildren(), 4000);
  };

  // ---- add form ----
  const inputs = {};
  for (const spec of fields) {
    inputs[spec.key] =
      spec.type === 'textarea'
        ? textareaInput(spec.key, { placeholder: spec.placeholder || '', rows: spec.rows || 3 })
        : textInput(spec.key, { placeholder: spec.placeholder || '', required: spec.required });
  }
  const addSubmit = button(addLabel, { kind: 'primary', type: 'submit' });
  const addForm = el(
    'form',
    { class: 'card inline-form' },
    ...fields.map((spec) => field(spec.label, inputs[spec.key], { wide: spec.type === 'textarea' })),
    addSubmit
  );

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    noticeArea.replaceChildren();
    const body = {};
    for (const spec of fields) body[spec.key] = inputs[spec.key].value;
    setBusy(addSubmit, true, 'Saving…');
    try {
      await api.post(`/api/${endpoint}`, body);
      addNotice('ok', `${title.replace(/s$/, '')} added.`);
      for (const spec of fields) inputs[spec.key].value = '';
      await refresh();
    } catch (err) {
      addNotice('error', err.message);
    } finally {
      setBusy(addSubmit, false);
    }
  });

  wrap.appendChild(addForm);
  wrap.appendChild(noticeArea);

  // ---- search + table ----
  const searchInput = textInput('search', { placeholder: searchPlaceholder });
  searchInput.setAttribute('aria-label', searchLabel);
  const searchRow = el('div', { class: 'search-row' }, searchInput);
  const tableHost = el('div', {});
  let records = [];

  async function refresh() {
    tableHost.replaceChildren(loadingState());
    try {
      records = await api.get(`/api/${endpoint}`);
      drawTable();
    } catch (err) {
      tableHost.replaceChildren(errorNotice(err));
    }
  }

  function drawTable() {
    const query = searchInput.value.trim().toLowerCase();
    const visible = query ? records.filter((record) => searchPredicate(record, query)) : records;
    if (visible.length === 0) {
      tableHost.replaceChildren(emptyState(query ? 'No matching records.' : 'No records yet.'));
      return;
    }
    const rows = visible.map((record) => rowFor(record));
    const tableEl = table(columns.map((column) => column.label), rows);
    const tbodyRows = tableEl.querySelectorAll('tbody tr');
    visible.forEach((record, index) => {
      tbodyRows[index].dataset.id = String(record.id);
    });
    tableHost.replaceChildren(tableEl);
  }

  function rowFor(record) {
    const cells = columns.map((column) => column.value(record));
    const editBtn = button('Edit', { small: true });
    editBtn.addEventListener('click', () => editRow(record));
    cells.push(el('div', { class: 'action-cell' }, editBtn));
    return cells;
  }

  function editRow(record) {
    const tbody = tableHost.querySelector('tbody');
    const tr = [...(tbody?.querySelectorAll('tr') || [])].find((row) =>
      row.dataset.id === String(record.id)
    );
    if (!tr) return;
    const editInputs = {};
    for (const spec of fields) {
      editInputs[spec.key] =
        spec.type === 'textarea'
          ? textareaInput(spec.key, { rows: spec.rows || 3 })
          : textInput(spec.key);
      editInputs[spec.key].value = record[spec.key] ?? '';
    }
    const saveBtn = button('Save', { kind: 'primary', small: true });
    const cancelBtn = button('Cancel', { small: true });
    const editTr = el('tr', { 'data-id': String(record.id) });
    for (const spec of fields) {
      editTr.appendChild(el('td', {}, editInputs[spec.key]));
    }
    editTr.appendChild(el('td', {}, el('div', { class: 'action-cell' }, saveBtn, cancelBtn)));

    cancelBtn.addEventListener('click', () => {
      tbody.replaceChild(tr, editTr);
    });
    saveBtn.addEventListener('click', async () => {
      const body = {};
      for (const spec of fields) body[spec.key] = editInputs[spec.key].value;
      setBusy(saveBtn, true);
      try {
        await api.patch(`/api/${endpoint}/${record.id}`, body);
        addNotice('ok', 'Changes saved.');
        await refresh();
      } catch (err) {
        addNotice('error', err.message);
        setBusy(saveBtn, false);
      }
    });

    tbody.replaceChild(editTr, tr);
  }

  searchInput.addEventListener('input', drawTable);

  wrap.appendChild(searchRow);
  wrap.appendChild(tableHost);
  refresh();
  return wrap;
}

export async function renderVolunteers(view) {
  const screen = buildDirectoryScreen({
    title: 'Volunteers',
    description:
      'Shared volunteer directory used by attendance, fundraising, outings, overseas trips and house visits.',
    endpoint: 'volunteers',
    searchLabel: 'Search volunteers by name or email',
    searchPlaceholder: 'Search by name or email…',
    searchPredicate: (volunteer, query) =>
      volunteer.name.toLowerCase().includes(query) || volunteer.email.toLowerCase().includes(query),
    fields: [
      { key: 'name', label: 'Name', required: true, placeholder: 'e.g. Jane Tan' },
      { key: 'email', label: 'Email', placeholder: 'optional' },
      { key: 'phone', label: 'Phone', placeholder: 'optional' },
    ],
    columns: [
      { label: 'Name', value: (v) => v.name },
      { label: 'Email', value: (v) => v.email || '—' },
      { label: 'Phone', value: (v) => v.phone || '—' },
    ],
  });
  view.appendChild(screen);
}

export async function renderTrainees(view) {
  const screen = buildDirectoryScreen({
    title: 'Trainees',
    description:
      'Shared trainee directory with caregiver and support details used by outings, overseas trips and house visits.',
    endpoint: 'trainees',
    searchLabel: 'Search trainees by name or caregiver',
    searchPlaceholder: 'Search by name or caregiver…',
    searchPredicate: (trainee, query) =>
      trainee.name.toLowerCase().includes(query) ||
      trainee.caregiverName.toLowerCase().includes(query),
    fields: [
      { key: 'name', label: 'Name', required: true, placeholder: 'e.g. Ahmad Rahman' },
      { key: 'caregiverName', label: 'Caregiver name', placeholder: 'optional' },
      { key: 'caregiverPhone', label: 'Caregiver phone', placeholder: 'optional' },
      {
        key: 'supportNeeds',
        label: 'Support needs',
        type: 'textarea',
        rows: 2,
        placeholder: 'optional',
      },
      { key: 'medicalNotes', label: 'Medical notes', type: 'textarea', rows: 2, placeholder: 'optional' },
      { key: 'dietaryNotes', label: 'Dietary notes', type: 'textarea', rows: 2, placeholder: 'optional' },
    ],
    columns: [
      { label: 'Name', value: (t) => t.name },
      { label: 'Caregiver', value: (t) => t.caregiverName || '—' },
      { label: 'Caregiver phone', value: (t) => t.caregiverPhone || '—' },
      { label: 'Support needs', value: (t) => t.supportNeeds || '—' },
    ],
  });
  view.appendChild(screen);
}
