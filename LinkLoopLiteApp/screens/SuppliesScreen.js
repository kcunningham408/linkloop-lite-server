import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Modal, RefreshControl, ActivityIndicator, Alert } from 'react-native';
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
  if (daysLeft <= 7) return { label: 'Low', color: '#FFA500', bg: '#2E2A1A' };
  if (daysLeft <= 14) return { label: 'Good', color: '#4A90D9', bg: '#1A2235' };
  return { label: 'Well Stocked', color: '#4A90D9', bg: '#1A2235' };
};

export default function SuppliesScreen() {
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
  const onRefresh = () => { setRefreshing(true); loadSupplies(); };

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4A90D9']} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Supply Tracker</Text>
        <Text style={styles.headerSubtitle}>Keep track of your T1D supplies and never run out</Text>
      </View>

      <View style={styles.content}>
        {/* Supply Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Supply Summary</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{supplies.length}</Text>
              <Text style={styles.summaryLabel}>Items Tracked</Text>
            </View>
            <View style={[styles.summaryItem, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#2C2C2E' }]}>
              <Text style={[styles.summaryNumber, { color: needsRefill > 0 ? '#FF6B6B' : '#4A90D9' }]}>{needsRefill}</Text>
              <Text style={styles.summaryLabel}>Needs Refill</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNumber, { color: '#4A90D9' }]}>{wellStocked}</Text>
              <Text style={styles.summaryLabel}>Well Stocked</Text>
            </View>
          </View>
        </View>

        {/* Supply List */}
        {loading ? (
          <ActivityIndicator size="large" color="#4A90D9" style={{ paddingVertical: 40 }} />
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
              <TouchableOpacity key={supply._id} style={styles.supplyCard} onLongPress={() => handleDeleteSupply(supply._id, supply.name)}>
                <Text style={styles.supplyEmoji}>{supply.emoji}</Text>
                <View style={styles.supplyInfo}>
                  <Text style={styles.supplyName}>{supply.name}</Text>
                  <Text style={styles.supplyQuantity}>{supply.quantity} {supply.unit} remaining</Text>
                </View>
                <View style={styles.supplyStatus}>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                  <Text style={styles.daysLeft}>{actualDaysLeft} days left</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Add Supply Button */}
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addButtonIcon}>➕</Text>
          <Text style={styles.addButtonText}>Add Supply</Text>
        </TouchableOpacity>

        {/* Usage Insights */}
        <View style={styles.insightsCard}>
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
        </View>

        {/* Smart Reminders */}
        <View style={styles.remindersCard}>
          <Text style={styles.sectionTitle}>Smart Reminders</Text>
          {supplies.filter(s => getActualDaysLeft(s) <= 7).length > 0 ? (
            supplies.filter(s => getActualDaysLeft(s) <= 7).map((s) => (
              <View key={s._id} style={styles.reminderItem}>
                <Text style={styles.reminderEmoji}>🔔</Text>
                <Text style={styles.reminderText}>
                  <Text style={{ fontWeight: 'bold' }}>{s.name}</Text> is running low — only {getActualDaysLeft(s)} day{getActualDaysLeft(s) !== 1 ? 's' : ''} left
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.reminderItem}>
              <Text style={styles.reminderEmoji}>✅</Text>
              <Text style={styles.reminderText}>All supplies are well stocked! No action needed.</Text>
            </View>
          )}
        </View>

        {/* Pro Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.sectionTitle}>Pro Tips</Text>
          <View style={styles.tipItem}>
            <Text style={styles.tipEmoji}>💡</Text>
            <Text style={styles.tipText}>Keep at least a 2-week backup supply of insulin and test strips</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipEmoji}>📋</Text>
            <Text style={styles.tipText}>Set a monthly reminder to audit your supplies and check expiration dates</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipEmoji}>🏥</Text>
            <Text style={styles.tipText}>Reorder supplies early so you never run out of what you need</Text>
          </View>
        </View>
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
                <TouchableOpacity key={c.value} style={[styles.catChip, newSupply.category === c.value && styles.catChipActive]} onPress={() => setNewSupply({ ...newSupply, category: c.value })}>
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
              <TouchableOpacity style={styles.saveButton} onPress={handleAddSupply} disabled={saving}>
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
  container: { flex: 1, backgroundColor: '#111111' },
  header: { backgroundColor: '#1C1C1E', padding: 20, paddingTop: 30 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  headerSubtitle: { fontSize: 14, color: '#A0A0A0' },
  content: { padding: 20 },
  summaryCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  summaryTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 15, textAlign: 'center' },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNumber: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  summaryLabel: { fontSize: 12, color: '#A0A0A0' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 50, marginBottom: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  supplyCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 15, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#2C2C2E' },
  supplyEmoji: { fontSize: 36, marginRight: 15 },
  supplyInfo: { flex: 1 },
  supplyName: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 4 },
  supplyQuantity: { fontSize: 13, color: '#A0A0A0' },
  supplyStatus: { alignItems: 'flex-end' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  daysLeft: { fontSize: 11, color: '#888' },
  addButton: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 2, borderColor: '#4A90D9', borderStyle: 'dashed' },
  addButtonIcon: { fontSize: 24, marginRight: 10 },
  addButtonText: { fontSize: 16, fontWeight: '600', color: '#4A90D9' },
  insightsCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
  insightItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  insightEmoji: { fontSize: 24, marginRight: 12 },
  insightInfo: { flex: 1 },
  insightTitle: { fontSize: 14, color: '#A0A0A0', marginBottom: 2 },
  insightValue: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  remindersCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  reminderItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  reminderEmoji: { fontSize: 20, marginRight: 10 },
  reminderText: { fontSize: 14, color: '#E0E0E0', flex: 1, lineHeight: 20 },
  tipsCard: { backgroundColor: '#1A2235', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#2A3A50' },
  tipItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  tipEmoji: { fontSize: 18, marginRight: 10, marginTop: 2 },
  tipText: { fontSize: 14, color: '#C0C0C0', flex: 1, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 25, paddingBottom: 40 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#E0E0E0', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: '#2C2C2E', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#3A3A3C', color: '#fff' },
  inputRow: { flexDirection: 'row', marginTop: 5 },
  catScroll: { marginBottom: 5 },
  catChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#2C2C2E', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#3A3A3C', marginRight: 8 },
  catChipActive: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  catEmoji: { fontSize: 16, marginRight: 6 },
  catLabel: { fontSize: 13, color: '#A0A0A0' },
  catLabelActive: { color: '#fff', fontWeight: '600' },
  modalButtons: { flexDirection: 'row', marginTop: 25, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#2C2C2E', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, color: '#A0A0A0', fontWeight: '600' },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#4A90D9', alignItems: 'center' },
  saveButtonText: { fontSize: 16, color: '#fff', fontWeight: 'bold' },
});
