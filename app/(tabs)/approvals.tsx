import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
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
  // 2 SUB-TABS: 'pending' (Pending Approvals) vs 'history' (Approved History)
  const [subTab, setSubTab] = useState<'pending' | 'history'>('pending');
  const [activeId, setActiveId] = useState<any>(null);

  const { data, err, busy, at, reload } = useLoad(() => api.approvals(), [], 'approvals');

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

  return (
    <Screen
      title="Discounts"
      subtitle={subTab === 'pending' ? `${pendingList.length} pending review` : `${historyList.length} discount records`}
      busy={busy}
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
                    {x.room_number ? `Room ${x.room_number}` : `Bill #${x.bill_number || x.bill_id || x.id}`}
                  </Text>
                  {x.guest_name ? (
                    <Text style={styles.guestName}>Guest: {x.guest_name}</Text>
                  ) : null}
                </View>
                <Badge text="PENDING APPROVAL" color={c.warn} />
              </View>

              <View style={styles.divider} />

              {x.room_number ? <DetailRow label="Department / Room" value={`${x.dept || 'Room'} · Room ${x.room_number}`} /> : null}
              {x.members ? <DetailRow label="Guest Members" value={x.members} bold /> : null}
              {x.expected_checkout ? <DetailRow label="Expected Checkout" value={x.expected_checkout} bold color={c.ink} /> : null}
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
                label="Requested By Staff"
                value={`${x.requested_by || 'Front Desk'} · ${when(x.requested_at)}`}
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
                        {x.dept ? `${x.dept.toUpperCase()} · ` : ''}{x.room_number ? `Room ${x.room_number}` : `Bill #${x.bill_number || x.bill_id}`}
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

                  {x.room_number ? <DetailRow label="Room Number" value={`Room ${x.room_number}`} /> : null}
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
