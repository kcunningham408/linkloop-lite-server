import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView, Platform,
    StyleSheet, Text,
    TextInput, TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { chatAPI } from '../services/api';

export default function GroupChatScreen({ navigation }) {
  const { user } = useAuth();
  const { getAccent, getGradient } = useTheme();
  const accent = getAccent(user?.role === 'member');
  const gradient = getGradient(user?.role === 'member');

  const [messages, setMessages] = useState([]);
  const [groupInfo, setGroupInfo] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const flatListRef = useRef(null);
  const pollRef = useRef(null);

  const loadMessages = useCallback(async (beforeDate = null, append = false) => {
    try {
      const msgs = await chatAPI.getGroupMessages(beforeDate);
      const msgArray = Array.isArray(msgs) ? msgs : (msgs.messages || []);
      if (append) {
        setMessages(prev => [...prev, ...msgArray.reverse()]);
      } else {
        setMessages(msgArray.reverse());
      }
      setHasMore(msgArray.length >= 50);
    } catch (err) {
      console.log('Load group messages error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadGroupInfo = useCallback(async () => {
    try {
      const info = await chatAPI.getGroupInfo();
      setGroupInfo(info);
    } catch (err) {
      console.log('Load group info error:', err);
    }
  }, []);

  useEffect(() => {
    loadMessages();
    loadGroupInfo();

    pollRef.current = setInterval(() => {
      loadMessages(null, false);
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadMessages, loadGroupInfo]);

  useEffect(() => {
    const memberCount = groupInfo?.memberCount || '';
    navigation.setOptions({
      title: '\uD83D\uDC65 Care Circle Group',
      headerStyle: { backgroundColor: 'transparent' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: TYPE.bold },
    });
  }, [navigation, groupInfo]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    haptic.medium();
    const msgText = text.trim();
    setText('');
    setSending(true);

    const tempMsg = {
      _id: 'temp_' + Date.now(),
      text: msgText,
      type: 'text',
      senderId: user?.id,
      senderName: user?.name || 'You',
      senderEmoji: user?.profileEmoji || '\uD83D\uDE0A',
      createdAt: new Date().toISOString(),
      _temp: true,
    };
    setMessages(prev => [tempMsg, ...prev]);

    try {
      await chatAPI.sendGroupMessage(msgText);
      loadMessages();
    } catch (err) {
      setMessages(prev => prev.filter(m => m._id !== tempMsg._id));
      setText(msgText);
    } finally {
      setSending(false);
    }
  };

  const loadOlderMessages = () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldestMsg = messages[messages.length - 1];
    if (oldestMsg) {
      loadMessages(oldestMsg.createdAt, true);
    }
  };

  const isMe = (msg) => {
    const senderId = msg.senderId?._id || msg.senderId;
    return senderId === user?.id;
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (diffDays === 0) return time;
    if (diffDays === 1) return 'Yesterday ' + time;
    if (diffDays < 7) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return days[d.getDay()] + ' ' + time;
    }
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + time;
  };

  const renderMessage = ({ item: msg }) => {
    const mine = isMe(msg);
    const isSystem = msg.type === 'system';
    const isAlert = msg.type === 'alert';
    const isAck = msg.type === 'acknowledgment';

    if (isSystem) {
      return (
        <View style={styles.systemMsgContainer}>
          <Text style={styles.systemMsgText}>ℹ️ {msg.text}</Text>
        </View>
      );
    }

    if (isAlert) {
      return (
        <View style={styles.alertMsgContainer}>
          <Text style={styles.alertMsgIcon}>🔔</Text>
          <View style={styles.alertMsgContent}>
            <Text style={styles.alertMsgLabel}>GLUCOSE ALERT</Text>
            <Text style={styles.alertMsgText}>{msg.text}</Text>
            <Text style={styles.alertMsgTime}>{formatTime(msg.createdAt)}</Text>
          </View>
        </View>
      );
    }

    if (isAck) {
      return (
        <View style={styles.ackMsgContainer}>
          <Text style={styles.ackMsgIcon}>✅</Text>
          <View style={styles.ackMsgContent}>
            <Text style={styles.ackMsgLabel} numberOfLines={1}>{msg.senderName || 'Someone'} acknowledged</Text>
            <Text style={styles.ackMsgText}>{msg.text}</Text>
            <Text style={styles.ackMsgTime}>{formatTime(msg.createdAt)}</Text>
          </View>
        </View>
      );
    }

    const bubbleInner = (
      <>
        {!mine && (
          <Text style={[styles.senderName, { color: accent }]}>{msg.senderName || 'Unknown'}</Text>
        )}
        <Text style={[styles.msgText, mine ? styles.msgTextMe : styles.msgTextOther]}>
          {msg.text}
        </Text>
        <Text style={[styles.timeText, mine ? styles.timeTextMe : styles.timeTextOther]}>
          {msg._temp ? 'Sending…' : formatTime(msg.createdAt)}
        </Text>
      </>
    );

    return (
      <View style={[styles.msgRow, mine ? styles.msgRowRight : styles.msgRowLeft]}>
        {!mine && (
          <View style={[styles.avatarCircle, { borderColor: accent + '40' }]}>
            <Text style={styles.avatarText}>{msg.senderEmoji || '👤'}</Text>
          </View>
        )}
        {mine ? (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.bubble, styles.bubbleMe, msg._temp && styles.bubbleSending]}
          >
            {bubbleInner}
          </LinearGradient>
        ) : (
          <View style={[styles.bubble, styles.bubbleOther, msg._temp && styles.bubbleSending]}>
            {bubbleInner}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={styles.loadingText}>Loading group chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Group Banner */}
        <LinearGradient
          colors={['#1E1E32', '#1A1A2E']}
          style={styles.chatBanner}
        >
          <View style={[styles.bannerAvatar, { borderColor: '#34C75940' }]}>
            <Text style={styles.chatBannerEmoji}>👥</Text>
          </View>
          <View style={styles.bannerTextWrap}>
            <Text style={styles.chatBannerName}>Care Circle Group</Text>
            {groupInfo && (
              <View style={styles.memberPills}>
                {groupInfo.members.map((m, i) => (
                  <View key={i} style={styles.memberPill}>
                    <Text style={styles.memberPillText}>{m.emoji} {m.name?.split(' ')[0]}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </LinearGradient>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item._id}
          inverted
          contentContainerStyle={styles.messagesList}
          onEndReached={loadOlderMessages}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator size="small" color={accent} style={{ padding: 10 }} />
          ) : null}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatEmoji}>{'\uD83D\uDC65'}</Text>
              <Text style={styles.emptyChatTitle}>Group chat is empty</Text>
              <Text style={styles.emptyChatText}>
                Send a message to your whole Care Circle!
              </Text>
            </View>
          }
        />

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.textInput}
              placeholder="Message the group..."
              placeholderTextColor="#888"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
              returnKeyType="default"
            />
          </View>
          <TouchableOpacity
            style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {text.trim() ? (
              <LinearGradient colors={gradient} style={styles.sendGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Text style={styles.sendButtonText}>{sending ? '…' : '➤'}</Text>
              </LinearGradient>
            ) : (
              <View style={styles.sendDisabledInner}>
                <Text style={[styles.sendButtonText, { color: '#B0B0B0' }]}>➤</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: 'rgba(255,255,255,0.45)', fontSize: TYPE.md },

  chatBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  bannerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(26,42,68,0.45)',
    marginRight: 12,
  },
  chatBannerEmoji: { fontSize: TYPE.xxl },
  bannerTextWrap: { flex: 1 },
  chatBannerName: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff' },
  memberPills: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  memberPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  memberPillText: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.55)', fontWeight: TYPE.medium },

  messagesList: { paddingHorizontal: 12, paddingVertical: 8 },

  msgRow: { flexDirection: 'row', marginVertical: 4, alignItems: 'flex-end' },
  msgRowLeft: { justifyContent: 'flex-start', marginRight: 44 },
  msgRowRight: { justifyContent: 'flex-end', marginLeft: 44 },

  avatarCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(26,34,53,0.4)', borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', marginRight: 6,
  },
  avatarText: { fontSize: TYPE.md },

  bubble: { maxWidth: '80%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: 'rgba(10,18,40,0.85)', borderBottomLeftRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  bubbleSending: { opacity: 0.6 },

  senderName: { fontSize: TYPE.xs, fontWeight: TYPE.bold, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  msgText: { fontSize: TYPE.md, lineHeight: 20 },
  msgTextMe: { color: '#fff' },
  msgTextOther: { color: 'rgba(255,255,255,0.85)' },

  timeText: { fontSize: TYPE.xs, marginTop: 4 },
  timeTextMe: { color: 'rgba(255,255,255,0.85)', textAlign: 'right' },
  timeTextOther: { color: 'rgba(255,255,255,0.40)' },

  systemMsgContainer: {
    alignSelf: 'center', backgroundColor: 'rgba(10,18,40,0.85)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 6, marginVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  systemMsgText: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },

  alertMsgContainer: {
    flexDirection: 'row', backgroundColor: 'rgba(42,26,26,0.5)', borderRadius: 16,
    padding: 14, marginVertical: 6, borderLeftWidth: 4, borderLeftColor: '#D32F2F', alignSelf: 'stretch',
    borderWidth: 1, borderColor: '#3A2020',
  },
  alertMsgIcon: { fontSize: TYPE.h3, marginRight: 10 },
  alertMsgContent: { flex: 1 },
  alertMsgLabel: { fontSize: TYPE.xs, fontWeight: TYPE.extrabold, color: '#FF6B6B', marginBottom: 4, letterSpacing: 0.8, textTransform: 'uppercase' },
  alertMsgText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },
  alertMsgTime: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.40)', marginTop: 4 },

  ackMsgContainer: {
    flexDirection: 'row', backgroundColor: 'rgba(26,46,26,0.5)', borderRadius: 16,
    padding: 14, marginVertical: 6, borderLeftWidth: 4, borderLeftColor: '#4CAF50', alignSelf: 'stretch',
    borderWidth: 1, borderColor: '#1E3A1E',
  },
  ackMsgIcon: { fontSize: TYPE.h3, marginRight: 10 },
  ackMsgContent: { flex: 1 },
  ackMsgLabel: { fontSize: TYPE.xs, fontWeight: TYPE.extrabold, color: '#4CAF50', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' },
  ackMsgText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },
  ackMsgTime: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.40)', marginTop: 4 },

  emptyChat: {
    alignItems: 'center', paddingVertical: 60,
    transform: [{ scaleY: -1 }],
  },
  emptyChatEmoji: { fontSize: 50, marginBottom: 12 },
  emptyChatTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 6 },
  emptyChatText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10,
    paddingVertical: 8, backgroundColor: 'rgba(10,18,40,0.88)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  inputWrap: { flex: 1, marginRight: 8 },
  textInput: {
    minHeight: 40, maxHeight: 100, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: TYPE.md, color: '#fff',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  sendButton: {
    width: 42, height: 42, borderRadius: 21, overflow: 'hidden',
  },
  sendGradient: {
    width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center',
  },
  sendDisabledInner: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(10,18,40,0.85)', justifyContent: 'center', alignItems: 'center',
  },
  sendButtonDisabled: {},
  sendButtonText: { fontSize: TYPE.xl, color: '#fff', fontWeight: TYPE.bold },
});
