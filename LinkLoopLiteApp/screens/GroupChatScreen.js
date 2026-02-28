import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, SafeAreaView
} from 'react-native';
import { chatAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function GroupChatScreen({ navigation }) {
  const { user } = useAuth();
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
        setMessages(prev => [...msgArray, ...prev]);
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
      headerStyle: { backgroundColor: '#1C1C1E' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
    });
  }, [navigation, groupInfo]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
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
          <Text style={styles.systemMsgText}>{'\u2139\uFE0F'} {msg.text}</Text>
        </View>
      );
    }

    if (isAlert) {
      return (
        <View style={styles.alertMsgContainer}>
          <Text style={styles.alertMsgIcon}>{'\uD83D\uDD14'}</Text>
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
          <Text style={styles.ackMsgIcon}>{'\u2705'}</Text>
          <View style={styles.ackMsgContent}>
            <Text style={styles.ackMsgLabel}>{msg.senderName || 'Someone'} acknowledged</Text>
            <Text style={styles.ackMsgText}>{msg.text}</Text>
            <Text style={styles.ackMsgTime}>{formatTime(msg.createdAt)}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.msgRow, mine ? styles.msgRowRight : styles.msgRowLeft]}>
        {!mine && (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{msg.senderEmoji || '\uD83D\uDC64'}</Text>
          </View>
        )}
        <View style={[
          styles.bubble,
          mine ? styles.bubbleMe : styles.bubbleOther,
          msg._temp && styles.bubbleSending,
        ]}>
          {!mine && (
            <Text style={styles.senderName}>{msg.senderName || 'Unknown'}</Text>
          )}
          <Text style={[styles.msgText, mine ? styles.msgTextMe : styles.msgTextOther]}>
            {msg.text}
          </Text>
          <Text style={[styles.timeText, mine ? styles.timeTextMe : styles.timeTextOther]}>
            {msg._temp ? 'Sending...' : formatTime(msg.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90D9" />
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
        <View style={styles.chatBanner}>
          <Text style={styles.chatBannerEmoji}>{'\uD83D\uDC65'}</Text>
          <View style={styles.bannerTextWrap}>
            <Text style={styles.chatBannerName}>Care Circle Group</Text>
            {groupInfo && (
              <Text style={styles.chatBannerMembers}>
                {groupInfo.members.map(m => m.emoji + ' ' + m.name).join('  ·  ')}
              </Text>
            )}
          </View>
        </View>

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
            <ActivityIndicator size="small" color="#4A90D9" style={{ padding: 10 }} />
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
          <TextInput
            style={styles.textInput}
            placeholder="Message the group..."
            placeholderTextColor="#999"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            <Text style={styles.sendButtonText}>
              {sending ? '...' : '\u27A4'}
            </Text>
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
  loadingText: { marginTop: 10, color: '#888', fontSize: 14 },

  chatBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  chatBannerEmoji: { fontSize: 32, marginRight: 12 },
  bannerTextWrap: { flex: 1 },
  chatBannerName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  chatBannerMembers: { fontSize: 11, color: '#888', marginTop: 2 },

  messagesList: { paddingHorizontal: 12, paddingVertical: 8 },

  msgRow: { flexDirection: 'row', marginVertical: 3, alignItems: 'flex-end' },
  msgRowLeft: { justifyContent: 'flex-start', marginRight: 50 },
  msgRowRight: { justifyContent: 'flex-end', marginLeft: 50 },

  avatarCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#1A2235', justifyContent: 'center', alignItems: 'center', marginRight: 6,
  },
  avatarText: { fontSize: 16 },

  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: '#4A90D9', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#1C1C1E', borderBottomLeftRadius: 4 },
  bubbleSending: { opacity: 0.6 },

  senderName: { fontSize: 11, fontWeight: '700', color: '#4A90D9', marginBottom: 2 },

  msgText: { fontSize: 15, lineHeight: 20 },
  msgTextMe: { color: '#fff' },
  msgTextOther: { color: '#E0E0E0' },

  timeText: { fontSize: 10, marginTop: 4 },
  timeTextMe: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  timeTextOther: { color: '#666' },

  systemMsgContainer: {
    alignSelf: 'center', backgroundColor: '#2C2C2E', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 6, marginVertical: 8,
  },
  systemMsgText: { fontSize: 12, color: '#A0A0A0', textAlign: 'center' },

  alertMsgContainer: {
    flexDirection: 'row', backgroundColor: '#2A1A1A', borderRadius: 14,
    padding: 14, marginVertical: 6, borderLeftWidth: 4, borderLeftColor: '#D32F2F', alignSelf: 'stretch',
  },
  alertMsgIcon: { fontSize: 28, marginRight: 10 },
  alertMsgContent: { flex: 1 },
  alertMsgLabel: { fontSize: 11, fontWeight: '800', color: '#FF6B6B', marginBottom: 4, letterSpacing: 0.5 },
  alertMsgText: { fontSize: 14, color: '#E0E0E0', lineHeight: 20 },
  alertMsgTime: { fontSize: 10, color: '#666', marginTop: 4 },

  ackMsgContainer: {
    flexDirection: 'row', backgroundColor: '#1A2E1A', borderRadius: 14,
    padding: 14, marginVertical: 6, borderLeftWidth: 4, borderLeftColor: '#4CAF50', alignSelf: 'stretch',
  },
  ackMsgIcon: { fontSize: 28, marginRight: 10 },
  ackMsgContent: { flex: 1 },
  ackMsgLabel: { fontSize: 11, fontWeight: '800', color: '#4CAF50', marginBottom: 4 },
  ackMsgText: { fontSize: 14, color: '#E0E0E0', lineHeight: 20 },
  ackMsgTime: { fontSize: 10, color: '#666', marginTop: 4 },

  emptyChat: {
    alignItems: 'center', paddingVertical: 60,
    transform: [{ scaleY: -1 }],
  },
  emptyChatEmoji: { fontSize: 50, marginBottom: 12 },
  emptyChatTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  emptyChatText: { fontSize: 14, color: '#888', textAlign: 'center' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10,
    paddingVertical: 8, backgroundColor: '#1C1C1E', borderTopWidth: 1, borderTopColor: '#2C2C2E',
  },
  textInput: {
    flex: 1, minHeight: 40, maxHeight: 100, backgroundColor: '#2C2C2E',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#fff', marginRight: 8,
  },
  sendButton: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#4A90D9',
    justifyContent: 'center', alignItems: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#2C2C2E' },
  sendButtonText: { fontSize: 20, color: '#fff', fontWeight: 'bold' },
});
