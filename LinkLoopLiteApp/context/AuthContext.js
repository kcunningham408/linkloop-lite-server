import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI, userAPI, getToken, clearToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await getToken();
      if (token) {
        const profile = await userAPI.getProfile();
        setUser(profile);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.log('Not authenticated');
      await clearToken();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (identifier, password) => {
    const data = await authAPI.login(identifier, password);
    setUser(data.user);
    setIsAuthenticated(true);
    return data;
  };

  const register = async (identifier, password, name, role) => {
    const data = await authAPI.register(identifier, password, name, role);
    setUser(data.user);
    setIsAuthenticated(true);
    return data;
  };

  const logout = async () => {
    await authAPI.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  const updateUser = async (updates) => {
    const data = await userAPI.updateProfile(updates);
    setUser(data.user);
    return data;
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated, login, register, logout, updateUser, checkAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
