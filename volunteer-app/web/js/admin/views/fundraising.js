// Section 2: Fundraising — fundraisers, products and orders.
// Totals shown while typing an order are only a preview: the server works out
// the real total from the stored prices.

import { call } from '../../api.js';
import { badge, busy, el, fuzzyFilter, labelled, mount, searchBox, toast } from '../../ui.js';
import {
  backTo, dateRangeText, field, formModal, icon, inlineSelect, load, money, pageHead, panel, plural, row, stat, statGrid, table, toolbar,
} from '../kit.js';

function fundraiserFields(f = {}) {
  return [
    field('name', 'Fundraiser name', { value: f.name || '', required: true, placeholder: 'e.g. Charity bake sale 2026' }),
    field('description', 'Description', { type: 'textarea', value: f.description || '', rows: 2, optional: true }),
    row(field('startDate', 'Start date', { type: 'date', value: f.startDate || '', optional: true }),
      field('endDate', 'End date', { type: 'date', value: f.endDate || '', optional: true })),
  ];
}

export function renderFundraisers(root, app, ctx) {
  const host = el('div', {});
  const create = () => formModal('New fundraiser', fundraiserFields(), 'Create fundraiser', async (d) => {
    const res = await call('createFundraiser', d);
    toast(res.message);
    location.hash = `#/admin/fundraiser/${res.fundraiser.fundraiserId}`;
  });
  mount(root, pageHead('Fundraising', 'Fundraisers, what they sell, and every order taken.',
    el('button', { class: 'btn btn-primary', onclick: create }, icon('plus', 'size-4'), 'New fundraiser')), host);
  return load(host, ctx, () => call('listFundraisers'), (d) => {
    const all = d.fundraisers;
    const sum = (k) => all.reduce((s, f) => s + f.sales[k], 0);
    mount(host,
      statGrid(
        stat('Open fundraisers', all.filter((f) => f.status === 'open').length, { tone: 'indigo' }),
        stat('Total sales', money(sum('totalCents')), { tone: 'emerald' }),
        stat('Paid', money(sum('paidCents'))),
        stat('Unpaid orders', sum('unpaid'), { tone: sum('unpaid') ? 'amber' : 'slate' }),
        stat('To collect', sum('toCollect'))),
      el('div', { class: 'mt-6' }, panel('Fundraisers', null, table([
        { label: 'Fundraiser', cell: (f) => el('span', {}, el('span', { class: 'block font-bold' }, f.name), el('span', { class: 'block text-xs muted' }, dateRangeText(f.startDate, f.endDate))) },
        { label: 'Status', cell: (f) => (f.status === 'open' ? badge('Open', 'emerald') : badge('Closed', 'slate')) },
        { label: 'Products', cell: (f) => String(f.products), class: 'text-right' },
        { label: 'Orders', cell: (f) => String(f.sales.orders), class: 'text-right' },
        { label: 'Sales', cell: (f) => money(f.sales.totalCents), class: 'text-right whitespace-nowrap' },
        { label: 'Paid', cell: (f) => money(f.sales.paidCents), class: 'text-right whitespace-nowrap' },
      ], all, { empty: 'No fundraisers yet. Create one to add products and take orders.', href: (f) => `#/admin/fundraiser/${f.fundraiserId}` }))));
  });
}

