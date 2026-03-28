import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { circleAPI } from '../services/api';
import { useAuth } from './AuthContext';

const ViewingContext = createContext(null);

/**
 * ViewingContext tracks which warrior's data the current user is viewing.
 *
 * For warriors: viewingId is null (own data) unless they're a hybrid viewing another.
 * For members: viewingId is their activeViewingId (the warrior they're watching).
 * For hybrids: viewingId can be null (own data) or another warrior's ID.
 *
 * Every data-fetching call should include `viewAs` param from this context.
 */
export function ViewingProvider({ children }) {
  const { user, checkAuth } = useAuth();

  // The warrior ID we're currently viewing — null means "my own data"
  const [viewingId, setViewingId] = useState(null);
  const [viewingName, setViewingName] = useState(null);
  const [viewingEmoji, setViewingEmoji] = useState(null);

  // All circles the user belongs to (for context switcher)
  const [circles, setCircles] = useState([]);
  const [selfOption, setSelfOption] = useState(null);

  // Whether the user is currently viewing someone else's data
  const isViewingOther = !!viewingId && viewingId !== user?.id;

  // Whether this user CAN view other warriors (member or hybrid)
  const canViewOthers = ['member', 'hybrid'].includes(user?.role);

  // Whether this user has their own warrior data (warrior or hybrid)
  const hasOwnData = ['warrior', 'hybrid'].includes(user?.role);

  // The tabs this user should see — member tabs when viewing another or when role is member
  const showMemberTabs = isViewingOther || user?.role === 'member';

  // Initialize from server state
  useEffect(() => {
    if (!user) {
      setViewingId(null);
      setViewingName(null);
      setViewingEmoji(null);
      setCircles([]);
      setSelfOption(null);
      return;
    }

    // Set initial viewing target from user's activeViewingId
    if (user.activeViewingId) {
      setViewingId(user.activeViewingId);
    } else {
      setViewingId(null);
    }

    // Load circles list
    loadCircles();
  }, [user?.id, user?.activeViewingId]);

  const loadCircles = useCallback(async () => {
    try {
      const data = await circleAPI.getMyCircles();
      setCircles(data.circles || []);
      setSelfOption(data.self || null);

      // Update viewing name/emoji from circles data
      if (viewingId) {
        const activeCircle = (data.circles || []).find(
          c => c.ownerId?.toString() === viewingId?.toString()
        );
        if (activeCircle) {
          setViewingName(activeCircle.warriorName);
          setViewingEmoji(activeCircle.warriorEmoji);
        }
      }
    } catch (err) {
      // Not in any circles — that's fine
      console.log('[ViewingContext] No circles:', err.message);
    }
  }, [viewingId]);

  // Switch to viewing a different warrior's data
  const switchTo = useCallback(async (targetId) => {
    try {
      const result = await circleAPI.switchContext(targetId);
      setViewingId(result.activeViewingId || null);
      setViewingName(result.targetName || null);
      setViewingEmoji(result.targetEmoji || null);
      // Refresh auth so user object has updated activeViewingId
      await checkAuth();
    } catch (err) {
      console.error('[ViewingContext] Switch failed:', err.message);
      throw err;
    }
  }, [checkAuth]);

  // Switch back to own data (warriors/hybrids only)
  const switchToSelf = useCallback(async () => {
    try {
      await circleAPI.switchContext(null);
      setViewingId(null);
      setViewingName(null);
      setViewingEmoji(null);
      await checkAuth();
    } catch (err) {
      console.error('[ViewingContext] Switch to self failed:', err.message);
      throw err;
    }
  }, [checkAuth]);

  // The viewAs param to pass to API calls
  const viewAsParam = isViewingOther ? viewingId : undefined;

  return (
    <ViewingContext.Provider
      value={{
        viewingId,
        viewingName,
        viewingEmoji,
        isViewingOther,
        canViewOthers,
        hasOwnData,
        showMemberTabs,
        circles,
        selfOption,
        viewAsParam,
        switchTo,
        switchToSelf,
        loadCircles,
      }}
    >
      {children}
    </ViewingContext.Provider>
  );
}

export function useViewing() {
  const context = useContext(ViewingContext);
  if (!context) {
    throw new Error('useViewing must be used within a ViewingProvider');
  }
  return context;
}
