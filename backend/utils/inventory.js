const AppError = require('../middleware/errorHandler').AppError;

const createLegacyLot = async (connection, productId) => {
  const [products] = await connection.query(
    'SELECT product_id, stock_quantity, purchase_price, created_at FROM products WHERE product_id = ?',
    [productId]
  );
  const product = products[0];
  if (!product || parseInt(product.stock_quantity) <= 0) return;

  const [existing] = await connection.query(
    'SELECT COALESCE(SUM(quantity_remaining), 0) AS lot_quantity FROM inventory_lots WHERE product_id = ?',
    [productId]
  );
  const remainingLegacyQuantity = parseInt(product.stock_quantity) - (parseInt(existing[0].lot_quantity) || 0);
  if (remainingLegacyQuantity <= 0) return;

  await connection.query(
    `INSERT INTO inventory_lots
      (lot_number, product_id, quantity_received, quantity_remaining, unit_cost, received_at, status)
     VALUES (?, ?, ?, ?, ?, ?, 'available')`,
    [
      `LEGACY-${product.product_id}`,
      product.product_id,
      remainingLegacyQuantity,
      remainingLegacyQuantity,
      parseFloat(product.purchase_price) || 0,
      product.created_at || new Date()
    ]
  );
};

const consumeLots = async (connection, productId, quantity, lotId) => {
  const remaining = parseInt(quantity) || 0;
  if (remaining < 1) throw new AppError('จำนวนสินค้าไม่ถูกต้อง', 400);

  await connection.query('SELECT product_id FROM products WHERE product_id = ? FOR UPDATE', [productId]);
  await createLegacyLot(connection, productId);

  const requestedLotId = parseInt(lotId) || null;
  if (requestedLotId) {
    const [selectedLots] = await connection.query(
      `SELECT lot_id, quantity_remaining, unit_cost
       FROM inventory_lots
       WHERE lot_id = ? AND product_id = ? AND quantity_remaining > 0 AND status = 'available'
       FOR UPDATE`,
      [requestedLotId, productId]
    );
    if (selectedLots.length === 0) {
      throw new AppError(`ไม่พบล็อตสินค้าที่เลือกหรือล็อตไม่พร้อมขาย`, 400);
    }
    const lot = selectedLots[0];
    const take = Math.min(remaining, parseInt(lot.quantity_remaining) || 0);
    if (take < remaining) {
      throw new AppError(`ล็อตสินค้าที่เลือกมีสต๊อกไม่เพียงพอ (คงเหลือ ${lot.quantity_remaining})`, 400);
    }
    await connection.query(
      'UPDATE inventory_lots SET quantity_remaining = quantity_remaining - ? WHERE lot_id = ?',
      [take, lot.lot_id]
    );
    return [{ lot_id: lot.lot_id, quantity: take, unit_cost: parseFloat(lot.unit_cost) || 0 }];
  }

  const [lots] = await connection.query(
    `SELECT lot_id, quantity_remaining, unit_cost
     FROM inventory_lots
     WHERE product_id = ? AND quantity_remaining > 0 AND status = 'available'
     ORDER BY received_at ASC, lot_id ASC
     FOR UPDATE`,
    [productId]
  );

  let needed = remaining;
  const allocations = [];
  for (const lot of lots) {
    if (needed <= 0) break;
    const take = Math.min(needed, parseInt(lot.quantity_remaining) || 0);
    if (take <= 0) continue;
    allocations.push({
      lot_id: lot.lot_id,
      quantity: take,
      unit_cost: parseFloat(lot.unit_cost) || 0
    });
    await connection.query(
      'UPDATE inventory_lots SET quantity_remaining = quantity_remaining - ? WHERE lot_id = ?',
      [take, lot.lot_id]
    );
    needed -= take;
  }

  if (needed > 0) {
    throw new AppError(`สินค้า "${productId}" มีสต๊อกไม่เพียงพอ (คงเหลือ ${remaining - needed})`, 400);
  }
  return allocations;
};

module.exports = { consumeLots };
