import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, useLoad } from '../src/lib/ui';
import { api, errMsg } from '../src/api/client';
import { c } from '../src/lib/theme';
import { KeyIcon, CloseIcon } from '../src/lib/icons';

const DEPARTMENTS = [
  { id: 'all', label: 'All Staff' },
  { id: 'hospitality', label: '🏨 Front Desk' },
  { id: 'restaurant', label: '🍽️ Restaurant POS' },
  { id: 'bar', label: '🍸 Bar Lounge' },
  { id: 'waiter', label: '🏃 Waiter App' },
  { id: 'manager', label: '👑 Management' }
];

export default function StaffManagement() {
  const router = useRouter();
  const [selectedDept, setSelectedDept] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  const { data: staffList, busy, err, reload, at } = useLoad(
    async () => {
      const list = await api.staff();
      return Array.isArray(list) ? list : [];
    },
    [],
    'staffList'
  );

  const toggleReveal = (id: any) => {
    setRevealedIds(prev => ({ ...prev, [String(id)]: !prev[String(id)] }));
  };

  const handleOpenPasswordModal = (staff: any) => {
    setEditingStaff(staff);
    setNewPassword(staff.plain_password || '');
  };

  const handleSavePassword = async () => {
    if (!editingStaff) return;
    const clean = newPassword.trim();
    if (!clean) {
      Alert.alert('Required', 'Please enter a valid password or PIN.');
      return;
    }

    setIsSaving(true);
    try {
      await api.updateStaffPassword(editingStaff.id, clean, editingStaff.username);
      Alert.alert(
        '✓ Password Updated',
        `Password/PIN for "${editingStaff.full_name || editingStaff.username}" is updated and adopted into local CRMs (Restaurant, Bar & Front Desk).`
      );
      setEditingStaff(null);
      setNewPassword('');
      reload();
    } catch (e: any) {
      Alert.alert('Error', errMsg(e) || 'Failed to update password.');
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = (staffList || []).filter((s: any) => {
    if (selectedDept !== 'all' && s.role !== selectedDept) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const u = String(s.username || '').toLowerCase();
      const n = String(s.full_name || '').toLowerCase();
      const r = String(s.role || '').toLowerCase();
      return u.includes(q) || n.includes(q) || r.includes(q);
    }
    return true;
  });

  return (
    <Screen title="Staff Passwords & PINs" subtitle="View and update cashier & staff login credentials" back busy={busy} reload={reload} at={at} err={err}>
      {/* Department Filter Bar */}
      <View style={styles.filterRow}>
        {DEPARTMENTS.map(d => {
          const active = selectedDept === d.id;
          return (
            <Pressable
              key={d.id}
              onPress={() => setSelectedDept(d.id)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {d.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Search Input */}
      <View style={styles.searchWrap}>
        <TextInput
          placeholder="Search by username, name or role…"
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
      </View>

      {/* Staff Count Summary */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          Total Staff: <Text style={{ fontWeight: '800', color: c.ink }}>{filtered.length}</Text>
        </Text>
        <Text style={styles.summaryNote}>
          Changes adopt directly into CRM Local Storage
        </Text>
      </View>

      {/* Staff List */}
      {filtered.length === 0 ? (
        <Card style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ color: c.mute, fontSize: 14 }}>
            {busy ? 'Loading staff credentials…' : 'No staff accounts match your search.'}
          </Text>
        </Card>
      ) : (
        filtered.map((s: any) => {
          const isRevealed = !!revealedIds[String(s.id)];
          const currentPass = s.plain_password || '••••••';
          const roleLabels: Record<string, { label: string; bg: string; color: string }> = {
            hospitality: { label: '🏨 Front Desk', bg: '#E0F2FE', color: '#0369A1' },
            restaurant: { label: '🍽️ Restaurant POS', bg: '#DCFCE7', color: '#15803D' },
            bar: { label: '🍸 Bar Lounge', bg: '#F3E8FF', color: '#7E22CE' },
            waiter: { label: '🏃 Waiter App', bg: '#FEF3C7', color: '#B45309' },
            manager: { label: '👑 Management', bg: '#F1F5F9', color: '#334155' }
          };
          const badge = roleLabels[s.role] || { label: s.role || 'Staff', bg: '#F1F5F9', color: '#475569' };

          return (
            <Card key={s.id || s.username} style={styles.staffCard}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={styles.usernameText}>@{s.username}</Text>
                    <View style={[styles.roleBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.roleBadgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.fullNameText}>{s.full_name || 'Staff Member'}</Text>
                </View>

                {/* Password / PIN Section */}
                <Pressable
                  onPress={() => handleOpenPasswordModal(s)}
                  style={({ pressed }) => [
                    styles.editPassBtn,
                    pressed && { opacity: 0.8 }
                  ]}
                >
                  <KeyIcon size={14} color="#FFF" />
                  <Text style={styles.editPassBtnText}>Update PIN</Text>
                </Pressable>
              </View>

              <View style={styles.divider} />

              <View style={styles.cardFooter}>
                <View style={styles.pinDisplayWrap}>
                  <Text style={styles.pinLabel}>Active Password / PIN:</Text>
                  <View style={styles.pinBox}>
                    <Text style={styles.pinText}>
                      {isRevealed ? (s.plain_password || '(Not set)') : currentPass}
                    </Text>
                    <Pressable
                      onPress={() => toggleReveal(s.id)}
                      style={styles.eyeBtn}
                      hitSlop={8}
                    >
                      <Text style={styles.eyeBtnText}>{isRevealed ? '🙈 Hide' : '👁️ Show'}</Text>
                    </Pressable>
                  </View>
                </View>

                {s.phone ? (
                  <Text style={styles.phoneText}>📞 {s.phone}</Text>
                ) : null}
              </View>
            </Card>
          );
        })
      )}

      {/* Password Update Modal */}
      <Modal
        visible={!!editingStaff}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingStaff(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Update Staff Password</Text>
                <Text style={styles.modalSubtitle}>
                  User: @{editingStaff?.username} ({editingStaff?.full_name})
                </Text>
              </View>
              <Pressable
                onPress={() => setEditingStaff(null)}
                style={styles.closeBtn}
                hitSlop={10}
              >
                <CloseIcon size={16} color="#475569" />
              </Pressable>
            </View>

            <View style={{ padding: 18, gap: 14 }}>
              <View>
                <Text style={styles.inputLabel}>New Password or 4-Digit PIN</Text>
                <TextInput
                  style={styles.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="e.g. 1234 or mypass123"
                  placeholderTextColor="#94A3B8"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.inputHint}>
                  Staff can immediately use this PIN to log in on Front Desk, Restaurant POS, or Bar counter.
                </Text>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setEditingStaff(null)}
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                >
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSavePassword}
                  disabled={isSaving}
                  style={[styles.modalBtn, styles.modalBtnSave, isSaving && { opacity: 0.7 }]}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.modalBtnSaveText}>Save &amp; Adopt</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0'
  },
  filterChipActive: {
    backgroundColor: '#0F2A2E',
    borderColor: '#0F2A2E'
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  filterChipTextActive: {
    color: '#FFFFFF'
  },
  searchWrap: {
    marginBottom: 12
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A'
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4
  },
  summaryText: {
    fontSize: 13,
    color: '#64748B'
  },
  summaryNote: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700'
  },
  staffCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF'
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10
  },
  usernameText: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: '#0F172A'
  },
  fullNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 2
  },
  roleBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  editPassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4
  },
  editPassBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700'
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8
  },
  pinDisplayWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  pinLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600'
  },
  pinBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    gap: 8
  },
  pinText: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: '#0F172A',
    letterSpacing: 1
  },
  eyeBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4
  },
  eyeBtnText: {
    fontSize: 11,
    color: '#4F46E5',
    fontWeight: '700'
  },
  phoneText: {
    fontSize: 12,
    color: '#64748B'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18
  },
  modalContainer: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0'
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A'
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#E2E8F0'
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  passwordInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: '#0F172A'
  },
  inputHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 15
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10
  },
  modalBtn: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalBtnCancel: {
    backgroundColor: '#F1F5F9'
  },
  modalBtnCancelText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13
  },
  modalBtnSave: {
    backgroundColor: '#059669',
    minWidth: 120
  },
  modalBtnSaveText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  }
});
