import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput,
  Modal, RefreshControl, ActivityIndicator, Alert as RNAlert, Vibration
} from 'react-native';
import { alertsAPI, glucoseAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const SEVERITY_CONFIG = {
  critical: { color: '#FF6B6B', bg: '#2A1A1A', icon: '🔴', label: 'HIGH PRIORITY' },
  urgent: { color: '#FF6D00', bg: '#2E2A1A', icon: '🟠', label: 'IMPORTANT' },
  warning: { color: '#FFC107', bg: '#2E2A1A', icon: '🟡', label: 'NOTICE' },
};

const ALERT_TYPE_LABELS = {
  low: '📉 Low Reading',
  high: '📈 High Reading',
  urgent_low: '🚨 Very Low',
  urgent_high: '🚨 Very High',
  rapid_drop: '⬇️ Dropping Fast',
  rapid_rise: '⬆️ Rising Fast',
  no_data: '❓ No Data',
};

const STATUS_CONFIG = {
  active: { color: '#FF6B6B', bg: '#2A1A1A', icon: '🔴', label: 'Active' },
  acknowledged: { color: '#FF9800', bg: '#2E2A1A', icon: '✅', label: 'Acknowledged' },
  resolved: { color: '#4CAF50', bg: '#1A2E1A', icon: '☑️', label: 'Resolved' },
};

export default function AlertsScreen({ navigation }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, active, acknowledged, resolved
  const [showAckModal, setShowAckModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [ackMessage, setAckMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailAlert, setDetailAlert] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadAlerts = useCallback(async () => {
    try {
      const statusParam = filter === 'all' ? '' : filter;
      const data = await alertsAPI.getAlerts(statusParam);
      setAlerts(Array.isArray(data) ? data : (data.alerts || []));
    } catch (err) {
      console.log('Load alerts error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    loadAlerts();

    // Poll every 10 seconds for new alerts
    const interval = setInterval(() => loadAlerts(), 10000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  const onRefresh = () => { setRefreshing(true); loadAlerts(); };

  const handleTriggerCheck = async () => {
    try {
      // Get latest glucose reading first
      const latest = await glucoseAPI.getLatest();
      const reading = latest.reading || latest;
      if (!reading || !reading.value) {
        RNAlert.alert('No Data', 'No recent glucose reading found. Log a reading first.');
        return;
      }
      const data = await alertsAPI.triggerCheck(reading.value);
      if (data.alert) {
        Vibration.vibrate([0, 200, 100, 200]);
        RNAlert.alert('🔔 Notification Created', data.alert.message || `Reading: ${reading.value} mg/dL`);
        loadAlerts();
      } else {
        RNAlert.alert('✅ All Clear', data.message || 'Glucose is in range');
      }
    } catch (err) {
      RNAlert.alert('Error', err.message || 'Could not check glucose');
    }
  };

  const openAcknowledge = (alert) => {
    setSelectedAlert(alert);
    setAckMessage('');
    setShowAckModal(true);
  };

  const handleAcknowledge = async () => {
    if (!selectedAlert) return;
    setSubmitting(true);
    try {
      await alertsAPI.acknowledge(selectedAlert._id, ackMessage.trim());
      Vibration.vibrate(100);
      setShowAckModal(false);
      setSelectedAlert(null);
      setAckMessage('');
      loadAlerts();
    } catch (err) {
      RNAlert.alert('Error', err.message || 'Could not acknowledge alert');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = (alert) => {
    RNAlert.alert(
      'Resolve Alert',
      'Mark this alert as resolved? This confirms the situation has been handled.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          onPress: async () => {
            try {
              await alertsAPI.resolve(alert._id);
              loadAlerts();
            } catch (err) {
              RNAlert.alert('Error', err.message || 'Could not resolve alert');
            }
          },
        },
      ]
    );
  };

  const openDetail = async (alert) => {
    setDetailAlert(alert);
    setShowDetailModal(true);
    setDetailLoading(true);
    try {
      const full = await alertsAPI.getAlert(alert._id);
      setDetailAlert(full.alert || full);
    } catch (err) {
      console.log('Load detail error:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const hasUserAcknowledged = (alert) => {
    return alert.acknowledgments?.some(
      ack => (ack.userId?._id || ack.userId) === user?.id
    );
  };

  const activeAlerts = alerts.filter(a => a.status === 'active');
  const otherAlerts = alerts.filter(a => a.status !== 'active');

  const renderAlertCard = (alert) => {
    const severity = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.warning;
    const status = STATUS_CONFIG[alert.status] || STATUS_CONFIG.active;
    const alertType = ALERT_TYPE_LABELS[alert.type] || alert.type;
    const isOwner = (alert.userId?._id || alert.userId) === user?.id;
    const userAcked = hasUserAcknowledged(alert);
    const ackCount = alert.acknowledgments?.length || 0;

    return (
      <TouchableOpacity
        key={alert._id}
        style={[styles.alertCard, { borderLeftColor: severity.color }]}
        onPress={() => openDetail(alert)}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.alertCardHeader}>
          <View style={styles.alertTypeRow}>
            <Text style={styles.alertTypeText}>{alertType}</Text>
            <View style={[styles.severityBadge, { backgroundColor: severity.bg }]}>
              <Text style={[styles.severityText, { color: severity.color }]}>
                {severity.icon} {severity.label}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.icon} {status.label}
            </Text>
          </View>
        </View>

        {/* Glucose Value */}
        <View style={styles.glucoseRow}>
          <Text style={[styles.glucoseValue, { color: severity.color }]}>
            {alert.glucoseValue}
          </Text>
          <Text style={styles.glucoseUnit}>mg/dL</Text>
          <Text style={styles.alertTime}>{formatTime(alert.createdAt)}</Text>
        </View>

        {/* Message */}
        <Text style={styles.alertMessage}>{alert.message}</Text>

        {/* Acknowledgment Status — THE KEY FEATURE */}
        <View style={styles.ackSection}>
          <View style={styles.ackHeader}>
            <Text style={styles.ackTitle}>
              {ackCount > 0 ? '✅' : '⏳'} Acknowledgments ({ackCount})
            </Text>
          </View>

          {alert.acknowledgments && alert.acknowledgments.length > 0 ? (
            alert.acknowledgments.map((ack, idx) => (
              <View key={idx} style={styles.ackItem}>
                <Text style={styles.ackName}>
                  ✅ {ack.userId?.name || 'Someone'}
                </Text>
                {ack.message ? (
                  <Text style={styles.ackItemMsg}>"{ack.message}"</Text>
                ) : null}
                <Text style={styles.ackItemTime}>
                  {formatTime(ack.acknowledgedAt)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.noAckText}>
              ⏳ No one has acknowledged yet
            </Text>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.alertActions}>
          {alert.status === 'active' && !userAcked && (
            <TouchableOpacity
              style={styles.ackButton}
              onPress={() => openAcknowledge(alert)}
            >
              <Text style={styles.ackButtonText}>✋ I'm Handling It</Text>
            </TouchableOpacity>
          )}

          {alert.status === 'active' && userAcked && (
            <View style={styles.ackedBadge}>
              <Text style={styles.ackedBadgeText}>✅ You acknowledged</Text>
            </View>
          )}

          {alert.status === 'active' && isOwner && (
            <TouchableOpacity
              style={styles.resolveButton}
              onPress={() => handleResolve(alert)}
            >
              <Text style={styles.resolveButtonText}>☑️ Resolve</Text>
            </TouchableOpacity>
          )}

          {alert.status === 'acknowledged' && isOwner && (
            <TouchableOpacity
              style={styles.resolveButton}
              onPress={() => handleResolve(alert)}
            >
              <Text style={styles.resolveButtonText}>☑️ Mark Resolved</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4A90D9']} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🔔 Notifications</Text>
        <Text style={styles.headerSubtitle}>
          Acknowledge notifications to keep your circle in the loop
        </Text>
      </View>

      <View style={styles.content}>
        {/* Manual Check Button */}
        <TouchableOpacity style={styles.checkButton} onPress={handleTriggerCheck}>
          <Text style={styles.checkButtonIcon}>📡</Text>
          <View>
            <Text style={styles.checkButtonText}>Check Glucose Now</Text>
            <Text style={styles.checkButtonSub}>Trigger alert if out of range</Text>
          </View>
        </TouchableOpacity>

        {/* Filter Tabs */}
        <View style={styles.filterRow}>
          {[
            { key: 'all', label: 'All' },
            { key: 'active', label: '🔴 Active' },
            { key: 'acknowledged', label: '✅ Ack\'d' },
            { key: 'resolved', label: '☑️ Done' },
          ].map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
              onPress={() => { setFilter(f.key); setLoading(true); }}
            >
              <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#4A90D9" style={{ paddingVertical: 40 }} />
        ) : alerts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>✨</Text>
            <Text style={styles.emptyTitle}>No alerts</Text>
            <Text style={styles.emptyText}>
              {filter === 'active'
                ? 'No active alerts — glucose is looking good!'
                : 'No alerts to show for this filter.'}
            </Text>
          </View>
        ) : (
          <>
            {/* Active alerts first (most important) */}
            {activeAlerts.length > 0 && filter === 'all' && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>🔴 Active — Needs Attention</Text>
                  <Text style={styles.sectionCount}>{activeAlerts.length}</Text>
                </View>
                {activeAlerts.map(renderAlertCard)}
              </>
            )}

            {/* Other alerts or all if filtered */}
            {filter === 'all' && otherAlerts.length > 0 && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>📋 Previous Alerts</Text>
                <Text style={styles.sectionCount}>{otherAlerts.length}</Text>
              </View>
            )}
            {(filter === 'all' ? otherAlerts : alerts).map(renderAlertCard)}
          </>
        )}

        {/* Explanation Card */}
        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>💡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>How Acknowledgments Work</Text>
            <Text style={styles.infoText}>
              When a glucose alert fires, everyone in the Care Circle is notified.{'\n\n'}
              Tap "I'm Handling It" to let others know the situation is under control.{'\n\n'}
              This gives your whole team peace of mind — no alert goes unnoticed.
            </Text>
          </View>
        </View>
      </View>

      {/* Acknowledge Modal */}
      <Modal visible={showAckModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✋ Acknowledge Alert</Text>

            {selectedAlert && (
              <View style={styles.ackModalAlert}>
                <Text style={styles.ackModalAlertType}>
                  {ALERT_TYPE_LABELS[selectedAlert.type]}
                </Text>
                <Text style={styles.ackModalAlertValue}>
                  {selectedAlert.glucoseValue} mg/dL
                </Text>
              </View>
            )}

            <Text style={styles.ackModalLabel}>
              Let the circle know you're on it:
            </Text>

            {/* Quick responses */}
            <View style={styles.quickResponses}>
              {[
                'I\'m handling it 👍',
                'Giving juice now 🧃',
                'Checking on them 👀',
                'Already treated ✅',
                'On my way 🏃',
              ].map((qr, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.quickChip, ackMessage === qr && styles.quickChipActive]}
                  onPress={() => setAckMessage(qr)}
                >
                  <Text style={[styles.quickChipText, ackMessage === qr && styles.quickChipTextActive]}>
                    {qr}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.ackInput}
              placeholder="Or type a custom message..."
              placeholderTextColor="#999"
              value={ackMessage}
              onChangeText={setAckMessage}
              multiline
              maxLength={200}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAckModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmAckButton}
                onPress={handleAcknowledge}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmAckButtonText}>✅ Acknowledge</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Alert Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {detailLoading ? (
              <ActivityIndicator size="large" color="#4A90D9" style={{ padding: 40 }} />
            ) : detailAlert ? (
              <>
                <Text style={styles.modalTitle}>
                  {ALERT_TYPE_LABELS[detailAlert.type] || 'Alert Details'}
                </Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Glucose</Text>
                  <Text style={[styles.detailValue, {
                    color: (SEVERITY_CONFIG[detailAlert.severity] || {}).color || '#333',
                    fontSize: 28,
                    fontWeight: 'bold',
                  }]}>
                    {detailAlert.glucoseValue} mg/dL
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={[styles.statusBadge, {
                    backgroundColor: (STATUS_CONFIG[detailAlert.status] || {}).bg || '#2C2C2E',
                  }]}>
                    <Text style={[styles.statusText, {
                      color: (STATUS_CONFIG[detailAlert.status] || {}).color || '#A0A0A0',
                    }]}>
                      {(STATUS_CONFIG[detailAlert.status] || {}).icon} {(STATUS_CONFIG[detailAlert.status] || {}).label || detailAlert.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Time</Text>
                  <Text style={styles.detailValue}>
                    {new Date(detailAlert.createdAt).toLocaleString()}
                  </Text>
                </View>

                <Text style={styles.detailSectionTitle}>
                  ✅ Acknowledgments ({detailAlert.acknowledgments?.length || 0})
                </Text>

                {detailAlert.acknowledgments?.length > 0 ? (
                  detailAlert.acknowledgments.map((ack, idx) => (
                    <View key={idx} style={styles.detailAckItem}>
                      <View style={styles.detailAckRow}>
                        <Text style={styles.detailAckName}>
                          ✅ {ack.userId?.name || 'Care Circle Member'}
                        </Text>
                        <Text style={styles.detailAckTime}>
                          {formatTime(ack.acknowledgedAt)}
                        </Text>
                      </View>
                      {ack.message ? (
                        <Text style={styles.detailAckMsg}>"{ack.message}"</Text>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <View style={styles.noAckDetailBox}>
                    <Text style={styles.noAckDetailIcon}>⏳</Text>
                    <Text style={styles.noAckDetailText}>
                      No one has acknowledged this alert yet.{'\n'}
                      Tap below to let everyone know it's being handled.
                    </Text>
                  </View>
                )}

                {/* Action buttons in detail */}
                {detailAlert.status === 'active' && !hasUserAcknowledged(detailAlert) && (
                  <TouchableOpacity
                    style={styles.ackButton}
                    onPress={() => {
                      setShowDetailModal(false);
                      openAcknowledge(detailAlert);
                    }}
                  >
                    <Text style={styles.ackButtonText}>✋ I'm Handling It</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : null}

            <TouchableOpacity
              style={styles.closeDetailButton}
              onPress={() => setShowDetailModal(false)}
            >
              <Text style={styles.closeDetailButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },

  // Header
  header: { backgroundColor: '#1C1C1E', padding: 20, paddingTop: 30 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  headerSubtitle: { fontSize: 14, color: '#A0A0A0' },

  content: { padding: 16 },

  // Check Button
  checkButton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#4A90D9',
  },
  checkButtonIcon: { fontSize: 30, marginRight: 14 },
  checkButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  checkButtonSub: { fontSize: 12, color: '#888', marginTop: 2 },

  // Filter
  filterRow: { flexDirection: 'row', marginBottom: 16, gap: 6 },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  filterTabActive: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  filterTabText: { fontSize: 12, color: '#A0A0A0', fontWeight: '600' },
  filterTabTextActive: { color: '#fff' },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  sectionCount: {
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#A0A0A0',
    overflow: 'hidden',
  },

  // Alert Card
  alertCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 5,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  alertCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  alertTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  alertTypeText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  severityText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },

  // Glucose value
  glucoseRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  glucoseValue: { fontSize: 32, fontWeight: '800' },
  glucoseUnit: { fontSize: 14, color: '#888', marginLeft: 4 },
  alertTime: { fontSize: 12, color: '#666', marginLeft: 'auto' },

  alertMessage: { fontSize: 14, color: '#C0C0C0', lineHeight: 20, marginBottom: 14 },

  // Acknowledgment section
  ackSection: {
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  ackHeader: { marginBottom: 8 },
  ackTitle: { fontSize: 13, fontWeight: '700', color: '#fff' },
  ackItem: {
    backgroundColor: '#1A2E1A',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  ackName: { fontSize: 13, fontWeight: '700', color: '#4CAF50' },
  ackItemMsg: { fontSize: 12, color: '#A0A0A0', fontStyle: 'italic', marginTop: 2 },
  ackItemTime: { fontSize: 10, color: '#666', marginTop: 3 },
  noAckText: { fontSize: 13, color: '#FF9800', fontStyle: 'italic', paddingVertical: 4 },

  // Action buttons
  alertActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  ackButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    alignItems: 'center',
  },
  ackButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  ackedBadge: {
    backgroundColor: '#1A2E1A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    alignItems: 'center',
  },
  ackedBadgeText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
  resolveButton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: '#4CAF50',
    alignItems: 'center',
  },
  resolveButtonText: { color: '#4CAF50', fontSize: 14, fontWeight: '700' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 50, marginBottom: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22 },

  // Info box
  infoBox: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  infoIcon: { fontSize: 28, marginRight: 12 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 6 },
  infoText: { fontSize: 13, color: '#A0A0A0', lineHeight: 20 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 25,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 16, textAlign: 'center' },

  // Ack modal
  ackModalAlert: {
    backgroundColor: '#2A1A1A',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  ackModalAlertType: { fontSize: 14, fontWeight: '700', color: '#FF6B6B', marginBottom: 4 },
  ackModalAlertValue: { fontSize: 28, fontWeight: '800', color: '#FF6B6B' },
  ackModalLabel: { fontSize: 14, fontWeight: '600', color: '#E0E0E0', marginBottom: 12 },

  quickResponses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  quickChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#2C2C2E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  quickChipActive: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  quickChipText: { fontSize: 13, color: '#A0A0A0' },
  quickChipTextActive: { color: '#fff', fontWeight: '600' },

  ackInput: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    minHeight: 50,
    maxHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 6,
    color: '#fff',
  },

  modalButtons: { flexDirection: 'row', marginTop: 16, gap: 12 },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 16, color: '#A0A0A0', fontWeight: '600' },
  confirmAckButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
  },
  confirmAckButtonText: { fontSize: 16, color: '#fff', fontWeight: 'bold' },

  // Detail modal
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  detailLabel: { fontSize: 14, color: '#888', fontWeight: '600' },
  detailValue: { fontSize: 15, color: '#fff', fontWeight: '600' },

  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginTop: 18,
    marginBottom: 10,
  },
  detailAckItem: {
    backgroundColor: '#1A2E1A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  detailAckRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailAckName: { fontSize: 14, fontWeight: '700', color: '#4CAF50' },
  detailAckTime: { fontSize: 11, color: '#666' },
  detailAckMsg: {
    fontSize: 13,
    color: '#A0A0A0',
    fontStyle: 'italic',
    marginTop: 4,
    paddingLeft: 4,
  },

  noAckDetailBox: {
    backgroundColor: '#2E2A1A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  noAckDetailIcon: { fontSize: 36, marginBottom: 8 },
  noAckDetailText: { fontSize: 13, color: '#A0A0A0', textAlign: 'center', lineHeight: 20 },

  closeDetailButton: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeDetailButtonText: { fontSize: 16, color: '#A0A0A0', fontWeight: '600' },
});
