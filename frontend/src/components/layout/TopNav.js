import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, isPathAllowedForRole } from '../../context/AuthContext';
import api from '../../services/api';
import {
  FiGrid, FiUsers, FiShoppingCart, FiPackage, FiTag, FiTruck,
  FiUser, FiDownload, FiFileText, FiClipboard, FiChevronDown,
  FiLogOut, FiMenu, FiX, FiHome
} from 'react-icons/fi';

const menuData = [
  { label: 'แดชบอร์ด', path: '/', icon: <FiGrid /> },
  {
    label: 'จัดการข้อมูล',
    icon: <FiUsers />,
    children: [
      { label: 'สินค้า', path: '/products', icon: <FiPackage /> },
      { label: 'แบรนด์', path: '/brands', icon: <FiTag /> },
      { label: 'ผู้ใช้งาน', path: '/users', icon: <FiUsers /> },
      { label: 'ผู้จำหน่าย', path: '/suppliers', icon: <FiTruck /> },
      { label: 'ลูกค้า', path: '/customers', icon: <FiUser /> },
      { label: 'ข้อมูลร้าน/บริษัท', path: '/company-profile', icon: <FiHome /> },
    ],
  },
  {
    label: 'ธุรกรรม',
    icon: <FiShoppingCart />,
    children: [
      { label: 'ขายสินค้า', path: '/sale', icon: <FiShoppingCart /> },
      { label: 'สั่งซื้อสินค้า', path: '/purchase-orders', icon: <FiFileText /> },
      { label: 'รับสินค้าเข้า', path: '/receive', icon: <FiDownload /> },
      { label: 'เบิกสินค้า', path: '/requisitions', icon: <FiClipboard /> },
    ],
  },
];

const RESETTABLE_PATHS = ['/sale', '/purchase-orders', '/receive', '/requisitions'];

const TopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [openMenu, setOpenMenu] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingRequisitions, setPendingRequisitions] = useState(0);
  const [pendingPO, setPendingPO] = useState(0);
  const [pendingPayment, setPendingPayment] = useState(0);
  const navRef = useRef(null);

  // Fetch pending requisitions count for admin/employee
  useEffect(() => {
    const fetchPendingCount = async () => {
      if (user && (user.user_role === 'admin' || user.user_role === 'employee')) {
        try {
          const res = await api.get('/requisitions/pending-count');
          setPendingRequisitions(res.data.data?.count || 0);
        } catch (err) {
          console.error('Failed to fetch pending requisitions:', err);
        }
        // รอชำระเงิน = อนุมัติแล้วแต่ยังไม่ชำระ (พนักงานนับเฉพาะที่ตนเองอนุมัติ ตามที่หน้าเบิกสินค้าแสดง)
        try {
          const res = await api.get('/requisitions', { params: { status: 'อนุมัติ', page: 1, limit: 100 } });
          const awaiting = (res.data.data || []).filter((r) =>
            r.payment_status !== 'ชำระแล้ว' && (user.user_role === 'admin' || r.approved_by === user.user_id));
          setPendingPayment(awaiting.length);
        } catch (err) {
          console.error('Failed to fetch awaiting-payment requisitions:', err);
        }
      } else {
        setPendingRequisitions(0);
        setPendingPayment(0);
      }

      // ใบสั่งซื้อรออนุมัติ แจ้งเตือนเฉพาะ Admin
      if (user && user.user_role === 'admin') {
        try {
          const res = await api.get('/purchase-orders/summary', { params: { status: 'รออนุมัติ' } });
          setPendingPO(res.data.data?.count || 0);
        } catch (err) {
          console.error('Failed to fetch pending purchase orders:', err);
        }
      } else {
        setPendingPO(0);
      }
    };

    fetchPendingCount();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(interval);
  }, [user, location.pathname]);

  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const go = (path) => {
    if (path === location.pathname && RESETTABLE_PATHS.includes(path)) {
      // แจ้งหน้าปัจจุบันให้ Reset ตัวเอง (App.js จะ remount หน้านั้นตาม resetKey)
      navigate(path, { replace: true, state: { resetKey: Date.now() } });
    } else {
      navigate(path);
    }
    setOpenMenu(null);
    setMobileOpen(false);
  };

  const isGroupActive = (item) =>
    item.children ? item.children.some(c => location.pathname === c.path) : location.pathname === item.path;

  const userInitial = (user?.fullname || user?.username || 'U').charAt(0).toUpperCase();
  const roleText = user?.user_role === 'admin' ? 'ผู้ดูแลระบบ' : user?.user_role === 'supplier' ? 'ช่าง' : 'พนักงาน';

  // แสดงเฉพาะเมนูที่ Role ของผู้ใช้มีสิทธิ์เข้าถึง (ตรวจเงื่อนไขเดียวกับ Route guard ใน App.js)
  const visibleMenu = menuData
    .map(item => item.children
      ? { ...item, children: item.children.filter(c => isPathAllowedForRole(c.path, user?.user_role)) }
      : item)
    .filter(item => item.children ? item.children.length > 0 : isPathAllowedForRole(item.path, user?.user_role));

  return (
    <header className="topnav" ref={navRef}>
      <div className="topnav-logo" onClick={() => go('/')}>
        <img src="/images/logo.png" alt="Technic Stock" />
        <div className="topnav-brand">
          <strong>Technic Stock</strong>
          <small>ระบบจัดการสต๊อกสินค้า</small>
        </div>
      </div>

      <nav className={`topnav-menu ${mobileOpen ? 'open' : ''}`}>
        {visibleMenu.map((item, idx) =>
          item.children ? (
            <div
              key={item.label}
              className={`topnav-group ${isGroupActive(item) ? 'active' : ''} ${openMenu === idx ? 'open' : ''}`}
              onMouseEnter={() => setOpenMenu(idx)}
              onMouseLeave={() => openMenu === idx && setOpenMenu(null)}
            >
              <button
                type="button"
                className="topnav-item"
                onClick={() => setOpenMenu(openMenu === idx ? null : idx)}
              >
                <span className="topnav-item-icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.label === 'ธุรกรรม' && pendingRequisitions + pendingPayment + pendingPO > 0 && (
                  <span className="topnav-badge">{pendingRequisitions + pendingPayment + pendingPO > 99 ? '99+' : pendingRequisitions + pendingPayment + pendingPO}</span>
                )}
                <FiChevronDown className="topnav-caret" />
              </button>
              <div className="topnav-dropdown">
                {item.children.map((c) => (
                  <button
                    key={c.path}
                    type="button"
                    className={`topnav-link ${location.pathname === c.path ? 'active' : ''}`}
                    onClick={() => go(c.path)}
                  >
                    <span className="topnav-link-icon">{c.icon}</span>
                    {c.label}
                    {c.path === '/requisitions' && pendingRequisitions > 0 && (
                      <span className="topnav-badge" title="รออนุมัติการเบิก">{pendingRequisitions > 99 ? '99+' : pendingRequisitions}</span>
                    )}
                    {c.path === '/requisitions' && pendingPayment > 0 && (
                      <span className="topnav-badge" title="รอชำระเงิน" style={{ background: '#ea580c' }}>{pendingPayment > 99 ? '99+' : pendingPayment}</span>
                    )}
                    {c.path === '/purchase-orders' && pendingPO > 0 && (
                      <span className="topnav-badge">{pendingPO > 99 ? '99+' : pendingPO}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              key={item.label}
              type="button"
              className={`topnav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => go(item.path)}
            >
              <span className="topnav-item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        )}
      </nav>

      <div className="topnav-user">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
          onClick={() => go('/profile')}
          title="โปรไฟล์ของฉัน"
        >
          <div className="topnav-user-info">
            <div className="topnav-user-name">{user?.fullname || user?.username}</div>
            <div className="topnav-user-role">{roleText}</div>
          </div>
          <div className="topnav-avatar">{userInitial}</div>
        </div>
        <button className="topnav-logout" onClick={logout} title="ออกจากระบบ">
          <FiLogOut />
        </button>
        <button className="topnav-burger" onClick={() => setMobileOpen(o => !o)} aria-label="เมนู">
          {mobileOpen ? <FiX /> : <FiMenu />}
        </button>
      </div>
    </header>
  );
};

export default TopNav;
