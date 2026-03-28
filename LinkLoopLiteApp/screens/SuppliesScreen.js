import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlassCard from '../components/GlassCard';
import ScreenHeader from '../components/ScreenHeader';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { suppliesAPI } from '../services/api';

const SUPPLY_CATEGORIES = [
  { value: 'insulin', label: 'Insulin', emoji: '💉' },
  { value: 'test_strips', label: 'Test Strips', emoji: '🔬' },
  { value: 'cgm_sensor', label: 'CGM Sensor', emoji: '📡' },
  { value: 'pump_supplies', label: 'Pump Supplies', emoji: '⚙️' },
  { value: 'lancets', label: 'Lancets', emoji: '🩸' },
  { value: 'glucose_tabs', label: 'Glucose Tabs', emoji: '🍬' },
  { value: 'batteries', label: 'Batteries', emoji: '🔋' },
  { value: 'alcohol_wipes', label: 'Alcohol Wipes', emoji: '🧴' },
  { value: 'other', label: 'Other', emoji: '📦' },
];

const getStatusInfo = (daysLeft) => {
  if (daysLeft <= 3) return { label: 'Reorder Soon', color: '#FF6B6B', bg: '#2A1A1A' };
  if (daysLeft <= 7) return { label: 'Low', color: '#FF7B93', bg: '#2A1E2E' };
  if (daysLeft <= 14) return { label: 'Good', color: '#4A90D9', bg: '#1A2235' };
  return { label: 'Well Stocked', color: '#4A90D9', bg: '#1A2235' };
};

