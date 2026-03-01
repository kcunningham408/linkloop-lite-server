import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';

const THEME_KEY = '@linkloop_theme';

// ── Preset Palettes ────────────────────────────────────────────────
// Each palette defines warrior + member accent colors and gradient pairs.
export const THEME_PALETTES = [
  {
    id: 'ocean',
    name: 'Ocean Blue',
    warrior: '#4A90D9',
    warriorDark: '#3A7BC8',
    member: '#34C759',
    memberDark: '#2A9E47',
    gradient: ['#4A90D9', '#3A7BC8'],
    memberGradient: ['#34C759', '#2A9E47'],
  },
  {
    id: 'sunset',
    name: 'Sunset Coral',
    warrior: '#FF6B6B',
    warriorDark: '#E05555',
    member: '#FF9F43',
    memberDark: '#E08A30',
    gradient: ['#FF6B6B', '#E05555'],
    memberGradient: ['#FF9F43', '#E08A30'],
  },
  {
    id: 'purple',
    name: 'Purple Haze',
    warrior: '#9B59B6',
    warriorDark: '#8244A0',
    member: '#00D4AA',
    memberDark: '#00B895',
    gradient: ['#9B59B6', '#8244A0'],
    memberGradient: ['#00D4AA', '#00B895'],
  },
  {
    id: 'emerald',
    name: 'Emerald',
    warrior: '#00D4AA',
    warriorDark: '#00B895',
    member: '#4A90D9',
    memberDark: '#3A7BC8',
    gradient: ['#00D4AA', '#00B895'],
    memberGradient: ['#4A90D9', '#3A7BC8'],
  },
  {
    id: 'crimson',
    name: 'Crimson',
    warrior: '#D32F2F',
    warriorDark: '#B71C1C',
    member: '#FF9800',
    memberDark: '#E08A00',
    gradient: ['#D32F2F', '#B71C1C'],
    memberGradient: ['#FF9800', '#E08A00'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    warrior: '#5C6BC0',
    warriorDark: '#3F51B5',
    member: '#26C6DA',
    memberDark: '#00ACC1',
    gradient: ['#5C6BC0', '#3F51B5'],
    memberGradient: ['#26C6DA', '#00ACC1'],
  },
  {
    id: 'rose',
    name: 'Rose Gold',
    warrior: '#E91E8C',
    warriorDark: '#C2185B',
    member: '#FFD54F',
    memberDark: '#FFC107',
    gradient: ['#E91E8C', '#C2185B'],
    memberGradient: ['#FFD54F', '#FFC107'],
  },
  {
    id: 'teal',
    name: 'Teal Breeze',
    warrior: '#009688',
    warriorDark: '#00796B',
    member: '#FF7043',
    memberDark: '#E64A19',
    gradient: ['#009688', '#00796B'],
    memberGradient: ['#FF7043', '#E64A19'],
  },
];

const DEFAULT_PALETTE = THEME_PALETTES[0]; // Ocean Blue

// ── Context ────────────────────────────────────────────────────────
const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [loaded, setLoaded] = useState(false);

  // Load saved theme on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_KEY);
        if (saved) {
          const found = THEME_PALETTES.find(p => p.id === saved);
          if (found) setPalette(found);
        }
      } catch (e) {
        console.log('Theme load error:', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const setTheme = async (paletteId) => {
    const found = THEME_PALETTES.find(p => p.id === paletteId);
    if (!found) return;
    setPalette(found);
    try {
      await AsyncStorage.setItem(THEME_KEY, paletteId);
    } catch (e) {
      console.log('Theme save error:', e);
    }
  };

  // Convenience helper: returns the right accent for the current user role
  const getAccent = (isMember) => isMember ? palette.member : palette.warrior;
  const getAccentDark = (isMember) => isMember ? palette.memberDark : palette.warriorDark;
  const getGradient = (isMember) => isMember ? palette.memberGradient : palette.gradient;

  return (
    <ThemeContext.Provider value={{
      palette,
      setTheme,
      loaded,
      getAccent,
      getAccentDark,
      getGradient,
      palettes: THEME_PALETTES,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
