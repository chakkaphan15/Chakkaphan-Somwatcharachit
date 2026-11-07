import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lg-page">
      <div className="lg-shell">
        <div className="lg-media">
          <div className="lg-media-brand">
            <strong>Technic Stock</strong>
            <small>เว็บแอปพลิเคชั่นจัดการสต๊อกสินค้า ร้านเทคนิคการไฟฟ้า</small>
          </div>
        </div>
        <div className="lg-panel">
          <div className="lg-content">
            <div className="lg-header">
              <img src="/images/logo.png" alt="Technic Stock" className="lg-logo-img" />
              <h1>เข้าสู่ระบบ</h1>
              <p>ยินดีต้อนรับสู่ Technic Stock</p>
            </div>
            {error && <div className="lg-error">⚠️ {error}</div>}
            <form onSubmit={handleSubmit} className="lg-form">
              <div className="lg-field">
                <label htmlFor="lg-username">ชื่อผู้ใช้</label>
                <div className="lg-input">
                  <input id="lg-username" type="text" placeholder="กรอกชื่อผู้ใช้"
                    value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
              </div>
              <div className="lg-field">
                <label htmlFor="lg-password">รหัสผ่าน</label>
                <div className="lg-input">
                  <input id="lg-password" type="password" placeholder="กรอกรหัสผ่าน"
                    value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </div>
              <button type="submit" className="lg-submit" disabled={loading}>
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
