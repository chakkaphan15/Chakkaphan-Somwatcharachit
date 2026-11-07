require('dotenv').config();
const db = require('./config/db');

async function testConnection() {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    console.log('✅ Database connected successfully!');
    console.log('Database: technic_stock');

    const [tables] = await db.query('SHOW TABLES');
    console.log('Tables:');
    tables.forEach(t => console.log(`  - ${Object.values(t)[0]}`));
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  } finally {
    process.exit();
  }
}

testConnection();
