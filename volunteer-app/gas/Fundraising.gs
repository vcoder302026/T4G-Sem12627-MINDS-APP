/**
 * Fundraising.gs — staff dashboard: fundraisers, products and orders.
 *
 * Prices are typed in dollars and stored in the sheet in dollars, but every
 * sum is worked out in whole cents. An order's total always comes from the
 * stored product prices (never from a total the browser sends), and each
 * order keeps its own copy of the unit prices, so a later price change does
 * not alter past orders.
 */

function fundraiserOut_(f) {
  return {
    fundraiserId: f.fundraiserId,
    name: f.name,
    description: f.description || '',
    startDate: f.startDate || '',
    endDate: f.endDate || '',
    status: f.status === 'closed' ? 'closed' : 'open',
    createdBy: f.createdBy || '',
    createdAt: f.createdAt || '',
  };
}

function productOut_(pr) {
  return {
    productId: pr.productId,
    fundraiserId: pr.fundraiserId,
    name: pr.name,
    priceCents: toCents_(pr.price),
    status: pr.status === 'archived' ? 'archived' : 'active',
  };
}

function orderOut_(o, items) {
  return {
    orderId: o.orderId,
    fundraiserId: o.fundraiserId,
    customerName: o.customerName,
    customerContact: o.customerContact || '',
    items: (items || []).map((i) => ({
      productId: i.productId,
      productName: i.productName,
      quantity: Number(i.quantity) || 0,
      unitCents: toCents_(i.unitPrice),
      lineCents: toCents_(i.lineTotal),
    })),
    summary: o.items || '',
    totalCents: toCents_(o.total),
    paymentStatus: o.paymentStatus === 'paid' ? 'paid' : 'unpaid',
    collectionStatus: o.collectionStatus === 'collected' ? 'collected' : 'pending',
    notes: o.notes || '',
    createdBy: o.createdBy || '',
    createdAt: o.createdAt || '',
  };
}

function salesOf_(orders) {
  const paid = orders.filter((o) => o.paymentStatus === 'paid');
  return {
    orders: orders.length,
    totalCents: orders.reduce((s, o) => s + toCents_(o.total), 0),
    paidCents: paid.reduce((s, o) => s + toCents_(o.total), 0),
    unpaid: orders.length - paid.length,
    toCollect: orders.filter((o) => o.collectionStatus !== 'collected').length,
  };
}

function listFundraisers_() {
  const products = table_('products').rows();
  const orders = table_('orders').rows();
  const list = table_('fundraisers').rows().filter((f) => f.fundraiserId).map((f) => Object.assign(fundraiserOut_(f), {
    products: products.filter((p) => p.fundraiserId === f.fundraiserId && p.status !== 'archived').length,
    sales: salesOf_(orders.filter((o) => o.fundraiserId === f.fundraiserId)),
  }));
  // Open fundraisers first, then the newest.
  list.sort((a, b) => (a.status === b.status ? (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0) : a.status === 'open' ? -1 : 1));
  return { fundraisers: list };
}

function fundraiserFields_(p, partial) {
  const out = {};
  if (!partial || has_(p, 'name')) out.name = str_(p.name, 'Fundraiser name', { required: true });
  if (!partial || has_(p, 'description')) out.description = str_(p.description, 'Description', { max: LIMITS.NOTES });
  if (!partial || has_(p, 'startDate')) out.startDate = date_(p.startDate, 'Start date', { optional: true });
  if (!partial || has_(p, 'endDate')) out.endDate = date_(p.endDate, 'End date', { optional: true });
  if (partial && has_(p, 'status')) out.status = oneOf_(p.status, 'Status', ['open', 'closed']);
  return out;
}

function checkDateOrder_(start, end) {
  if (start && end && end < start) throw err_.validation('The end date must be on or after the start date.');
}

function createFundraiser_(p, admin) {
  onlyFields_(p, ['name', 'description', 'startDate', 'endDate']);
  const fields = fundraiserFields_(p, false);
  checkDateOrder_(fields.startDate, fields.endDate);
  const f = table_('fundraisers').insert(Object.assign(fields, {
    fundraiserId: newId_('FR'), status: 'open', createdBy: admin.name, createdAt: fmtDateTime_(now_()),
  }));
  return Object.assign(fundraiserDetail_({ fundraiserId: f.fundraiserId }), { message: `Created "${f.name}".` });
}

