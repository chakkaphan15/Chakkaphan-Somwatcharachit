const db = require('./db');

// เพิ่มคอลัมน์ให้ตารางที่มีอยู่แล้วแบบปลอดภัย (ข้ามถ้ามีคอลัมน์นี้อยู่แล้ว)
const ensureColumn = async (table, column, definition) => {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (rows.length === 0) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[schema] Added column ${table}.${column}`);
  }
};

// ผ่อนคอลัมน์ที่เคยบังคับ NOT NULL ให้รับค่า NULL ได้ (ไม่แก้ไขข้อมูลเดิม)
const ensureNullableColumn = async (table, column, definition) => {
  const [rows] = await db.query(
    `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (rows.length > 0 && rows[0].IS_NULLABLE === 'NO') {
    await db.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${definition}`);
    console.log(`[schema] Made ${table}.${column} nullable`);
  }
};

// สร้างตารางที่จำเป็นสำหรับฟีเจอร์เบิกสินค้า หากยังไม่มีในฐานข้อมูล
const ensureSchema = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory_lots (
        lot_id INT AUTO_INCREMENT PRIMARY KEY,
        lot_number VARCHAR(50) NOT NULL,
        product_id VARCHAR(20) NOT NULL,
        receipt_id VARCHAR(20) NULL,
        quantity_received INT NOT NULL,
        quantity_remaining INT NOT NULL,
        unit_cost DECIMAL(10,2) NOT NULL,
        received_at DATETIME NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'available',
        INDEX idx_inventory_lots_product (product_id),
        INDEX idx_inventory_lots_receipt (receipt_id),
        INDEX idx_inventory_lots_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn('inventory_lots', 'lot_number', 'VARCHAR(50) NOT NULL');
    await ensureColumn('inventory_lots', 'product_id', 'VARCHAR(20) NOT NULL');
    await ensureColumn('inventory_lots', 'receipt_id', 'VARCHAR(20) NULL');
    await ensureColumn('inventory_lots', 'quantity_received', 'INT NOT NULL');
    await ensureColumn('inventory_lots', 'quantity_remaining', 'INT NOT NULL');
    await ensureColumn('inventory_lots', 'unit_cost', 'DECIMAL(10,2) NOT NULL');
    await ensureColumn('inventory_lots', 'received_at', 'DATETIME NOT NULL');
    await ensureColumn('inventory_lots', 'status', "VARCHAR(20) NOT NULL DEFAULT 'available'");

    const [stockProducts] = await db.query(
      'SELECT product_id, stock_quantity, purchase_price, created_at FROM products WHERE stock_quantity > 0'
    );
    for (const product of stockProducts) {
      const [lotTotals] = await db.query(
        'SELECT COALESCE(SUM(quantity_remaining), 0) AS lot_quantity FROM inventory_lots WHERE product_id = ?',
        [product.product_id]
      );
      const missingQuantity = parseInt(product.stock_quantity) - (parseInt(lotTotals[0].lot_quantity) || 0);
      if (missingQuantity <= 0) continue;
      const legacyNumber = `LEGACY-${product.product_id}`;
      const [legacyLots] = await db.query(
        'SELECT lot_id, quantity_received, quantity_remaining FROM inventory_lots WHERE product_id = ? AND lot_number = ?',
        [product.product_id, legacyNumber]
      );
      if (legacyLots.length > 0) {
        await db.query(
          'UPDATE inventory_lots SET quantity_received = quantity_received + ?, quantity_remaining = quantity_remaining + ? WHERE lot_id = ?',
          [missingQuantity, missingQuantity, legacyLots[0].lot_id]
        );
      } else {
        await db.query(
          `INSERT INTO inventory_lots
            (lot_number, product_id, quantity_received, quantity_remaining, unit_cost, received_at, status)
           VALUES (?, ?, ?, ?, ?, ?, 'available')`,
          [
            legacyNumber,
            product.product_id,
            missingQuantity,
            missingQuantity,
            parseFloat(product.purchase_price) || 0,
            product.created_at || new Date()
          ]
        );
      }
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS requisition (
        requisition_id VARCHAR(20) PRIMARY KEY,
        user_id VARCHAR(20) NOT NULL,
        customer_name VARCHAR(150) NOT NULL,
        job_detail VARCHAR(255) NOT NULL,
        requisition_date DATETIME NOT NULL,
        requisition_status VARCHAR(20) NOT NULL DEFAULT 'รออนุมัติ',
        approved_by VARCHAR(20) NULL,
        approved_at DATETIME NULL,
        reject_reason VARCHAR(255) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_requisition_user (user_id),
        INDEX idx_requisition_status (requisition_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS requisition_details (
        requisition_detail_id INT AUTO_INCREMENT PRIMARY KEY,
        requisition_id VARCHAR(20) NOT NULL,
        product_id VARCHAR(20) NOT NULL,
        quantity INT NOT NULL,
        INDEX idx_requisition_detail_req (requisition_id),
        INDEX idx_requisition_detail_prod (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ราคาที่ต้องเรียกเก็บจากลูกค้าสำหรับของที่เบิกไป (คำนวณตอนอนุมัติ) + สถานะการชำระเงิน
    await ensureColumn('requisition', 'subtotal_amount', 'DECIMAL(10,2) NULL');
    await ensureColumn('requisition', 'vat_amount', 'DECIMAL(10,2) NULL');
    await ensureColumn('requisition', 'net_amount', 'DECIMAL(10,2) NULL');
    await ensureColumn('requisition', 'discount_amount', 'DECIMAL(10,2) NULL');
    await ensureColumn('requisition', 'labor_cost', 'DECIMAL(10,2) NULL');
    await ensureColumn('requisition', 'payment_status', "VARCHAR(20) NOT NULL DEFAULT 'ยังไม่ชำระ'");
    await ensureColumn('requisition', 'payment_method', 'VARCHAR(20) NULL');
    await ensureColumn('requisition', 'paid_at', 'DATETIME NULL');

    // ต้นทุนต่อหน่วยของแต่ละล็อตที่รับเข้า และล็อตที่ถูกใช้งานในแต่ละเอกสาร
    await ensureColumn('goods_receipt_details', 'unit_cost', 'DECIMAL(10,2) NULL');
    await ensureColumn('goods_receipt_details', 'lot_id', 'INT NULL');
    await ensureColumn('sale_details', 'lot_id', 'INT NULL');
    await ensureColumn('sale_details', 'unit_cost', 'DECIMAL(10,2) NULL');
    // ชื่อลูกค้าที่กรอกตอนเบิก (ใช้กับรายการขายที่มาจากการเบิกสินค้า)
    await ensureColumn('sale', 'customer_name', 'VARCHAR(150) NULL');
    await ensureColumn('requisition_details', 'lot_id', 'INT NULL');
    await ensureColumn('requisition_details', 'unit_cost', 'DECIMAL(10,2) NULL');
    await ensureColumn('requisition_details', 'unit_price', 'DECIMAL(10,2) NULL');

    // ราคาขายของแต่ละล็อต (แยกจากราคาปัจจุบันของสินค้าใน products) รองรับ NULL สำหรับล็อตเก่าที่ยังไม่เคยระบุราคาขาย
    await ensureColumn('inventory_lots', 'selling_price', 'DECIMAL(10,2) NULL');
    await ensureColumn('goods_receipt_details', 'selling_price', 'DECIMAL(10,2) NULL');
    // รองรับการเพิ่มสินค้าโดยยังไม่มีราคาขาย (จะกำหนดตอนรับสินค้าเข้าแทน)
    await ensureNullableColumn('products', 'selling_price', 'DECIMAL(10,2) NULL');
    // วันหมดอายุของแต่ละล็อต (ถ้ามี) ใช้แสดง/แก้ไขในหน้าแสดงสินค้าแบบแยกรายล็อต
    await ensureColumn('inventory_lots', 'expiry_date', 'DATE NULL');

    // ข้อมูลร้าน/บริษัทส่วนกลาง (แถวเดียว id=1 ไม่ผูกกับ Admin คนใดคนหนึ่ง)
    await db.query(`
      CREATE TABLE IF NOT EXISTS company_profile (
        id INT PRIMARY KEY,
        company_name VARCHAR(150) NOT NULL,
        tax_id VARCHAR(20) NULL,
        address VARCHAR(255) NULL,
        phone_number VARCHAR(20) NULL,
        updated_at DATETIME NULL,
        updated_by VARCHAR(20) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // บันทึกสำเนาข้อมูลร้าน/บริษัท ณ เวลาที่สร้าง PO แต่ละใบ (ไม่ย้อนเปลี่ยนตามข้อมูลปัจจุบัน)
    await ensureColumn('purchase_orders', 'company_name', 'VARCHAR(150) NULL');
    await ensureColumn('purchase_orders', 'company_tax_id', 'VARCHAR(20) NULL');
    await ensureColumn('purchase_orders', 'company_address', 'VARCHAR(255) NULL');
    await ensureColumn('purchase_orders', 'company_phone', 'VARCHAR(20) NULL');

    // ผู้อนุมัติใบสั่งซื้อ (Admin ที่กดอนุมัติจริง)
    await ensureColumn('purchase_orders', 'approved_by', 'VARCHAR(20) NULL');
    await ensureColumn('purchase_orders', 'approved_at', 'DATETIME NULL');

    console.log('[schema] Requisition tables OK');
  } catch (err) {
    console.error('[schema] Error:', err.message);
  }
};

module.exports = ensureSchema;
