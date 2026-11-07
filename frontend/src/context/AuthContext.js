import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

// หน้าที่ Admin เท่านั้นเข้าได้ (ทั้ง Employee และ Technician ("supplier") ห้ามเข้า)
export const ADMIN_ONLY_PATHS = ['/users', '/company-profile'];
// หน้าที่ Technician ("supplier") ได้รับอนุญาตให้เข้า (นอกเหนือจากนี้ถือว่าไม่มีสิทธิ์)
export const TECHNICIAN_ALLOWED_PATHS = ['/', '/products', '/requisitions', '/profile'];

// ตรวจสิทธิ์การเข้าหน้าตาม Role จริงของผู้ใช้ (ใช้ร่วมกันทั้ง Route guard และเมนู)
export const isPathAllowedForRole = (path, role) => {
  if (role === 'admin') return true;
  if (ADMIN_ONLY_PATHS.includes(path)) return false;
  if (role === 'supplier') return TECHNICIAN_ALLOWED_PATHS.includes(path);
  return true;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) loadUser();
    else setLoading(false);
  }, []);

  const loadUser = async () => {
    try {
      const res = await api.get('/auth/me');
      const { token, ...userData } = res.data.data;
      if (token) localStorage.setItem('token', token);
      setUser(userData);
    } catch {
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    localStorage.setItem('token', res.data.data.token);
    setUser(res.data.data.user);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};
