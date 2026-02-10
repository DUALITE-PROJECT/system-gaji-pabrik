import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  permissions: string[];
  status: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Cek apakah ada sesi tersimpan di LocalStorage
    const storedUser = localStorage.getItem('erp_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('erp_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string) => {
    // 1. Cari user di database berdasarkan email
    const { data, error } = await supabase
      .from('user_access')
      .select('*')
      .eq('email', email.trim())
      .single();

    if (error || !data) {
      throw new Error('Email tidak terdaftar dalam sistem.');
    }

    if (data.status !== 'active') {
      throw new Error('Akun ini telah dinonaktifkan. Hubungi Admin.');
    }

    // 2. Simpan sesi
    const userData = {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      permissions: data.permissions || [], // Array string ID modul
      status: data.status
    };

    localStorage.setItem('erp_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('erp_user');
    setUser(null);
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
