// Fundraising: fundraisers with products and orders. Orders are totalled by
// the backend; staff can mark orders paid/unpaid and collected/pending.

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
  dateInput,
  todayInSingapore,
} from '../ui.js';

export async function renderFundraiserList(view, { navigate }) {
  view.appendChild(el('h1', {}, 'Fundraising'));
  view.appendChild(
    el('p', { class: 'muted' }, 'Create fundraisers, sell products and track payment and collection.')
  );

  const noticeArea = el('div', {});
  const addNotice = (kind, message) => {
    noticeArea.replaceChildren(notice(kind, message));
    if (kind === 'ok') setTimeout(() => noticeArea.replaceChildren(), 4000);
  };

  const nameInput = textInput('name', { required: true, placeholder: 'e.g. Year-End Bake Sale' });
  const dateField = dateInput('date', { value: todayInSingapore(), required: true });
  const addSubmit = button('Create fundraiser', { kind: 'primary', type: 'submit' });
  const addForm = el(
    'form',
    { class: 'card inline-form' },
    field('Name', nameInput),
    field('Date', dateField),
    addSubmit
  );
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(addSubmit, true, 'Saving…');
    try {
      await api.post('/api/fundraisers', { name: nameInput.value, date: dateField.value });
      addNotice('ok', 'Fundraiser created.');
      nameInput.value = '';
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
      const fundraisers = await api.get('/api/fundraisers');
      listHost.replaceChildren();
      listHost.appendChild(el('h2', {}, 'Fundraisers'));
      if (fundraisers.length === 0) {
        listHost.appendChild(emptyState('No fundraisers yet.'));
        return;
      }
      listHost.appendChild(
        table(
          ['Name', 'Date', ''],
          fundraisers.map((fundraiser) => [
            fundraiser.name,
            formatDate(fundraiser.date),
            el('a', { href: `#/fundraising/${fundraiser.id}` }, 'Open'),
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

export async function renderFundraiserDetail(view, { id, navigate }) {
  view.appendChild(el('a', { class: 'back-link', href: '#/fundraising' }, '← Back to fundraising'));

  const noticeArea = el('div', {});
  const addNotice = (kind, message) => {
    noticeArea.replaceChildren(notice(kind, message));
    if (kind === 'ok') setTimeout(() => noticeArea.replaceChildren(), 4000);
  };

  const headHost = el('div', { class: 'page-head' });
  const productsHost = el('div', {});
  const orderFormHost = el('div', {});
  const ordersHost = el('div', {});
  const totalsHost = el('div', {});
  view.append(headHost, noticeArea, productsHost, orderFormHost, ordersHost, totalsHost);

  let detail = null;

  async function refresh() {
    headHost.replaceChildren(loadingState());
    try {
      detail = await api.get(`/api/fundraisers/${id}`);
    } catch (err) {
      if (err.status === 404) {
        view.replaceChildren(
          el('h1', {}, 'Fundraising'),
          errorNotice(err),
          el('p', {}, el('a', { href: '#/fundraising' }, '← Back to fundraising'))
        );
        return;
      }
      throw err;
    }
    const { fundraiser, products, orders, totalSalesCents, paidSalesCents } = detail;
    headHost.replaceChildren(
      el('h1', {}, fundraiser.name),
      el('p', { class: 'muted' }, formatDate(fundraiser.date))
    );
    drawProducts(products);
    drawOrderForm(products);
    drawOrders(orders);
    drawTotals(totalSalesCents, paidSalesCents);
  }

  function drawProducts(products) {
    const host = el('div', { class: 'card' });
    host.appendChild(el('h3', {}, 'Products'));

    const nameInput = textInput('productName', { required: true, placeholder: 'e.g. Banana loaf' });
    const priceInput = textInput('price', { required: true, placeholder: 'e.g. 5.50' });
    const addBtn = button('Add product', { kind: 'primary', type: 'submit' });
    const form = el(
      'form',
      { class: 'inline-form' },
      field('Product name', nameInput),
      field('Price (SGD)', priceInput),
      addBtn
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const priceCents = parseMoneyInput(priceInput.value);
      if (priceCents === null) {
        addNotice('error', 'Price must be a positive amount with at most two decimal places, e.g. 5.50.');
        return;
      }
      setBusy(addBtn, true, 'Saving…');
      try {
        await api.post(`/api/fundraisers/${id}/products`, {
          name: nameInput.value,
          priceCents,
        });
        addNotice('ok', 'Product added.');
        nameInput.value = '';
        priceInput.value = '';
        await refresh();
      } catch (err) {
        addNotice('error', err.message);
      } finally {
        setBusy(addBtn, false);
      }
    });

    host.appendChild(form);
    if (products.length === 0) {
      host.appendChild(emptyState('No products yet. Add one to start taking orders.'));
    } else {
      host.appendChild(
        table(
          ['Product', 'Price'],
          products.map((product) => [product.name, formatMoney(product.priceCents)])
        )
      );
    }
    productsHost.replaceChildren(host);
  }

  function drawOrderForm(products) {
    const host = el('div', { class: 'card' });
    host.appendChild(el('h3', {}, 'New order'));
    if (products.length === 0) {
      host.appendChild(el('p', { class: 'help-text' }, 'Add at least one product before creating orders.'));
      orderFormHost.replaceChildren(host);
      return;
    }

    const customerInput = textInput('customerName', { required: true, placeholder: 'e.g. Mdm Lim' });
    const contactInput = textInput('customerContact', { placeholder: 'phone or email (optional)' });
    const itemsHost = el('div', {});
    const previewTotal = el('p', { class: 'total-line' }, 'Preview total: SGD 0.00');
    const createBtn = button('Create order', { kind: 'primary', type: 'submit' });
    const form = el(
      'form',
      {},
      el('div', { class: 'inline-form' }, field('Customer name', customerInput), field('Customer contact', contactInput)),
      itemsHost,
      el('div', {}, button('＋ Add another product', { small: true, onClick: () => addItemRow() })),
      previewTotal,
      createBtn
    );

    const productOptions = products.map((product) => ({
      value: String(product.id),
      label: `${product.name} — ${formatMoney(product.priceCents)}`,
    }));

    function addItemRow() {
      const productSelect = selectInput('productId', productOptions);
      const qtyInput = textInput('quantity', { value: '1' });
      qtyInput.setAttribute('inputmode', 'numeric');
      qtyInput.style.width = '70px';
      const removeBtn = button('Remove', { small: true });
      const row = el('div', { class: 'item-row' }, field('Product', productSelect), field('Qty', qtyInput), removeBtn);
      removeBtn.addEventListener('click', () => {
        row.remove();
        if (itemsHost.children.length === 0) addItemRow();
        updatePreview();
      });
      productSelect.addEventListener('change', updatePreview);
      qtyInput.addEventListener('input', updatePreview);
      itemsHost.appendChild(row);
      updatePreview();
    }

    function collectItems() {
      const items = [];
      for (const row of itemsHost.querySelectorAll('.item-row')) {
        const productId = Number(row.querySelector('select').value);
        const quantity = Number(row.querySelector('input').value);
        items.push({ productId, quantity });
      }
      return items;
    }

    function updatePreview() {
      let cents = 0;
      for (const item of collectItems()) {
        const product = products.find((candidate) => candidate.id === item.productId);
        if (product && Number.isInteger(item.quantity) && item.quantity > 0) {
          cents += product.priceCents * item.quantity;
        }
      }
      previewTotal.replaceChildren('Preview total: ', el('strong', {}, formatMoney(cents)));
      previewTotal.appendChild(document.createTextNode(' (final total is calculated by the server)'));
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const items = collectItems();
      if (items.length === 0) {
        addNotice('error', 'Add at least one product to the order.');
        return;
      }
      if (!customerInput.value.trim()) {
        addNotice('error', 'Customer name is required.');
        return;
      }
      setBusy(createBtn, true, 'Saving…');
      try {
        await api.post(`/api/fundraisers/${id}/orders`, {
          customerName: customerInput.value,
          customerContact: contactInput.value,
          items,
        });
        addNotice('ok', 'Order created.');
        customerInput.value = '';
        contactInput.value = '';
        itemsHost.replaceChildren();
        addItemRow();
        await refresh();
      } catch (err) {
        addNotice('error', err.message);
      } finally {
        setBusy(createBtn, false);
      }
    });

    itemsHost.replaceChildren();
    addItemRow();
    host.appendChild(form);
    orderFormHost.replaceChildren(host);
  }

  function drawOrders(orders) {
    const host = el('div', {});
    host.appendChild(el('h2', {}, 'Orders'));
    if (orders.length === 0) {
      host.appendChild(emptyState('No orders yet.'));
      ordersHost.replaceChildren(host);
      return;
    }
    const rows = orders.map((order) => {
      const itemsText = order.items
        .map((item) => `${item.quantity} × ${item.productName}`)
        .join(', ');
      const payment = order.paymentStatus === 'paid' ? chip('Paid', 'chip-ok') : chip('Unpaid', 'chip-warn');
      const collection =
        order.collectionStatus === 'collected' ? chip('Collected', 'chip-ok') : chip('Pending', 'chip-warn');
      const togglePay = button(order.paymentStatus === 'paid' ? 'Mark unpaid' : 'Mark paid', { small: true });
      togglePay.addEventListener('click', () =>
        updateOrder(order.id, {
          paymentStatus: order.paymentStatus === 'paid' ? 'unpaid' : 'paid',
        })
      );
      const toggleCollect = button(
        order.collectionStatus === 'collected' ? 'Mark pending' : 'Mark collected',
        { small: true }
      );
      toggleCollect.addEventListener('click', () =>
        updateOrder(order.id, {
          collectionStatus: order.collectionStatus === 'collected' ? 'pending' : 'collected',
        })
      );
      return [
        order.customerName,
        order.customerContact || '—',
        itemsText,
        formatMoney(order.totalCents),
        payment,
        collection,
        el('div', { class: 'action-cell' }, togglePay, toggleCollect),
      ];
    });
    host.appendChild(
      table(['Customer', 'Contact', 'Items', 'Total', 'Payment', 'Collection', 'Actions'], rows)
    );
    ordersHost.replaceChildren(host);
  }

  async function updateOrder(orderId, body) {
    try {
      await api.patch(`/api/orders/${orderId}`, body);
      addNotice('ok', 'Order updated.');
      await refresh();
    } catch (err) {
      addNotice('error', err.message);
    }
  }

  function drawTotals(totalSalesCents, paidSalesCents) {
    const host = el('div', { class: 'card' });
    host.appendChild(el('h3', {}, 'Sales'));
    host.appendChild(
      el('p', { class: 'total-line' }, 'Total sales: ', el('strong', {}, formatMoney(totalSalesCents)))
    );
    host.appendChild(
      el('p', { class: 'total-line' }, 'Paid sales: ', el('strong', {}, formatMoney(paidSalesCents)))
    );
    totalsHost.replaceChildren(host);
  }

  await refresh();
}
