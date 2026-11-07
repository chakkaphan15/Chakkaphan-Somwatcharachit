const bcrypt = require('bcryptjs');
const db = require('./config/db');

const run = async () => {
  try {
    const hashedPassword = bcrypt.hashSync('admin', 10);
    const [exist] = await db.query('SELECT user_id FROM user WHERE username = ?', ['admin']);

    if (exist.length > 0) {
      await db.query('UPDATE user SET password = ?, user_role = ? WHERE username = ?', [hashedPassword, 'admin', 'admin']);
      console.log(`Admin user password updated`);
    } else {
      const [maxRow] = await db.query('SELECT MAX(CAST(SUBSTRING(user_id,6) AS UNSIGNED)) AS maxId FROM user');
      const nextNum = (maxRow[0].maxId || 0) + 1;
      const userId = `USER${String(nextNum).padStart(5, '0')}`;

      await db.query(
        `INSERT INTO user (user_id, password, prefix, first_name, last_name, username, phone_number, user_role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [userId, hashedPassword, 'นาย', 'Admin', 'System', 'admin', '0000000000', 'admin']
      );
      console.log(`Admin user created: ${userId}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

run();
