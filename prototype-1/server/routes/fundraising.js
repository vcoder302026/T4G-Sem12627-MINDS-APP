// Fundraisers, products, transactional orders and order status updates.

import { Router } from 'express';
import { withTransaction, applyUpdate } from '../db.js';
import {
  NAME_MAX,
  notFoundError,
  optionalTrimmedString,
  rejectUnknownFields,
  requireBodyObject,
  requireDateString,
  requireMoneyCents,
  requirePositiveCount,
  requirePositiveId,
  requireTrimmedString,
  requireEnumValue,
  validationError,
} from '../validation.js';

function fundraiserOut(row) {
  return { id: row.id, name: row.name, date: row.date, createdAt: row.created_at };
}

function productOut(row) {
  return { id: row.id, fundraiserId: row.fundraiser_id, name: row.name, priceCents: row.price_cents };
}

function orderOut(order, items) {
  return {
    id: order.id,
    fundraiserId: order.fundraiser_id,
    customerName: order.customer_name,
    customerContact: order.customer_contact,
    totalCents: order.total_cents,
    paymentStatus: order.payment_status,
    collectionStatus: order.collection_status,
    createdAt: order.created_at,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
    })),
  };
}

export function createFundraisersRouter(db) {
  const router = Router();

  const selectAll = db.prepare(
    'SELECT id, name, date, created_at FROM fundraisers ORDER BY date DESC, id DESC'
  );
  const selectById = db.prepare('SELECT id, name, date, created_at FROM fundraisers WHERE id = ?');
  const selectProducts = db.prepare(
    'SELECT id, fundraiser_id, name, price_cents FROM products WHERE fundraiser_id = ? ORDER BY name COLLATE NOCASE, id'
  );
  const selectOrders = db.prepare(
    'SELECT id, fundraiser_id, customer_name, customer_contact, total_cents, payment_status, collection_status, created_at FROM orders WHERE fundraiser_id = ? ORDER BY created_at DESC, id DESC'
  );
  const selectOrderById = db.prepare(
    'SELECT id, fundraiser_id, customer_name, customer_contact, total_cents, payment_status, collection_status, created_at FROM orders WHERE id = ?'
  );
  const selectItemsForOrder = db.prepare(
    'SELECT id, order_id, product_id, product_name, quantity, unit_price_cents FROM order_items WHERE order_id = ? ORDER BY id'
  );
  const selectProductById = db.prepare(
    'SELECT id, fundraiser_id, name, price_cents FROM products WHERE id = ?'
  );

  function loadFundraiser(idParam) {
    const id = requirePositiveId(idParam, 'Fundraiser id');
    const fundraiser = selectById.get(id);
    if (!fundraiser) throw notFoundError('Fundraiser not found.');
    return fundraiser;
  }

  function itemsForOrder(orderId) {
    return selectItemsForOrder.all(orderId);
  }

  router.get('/', (req, res, next) => {
    try {
      res.json({ data: selectAll.all().map(fundraiserOut) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['name', 'date']);
      const name = requireTrimmedString(body.name, 'Name');
      const date = requireDateString(body.date, 'Date');
      const result = db
        .prepare('INSERT INTO fundraisers (name, date, created_at) VALUES (?,?,?)')
        .run(name, date, new Date().toISOString());
      res.status(201).json({ data: fundraiserOut(selectById.get(Number(result.lastInsertRowid))) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/products', (req, res, next) => {
    try {
      const fundraiser = loadFundraiser(req.params.id);
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['name', 'priceCents']);
      const name = requireTrimmedString(body.name, 'Product name');
      const priceCents = requireMoneyCents(body.priceCents, 'Price');
      const result = db
        .prepare('INSERT INTO products (fundraiser_id, name, price_cents) VALUES (?,?,?)')
        .run(fundraiser.id, name, priceCents);
      res
        .status(201)
        .json({ data: productOut(selectProductById.get(Number(result.lastInsertRowid))) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/orders', (req, res, next) => {
    try {
      const fundraiser = loadFundraiser(req.params.id);
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['customerName', 'customerContact', 'items']);
      const customerName = requireTrimmedString(body.customerName, 'Customer name');
      const customerContact = optionalTrimmedString(body.customerContact, 'Customer contact', {
        max: NAME_MAX,
      });
      if (!Array.isArray(body.items) || body.items.length === 0) {
        throw validationError('At least one order item is required.');
      }
      const seenProductIds = new Set();
      const parsedItems = [];
      for (const rawItem of body.items) {
        const item = requireBodyObject(rawItem, 'Each order item');
        rejectUnknownFields(item, ['productId', 'quantity']);
        const productId = requirePositiveId(item.productId, 'Product id');
        const quantity = requirePositiveCount(item.quantity, 'Quantity');
        if (seenProductIds.has(productId)) {
          throw validationError('Duplicate product in order.');
        }
        seenProductIds.add(productId);
        parsedItems.push({ productId, quantity });
      }

      const created = withTransaction(db, () => {
        const products = new Map();
        for (const product of selectProducts.all(fundraiser.id)) {
          products.set(product.id, product);
        }
        let totalCents = 0;
        for (const item of parsedItems) {
          const product = products.get(item.productId);
          if (!product) {
            throw validationError('One of the products does not belong to this fundraiser.');
          }
          totalCents += product.price_cents * item.quantity;
        }
        const now = new Date().toISOString();
        const orderResult = db
          .prepare(
            `INSERT INTO orders (fundraiser_id, customer_name, customer_contact, total_cents, created_at)
             VALUES (?,?,?,?,?)`
          )
          .run(fundraiser.id, customerName, customerContact, totalCents, now);
        const orderId = Number(orderResult.lastInsertRowid);
        const insertItem = db.prepare(
          `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price_cents)
           VALUES (?,?,?,?,?)`
        );
        for (const item of parsedItems) {
          const product = products.get(item.productId);
          insertItem.run(orderId, product.id, product.name, item.quantity, product.price_cents);
        }
        return orderId;
      });

      res.status(201).json({ data: orderOut(selectOrderById.get(created), itemsForOrder(created)) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req, res, next) => {
    try {
      const fundraiser = loadFundraiser(req.params.id);
      const products = selectProducts.all(fundraiser.id).map(productOut);
      const orders = selectOrders.all(fundraiser.id).map((order) => orderOut(order, itemsForOrder(order.id)));
      const totalSalesCents = orders.reduce((sum, order) => sum + order.totalCents, 0);
      const paidSalesCents = orders
        .filter((order) => order.paymentStatus === 'paid')
        .reduce((sum, order) => sum + order.totalCents, 0);
      res.json({
        data: {
          fundraiser: fundraiserOut(fundraiser),
          products,
          orders,
          totalSalesCents,
          paidSalesCents,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createOrdersRouter(db) {
  const router = Router();
  const selectOrderById = db.prepare(
    'SELECT id, fundraiser_id, customer_name, customer_contact, total_cents, payment_status, collection_status, created_at FROM orders WHERE id = ?'
  );
  const selectItemsForOrder = db.prepare(
    'SELECT id, order_id, product_id, product_name, quantity, unit_price_cents FROM order_items WHERE order_id = ? ORDER BY id'
  );

  router.patch('/:id', (req, res, next) => {
    try {
      const id = requirePositiveId(req.params.id, 'Order id');
      const order = selectOrderById.get(id);
      if (!order) throw notFoundError('Order not found.');
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['paymentStatus', 'collectionStatus'], { requireAtLeastOne: true });
      const updates = {};
      if (body.paymentStatus !== undefined) {
        updates.payment_status = requireEnumValue(body.paymentStatus, 'Payment status', [
          'unpaid',
          'paid',
        ]);
      }
      if (body.collectionStatus !== undefined) {
        updates.collection_status = requireEnumValue(body.collectionStatus, 'Collection status', [
          'pending',
          'collected',
        ]);
      }
      applyUpdate(db, 'orders', id, updates);
      res.json({
        data: orderOut(selectOrderById.get(id), selectItemsForOrder.all(id)),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