export function renderFundraiser(root, app, ctx, fundraiserId) {
  const host = el('div', {});
  let query = '';
  let showOrders = 'all';
  let data = null;
  const ordersHost = el('div', {});
  const refresh = () => load(host, ctx, () => call('fundraiserDetail', { fundraiserId }), draw);
  const apply = (res) => { toast(res.message); draw(res); };

  const editFundraiser = () => formModal('Edit fundraiser', fundraiserFields(data.fundraiser), 'Save', async (d) => {
    apply(await call('updateFundraiser', { fundraiserId, ...d }));
  });

  const productModal = (p) => formModal(p ? `Edit ${p.name}` : 'Add a product', [
    field('name', 'Product name', { value: p ? p.name : '', required: true }),
    field('price', 'Price (SGD)', { value: p ? (p.priceCents / 100).toFixed(2) : '', inputmode: 'decimal', placeholder: '5.50', required: true,
      hint: p ? 'Changing the price does not change orders already taken.' : undefined }),
  ], p ? 'Save product' : 'Add product', async (d) => {
    apply(await call('saveProduct', p ? { productId: p.productId, name: d.name, price: d.price } : { fundraiserId, ...d }));
  });

  const orderModal = () => {
    const products = data.products.filter((p) => p.status === 'active');
    if (!products.length) { toast('Add a product first.', 'warn'); return; }
    const preview = el('p', { class: 'text-right text-lg font-extrabold' }, money(0));
    const qty = products.map((p) => {
      const input = el('input', { type: 'number', min: 0, max: 1000, step: 1, value: 0, class: 'input w-24 py-2 text-right', 'aria-label': `Quantity of ${p.name}`, dataset: { productId: p.productId, cents: p.priceCents } });
      input.addEventListener('input', () => {
        preview.textContent = money(qty.reduce((s, i) => s + (Math.max(0, Math.floor(Number(i.value) || 0)) * Number(i.dataset.cents)), 0));
      });
      return input;
    });
    formModal('Take an order', [
      row(field('customerName', 'Customer name', { required: true }), field('customerContact', 'Phone or email', { optional: true })),
      labelled('Items', el('div', { class: 'well divide-y divide-slate-200 dark:divide-neutral-800' },
        products.map((p, i) => el('div', { class: 'flex items-center justify-between gap-3 px-4 py-2' },
          el('span', {}, el('span', { class: 'block font-bold' }, p.name), el('span', { class: 'block text-xs muted' }, money(p.priceCents))),
          qty[i])))),
      el('div', { class: 'flex items-center justify-between' }, el('span', { class: 'text-sm muted' }, 'Total (worked out again by the server)'), preview),
      el('label', { class: 'flex items-center gap-3 text-sm font-bold' },
        el('input', { type: 'checkbox', name: 'paid', value: 'yes', class: 'size-5 accent-indigo-600' }), 'Already paid'),
      field('notes', 'Notes', { type: 'textarea', rows: 2, optional: true }),
    ], 'Save order', async (d) => {
      const items = qty.filter((i) => Number(i.value) > 0).map((i) => ({ productId: i.dataset.productId, quantity: Number(i.value) }));
      apply(await call('createOrder', {
        fundraiserId, customerName: d.customerName, customerContact: d.customerContact, notes: d.notes, items,
        paymentStatus: d.paid === 'yes' ? 'paid' : 'unpaid',
      }));
    }, { wide: true });
  };

  const setOrder = async (o, patch) => {
    try {
      const res = await call('updateOrder', { orderId: o.orderId, ...patch });
      data = res;
      drawOrders();
      drawStats();
      toast(res.message);
    } catch (err) {
      toast(err.message, 'error');
      throw err;
    }
  };

  const statsHost = el('div', {});
  const drawStats = () => {
    const s = data.sales;
    mount(statsHost, statGrid(
      stat('Total sales', money(s.totalCents), { tone: 'emerald', sub: plural(s.orders, 'order') }),
      stat('Paid', money(s.paidCents), { tone: 'indigo' }),
      stat('Still to pay', money(s.totalCents - s.paidCents), { tone: s.unpaid ? 'amber' : 'slate', sub: plural(s.unpaid, 'unpaid order') }),
      stat('To collect', s.toCollect)));
  };

  const drawOrders = () => {
    let rows = data.orders;
    if (showOrders === 'unpaid') rows = rows.filter((o) => o.paymentStatus === 'unpaid');
    if (showOrders === 'pending') rows = rows.filter((o) => o.collectionStatus === 'pending');
    rows = fuzzyFilter(rows, query, (o) => [o.customerName, o.customerContact, o.summary, o.notes]);
    mount(ordersHost, table([
      { label: 'Customer', cell: (o) => el('span', {}, el('span', { class: 'block font-bold' }, o.customerName), el('span', { class: 'block text-xs muted' }, o.customerContact)) },
      { label: 'Items', cell: (o) => el('span', {}, el('span', { class: 'block' }, o.summary), o.notes ? el('span', { class: 'block text-xs muted' }, o.notes) : null) },
      { label: 'Total', cell: (o) => el('span', { class: 'font-bold' }, money(o.totalCents)), class: 'text-right whitespace-nowrap' },
      { label: 'Payment', cell: (o) => inlineSelect([{ value: 'unpaid', label: 'Unpaid' }, { value: 'paid', label: 'Paid' }], o.paymentStatus, (v) => setOrder(o, { paymentStatus: v }), `Payment for ${o.customerName}`) },
      { label: 'Collection', cell: (o) => inlineSelect([{ value: 'pending', label: 'To collect' }, { value: 'collected', label: 'Collected' }], o.collectionStatus, (v) => setOrder(o, { collectionStatus: v }), `Collection for ${o.customerName}`) },
      { label: 'Taken', cell: (o) => el('span', { class: 'text-xs muted' }, el('span', { class: 'block whitespace-nowrap' }, o.createdAt.slice(0, 16)), el('span', { class: 'block' }, `by ${o.createdBy}`)) },
    ], rows, { empty: data.orders.length ? 'No orders match.' : 'No orders yet.' }));
  };

  const draw = (d) => {
    data = d;
    const f = d.fundraiser;
    const toggle = el('button', { class: 'btn btn-secondary' }, f.status === 'open' ? 'Close fundraiser' : 'Reopen');
    toggle.addEventListener('click', () => busy(toggle, '', async () => apply(await call('updateFundraiser', { fundraiserId, status: f.status === 'open' ? 'closed' : 'open' }))));
    const archive = (p) => {
      const b = el('button', { class: 'btn btn-secondary btn-sm' }, p.status === 'active' ? 'Stop selling' : 'Sell again');
      b.addEventListener('click', () => busy(b, '', async () => apply(await call('saveProduct', { productId: p.productId, status: p.status === 'active' ? 'archived' : 'active' }))));
      return b;
    };
    const showSelect = el('select', { class: 'input py-2', 'aria-label': 'Show orders' },
      [['all', 'All orders'], ['unpaid', 'Unpaid'], ['pending', 'To collect']].map(([v, l]) => el('option', { value: v, selected: v === showOrders }, l)));
    showSelect.addEventListener('change', () => { showOrders = showSelect.value; drawOrders(); });

    mount(host,
      backTo('#/admin/fundraising', 'Fundraising'),
      pageHead(f.name, [dateRangeText(f.startDate, f.endDate), f.description].filter((x) => x && x !== '—').join(' · '),
        f.status === 'open' ? badge('Open', 'emerald') : badge('Closed', 'slate'),
        el('button', { class: 'btn btn-secondary', onclick: editFundraiser }, icon('pencil', 'size-4'), 'Edit'), toggle,
        f.status === 'open' ? el('button', { class: 'btn btn-primary', onclick: orderModal }, icon('plus', 'size-4'), 'Take an order') : null),
      statsHost,
      el('div', { class: 'mt-6 space-y-6' },
        panel('Orders', null,
          toolbar(labelled('Show', showSelect), el('div', { class: 'min-w-56 flex-1' }, labelled('Search', searchBox('Customer, contact or item', (q) => { query = q; drawOrders(); })))),
          ordersHost),
        panel('Products', el('button', { class: 'btn btn-secondary btn-sm', onclick: () => productModal(null) }, icon('plus', 'size-4'), 'Add product'),
          table([
            { label: 'Product', cell: (p) => el('span', { class: p.status === 'archived' ? 'muted line-through' : 'font-bold' }, p.name) },
            { label: 'Price', cell: (p) => money(p.priceCents), class: 'whitespace-nowrap' },
            { label: 'Status', cell: (p) => (p.status === 'active' ? badge('On sale', 'emerald') : badge('Not on sale', 'slate')) },
            { label: '', cell: (p) => el('span', { class: 'flex justify-end gap-1' }, el('button', { class: 'btn btn-secondary btn-sm', onclick: () => productModal(p) }, icon('pencil', 'size-4'), 'Edit'), archive(p)), class: 'text-right' },
          ], d.products, { empty: 'No products yet. Add what this fundraiser sells.' }))));
    drawStats();
    drawOrders();
  };

  mount(root, host);
  return refresh();
}
