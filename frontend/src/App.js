import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, isPathAllowedForRole } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProductsPage from './pages/ProductsPage';
import BrandsPage from './pages/BrandsPage';
import UsersPage from './pages/UsersPage';
import SuppliersPage from './pages/SuppliersPage';
import CompanyProfilePage from './pages/CompanyProfilePage';
import ProfilePage from './pages/ProfilePage';
import SalePage from './pages/SalePage';
import CustomersPage from './pages/CustomersPage';
import ReceivePage from './pages/ReceivePage';
import RequisitionPage from './pages/RequisitionPage';
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import SalesHistoryPage from './pages/SalesHistoryPage';
import ReceiveHistoryPage from './pages/ReceiveHistoryPage';
import PurchaseOrdersHistoryPage from './pages/PurchaseOrdersHistoryPage';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh', background: '#f1f5f9' }}>
      <div className="text-center">
        <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}></div>
        <div style={{ color: '#64748b', fontSize: '14px' }}>กำลังโหลด...</div>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  if (!isPathAllowedForRole(location.pathname, user.user_role)) return <Navigate to="/" />;
  return children;
};

// เมื่อกดเมนูหน้าปัจจุบันซ้ำ TopNav ส่ง state.resetKey ใหม่ -> remount หน้าธุรกรรมเพื่อเริ่มรายการใหม่ (ไม่ reload เว็บ)
const ResettablePage = ({ children }) => {
  const location = useLocation();
  return <React.Fragment key={location.state?.resetKey || 0}>{children}</React.Fragment>;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/brands" element={<PrivateRoute><BrandsPage /></PrivateRoute>} />
          <Route path="/users" element={<PrivateRoute><UsersPage /></PrivateRoute>} />
          <Route path="/company-profile" element={<PrivateRoute><CompanyProfilePage /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route path="/suppliers" element={<PrivateRoute><SuppliersPage /></PrivateRoute>} />
          <Route path="/products" element={<PrivateRoute><ProductsPage /></PrivateRoute>} />
          <Route path="/sale" element={<PrivateRoute><ResettablePage><SalePage /></ResettablePage></PrivateRoute>} />
          <Route path="/sale/history" element={<PrivateRoute><SalesHistoryPage /></PrivateRoute>} />
          <Route path="/receive" element={<PrivateRoute><ResettablePage><ReceivePage /></ResettablePage></PrivateRoute>} />
          <Route path="/requisitions" element={<PrivateRoute><ResettablePage><RequisitionPage /></ResettablePage></PrivateRoute>} />
          <Route path="/receive/history" element={<PrivateRoute><ReceiveHistoryPage /></PrivateRoute>} />
          <Route path="/purchase-orders" element={<PrivateRoute><ResettablePage><PurchaseOrdersPage /></ResettablePage></PrivateRoute>} />
          <Route path="/purchase-orders/history" element={<PrivateRoute><PurchaseOrdersHistoryPage /></PrivateRoute>} />
          <Route path="/customers" element={<PrivateRoute><CustomersPage /></PrivateRoute>} />
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
