import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet, Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { moodAPI } from '../services/api';

const MOOD_OPTIONS = [
  { emoji: '😊', label: 'great', display: 'Great' },
  { emoji: '🙂', label: 'good', display: 'Good' },
  { emoji: '😐', label: 'okay', display: 'Okay' },
  { emoji: '😴', label: 'tired', display: 'Tired' },
  { emoji: '😫', label: 'stressed', display: 'Stressed' },
  { emoji: '🤢', label: 'sick', display: 'Sick' },
  { emoji: '😩', label: 'low_energy', display: 'Low Energy' },
  { emoji: '😰', label: 'anxious', display: 'Anxious' },
];

export default function MoodScreen() {
  const [selectedMood, setSelectedMood] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [editMood, setEditMood] = useState(null);
  const [editNote, setEditNote] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [entriesData, statsData] = await Promise.allSettled([
        moodAPI.getEntries(168),
        moodAPI.getStats(168),
      ]);
      if (entriesData.status === 'fulfilled') setEntries(entriesData.value);
      if (statsData.status === 'fulfilled') setStats(statsData.value);
    } catch (err) {
      console.log('Mood load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handleLogMood = async () => {
    if (!selectedMood) {
      Alert.alert('Select a Mood', 'Tap how you\'re feeling to log it.');
      return;
    }

    setSaving(true);
    try {
      await moodAPI.log(selectedMood.emoji, selectedMood.label, note.trim());
      setSelectedMood(null);
      setNote('');
      loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save mood entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Delete Entry', 'Remove this mood entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await moodAPI.remove(id);
            loadData();
          } catch (err) {
            Alert.alert('Error', 'Could not delete entry');
          }
        }
      }
    ]);
  };

  const openEdit = (entry) => {
    const mood = MOOD_OPTIONS.find(m => m.label === entry.label) || { emoji: entry.emoji, label: entry.label, display: entry.label };
    setEditEntry(entry);
    setEditMood(mood);
    setEditNote(entry.note || '');
  };

  const handleSaveEdit = async () => {
    if (!editEntry || !editMood) return;
    setEditSaving(true);
    try {
      await moodAPI.update(editEntry._id, {
        emoji: editMood.emoji,
        label: editMood.label,
        note: editNote.trim(),
      });
      setEditEntry(null);
      loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update entry');
    } finally {
      setEditSaving(false);
    }
  };

  const timeAgo = (timestamp) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4A90D9']} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>How Are You Feeling?</Text>
          <Text style={styles.headerSubtitle}>Track your mood alongside your glucose — AI will learn your patterns</Text>
        </View>

        <View style={styles.content}>
          {/* Mood Picker */}
          <View style={styles.moodGrid}>
            {MOOD_OPTIONS.map((mood) => (
              <TouchableOpacity
                key={mood.label}
                style={[
                  styles.moodOption,
                  selectedMood?.label === mood.label && styles.moodOptionSelected,
                ]}
                onPress={() => setSelectedMood(mood)}
              >
                <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                <Text style={[
                  styles.moodLabel,
                  selectedMood?.label === mood.label && styles.moodLabelSelected,
                ]}>{mood.display}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Note Input */}
          <View style={styles.noteContainer}>
            <Text style={styles.noteLabel}>📝 Quick Note (optional)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="What's going on? Pizza night, stressful day, feeling off..."
              placeholderTextColor="#666"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
              returnKeyType="done"
              blurOnSubmit
            />
            <Text style={styles.noteCount}>{note.length}/500</Text>
          </View>

          {/* Log Button */}
          <TouchableOpacity
            style={[styles.logButton, !selectedMood && styles.logButtonDisabled]}
            onPress={handleLogMood}
            disabled={!selectedMood || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.logButtonText}>
                {selectedMood ? `Log ${selectedMood.emoji} ${selectedMood.display}` : 'Select a mood above'}
              </Text>
            )}
          </TouchableOpacity>

          {/* AI Info Card */}
          <View style={styles.aiInfoCard}>
            <Text style={styles.aiInfoIcon}>🧠</Text>
            <Text style={styles.aiInfoText}>
              Your mood entries and notes are shared with AI Insights — over time, it'll spot correlations 
              between how you feel and your glucose patterns.
            </Text>
          </View>

          {/* Mood Stats */}
          {stats && stats.totalEntries > 0 && (
            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>📊 This Week's Mood</Text>
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{stats.totalEntries}</Text>
                  <Text style={styles.statLabel}>Entries</Text>
                </View>
                {stats.topMood && (
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{stats.topMood.emoji}</Text>
                    <Text style={styles.statLabel}>Most Common</Text>
                  </View>
                )}
                {stats.currentStreak && stats.currentStreak.count > 1 && (
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{stats.currentStreak.count}x</Text>
                    <Text style={styles.statLabel}>{stats.currentStreak.emoji} Streak</Text>
                  </View>
                )}
              </View>

              {/* Mood frequency bars */}
              {stats.frequency && stats.frequency.length > 0 && (
                <View style={styles.frequencySection}>
                  {stats.frequency.map((item) => {
                    const pct = Math.round((item.count / stats.totalEntries) * 100);
                    return (
                      <View key={item.label} style={styles.freqRow}>
                        <Text style={styles.freqEmoji}>{item.emoji}</Text>
                        <View style={styles.freqBarBg}>
                          <View style={[styles.freqBarFill, { width: `${Math.max(pct, 5)}%` }]} />
                        </View>
                        <Text style={styles.freqCount}>{item.count}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Recent Entries */}
          <Text style={styles.sectionTitle}>Recent Entries</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#4A90D9" style={{ paddingVertical: 30 }} />
          ) : entries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📝</Text>
              <Text style={styles.emptyTitle}>No mood entries yet</Text>
              <Text style={styles.emptyText}>Tap a mood above to start tracking how you feel</Text>
            </View>
          ) : (
            entries.map((entry) => (
              <TouchableOpacity
                key={entry._id}
                style={styles.entryCard}
                onPress={() => openEdit(entry)}
                onLongPress={() => handleDelete(entry._id)}
              >
                <View style={styles.entryHeader}>
                  <Text style={styles.entryEmoji}>{entry.emoji}</Text>
                  <View style={styles.entryInfo}>
                    <Text style={styles.entryLabel}>
                      {MOOD_OPTIONS.find(m => m.label === entry.label)?.display || entry.label}
                    </Text>
                    <Text style={styles.entryTime}>{timeAgo(entry.timestamp)}</Text>
                  </View>
                </View>
                {entry.note ? (
                  <Text style={styles.entryNote}>{entry.note}</Text>
                ) : null}
              </TouchableOpacity>
            ))
          )}

          {entries.length > 0 && (
            <Text style={styles.longPressHint}>Tap to edit · Long press to delete</Text>
          )}
        </View>
      </ScrollView>

      {/* Edit Mood Modal */}
      <Modal visible={!!editEntry} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✏️ Edit Mood Entry</Text>

            <View style={styles.editMoodGrid}>
              {MOOD_OPTIONS.map((mood) => (
                <TouchableOpacity
                  key={mood.label}
                  style={[
                    styles.moodOption,
                    editMood?.label === mood.label && styles.moodOptionSelected,
                    { width: '23%', marginBottom: 8 },
                  ]}
                  onPress={() => setEditMood(mood)}
                >
                  <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                  <Text style={[
                    styles.moodLabel,
                    editMood?.label === mood.label && styles.moodLabelSelected,
                  ]}>{mood.display}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.editNoteLabel}>📝 Note</Text>
            <TextInput
              style={styles.editNoteInput}
              placeholder="Optional note..."
              placeholderTextColor="#666"
              value={editNote}
              onChangeText={setEditNote}
              multiline
              maxLength={500}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditEntry(null)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit} disabled={editSaving}>
                {editSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },
  header: {
    backgroundColor: '#1C1C1E',
    padding: 20,
    paddingTop: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  headerSubtitle: { fontSize: 14, color: '#A0A0A0', lineHeight: 20 },

  content: { padding: 20 },

  // Mood Grid
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  moodOption: {
    width: '23%',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#2C2C2E',
  },
  moodOptionSelected: {
    borderColor: '#4A90D9',
    backgroundColor: '#1A2235',
  },
  moodEmoji: { fontSize: 32, marginBottom: 4 },
  moodLabel: { fontSize: 11, color: '#A0A0A0', textAlign: 'center' },
  moodLabelSelected: { color: '#4A90D9', fontWeight: 'bold' },

  // Note Input
  noteContainer: { marginBottom: 20 },
  noteLabel: { fontSize: 14, color: '#A0A0A0', marginBottom: 8 },
  noteInput: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 15,
    color: '#fff',
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  noteCount: { fontSize: 11, color: '#555', textAlign: 'right', marginTop: 4 },

  // Log Button
  logButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  logButtonDisabled: { backgroundColor: '#2A3A50', opacity: 0.6 },
  logButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // AI Info Card
  aiInfoCard: {
    backgroundColor: '#1A2235',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#2A3A50',
  },
  aiInfoIcon: { fontSize: 20, marginRight: 12, marginTop: 2 },
  aiInfoText: { flex: 1, fontSize: 13, color: '#A0A0A0', lineHeight: 19 },

  // Stats Card
  statsCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 18,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  statsTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 },
  statBox: { alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#4A90D9' },
  statLabel: { fontSize: 11, color: '#A0A0A0', marginTop: 4 },

  // Frequency bars
  frequencySection: { marginTop: 5 },
  freqRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  freqEmoji: { fontSize: 18, width: 30 },
  freqBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#2C2C2E',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  freqBarFill: { height: 8, backgroundColor: '#4A90D9', borderRadius: 4 },
  freqCount: { fontSize: 12, color: '#A0A0A0', width: 25, textAlign: 'right' },

  // Section
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 15 },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#A0A0A0' },

  // Entry Cards
  entryCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  entryHeader: { flexDirection: 'row', alignItems: 'center' },
  entryEmoji: { fontSize: 28, marginRight: 12 },
  entryInfo: { flex: 1 },
  entryLabel: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  entryTime: { fontSize: 12, color: '#888', marginTop: 2 },
  entryNote: {
    fontSize: 13,
    color: '#A0A0A0',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
    lineHeight: 19,
  },

  longPressHint: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 30,
  },

  // Edit Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 25, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' },
  editMoodGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 15 },
  editNoteLabel: { fontSize: 14, color: '#A0A0A0', marginBottom: 8 },
  editNoteInput: { backgroundColor: '#111', borderRadius: 12, padding: 15, color: '#fff', fontSize: 15, minHeight: 70, textAlignVertical: 'top', borderWidth: 1, borderColor: '#2C2C2E', marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#2C2C2E', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, color: '#A0A0A0', fontWeight: '600' },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#4A90D9', alignItems: 'center' },
  saveButtonText: { fontSize: 16, color: '#fff', fontWeight: 'bold' },
});
