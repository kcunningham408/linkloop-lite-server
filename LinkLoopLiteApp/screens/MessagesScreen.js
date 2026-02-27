import { useFocusEffect } from '@react-navigation/native';
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
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadConversations = useCallback(async () => {
    try {
      setError(null);
      const data = await chatAPI.getConversations();
      setConversations(Array.isArray(data) ? data : []);
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
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>{convo.otherPerson.emoji || '\uD83D\uDC64'}</Text>
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
          <View style={styles.rowSub}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {getLastMessagePreview(convo.lastMessage)}
            </Text>
          </View>
          <Text style={styles.relationshipLabel}>
            {convo.relationship || 'Care Circle Member'}
          </Text>
        </View>

        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90D9" />
        <Text style={styles.loadingText}>Loading messages…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadConversations}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => String(item.circleId)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4A90D9" />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
    fontSize: 14,
    color: '#888',
  },
  errorEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 15,
    color: '#FF6B6B',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#4A90D9',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Conversation row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#111111',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarEmoji: {
    fontSize: 26,
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
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
  },
  rowSub: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#A0A0A0',
    flex: 1,
  },
  relationshipLabel: {
    fontSize: 11,
    color: '#4A90D9',
    marginTop: 3,
    textTransform: 'capitalize',
  },
  chevron: {
    fontSize: 22,
    color: '#444',
    marginLeft: 8,
    fontWeight: '300',
  },
  separator: {
    height: 1,
    backgroundColor: '#1C1C1E',
    marginLeft: 82,
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
});
