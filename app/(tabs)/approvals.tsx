import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Pressable, StyleSheet, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { api, errMsg } from '../../src/api/client';
import { Screen, Card, Btn, Badge, useLoad } from '../../src/lib/ui';
import { c, money, when } from '../../src/lib/theme';
import { useAuth } from '../../src/store/auth';
import { AvailableRoomsIcon, ChequeIcon } from '../../src/lib/icons';

const DetailRow = ({ label, value, bold, color }: any) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, bold && styles.detailValueBold, color ? { color } : null]}>
        {value}
      </Text>
    </View>
  );
};

export default function Approvals() {
  const router = useRouter();
  const params = useLocalSearchParams<any>();
  // 2 SUB-TABS: 'pending' (Pending Approvals) vs 'history' (Approved History)
  const [subTab, setSubTab] = useState<'pending' | 'history'>('pending');
  const [activeId, setActiveId] = useState<any>(null);
  const [popupItem, setPopupItem] = useState<any>(null);
  const [actingModal, setActingModal] = useState(false);

  const { data, err, busy, isRefreshing, at, reload } = useLoad(() => api.approvals(), [], 'approvals');

  // Support both new { pending, history } and legacy flat array
  const pendingList: any[] = Array.isArray(data)
    ? data.filter((x: any) => (x.status || 'PENDING').toUpperCase() === 'PENDING')
    : (data as any)?.pending || [];

  const historyList: any[] = Array.isArray(data)
    ? data.filter((x: any) => (x.status || 'PENDING').toUpperCase() !== 'PENDING')
    : (data as any)?.history || [];

  useEffect(() => {
    useAuth.getState().setBadges({ approvals: pendingList.length });
  }, [pendingList.length]);

  // AUTO-POPUP ON NOTIFICATION CLICK:
  // When opened via discount notification (autoOpen='true' or approval_id present),
  // immediately show the interactive approval modal popup so admin can approve or reject in 1 tap!
  useEffect(() => {
    if (params?.autoOpen === 'true' || params?.approval_id) {
      const match = pendingList.find((x: any) => String(x.id) === String(params.approval_id));
      if (match) {
        setPopupItem(match);
      } else if (params.approval_id || params.discount) {
        setPopupItem({
          id: params.approval_id,
          room_number: params.room_number || '',
          room_count: Number(params.room_count) || 1,
          guest_name: params.guest_name || '',
          members: params.members || '',
          expected_checkout: params.expected_checkout || '',
          meal_plan: params.meal_plan || '',
          current_total: Number(params.current_total) || 0,
          discount: Number(params.discount) || 0,
          discount_pct: Number(params.discount_pct) || 0,
          final_amount: Number(params.final_amount) || 0,
          requested_by: params.requested_by || 'Front Desk',
          reason: params.reason || ''
        });
      }
    }
  }, [params?.autoOpen, params?.approval_id, pendingList.length]);

  const handleAction = (item: any, kind: 'approve' | 'reject') => {
    Alert.alert(
      kind === 'approve' ? 'Approve Discount?' : 'Reject Discount?',
      `${money(item.discount)} discount on Room ${item.room_number || ''} (Bill #${item.bill_number || item.bill_id || item.id})`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: kind === 'approve' ? 'Approve' : 'Reject',
          style: kind === 'approve' ? 'default' : 'destructive',
          onPress: async () => {
            setActiveId(item.id);
            try {
              if (kind === 'approve') {
                await api.approve(item.id);
              } else {
                await api.reject(item.id);
              }
              await reload();
            } catch (e: any) {
              Alert.alert('Action Failed', errMsg(e));
            } finally {
              setActiveId(null);
            }
          }
        }
      ]
    );
  };

  const handleModalAction = async (kind: 'approve' | 'reject') => {
    if (!popupItem) return;
    setActingModal(true);
    try {
      if (kind === 'approve') {
        await api.approve(popupItem.id);
        Alert.alert('✓ Discount Approved', `Approved ${popupItem.discount_pct ? popupItem.discount_pct + '% ' : ''}discount for Room ${popupItem.room_number || ''}.`);
      } else {
        await api.reject(popupItem.id);
        Alert.alert('Discount Rejected', `Discount request rejected for Room ${popupItem.room_number || ''}.`);
      }
      setPopupItem(null);
      await reload();
    } catch (e: any) {
      Alert.alert('Action Failed', errMsg(e));
    } finally {
      setActingModal(false);
    }
  };

  return (
    <Screen
      title="Discounts"
      subtitle={subTab === 'pending' ? `${pendingList.length} pending review` : `${historyList.length} discount records`}
      busy={busy}
      isRefreshing={isRefreshing}
      reload={reload}
      at={at}
      err={err}
    >
      {/* 2 SUB-TABS: "Pending Approvals" vs "Approved History" */}
      <View style={styles.subTabBar}>
        <Pressable
          onPress={() => setSubTab('pending')}
          style={[styles.subTabBtn, subTab === 'pending' && styles.subTabBtnActive]}
        >
          <Text style={[styles.subTabLabel, subTab === 'pending' && styles.subTabLabelActive]}>
            Pending Approvals
          </Text>
          {pendingList.length > 0 && (
            <View style={[styles.tabBadge, subTab === 'pending' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, subTab === 'pending' && styles.tabBadgeTextActive]}>
                {pendingList.length}
              </Text>
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={() => setSubTab('history')}
          style={[styles.subTabBtn, subTab === 'history' && styles.subTabBtnActive]}
        >
          <Text style={[styles.subTabLabel, subTab === 'history' && styles.subTabLabelActive]}>
            Approved History
          </Text>
          {historyList.length > 0 && (
            <View style={[styles.tabBadge, styles.tabBadgeHistory, subTab === 'history' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, subTab === 'history' && styles.tabBadgeTextActive]}>
                {historyList.length}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* ======================================================== */}
      {/* SUB-TAB 1: PENDING APPROVALS                             */}
      {/* ======================================================== */}
      {subTab === 'pending' && (
        <>
          {pendingList.length === 0 && !busy ? (
            <Card style={styles.emptyCard}>
              <View style={{ marginBottom: 10 }}>
                <AvailableRoomsIcon size={38} color="#10B981" />
              </View>
              <Text style={styles.emptyTitle}>All Caught Up!</Text>
              <Text style={styles.emptySub}>
                There are no pending discount approvals waiting for management review.
              </Text>
            </Card>
          ) : null}

          {pendingList.map((x: any) => (
            <View key={x.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.billTitle}>
                    {x.room_number
                      ? (x.room_number.startsWith('Room') ? x.room_number : ((x.room_count && x.room_count > 1) || x.room_number.includes(',') ? `Rooms ${x.room_number}` : `Room ${x.room_number}`))
                      : `Bill #${x.bill_number || x.bill_id || x.id}`}
                  </Text>
                  {x.guest_name ? (
                    <Text style={styles.guestName}>Guest: {x.guest_name}</Text>
                  ) : null}
                </View>
                <Badge text="PENDING APPROVAL" color={c.warn} />
              </View>

              <View style={styles.divider} />

              {x.room_number ? <DetailRow label="Department / Rooms" value={`${x.dept || 'Room'} · ${x.room_number.startsWith('Room') ? x.room_number : (x.room_count && x.room_count > 1 ? `Rooms ${x.room_number}` : `Room ${x.room_number}`)}`} /> : null}
              {x.room_count ? <DetailRow label="Number of Rooms" value={`${x.room_count} Room${x.room_count > 1 ? 's' : ''}`} bold color="#0284c7" /> : null}
              {x.members ? <DetailRow label="Guest Members" value={x.members} bold /> : null}
              {x.expected_checkout ? <DetailRow label="Expected Checkout" value={x.expected_checkout} bold color={c.ink} /> : null}
              {x.meal_plan ? <DetailRow label="Meal Plan" value={x.meal_plan} bold color="#059669" /> : null}
              {x.discount_pct ? <DetailRow label="Discount Percentage" value={`${x.discount_pct}%`} bold color={c.brass} /> : null}
              <DetailRow label="Total Tariff (Before Discount)" value={money(x.current_total)} />
              <DetailRow
                label="Permission Discount"
                value={`− ${money(x.discount)} (${x.discount_pct || 0}%)`}
                bold
                color={c.ok}
              />
              <DetailRow label="Net Amount After Discount" value={money(x.final_amount)} bold />
              <DetailRow
                label="Raised By Staff"
                value={`${x.requested_by || 'Front Desk'} · ${when(x.requested_at)}`}
                bold
              />

              {x.reason ? (
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonLabel}>Discount Justification:</Text>
                  <Text style={styles.reasonText}>{x.reason}</Text>
                </View>
              ) : null}

              {/* Action Buttons: Approve / Reject */}
              <View style={styles.actionContainer}>
                <View style={styles.btnRow}>
                  <Btn
                    kind="bad"
                    label="Reject"
                    disabled={activeId === x.id}
                    onPress={() => handleAction(x, 'reject')}
                  />
                  <Btn
                    kind="ok"
                    label={`Approve ${x.discount_pct ? x.discount_pct + '% ' : ''}Discount`}
                    disabled={activeId === x.id}
                    onPress={() => handleAction(x, 'approve')}
                  />
                </View>
                <Text style={styles.actionDisclaimer}>
                  Approving immediately permits this discount for this check-in in the CRM.
                </Text>
              </View>
            </View>
          ))}
        </>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 2: APPROVED HISTORY                              */}
      {/* ======================================================== */}
      {subTab === 'history' && (
        <>
          {historyList.length === 0 && !busy ? (
            <Card style={styles.emptyCard}>
              <View style={{ marginBottom: 10 }}>
                <ChequeIcon size={38} color="#B8893B" />
              </View>
              <Text style={styles.emptyTitle}>No Historical Discounts</Text>
              <Text style={styles.emptySub}>
                No discount records found in the past settlement history.
              </Text>
            </Card>
          ) : null}

          {historyList.map((x: any) => {
            const isClickable = Boolean(x.bill_id && x.dept);
            const isApproved = (x.status || 'APPROVED').toUpperCase() === 'APPROVED';

            return (
              <Pressable
                key={x.id}
                disabled={!isClickable}
                onPress={() => router.push({ pathname: '/bill', params: { dept: x.dept, id: String(x.bill_id) } })}
                style={({ pressed }) => [
                  styles.itemWrap,
                  isClickable && pressed && styles.itemPressed
                ]}
              >
                <View style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.billTitle}>
                        {x.dept ? `${x.dept.toUpperCase()} · ` : ''}{x.room_number
                          ? (x.room_number.startsWith('Room') ? x.room_number : ((x.room_count && x.room_count > 1) || x.room_number.includes(',') ? `Rooms ${x.room_number}` : `Room ${x.room_number}`))
                          : `Bill #${x.bill_number || x.bill_id}`}
                      </Text>
                      {x.guest_name ? (
                        <Text style={styles.guestName}>Guest: {x.guest_name}</Text>
                      ) : null}
                    </View>
                    <Badge
                      text={isApproved ? 'APPROVED' : 'REJECTED'}
                      color={isApproved ? c.ok : c.bad}
                    />
                  </View>

                  <View style={styles.divider} />

                  {x.room_number ? <DetailRow label="Room Number(s)" value={`${x.room_number.startsWith('Room') ? x.room_number : (x.room_count && x.room_count > 1 ? `Rooms ${x.room_number}` : `Room ${x.room_number}`)}`} /> : null}
                  {x.room_count ? <DetailRow label="Number of Rooms" value={`${x.room_count} Room${x.room_count > 1 ? 's' : ''}`} bold color="#0284c7" /> : null}
                  {x.expected_checkout ? <DetailRow label="Expected Checkout" value={x.expected_checkout} bold color={c.ink} /> : null}
                  {x.meal_plan ? <DetailRow label="Meal Plan" value={x.meal_plan} bold color="#059669" /> : null}
                  {x.discount_pct ? <DetailRow label="Discount Percentage" value={`${x.discount_pct}%`} bold color={c.brass} /> : null}
                  <DetailRow label="Subtotal (Before Discount)" value={money(x.current_total)} />
                  <DetailRow
                    label="Discount Applied"
                    value={`− ${money(x.discount)}`}
                    bold
                    color={c.ok}
                  />
                  <DetailRow label="Final Billed Amount" value={money(x.final_amount)} bold />
                  <DetailRow
                    label="Authorized / Billed By"
                    value={`${x.action_by || x.requested_by || 'Management'} · ${when(x.requested_at)}`}
                  />

                  {x.reason ? (
                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonLabel}>Notes / Reason:</Text>
                      <Text style={styles.reasonText}>{x.reason}</Text>
                    </View>
                  ) : null}

                  {isClickable ? (
                    <View style={styles.cardFooter}>
                      <Text style={styles.viewBillPrompt}>Tap to view settled receipt ›</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </>
      )}

      {/* Interactive Approval Popup when opened via push notification or tap */}
      {popupItem && (
        <Modal
          transparent
          animationType="fade"
          visible={!!popupItem}
          onRequestClose={() => setPopupItem(null)}
        >
          <View style={modalStyles.backdrop}>
            <View style={modalStyles.modalCard}>
              {/* Header */}
              <View style={modalStyles.modalHeader}>
                <View style={modalStyles.headerTitleBox}>
                  <Text style={modalStyles.headerBadge}>⚡ DISCOUNT APPROVAL REQUEST</Text>
                  <Text style={modalStyles.headerTitle}>
                    {popupItem.room_number
                      ? (popupItem.room_number.startsWith('Room') ? popupItem.room_number : ((popupItem.room_count && popupItem.room_count > 1) || popupItem.room_number.includes(',') ? `Rooms ${popupItem.room_number}` : `Room ${popupItem.room_number}`))
                      : `Bill #${popupItem.bill_number || popupItem.id}`}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setPopupItem(null)}
                  hitSlop={12}
                  style={modalStyles.closeBtn}
                >
                  <Text style={modalStyles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              {/* Body */}
              <View style={modalStyles.modalBody}>
                {popupItem.guest_name ? (
                  <View style={modalStyles.row}>
                    <Text style={modalStyles.label}>Guest Name</Text>
                    <Text style={modalStyles.valBold}>{popupItem.guest_name}</Text>
                  </View>
                ) : null}

                {popupItem.members ? (
                  <View style={modalStyles.row}>
                    <Text style={modalStyles.label}>Guest Members</Text>
                    <Text style={modalStyles.valBold}>{popupItem.members}</Text>
                  </View>
                ) : null}

                {popupItem.expected_checkout ? (
                  <View style={modalStyles.row}>
                    <Text style={modalStyles.label}>Expected Checkout</Text>
                    <Text style={[modalStyles.valBold, { color: '#8c5d77' }]}>
                      {popupItem.expected_checkout}
                    </Text>
                  </View>
                ) : null}

                {popupItem.meal_plan ? (
                  <View style={modalStyles.row}>
                    <Text style={modalStyles.label}>Meal Plan</Text>
                    <Text style={[modalStyles.valBold, { color: '#059669' }]}>
                      {popupItem.meal_plan}
                    </Text>
                  </View>
                ) : null}

                <View style={modalStyles.row}>
                  <Text style={modalStyles.label}>Total Tariff</Text>
                  <Text style={modalStyles.val}>{money(popupItem.current_total)}</Text>
                </View>

                <View style={[modalStyles.row, modalStyles.highlightRow]}>
                  <Text style={[modalStyles.label, { color: '#B45309', fontWeight: '700' }]}>
                    Permission Discount
                  </Text>
                  <Text style={modalStyles.valDiscount}>
                    {popupItem.discount_pct}% (− {money(popupItem.discount)})
                  </Text>
                </View>

                <View style={[modalStyles.row, { borderBottomWidth: 0, paddingTop: 6 }]}>
                  <Text style={[modalStyles.label, { fontWeight: '800', color: '#8c5d77' }]}>
                    Net Payable
                  </Text>
                  <Text style={modalStyles.valNet}>
                    {money(popupItem.final_amount)}
                  </Text>
                </View>

                {popupItem.requested_by ? (
                  <View style={modalStyles.row}>
                    <Text style={modalStyles.label}>Raised By</Text>
                    <Text style={modalStyles.valBold}>{popupItem.requested_by}</Text>
                  </View>
                ) : null}

                {popupItem.reason ? (
                  <View style={modalStyles.reasonBox}>
                    <Text style={modalStyles.reasonText}>{popupItem.reason}</Text>
                  </View>
                ) : null}
              </View>

              {/* Action Buttons: Approve / Reject */}
              <View style={modalStyles.btnRow}>
                <Pressable
                  disabled={actingModal}
                  onPress={() => handleModalAction('reject')}
                  style={({ pressed }) => [
                    modalStyles.actionBtn,
                    modalStyles.rejectBtn,
                    pressed && { opacity: 0.85 }
                  ]}
                >
                  <Text style={modalStyles.rejectText}>✕ Reject</Text>
                </Pressable>

                <Pressable
                  disabled={actingModal}
                  onPress={() => handleModalAction('approve')}
                  style={({ pressed }) => [
                    modalStyles.actionBtn,
                    modalStyles.approveBtn,
                    pressed && { opacity: 0.85 }
                  ]}
                >
                  <Text style={modalStyles.approveText}>
                    {actingModal ? 'Processing...' : `✓ Approve ${popupItem.discount_pct ? popupItem.discount_pct + '% ' : ''}Discount`}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subTabBar: {
    flexDirection: 'row',
    backgroundColor: '#EEF2F0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 4
  },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6
  },
  subTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2
  },
  subTabLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7A75'
  },
  subTabLabelActive: {
    color: c.ink,
    fontWeight: '800'
  },
  tabBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10
  },
  tabBadgeHistory: {
    backgroundColor: '#E0F2FE'
  },
  tabBadgeActive: {
    backgroundColor: c.ink
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E'
  },
  tabBadgeTextActive: {
    color: '#FFFFFF'
  },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#FFFFFF',
    marginTop: 8
  },
  emptyIcon: {
    fontSize: 34,
    marginBottom: 8
  },
  emptyTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: c.ink,
    marginBottom: 4
  },
  emptySub: {
    color: c.mute,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18
  },
  itemWrap: {
    marginBottom: 2
  },
  itemPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E8EDEA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 10
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8
  },
  billTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: c.ink
  },
  guestName: {
    fontSize: 12,
    color: c.mute,
    marginTop: 2,
    fontWeight: '600'
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F4F2',
    marginVertical: 10
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8
  },
  detailLabel: {
    fontSize: 13,
    color: c.mute,
    fontWeight: '500',
    flex: 1
  },
  detailValue: {
    fontSize: 13,
    color: c.text,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1
  },
  detailValueBold: {
    fontWeight: '800',
    fontSize: 13.5
  },
  reasonBox: {
    marginTop: 10,
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: c.mute,
    marginBottom: 2
  },
  reasonText: {
    fontSize: 13,
    color: c.text,
    fontStyle: 'italic'
  },
  actionContainer: {
    marginTop: 12
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10
  },
  actionDisclaimer: {
    color: c.mute,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center'
  },
  cardFooter: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2'
  },
  viewBillPrompt: {
    fontSize: 12,
    color: c.brass,
    fontWeight: '700'
  }
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
    zIndex: 99999
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  modalHeader: {
    backgroundColor: '#8c5d77',
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  headerTitleBox: {
    flex: 1
  },
  headerBadge: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800'
  },
  closeBtn: {
    padding: 6
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '700'
  },
  modalBody: {
    padding: 16
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  highlightRow: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    borderRadius: 8,
    marginVertical: 4,
    borderBottomWidth: 0
  },
  label: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
    marginRight: 6
  },
  val: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700'
  },
  valBold: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '800',
    textAlign: 'right',
    flexShrink: 1
  },
  valDiscount: {
    fontSize: 13.5,
    color: '#B45309',
    fontWeight: '800'
  },
  valNet: {
    fontSize: 15,
    color: '#2563EB',
    fontWeight: '900'
  },
  reasonBox: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  reasonText: {
    fontSize: 11.5,
    color: '#64748B',
    fontStyle: 'italic'
  },
  btnRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rejectBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA'
  },
  rejectText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 14
  },
  approveBtn: {
    backgroundColor: '#10B981',
    borderWidth: 1,
    borderColor: '#059669'
  },
  approveText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14
  }
});
