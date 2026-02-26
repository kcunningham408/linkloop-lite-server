import { createContext, useContext, useEffect, useState } from 'react';
import { authAPI, clearToken, getCachedUser, getToken, setCachedUser, userAPI } from '../services/api';

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
      if (!token) {
        setIsLoading(false);
        return;
      }

      // 1. Restore from cache immediately — zero network latency
      const cached = await getCachedUser();
      if (cached) {
        setUser(cached);
        setIsAuthenticated(true);
        setIsLoading(false); // Show the app now, don't wait for the network
      }

      // 2. Re-verify in the background and refresh if anything changed
      try {
        const profile = await userAPI.getProfile();
        setUser(profile);
        await setCachedUser(profile);
        if (!cached) {
          // First time (cache was empty) — mark authenticated now
          setIsAuthenticated(true);
        }
      } catch (networkError) {
        // Network unavailable but we have a valid cached user — that's fine
        if (!cached) {
          // No cache + network failed = force logout
          await clearToken();
          setIsAuthenticated(false);
        }
      }
    } catch (error) {
      console.log('Auth check failed:', error.message);
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

  const deleteAccount = async () => {
    await userAPI.deleteAccount();
    await clearToken();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated, login, register, logout, updateUser, deleteAccount, checkAuth }}
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
