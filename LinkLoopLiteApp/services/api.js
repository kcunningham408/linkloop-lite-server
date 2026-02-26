import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../config/api';

// Token management
let authToken = null;

export const setToken = async (token) => {
  authToken = token;
  await AsyncStorage.setItem('authToken', token);
};

export const getToken = async () => {
  if (!authToken) {
    authToken = await AsyncStorage.getItem('authToken');
  }
  return authToken;
};

export const clearToken = async () => {
  authToken = null;
  await AsyncStorage.multiRemove(['authToken', 'cachedUser']);
};

// Cached user — avoids a network round-trip on every cold start
export const setCachedUser = async (user) => {
  await AsyncStorage.setItem('cachedUser', JSON.stringify(user));
};

export const getCachedUser = async () => {
  try {
    const raw = await AsyncStorage.getItem('cachedUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Wake-up ping — call this as early as possible (e.g. when LoginScreen mounts)
// so the Render dyno is already warm by the time the user taps "Sign In".
export const pingServer = async () => {
  try {
    await fetch(`${API_URL}/health`, { method: 'GET' });
  } catch {
    // Silently ignore — this is a best-effort warm-up
  }
};

// API request helper
const apiRequest = async (endpoint, options = {}) => {
  const token = await getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'API request failed');
  }

  return data;
};

// ============ AUTH API ============

export const authAPI = {
  register: async (identifier, password, name, role = 'warrior') => {
    // identifier can be email or phone — detect which one
    const isPhone = /^\+?\d[\d\s\-()]{8,}$/.test(identifier.replace(/\s/g, ''));
    const body = { password, name, role };
    if (isPhone) {
      body.phone = identifier;
    } else {
      body.email = identifier;
    }

    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (data.token) {
      await setToken(data.token);
    }
    if (data.user) {
      await setCachedUser(data.user);
    }
    return data;
  },

  login: async (identifier, password) => {
    const isPhone = /^\+?\d[\d\s\-()]{8,}$/.test(identifier.replace(/\s/g, ''));
    const body = { password };
    if (isPhone) {
      body.phone = identifier;
    } else {
      body.email = identifier;
    }

    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (data.token) {
      await setToken(data.token);
    }
    if (data.user) {
      await setCachedUser(data.user);
    }
    return data;
  },

  logout: async () => {
    await clearToken();
  },
};

// ============ USER API ============

export const userAPI = {
  getProfile: async () => {
    return apiRequest('/users/me');
  },

  updateProfile: async (updates) => {
    const data = await apiRequest('/users/me', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    // Keep the local cache in sync so the next cold start reflects any name/emoji changes
    if (data.user) {
      await setCachedUser(data.user);
    }
    return data;
  },

  deleteAccount: async () => {
    return apiRequest('/users/me', {
      method: 'DELETE',
    });
  },
};

// ============ GLUCOSE API ============

export const glucoseAPI = {
  getReadings: async (hours = 24) => {
    return apiRequest(`/glucose?hours=${hours}`);
  },

  getLatest: async () => {
    return apiRequest('/glucose/latest');
  },

  getStats: async (hours = 24) => {
    return apiRequest(`/glucose/stats?hours=${hours}`);
  },

  addReading: async (value, trend = 'stable', source = 'manual', notes = '') => {
    return apiRequest('/glucose', {
      method: 'POST',
      body: JSON.stringify({ value, trend, source, notes }),
    });
  },

  // Loop Member: fetch the linked warrior's glucose data (readings + stats + latest)
  getMemberView: async (ownerId, hours = 24) => {
    return apiRequest(`/glucose/member-view/${ownerId}?hours=${hours}`);
  },
};

// ============ CARE CIRCLE API ============

export const circleAPI = {
  getMembers: async () => {
    return apiRequest('/circle');
  },

  createInvite: async (memberName, memberEmoji, relationship, permissions) => {
    return apiRequest('/circle/invite', {
      method: 'POST',
      body: JSON.stringify({ memberName, memberEmoji, relationship, permissions }),
    });
  },

  joinCircle: async (inviteCode) => {
    return apiRequest('/circle/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  },

  updateMember: async (memberId, updates) => {
    return apiRequest(`/circle/${memberId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  removeMember: async (memberId) => {
    return apiRequest(`/circle/${memberId}`, {
      method: 'DELETE',
    });
  },
};

// ============ INSIGHTS API ============

export const insightsAPI = {
  getInsights: async (hours = 72) => {
    return apiRequest(`/insights?hours=${hours}`);
  },
  getAISummary: async (hours = 72) => {
    return apiRequest(`/insights/ai-summary?hours=${hours}`);
  },
  getAITrends: async (hours = 72) => {
    return apiRequest(`/insights/ai-trends?hours=${hours}`);
  },
  getDailyMotivation: async () => {
    return apiRequest('/insights/daily-motivation');
  },
};

// ============ CHAT API ============

export const chatAPI = {
  getConversations: async () => {
    return apiRequest('/chat/conversations');
  },

  getMessages: async (circleId, before = null) => {
    const query = before ? `?before=${before}` : '';
    return apiRequest(`/chat/${circleId}/messages${query}`);
  },

  sendMessage: async (circleId, text) => {
    return apiRequest(`/chat/${circleId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },
};

// ============ ALERTS API ============

export const alertsAPI = {
  triggerCheck: async (glucoseValue) => {
    return apiRequest('/alerts/check', {
      method: 'POST',
      body: JSON.stringify({ glucoseValue }),
    });
  },

  acknowledge: async (alertId, message = '') => {
    return apiRequest(`/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  getAlerts: async (status = '') => {
    const query = status ? `?status=${status}` : '';
    return apiRequest(`/alerts${query}`);
  },

  getAlert: async (alertId) => {
    return apiRequest(`/alerts/${alertId}`);
  },

  getActiveAlerts: async () => {
    return apiRequest('/alerts/active');
  },

  resolve: async (alertId) => {
    return apiRequest(`/alerts/${alertId}/resolve`, {
      method: 'POST',
    });
  },
};

// ============ SUPPLIES API ============

export const suppliesAPI = {
  getAll: async () => {
    return apiRequest('/supplies');
  },

  add: async (supply) => {
    return apiRequest('/supplies', {
      method: 'POST',
      body: JSON.stringify(supply),
    });
  },

  update: async (id, updates) => {
    return apiRequest(`/supplies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  remove: async (id) => {
    return apiRequest(`/supplies/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============ DEXCOM API ============

export const dexcomAPI = {
  getAuthUrl: async () => {
    return apiRequest('/dexcom/auth');
  },

  getStatus: async () => {
    return apiRequest('/dexcom/status');
  },

  sync: async () => {
    return apiRequest('/dexcom/sync', {
      method: 'POST',
    });
  },

  disconnect: async () => {
    return apiRequest('/dexcom/disconnect', {
      method: 'POST',
    });
  },
};

// ============ MOOD API ============

export const moodAPI = {
  log: async (emoji, label, note = '') => {
    return apiRequest('/mood', {
      method: 'POST',
      body: JSON.stringify({ emoji, label, note }),
    });
  },

  getEntries: async (hours = 168) => {
    return apiRequest(`/mood?hours=${hours}`);
  },

  getStats: async (hours = 168) => {
    return apiRequest(`/mood/stats?hours=${hours}`);
  },

  remove: async (id) => {
    return apiRequest(`/mood/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============ ACHIEVEMENTS API ============

export const achievementsAPI = {
  getAll: async () => {
    return apiRequest('/achievements');
  },

  check: async () => {
    return apiRequest('/achievements/check', {
      method: 'POST',
    });
  },
};
