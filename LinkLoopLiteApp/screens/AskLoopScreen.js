import { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, FlatList, KeyboardAvoidingView,
    Platform, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlassCard from '../components/GlassCard';
import ScreenHeader from '../components/ScreenHeader';
import { FadeIn } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { insightsAPI } from '../services/api';

const SUGGESTED_QUESTIONS = [
  { text: 'How are my mornings?', emoji: '🌅' },
  { text: 'Why did I spike today?', emoji: '⚡' },
  { text: "What's my best time of day?", emoji: '🏆' },
  { text: 'Am I doing better than yesterday?', emoji: '📈' },
  { text: 'How stable have I been?', emoji: '❤️' },
  { text: 'How are my overnights?', emoji: '🌙' },
];

export default function AskLoopScreen() {
  const { user } = useAuth();
  const { getAccent } = useTheme();
  const insets = useSafeAreaInsets();
  const accent = getAccent(user?.role === 'member');
  const isMember = user?.role === 'member';

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef(null);

  const sendMessage = useCallback(async (text) => {
    const question = (text || input).trim();
    if (!question || loading) return;

    haptic.medium();
    setInput('');

    const userMsg = { id: Date.now().toString(), role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Scroll to bottom
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const data = await insightsAPI.askLoop(question);
      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer || "Hmm, I didn't get a response. Try again! 🤔",
        context: data.context,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.log('Ask Loop client error:', err?.message || err);
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: err?.message?.includes('timeout') || err?.message?.includes('network')
          ? "The server is waking up — give it a moment and try again! ☕"
          : "Sorry, I couldn't process that right now. Try again in a moment! 🧠",
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [input, loading]);

  const clearHistory = () => {
    Alert.alert('Clear Chat', 'Start a fresh conversation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          haptic.medium();
          setMessages([]);
          try { await insightsAPI.clearAskHistory(); } catch {}
        }
      }
    ]);
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
        {!isUser && <Text style={[styles.loopAvatar, { color: accent }]}>∞</Text>}
        <View style={[
          styles.msgBubble,
          isUser
            ? [styles.msgBubbleUser, { backgroundColor: accent }]
            : styles.msgBubbleAssistant
        ]}>
          <Text style={[styles.msgText, isUser && styles.msgTextUser]}>{item.content}</Text>
          {item.context && (
            <View style={styles.contextRow}>
              <Text style={styles.contextText}>
                📊 {item.context.readingCount} readings · {item.context.tir}% TIR · avg {item.context.avg}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const showSuggestions = messages.length === 0;

  // Members can't use Ask Loop — warrior-only feature
  if (isMember) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="🤖 Ask Loop" subtitle="AI glucose companion" />
        <View style={styles.lockedContainer}>
          <GlassCard>
            <Text style={styles.lockedEmoji}>🔒</Text>
            <Text style={styles.lockedTitle}>Warrior Feature</Text>
            <Text style={styles.lockedText}>
              Ask Loop is an AI companion that helps warriors analyze their glucose data and patterns. This feature is only available for warrior accounts.
            </Text>
          </GlassCard>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <ScreenHeader
        title="🤖 Ask Loop"
        subtitle="Chat with your glucose data — powered by AI"
      />

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        ListHeaderComponent={
          showSuggestions ? (
            <FadeIn delay={0}>
              <View style={styles.welcomeSection}>
                <GlassCard accent={accent}>
                  <Text style={styles.welcomeEmoji}>∞</Text>
                  <Text style={styles.welcomeTitle}>Hey{user?.name ? `, ${user.name}` : ''}! 👋</Text>
                  <Text style={styles.welcomeText}>
                    I'm Loop — your AI glucose companion. Ask me anything about your readings, patterns, or trends. I'll use your actual data to give you personalized answers.
                  </Text>
                </GlassCard>

                <Text style={styles.suggestionsTitle}>Try asking...</Text>
                <View style={styles.suggestionsGrid}>
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.suggestionChip}
                      onPress={() => sendMessage(q.text)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.suggestionEmoji}>{q.emoji}</Text>
                      <Text style={styles.suggestionText} numberOfLines={2}>{q.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </FadeIn>
          ) : null
        }
        ListFooterComponent={
          loading ? (
            <View style={[styles.msgRow, styles.msgRowAssistant]}>
              <Text style={[styles.loopAvatar, { color: accent }]}>∞</Text>
              <View style={[styles.msgBubble, styles.msgBubbleAssistant]}>
                <View style={styles.typingRow}>
                  <ActivityIndicator size="small" color={accent} />
                  <Text style={styles.typingText}>Loop is thinking...</Text>
                </View>
              </View>
            </View>
          ) : null
        }
      />

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: Platform.OS === 'ios' ? 30 : 10 + insets.bottom }]}>
        {messages.length > 0 && (
          <TouchableOpacity onPress={clearHistory} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>🗑️</Text>
          </TouchableOpacity>
        )}
        <View style={[styles.inputWrap, { borderColor: accent + '40' }]}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask about your glucose data..."
            placeholderTextColor="#888"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
            editable={!loading}
            maxLength={300}
            multiline={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: input.trim() ? accent : '#333' }]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  lockedContainer: { flex: 1, justifyContent: 'center', padding: 24 },
  lockedEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  lockedTitle: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff', textAlign: 'center', marginBottom: 8 },
  lockedText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22 },
  messagesList: { padding: 16, paddingBottom: 20 },

  // Welcome
  welcomeSection: { marginBottom: 20 },
  welcomeEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 12, color: '#fff' },
  welcomeTitle: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff', textAlign: 'center', marginBottom: 8 },
  welcomeText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22 },

  suggestionsTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginTop: 24, marginBottom: 12 },
  suggestionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  suggestionChip: {
    backgroundColor: 'rgba(10,18,40,0.80)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    width: '48%',
  },
  suggestionEmoji: { fontSize: TYPE.xl, marginRight: 8 },
  suggestionText: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.55)', flex: 1, lineHeight: 18 },

  // Messages
  msgRow: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAssistant: { justifyContent: 'flex-start' },
  loopAvatar: { fontSize: 20, color: '#4A90D9', fontWeight: '900', marginRight: 8, marginBottom: 4 },
  msgBubble: { maxWidth: '80%', borderRadius: 18, padding: 14 },
  msgBubbleUser: { backgroundColor: '#4A90D9', borderBottomRightRadius: 4 },
  msgBubbleAssistant: { backgroundColor: 'rgba(10,18,40,0.80)', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  msgText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.70)', lineHeight: 22 },
  msgTextUser: { color: '#fff' },

  contextRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  contextText: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.45)' },

  // Typing indicator
  typingRow: { flexDirection: 'row', alignItems: 'center' },
  typingText: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.45)', marginLeft: 8 },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 10,
    backgroundColor: 'rgba(10,18,40,0.88)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)',
  },
  clearBtn: { padding: 8, marginRight: 6 },
  clearBtnText: { fontSize: TYPE.xl },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    paddingLeft: 16, paddingRight: 4, paddingVertical: Platform.OS === 'ios' ? 4 : 0,
  },
  textInput: { flex: 1, color: '#fff', fontSize: TYPE.md, paddingVertical: 10 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginLeft: 6 },
  sendBtnText: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff' },
});