export default function SuppliesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getAccent } = useTheme();
  const isMember = user?.role === 'member';
  const accent = getAccent(isMember);

  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSupply, setNewSupply] = useState({ name: '', category: 'insulin', quantity: '', unit: 'units', daysLeft: '' });

  const loadSupplies = useCallback(async () => {
    try {
      const data = await suppliesAPI.getAll();
      setSupplies(data);
    } catch (err) {
      console.log('Load supplies error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadSupplies(); }, [loadSupplies]);
  const onRefresh = () => { haptic.light(); setRefreshing(true); loadSupplies(); };

  const handleAddSupply = async () => {
    if (!newSupply.name.trim()) { Alert.alert('Error', 'Please enter a supply name'); return; }
    if (!newSupply.quantity) { Alert.alert('Error', 'Please enter a quantity'); return; }
    setSaving(true);
    try {
      const cat = SUPPLY_CATEGORIES.find(c => c.value === newSupply.category);
      await suppliesAPI.add({
        name: newSupply.name.trim(),
        emoji: cat?.emoji || '📦',
        category: newSupply.category,
        quantity: parseInt(newSupply.quantity),
        unit: newSupply.unit,
        daysLeft: parseInt(newSupply.daysLeft) || 30,
      });
      setShowAddModal(false);
      setNewSupply({ name: '', category: 'insulin', quantity: '', unit: 'units', daysLeft: '' });
      loadSupplies();
    } catch (err) { Alert.alert('Error', err.message || 'Could not add supply'); }
    finally { setSaving(false); }
  };

  const handleDeleteSupply = (id, name) => {
    haptic.warning();
    Alert.alert('Delete Supply', `Remove ${name} from your supplies?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await suppliesAPI.remove(id); loadSupplies(); }
        catch (err) { Alert.alert('Error', 'Could not delete supply'); }
      }},
    ]);
  };

  const getActualDaysLeft = (s) => {
    const daysSince = s.createdAt ? Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 86400000) : 0;
    return Math.max(0, (s.daysLeft || 30) - daysSince);
  };
  const needsRefill = supplies.filter(s => getActualDaysLeft(s) <= 7).length;
  const wellStocked = supplies.filter(s => getActualDaysLeft(s) > 7).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[accent]} />}
    >
      <ScreenHeader
        title="Supply Tracker"
        subtitle="Keep track of your T1D supplies and never run out"
      />

      <View style={styles.content}>
        {/* Supply Summary */}
        <FadeIn delay={stagger(0, 100)}>
        <GlassCard accent={accent} style={{ marginBottom: 20 }}>
          <Text style={styles.summaryTitle}>Supply Summary</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{supplies.length}</Text>
              <Text style={styles.summaryLabel}>Items Tracked</Text>
            </View>
            <View style={[styles.summaryItem, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }]}>
              <Text style={[styles.summaryNumber, { color: needsRefill > 0 ? '#FF6B6B' : accent }]}>{needsRefill}</Text>
              <Text style={styles.summaryLabel}>Needs Refill</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNumber, { color: accent }]}>{wellStocked}</Text>
              <Text style={styles.summaryLabel}>Well Stocked</Text>
            </View>
          </View>
        </GlassCard>
        </FadeIn>

        <FadeIn delay={stagger(1, 100)}>
        {/* Supply List */}
        {loading ? (
          <ActivityIndicator size="large" color={accent} style={{ paddingVertical: 40 }} />
        ) : supplies.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyTitle}>No supplies tracked yet</Text>
            <Text style={styles.emptyText}>Add your T1D supplies to keep track of stock levels and get reminders when running low.</Text>
          </View>
        ) : (
          supplies.map((supply) => {
            // Auto-decrement daysLeft based on time elapsed since creation
            const daysSinceCreated = supply.createdAt
              ? Math.floor((Date.now() - new Date(supply.createdAt).getTime()) / 86400000)
              : 0;
            const actualDaysLeft = Math.max(0, (supply.daysLeft || 30) - daysSinceCreated);
            const status = getStatusInfo(actualDaysLeft);
            return (
              <GlassCard key={supply._id} accent={accent} noPadding style={{ marginBottom: 12 }}>
              <TouchableOpacity style={styles.supplyCard} onLongPress={() => handleDeleteSupply(supply._id, supply.name)}>
                <Text style={styles.supplyEmoji}>{supply.emoji}</Text>
                <View style={styles.supplyInfo}>
                  <Text style={styles.supplyName} numberOfLines={1}>{supply.name}</Text>
                  <Text style={styles.supplyQuantity} numberOfLines={1}>{supply.quantity} {supply.unit} remaining</Text>
                </View>
                <View style={styles.supplyStatus}>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                  <Text style={styles.daysLeft}>{actualDaysLeft} days left</Text>
                </View>
              </TouchableOpacity>
              </GlassCard>
            );
          })
        )}

        {/* Add Supply Button */}
        <GlassCard accent={accent} noPadding style={{ marginBottom: 20 }}>
        <TouchableOpacity style={[styles.addButton, { borderColor: accent }]} onPress={() => { haptic.light(); setShowAddModal(true); }}>
          <Text style={styles.addButtonIcon}>➕</Text>
          <Text style={[styles.addButtonText, { color: accent }]}>Add Supply</Text>
        </TouchableOpacity>
        </GlassCard>

        {/* Usage Insights */}
        <GlassCard accent={accent} style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>Usage Insights</Text>
          <View style={styles.insightItem}>
            <Text style={styles.insightEmoji}>📊</Text>
            <View style={styles.insightInfo}>
              <Text style={styles.insightTitle}>Average Supply Duration</Text>
              <Text style={styles.insightValue}>
                {supplies.length > 0 ? Math.round(supplies.reduce((sum, s) => sum + getActualDaysLeft(s), 0) / supplies.length) : 0} days
              </Text>
            </View>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightEmoji}>⚠️</Text>
            <View style={styles.insightInfo}>
              <Text style={styles.insightTitle}>Items Needing Attention</Text>
              <Text style={styles.insightValue}>{needsRefill} item{needsRefill !== 1 ? 's' : ''}</Text>
            </View>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightEmoji}>✅</Text>
            <View style={styles.insightInfo}>
              <Text style={styles.insightTitle}>Supply Health</Text>
              <Text style={styles.insightValue}>
                {supplies.length > 0 ? Math.round((wellStocked / supplies.length) * 100) : 100}% stocked
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* Smart Reminders */}
        <GlassCard accent={accent} style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>Smart Reminders</Text>
          {supplies.filter(s => getActualDaysLeft(s) <= 7).length > 0 ? (
            supplies.filter(s => getActualDaysLeft(s) <= 7).map((s) => (
              <View key={s._id} style={styles.reminderItem}>
                <Text style={styles.reminderEmoji}>🔔</Text>
                <Text style={styles.reminderText}>
                  <Text style={{ fontWeight: TYPE.bold }}>{s.name}</Text> is running low — only {getActualDaysLeft(s)} day{getActualDaysLeft(s) !== 1 ? 's' : ''} left
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.reminderItem}>
              <Text style={styles.reminderEmoji}>✅</Text>
              <Text style={styles.reminderText}>All supplies are well stocked! No action needed.</Text>
            </View>
          )}
        </GlassCard>
        </FadeIn>
      </View>

      {/* Add Supply Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Supply</Text>

            <Text style={styles.inputLabel}>Supply Name</Text>
            <TextInput style={styles.input} placeholder="e.g. Humalog Insulin" value={newSupply.name} onChangeText={(t) => setNewSupply({ ...newSupply, name: t })} />

            <Text style={styles.inputLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {SUPPLY_CATEGORIES.map(c => (
                <TouchableOpacity key={c.value} style={[styles.catChip, newSupply.category === c.value && [styles.catChipActive, { backgroundColor: accent, borderColor: accent }]]} onPress={() => setNewSupply({ ...newSupply, category: c.value })}>
                  <Text style={styles.catEmoji}>{c.emoji}</Text>
                  <Text style={[styles.catLabel, newSupply.category === c.value && styles.catLabelActive]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.inputRow}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.inputLabel}>Quantity</Text>
                <TextInput style={styles.input} placeholder="e.g. 100" keyboardType="numeric" value={newSupply.quantity} onChangeText={(t) => setNewSupply({ ...newSupply, quantity: t })} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.inputLabel}>Days Left</Text>
                <TextInput style={styles.input} placeholder="e.g. 30" keyboardType="numeric" value={newSupply.daysLeft} onChangeText={(t) => setNewSupply({ ...newSupply, daysLeft: t })} />
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: accent }]} onPress={handleAddSupply} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Add Supply</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 20 },
  summaryTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginBottom: 15, textAlign: 'center' },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNumber: { fontSize: TYPE.h2, fontWeight: TYPE.bold, color: '#fff', marginBottom: 4 },
  summaryLabel: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.55)' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 50, marginBottom: 10 },
  emptyTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 6 },
  emptyText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  supplyCard: { padding: 15, flexDirection: 'row', alignItems: 'center' },
  supplyEmoji: { fontSize: 36, marginRight: 15 },
  supplyInfo: { flex: 1 },
  supplyName: { fontSize: TYPE.lg, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 4 },
  supplyQuantity: { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  supplyStatus: { alignItems: 'flex-end', flexShrink: 0, marginLeft: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 4 },
  statusText: { fontSize: TYPE.sm, fontWeight: TYPE.semibold },
  daysLeft: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
  addButton: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderRadius: 14 },
  addButtonIcon: { fontSize: TYPE.h3, marginRight: 10 },
  addButtonText: { fontSize: TYPE.lg, fontWeight: TYPE.semibold },
  sectionTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 15 },
  insightItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  insightEmoji: { fontSize: TYPE.h3, marginRight: 12 },
  insightInfo: { flex: 1 },
  insightTitle: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', marginBottom: 2 },
  insightValue: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff' },
  reminderItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  reminderEmoji: { fontSize: 20, marginRight: 10 },
  reminderText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.70)', flex: 1, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'rgba(10,18,40,0.96)', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 25, paddingBottom: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  modalTitle: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 20, textAlign: 'center' },
  inputLabel: { fontSize: TYPE.md, fontWeight: TYPE.semibold, color: 'rgba(255,255,255,0.70)', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, fontSize: TYPE.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', color: '#fff' },
  inputRow: { flexDirection: 'row', marginTop: 5 },
  catScroll: { marginBottom: 5 },
  catChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', marginRight: 8 },
  catChipActive: { borderColor: 'transparent' },
  catEmoji: { fontSize: TYPE.lg, marginRight: 6 },
  catLabel: { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  catLabelActive: { color: '#fff', fontWeight: TYPE.semibold },
  modalButtons: { flexDirection: 'row', marginTop: 25, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  cancelButtonText: { fontSize: TYPE.lg, color: 'rgba(255,255,255,0.70)', fontWeight: TYPE.semibold },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { fontSize: TYPE.lg, color: '#fff', fontWeight: TYPE.bold },
});