function updateFundraiser_(p) {
  onlyFields_(p, ['fundraiserId', 'name', 'description', 'startDate', 'endDate', 'status']);
  requireChanges_(p, 'fundraiserId');
  const { table, row } = rowById_('fundraisers', 'fundraiserId', p.fundraiserId, 'Fundraiser');
  const patch = fundraiserFields_(p, true);
  checkDateOrder_(has_(patch, 'startDate') ? patch.startDate : row.startDate, has_(patch, 'endDate') ? patch.endDate : row.endDate);
  table.update(row, patch);
  if (patch.name) {
    ['products', 'orders'].forEach((key) => {
      const t = table_(key);
      t.filter((r) => r.fundraiserId === row.fundraiserId).forEach((r) => t.update(r, { fundraiserName: patch.name }));
    });
  }
  return Object.assign(fundraiserDetail_({ fundraiserId: row.fundraiserId }), { message: 'Fundraiser saved.' });
}

function fundraiserDetail_(p) {
  const { row: f } = rowById_('fundraisers', 'fundraiserId', p.fundraiserId, 'Fundraiser');
  const products = table_('products').filter((x) => x.fundraiserId === f.fundraiserId);
  const orders = table_('orders').filter((o) => o.fundraiserId === f.fundraiserId);
  const items = table_('orderItems').rows();
  const itemsByOrder = {};
  items.forEach((i) => { (itemsByOrder[i.orderId] = itemsByOrder[i.orderId] || []).push(i); });
  return {
    fundraiser: fundraiserOut_(f),
    products: sortBy_(products, (x) => `${x.status === 'archived' ? 1 : 0}|${String(x.name).toLowerCase()}`).map(productOut_),
    orders: sortBy_(orders, (o) => `${o.createdAt}|${String(o._row).padStart(6, '0')}`).reverse().map((o) => orderOut_(o, itemsByOrder[o.orderId])),
    sales: salesOf_(orders),
  };
}

/** Adds a product (no productId) or edits one (name, price, active/archived). */
function saveProduct_(p, admin) {
  onlyFields_(p, ['fundraiserId', 'productId', 'name', 'price', 'status']);
  const products = table_('products');
  if (p.productId) {
    if (!['name', 'price', 'status'].some((k) => has_(p, k))) throw err_.validation('Nothing to update.');
    const { row } = rowById_('products', 'productId', p.productId, 'Product');
    const patch = {};
    if (has_(p, 'name')) patch.name = str_(p.name, 'Product name', { required: true });
    if (has_(p, 'price')) patch.price = dollars_(cents_(p.price, 'Price'));
    if (has_(p, 'status')) patch.status = oneOf_(p.status, 'Status', ['active', 'archived']);
    if (patch.name) assertProductNameFree_(products, row.fundraiserId, patch.name, row.productId);
    table_('products').update(row, patch);
    return Object.assign(fundraiserDetail_({ fundraiserId: row.fundraiserId }), { message: 'Product saved. Past orders keep the price they were sold at.' });
  }
  const { row: f } = rowById_('fundraisers', 'fundraiserId', p.fundraiserId, 'Fundraiser');
  const name = str_(p.name, 'Product name', { required: true });
  const priceCents = cents_(p.price, 'Price');
  assertProductNameFree_(products, f.fundraiserId, name, null);
  products.insert({
    productId: newId_('PD'), fundraiserId: f.fundraiserId, fundraiserName: f.name, name,
    price: dollars_(priceCents), status: 'active', createdBy: admin.name, createdAt: fmtDateTime_(now_()),
  });
  return Object.assign(fundraiserDetail_({ fundraiserId: f.fundraiserId }), { message: `Added ${name}.` });
}

function assertProductNameFree_(products, fundraiserId, name, productId) {
  const clash = products.find((x) => x.fundraiserId === fundraiserId && x.productId !== productId
    && x.status !== 'archived' && String(x.name).trim().toLowerCase() === name.toLowerCase());
  if (clash) throw err_.conflict(`This fundraiser already has a product called "${clash.name}".`);
}

