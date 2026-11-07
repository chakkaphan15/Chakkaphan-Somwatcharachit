import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import { FiPackage, FiDollarSign, FiAlertTriangle, FiUsers, FiDownload, FiLayers, FiShoppingCart, FiBox, FiClipboard, FiList, FiBarChart2 } from 'react-icons/fi';

const buildDailySales = (rows, year, month) => {
  const map = {};
  (rows || []).forEach(r => { map[String(r.day)] = { total: Number(r.total) || 0, count: Number(r.count) || 0 }; });
  const daysInMonth = new Date(year, month, 0).getDate();
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const data = map[String(d)] || { total: 0, count: 0 };
    result.push({ day: d, label: String(d), total: data.total, count: data.count });
  }
  return result;
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState([
    { key: 'products', icon: FiPackage, label: 'สินค้าทั้งหมด', value: '-', desc: 'รายการในระบบ', gradient: 'linear-gradient(135deg, #1d6fd6, #1d6fd6)', path: '/products' },
    { key: 'sales', icon: FiDollarSign, label: 'ขายวันนี้', value: '-', desc: 'ยอดขายปัจจุบัน', gradient: 'linear-gradient(135deg, #16a34a, #16a34a)', path: '/sale/history?range=today' },
    { key: 'lowstock', icon: FiAlertTriangle, label: 'สินค้าใกล้หมด', value: '-', desc: 'ต่ำกว่า stock ต่ำสุด', gradient: 'linear-gradient(135deg, #ef6c00, #ef6c00)', path: '/products?low_stock=1' },
    { key: 'users', icon: FiUsers, label: 'ผู้ใช้งานทั้งหมด', value: '-', desc: 'ผู้ใช้งานในระบบ', gradient: 'linear-gradient(135deg, #0ea5e9, #0ea5e9)', path: '/users' },
    { key: 'receive', icon: FiDownload, label: 'รับเข้าวันนี้', value: '-', desc: 'รายการรับสินค้า', gradient: 'linear-gradient(135deg, #eab308, #eab308)', path: '/receive/history?range=today' },
    { key: 'stock', icon: FiLayers, label: 'สต๊อกคงเหลือ', value: '-', desc: 'จำนวนรวมทั้งหมด', gradient: 'linear-gradient(135deg, #7c3aed, #7c3aed)', path: '/products' },
  ]);
  const [monthlySales, setMonthlySales] = useState([]);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [monthLabel, setMonthLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hr = new Date().getHours();
    if (hr < 12) setGreeting('สวัสดีตอนเช้า');
    else if (hr < 17) setGreeting('สวัสดีตอนบ่าย');
    else setGreeting('สวัสดีตอนเย็น');
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [pRes, uRes, lsRes, sRes, stRes, rRes, msRes] = await Promise.allSettled([
        api.get('/products?limit=1'),
        api.get('/users?limit=1'),
        api.get('/products/low-stock'),
        api.get('/sales/today-stats'),
        api.get('/products/all'),
        api.get('/receipts/today-stats'),
        api.get('/sales/daily-stats')
      ]);

      const pData = pRes.value?.data;
      const lRes = lsRes.value?.data;
      const sData = sRes.value?.data?.data;
      const allProducts = stRes.value?.data?.data || [];
      const rData = rRes.value?.data?.data;

      const lData = (lRes && lRes.data) || [];
      let totalStock = allProducts.reduce((sum, p) => sum + (parseInt(p.stock_quantity) || 0), 0);
      const now = new Date();
      setMonthLabel(now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }));
      setMonthlySales(buildDailySales(msRes.value?.data?.data, now.getFullYear(), now.getMonth() + 1));

      setStats(prev => prev.map(s => {
        if (s.key === 'products') {
          const total = pData?.pagination?.total || 0;
          return { ...s, value: total.toLocaleString() };
        }
        if (s.key === 'sales') {
          const count = sData?.count || 0;
          const total = sData?.total || 0;
          return { ...s, value: Number(total).toLocaleString('th-TH', { minimumFractionDigits: 2 }), desc: count.toLocaleString() + ' รายการ' };
        }
        if (s.key === 'users') {
          const total = uRes.value?.data?.pagination?.total || 0;
          return { ...s, value: total.toLocaleString() };
        }
        if (s.key === 'lowstock') {
          const count = Array.isArray(lData) ? lData.length : 0;
          return { ...s, value: count.toLocaleString() };
        }
        if (s.key === 'receive') {
          const count = rData?.count || 0;
          return { ...s, value: count.toLocaleString(), desc: count.toLocaleString() + ' รายการ' };
        }
        if (s.key === 'stock') {
          return { ...s, value: totalStock.toLocaleString() };
        }
        return s;
      }));
    } catch { } finally {
      setLoading(false);
      setMonthlyLoading(false);
    }
  };

  const today = new Date().toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long'
  });

  const isTechnician = user?.user_role === 'supplier';

  const quickActions = isTechnician
    ? [
        { icon: FiClipboard, label: 'เบิกสินค้า', path: '/requisitions', color: '#7c3aed', light: '#ede9fe' },
      ]
    : [
        { icon: FiShoppingCart, label: 'ขายสินค้า', path: '/sale', color: '#16a34a', light: '#dcfce7' },
        { icon: FiDownload, label: 'รับสินค้า', path: '/receive', color: '#eab308', light: '#fef9c3' },
        { icon: FiClipboard, label: 'สั่งซื้อสินค้า', path: '/purchase-orders', color: '#1d6fd6', light: '#e0edff' },
        { icon: FiBox, label: 'จัดการคลัง', path: '/products', color: '#0ea5e9', light: '#e0f7ff' },
      ];

  return (
    <Layout title="แดชบอร์ด" hideHeader>
      {/* ใส่ isolation: isolate เพื่อแยก Layer การแสดงผลของ Dashboard ออกจาก Dropdown Menu */}
      <div className="dashboard-page" style={{ isolation: 'isolate', position: 'relative', zIndex: 1 }}>
        <div className="dashboard-welcome">
          <div className="welcome-content">
            <div className="welcome-text">
              <h2>{greeting}, {user?.fullname || user?.username}</h2>
              <p>ยินดีต้อนรับสู่ระบบจัดการสต๊อกสินค้า Technic Stock</p>
            </div>
            <div className="welcome-info">
              <div className="welcome-date">
                <FiList size={14} />
                <span>{today}</span>
              </div>
              <div className="welcome-role">
                <span className={`role-badge ${user?.user_role === 'admin' ? 'admin' : 'employee'}`}>
                  {user?.user_role === 'admin' ? 'ผู้ดูแลระบบ' : isTechnician ? 'ช่าง' : 'พนักงาน'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="stats-grid">
          {stats.map((card, i) => (
            <div className="stat-card-modern stat-card-link" key={i} onClick={() => card.path && navigate(card.path)} title={card.path ? `ไปหน้า${card.label}` : ''}>
              <div className="stat-card-accent" style={{ background: card.gradient }} />
              <div className="stat-card-body">
                <div className="stat-card-icon" style={{ background: card.gradient }}>
                  <card.icon size={20} />
                </div>
                <div className="stat-card-label">{card.label}</div>
                <div className="stat-card-value">
                  {loading ? <span className="spinner" /> : card.value}
                </div>
                <div className="stat-card-desc">{card.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="dashboard-bottom">
          <div className="db-panel db-panel-sales-chart">
            <div className="db-panel-header">
              <FiBarChart2 size={18} color="#11408c" />
              <h3>ยอดขายรายเดือน ({monthLabel})</h3>
            </div>
            <div className="db-panel-body">
              {monthlyLoading ? (
                <div className="db-loading">กำลังโหลด...</div>
              ) : (
                <div className="sales-chart">
                  {(() => {
                    const max = Math.max(...monthlySales.map(m => m.total), 1);
                    return monthlySales.map(m => (
                      <div className="sc-col" key={m.day}>
                        <div className="sc-bar-wrap">
                          <div className="sc-value">{m.total > 0 ? m.total.toLocaleString('th-TH') : '0'}</div>
                          <div className={`sc-bar ${m.total === 0 ? 'sc-bar-empty' : ''}`} style={{ height: `${m.total > 0 ? Math.max((m.total / max) * 100, 6) : 3}%` }} title={`${m.day} ${monthLabel} ${m.total.toLocaleString('th-TH')} บาท`} />
                        </div>
                        <div className="sc-label">{m.label}</div>
                      </div>
                    ));
                  })()}
                </div>
              )}
              {!monthlyLoading && (
                <div className="sc-summary">
                  ยอดรวมเดือนนี้ {monthlySales.reduce((sum, m) => sum + m.total, 0).toLocaleString('th-TH')} บาท ({monthlySales.reduce((sum, m) => sum + m.count, 0)} รายการ)
                </div>
              )}
            </div>
          </div>

          <div className="db-panel db-panel-actions">
            <div className="db-panel-header">
              <FiList size={18} color="#1e40af" />
              <h3>การดำเนินการด่วน</h3>
            </div>
            <div className="db-panel-body">
              <div className="quick-actions-grid">
                {quickActions.map((action, i) => (
                  <button key={i} className="quick-action-btn" onClick={() => navigate(action.path)}
                    style={{ '--accent': action.color, '--accent-light': action.light }}>
                    <div className="qab-icon" style={{ background: action.light, color: action.color }}>
                      <action.icon size={22} />
                    </div>
                    <div className="qab-label">{action.label}</div>
                    <div className="qab-arrow">→</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;