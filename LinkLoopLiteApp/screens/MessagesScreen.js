import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import TYPE from '../config/typography';
import ScreenHeader from '../components/ScreenHeader';
import { chatAPI } from '../services/api';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getDay()];
  }
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function getLastMessagePreview(lastMessage) {
  if (!lastMessage) return 'No messages yet — tap to say hi!';
  const prefix =
    lastMessage.type === 'alert' ? '\uD83D\uDD14 Alert: ' :
    lastMessage.type === 'acknowledgment' ? '\u2705 ' :
    lastMessage.type === 'system' ? '\u2139\uFE0F ' : '';
  const text = lastMessage.text || '';
  const truncated = text.length > 55 ? text.slice(0, 55) + '…' : text;
  return prefix + truncated;
}

export default function MessagesScreen({ navigation }) {
  const { user } = useAuth();
  const { getAccent, getGradient } = useTheme();
  const isMember = user?.role === 'member';
  const accent = getAccent(isMember);
  const gradient = getGradient(isMember);

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [groupLastMessage, setGroupLastMessage] = useState(null);

  const loadConversations = useCallback(async () => {
    try {
      setError(null);
      const [convoData, groupData] = await Promise.allSettled([
        chatAPI.getConversations(),
        chatAPI.getGroupMessages().catch(() => []),
      ]);
      if (convoData.status === 'fulfilled') {
        setConversations(Array.isArray(convoData.value) ? convoData.value : []);
      }
      if (groupData.status === 'fulfilled') {
        const msgs = Array.isArray(groupData.value) ? groupData.value : (groupData.value?.messages || []);
        if (msgs.length > 0) setGroupLastMessage(msgs[msgs.length - 1]);
      }
    } catch (err) {
      console.log('Load conversations error:', err);
      setError(err.message || 'Could not load messages');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload each time the screen is focused (so unread counts refresh after leaving a chat)
  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations])
  );

  const onRefresh = () => { setRefreshing(true); loadConversations(); };

  const handleOpenChat = (convo) => {
    navigation.navigate('Chat', {
      circleId: convo.circleId,
      memberName: convo.otherPerson.name || 'Care Circle Member',
      memberEmoji: convo.otherPerson.emoji || '\uD83D\uDC64',
      relationship: convo.relationship,
    });
  };

  const renderConversation = ({ item: convo }) => {
    const hasMessage = !!convo.lastMessage;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => handleOpenChat(convo)}
        activeOpacity={0.7}
      >
        {/* Accent stripe */}
        <LinearGradient colors={gradient} style={styles.accentStripe} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />

        {/* Avatar */}
        <View style={[styles.avatarRing, { borderColor: accent + '50' }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>{convo.otherPerson.emoji || '👤'}</Text>
          </View>
        </View>

        {/* Text content */}
        <View style={styles.rowContent}>
          <View style={styles.rowHeader}>
            <Text style={styles.personName} numberOfLines={1}>
              {convo.otherPerson.name || 'Care Circle Member'}
            </Text>
            {hasMessage && (
              <Text style={styles.timestamp}>{formatTime(convo.lastMessage.createdAt)}</Text>
            )}
          </View>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {getLastMessagePreview(convo.lastMessage)}
          </Text>
          <View style={[styles.rolePill, { backgroundColor: accent + '18' }]}>
            <Text style={[styles.rolePillText, { color: accent }]}>
              {convo.relationship || 'Care Circle Member'}
            </Text>
          </View>
        </View>

        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={accent} />
        <Text style={styles.loadingText}>Loading messages…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Messages" />
      {error ? (
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: accent }]} onPress={loadConversations}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => String(item.circleId)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[accent]} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <>
              <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate('GroupChat')}
                activeOpacity={0.7}
              >
                <LinearGradient colors={['#34C759', '#30D158']} style={styles.accentStripe} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
                <View style={[styles.avatarRing, { borderColor: '#34C75950' }]}>
                  <View style={[styles.avatar, { backgroundColor: '#1A2A44' }]}>
                    <Text style={styles.avatarEmoji}>👥</Text>
                  </View>
                </View>
                <View style={styles.rowContent}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.personName} numberOfLines={1}>
                      Care Circle Group
                    </Text>
                    {groupLastMessage && (
                      <Text style={styles.timestamp}>{formatTime(groupLastMessage.createdAt)}</Text>
                    )}
                  </View>
                  <Text style={styles.lastMessage} numberOfLines={1}>
                    {groupLastMessage
                      ? (groupLastMessage.senderName ? groupLastMessage.senderName + ': ' : '') +
                        (groupLastMessage.text?.length > 40
                          ? groupLastMessage.text.slice(0, 40) + '…'
                          : groupLastMessage.text || 'Sent a message')
                      : 'No messages yet — start the group chat!'}
                  </Text>
                  <View style={[styles.rolePill, { backgroundColor: '#34C75918' }]}>
                    <Text style={[styles.rolePillText, { color: '#34C759' }]}>
                      Group Chat
                    </Text>
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
              <View style={styles.separator} />
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptyText}>
                {user?.role === 'member'
                  ? 'Your warrior can start a conversation with you, or send them a message first!'
                  : 'Once someone joins your Care Circle, you can message them here.'}
              </Text>
            </View>
          }
          contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#111111',
  },
  loadingText: {
    marginTop: 12,
    fontSize: TYPE.md,
    color: '#888',
  },
  errorEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorText: {
    fontSize: TYPE.md,
    color: '#FF6B6B',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontSize: TYPE.md,
    fontWeight: TYPE.semibold,
  },

  // Conversation row — card style
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 5,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  accentStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  avatarRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#252528',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: {
    fontSize: 24,
  },
  rowContent: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  personName: {
    fontSize: TYPE.lg,
    fontWeight: TYPE.bold,
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  timestamp: {
    fontSize: TYPE.xs,
    color: '#666',
    fontWeight: TYPE.medium,
  },
  lastMessage: {
    fontSize: TYPE.sm,
    color: '#A0A0A0',
    lineHeight: 18,
    marginBottom: 6,
  },
  rolePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: TYPE.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chevron: {
    fontSize: TYPE.xxl,
    color: '#444',
    marginLeft: 6,
    fontWeight: '300',
  },
  separator: {
    height: 1,
    backgroundColor: 'transparent',
  },

  // Empty state
  emptyContainer: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: TYPE.xl,
    fontWeight: TYPE.bold,
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: TYPE.md,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
});
