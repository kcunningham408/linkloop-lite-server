import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, SafeAreaView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { chatAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import TYPE from '../config/typography';

export default function ChatScreen({ route, navigation }) {
  const { circleId, memberName, memberEmoji, relationship } = route.params;
  const { user } = useAuth();
  const { getAccent, getGradient } = useTheme();
  const accent = getAccent(user?.role === 'member');
  const gradient = getGradient(user?.role === 'member');

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const flatListRef = useRef(null);
  const pollRef = useRef(null);

  const loadMessages = useCallback(async (beforeDate = null, append = false) => {
    try {
      const msgs = await chatAPI.getMessages(circleId, beforeDate);
      const msgArray = Array.isArray(msgs) ? msgs : (msgs.messages || []);
      if (append) {
        setMessages(prev => [...msgArray, ...prev]);
      } else {
        setMessages(msgArray.reverse()); // reverse to newest-first for inverted FlatList
      }
      setHasMore(msgArray.length >= 50);
    } catch (err) {
      console.log('Load messages error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [circleId]);

  useEffect(() => {
    loadMessages();

    // Poll for new messages every 5 seconds
    pollRef.current = setInterval(() => {
      loadMessages(null, false);
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadMessages]);

  useEffect(() => {
    navigation.setOptions({
      title: `${memberEmoji} ${memberName}`,
      headerStyle: { backgroundColor: '#1C1C1E' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: TYPE.bold },
    });
  }, [navigation, memberName, memberEmoji]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    const msgText = text.trim();
    setText('');
    setSending(true);

    // Optimistic update
    const tempMsg = {
      _id: 'temp_' + Date.now(),
      text: msgText,
      type: 'text',
      senderId: user?.id,
      senderName: user?.name || 'You',
      senderEmoji: '😊',
      createdAt: new Date().toISOString(),
      _temp: true,
    };
    setMessages(prev => [tempMsg, ...prev]);

    try {
      await chatAPI.sendMessage(circleId, msgText);
      loadMessages(); // Refresh to get the real message
    } catch (err) {
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m._id !== tempMsg._id));
      setText(msgText);
    } finally {
      setSending(false);
    }
  };

  const loadOlderMessages = () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    // Get the oldest message's timestamp (last item since list is inverted = newest first)
    const oldestMsg = messages[messages.length - 1];
    if (oldestMsg) {
      loadMessages(oldestMsg.createdAt, true);
    }
  };

  const getMessageStyle = (msg) => {
    const senderId = msg.senderId?._id || msg.senderId;
    const isMe = senderId === user?.id;
    return isMe;
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

  const getMessageTypeIcon = (type) => {
    switch (type) {
      case 'alert': return '🔔 ';
      case 'acknowledgment': return '✅ ';
      case 'system': return 'ℹ️ ';
      default: return '';
    }
  };

  const renderMessage = ({ item: msg }) => {
    const isMe = getMessageStyle(msg);
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
            <Text style={styles.alertMsgLabel}>GLUCOSE UPDATE</Text>
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
            <Text style={styles.ackMsgLabel}>
              {msg.senderName || 'Someone'} acknowledged
            </Text>
            <Text style={styles.ackMsgText}>{msg.text}</Text>
            <Text style={styles.ackMsgTime}>{formatTime(msg.createdAt)}</Text>
          </View>
        </View>
      );
    }

    const bubbleInner = (
      <>
        {!isMe && (
          <Text style={[styles.senderName, { color: accent }]}>{msg.senderName || memberName}</Text>
        )}
        <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextOther]}>
          {getMessageTypeIcon(msg.type)}{msg.text}
        </Text>
        <Text style={[styles.timeText, isMe ? styles.timeTextMe : styles.timeTextOther]}>
          {msg._temp ? 'Sending…' : formatTime(msg.createdAt)}
        </Text>
      </>
    );

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isMe && (
          <View style={[styles.avatarCircle, { borderColor: accent + '40' }]}>
            <Text style={styles.avatarText}>{memberEmoji}</Text>
          </View>
        )}
        {isMe ? (
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
          <Text style={styles.loadingText}>Loading messages...</Text>
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
        {/* Chat Info Banner */}
        <LinearGradient
          colors={['#1C1C1E', '#161618']}
          style={styles.chatBanner}
        >
          <View style={[styles.bannerAvatar, { borderColor: accent + '40' }]}>
            <Text style={styles.chatBannerEmoji}>{memberEmoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatBannerName}>{memberName}</Text>
            <Text style={[styles.chatBannerRole, { color: accent }]}>{relationship || 'Care Circle Member'}</Text>
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
              <Text style={styles.emptyChatEmoji}>💬</Text>
              <Text style={styles.emptyChatTitle}>No messages yet</Text>
              <Text style={styles.emptyChatText}>
                Start the conversation with {memberName}!
              </Text>
            </View>
          }
        />

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor="#666"
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
                <Text style={[styles.sendButtonText, { color: '#666' }]}>➤</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#888', fontSize: TYPE.md },

  // Chat Banner
  chatBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  bannerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#252528',
    marginRight: 12,
  },
  chatBannerEmoji: { fontSize: 22 },
  chatBannerName: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff' },
  chatBannerRole: { fontSize: TYPE.xs, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: TYPE.semibold, marginTop: 1 },

  // Messages List
  messagesList: { paddingHorizontal: 12, paddingVertical: 8 },

  // Message rows
  msgRow: { flexDirection: 'row', marginVertical: 4, alignItems: 'flex-end' },
  msgRowLeft: { justifyContent: 'flex-start', marginRight: 44 },
  msgRowRight: { justifyContent: 'flex-end', marginLeft: 44 },

  // Avatar
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1A2235',
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  avatarText: { fontSize: 14 },

  // Bubble
  bubble: {
    maxWidth: '80%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMe: {
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: '#1C1C1E',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  bubbleSending: { opacity: 0.6 },

  senderName: { fontSize: 10, fontWeight: TYPE.bold, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  msgText: { fontSize: TYPE.md, lineHeight: 20 },
  msgTextMe: { color: '#fff' },
  msgTextOther: { color: '#E0E0E0' },

  timeText: { fontSize: 9, marginTop: 4 },
  timeTextMe: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  timeTextOther: { color: '#555' },

  // System message
  systemMsgContainer: {
    alignSelf: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  systemMsgText: { fontSize: TYPE.xs, color: '#A0A0A0', textAlign: 'center' },

  // Alert message
  alertMsgContainer: {
    flexDirection: 'row',
    backgroundColor: '#2A1A1A',
    borderRadius: 16,
    padding: 14,
    marginVertical: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#3A2020',
  },
  alertMsgIcon: { fontSize: TYPE.h3, marginRight: 10 },
  alertMsgContent: { flex: 1 },
  alertMsgLabel: { fontSize: 10, fontWeight: TYPE.extrabold, color: '#FF6B6B', marginBottom: 4, letterSpacing: 0.8, textTransform: 'uppercase' },
  alertMsgText: { fontSize: TYPE.md, color: '#E0E0E0', lineHeight: 20 },
  alertMsgTime: { fontSize: 9, color: '#666', marginTop: 4 },

  // Acknowledgment message
  ackMsgContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A2E1A',
    borderRadius: 16,
    padding: 14,
    marginVertical: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#1E3A1E',
  },
  ackMsgIcon: { fontSize: TYPE.h3, marginRight: 10 },
  ackMsgContent: { flex: 1 },
  ackMsgLabel: { fontSize: 10, fontWeight: TYPE.extrabold, color: '#4CAF50', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' },
  ackMsgText: { fontSize: TYPE.md, color: '#E0E0E0', lineHeight: 20 },
  ackMsgTime: { fontSize: 9, color: '#666', marginTop: 4 },

  // Empty state
  emptyChat: {
    alignItems: 'center',
    paddingVertical: 60,
    transform: [{ scaleY: -1 }],
  },
  emptyChatEmoji: { fontSize: 50, marginBottom: 12 },
  emptyChatTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 6 },
  emptyChatText: { fontSize: TYPE.md, color: '#888', textAlign: 'center' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#161618',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  inputWrap: {
    flex: 1,
    marginRight: 8,
  },
  textInput: {
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: TYPE.md,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
  },
  sendGradient: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendDisabledInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {},
  sendButtonText: { fontSize: 20, color: '#fff', fontWeight: TYPE.bold },
});
