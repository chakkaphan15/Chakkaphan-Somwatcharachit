const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const { notFound, errorHandler } = require('./middleware/errorHandler');
const seedOnce = require('./seed-once');
const ensureSchema = require('./config/ensureSchema');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `prod_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype.split('/')[1]);
    cb(null, extOk && mimeOk);
  }
});
app.upload = upload;

app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is running!', database: 'technic_stock' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/emergency-contacts', require('./routes/emergency_contacts'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/purchase-orders', require('./routes/purchase_orders'));
app.use('/api/requisitions', require('./routes/requisitions'));
app.use('/api/company', require('./routes/company'));

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database: technic_stock`);
  await ensureSchema();
  await seedOnce();
});
