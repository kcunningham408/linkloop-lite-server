import { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { authAPI, clearToken, getCachedUser, getToken, setCachedUser, userAPI, usersAPI } from '../services/api';

const AuthContext = createContext(null);

// Configure how notifications behave while the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Request permission and register the Expo push token with the server
async function registerPushToken() {
  if (!Device.isDevice) {
    // Push tokens only work on real devices
    return;
  }

  // Create an Android notification channel for alerts
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Glucose Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF0000',
      sound: 'default',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted');
    return;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'fe571b30-5832-4068-b4cd-327399d778c6',
    });
    const token = tokenData.data;
    console.log('[Push] Token:', token);
    await usersAPI.savePushToken(token);
  } catch (err) {
    console.error('[Push] Token registration error:', err);
  }
}

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
        // Register push token in the background after successful auth restore
        registerPushToken().catch(() => {});
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
    // Register push token after successful login
    registerPushToken().catch(() => {});
    return data;
  };

  const register = async (identifier, password, name, role) => {
    const data = await authAPI.register(identifier, password, name, role);
    setUser(data.user);
    setIsAuthenticated(true);
    // Register push token after successful registration
    registerPushToken().catch(() => {});
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