/**
 * Takes an order: items [{ productId, quantity }]. Everything is checked before
 * anything is written, so a bad line never leaves half an order in the sheet.
 */
function createOrder_(p, admin) {
  onlyFields_(p, ['fundraiserId', 'customerName', 'customerContact', 'notes', 'items', 'paymentStatus']);
  const { row: f } = rowById_('fundraisers', 'fundraiserId', p.fundraiserId, 'Fundraiser');
  if (f.status === 'closed') throw err_.validation('This fundraiser is closed. Reopen it to take orders.');
  const customerName = str_(p.customerName, 'Customer name', { required: true });
  const customerContact = str_(p.customerContact, 'Contact', { max: LIMITS.SHORT });
  const notes = str_(p.notes, 'Notes', { max: LIMITS.NOTES });
  const paymentStatus = p.paymentStatus === undefined ? 'unpaid' : oneOf_(p.paymentStatus, 'Payment', ['unpaid', 'paid']);
  if (!Array.isArray(p.items) || !p.items.length) throw err_.validation('Add at least one item to the order.');
  if (p.items.length > 50) throw err_.validation('An order can have at most 50 different items.');

  const products = byKey_(table_('products').filter((x) => x.fundraiserId === f.fundraiserId), 'productId');
  const seen = {};
  const lines = p.items.map((raw, i) => {
    const item = obj_(raw, `Item ${i + 1}`);
    onlyFields_(item, ['productId', 'quantity']);
    const productId = id_(item.productId, `Item ${i + 1} product`);
    const product = products[productId];
    if (!product) throw err_.validation(`Item ${i + 1} is not a product of this fundraiser.`);
    if (product.status === 'archived') throw err_.validation(`${product.name} is no longer on sale.`);
    if (seen[productId]) throw err_.validation(`${product.name} is listed twice. Change the quantity instead.`);
    seen[productId] = true;
    const quantity = int_(item.quantity, `Quantity of ${product.name}`, 1, 1000);
    const unitCents = toCents_(product.price);
    return { product, quantity, unitCents, lineCents: unitCents * quantity };
  });
  const totalCents = lines.reduce((s, l) => s + l.lineCents, 0);

  const order = table_('orders').insert({
    orderId: newId_('OR'), fundraiserId: f.fundraiserId, fundraiserName: f.name, customerName, customerContact,
    items: lines.map((l) => `${l.quantity} × ${l.product.name}`).join(', '),
    total: dollars_(totalCents), paymentStatus, collectionStatus: 'pending', notes,
    createdBy: admin.name, createdAt: fmtDateTime_(now_()),
  });
  const orderItems = table_('orderItems');
  lines.forEach((l) => orderItems.insert({
    itemId: newId_('OI'), orderId: order.orderId, productId: l.product.productId, productName: l.product.name,
    quantity: l.quantity, unitPrice: dollars_(l.unitCents), lineTotal: dollars_(l.lineCents),
  }));
  return Object.assign(fundraiserDetail_({ fundraiserId: f.fundraiserId }), {
    orderId: order.orderId,
    message: `Order for ${customerName} saved: $${(totalCents / 100).toFixed(2)}.`,
  });
}

/** Orders can't be changed once taken; staff only mark them paid and collected. */
function updateOrder_(p, admin) {
  onlyFields_(p, ['orderId', 'paymentStatus', 'collectionStatus']);
  requireChanges_(p, 'orderId');
  const { table, row } = rowById_('orders', 'orderId', p.orderId, 'Order');
  const patch = stamp_(admin);
  if (has_(p, 'paymentStatus')) patch.paymentStatus = oneOf_(p.paymentStatus, 'Payment', ['unpaid', 'paid']);
  if (has_(p, 'collectionStatus')) patch.collectionStatus = oneOf_(p.collectionStatus, 'Collection', ['pending', 'collected']);
  table.update(row, patch);
  return Object.assign(fundraiserDetail_({ fundraiserId: row.fundraiserId }), { message: 'Order updated.' });
}
