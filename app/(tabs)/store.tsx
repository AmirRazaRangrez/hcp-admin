import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  Linking,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet
} from 'react-native';
import { api } from '../../src/api/client';
import { Screen, Card, Badge, useLoad } from '../../src/lib/ui';
import { c, money, when } from '../../src/lib/theme';
import {
  UsersIcon,
  DocumentIcon,
  PhoneIcon,
  CreditCardIcon,
  SparklesIcon,
  CloseIcon,
  CheckIcon,
  AlertIcon
} from '../../src/lib/icons';

export default function StoreScreen() {
  // Main Sub-Tab: 'current' (Pending/Partly) vs 'history' (Full/Paid)
  const [subTab, setSubTab] = useState<'current' | 'history'>('current');

  // In Current Sub-Tab: 'party' (Party-wise entire due) vs 'bill' (Bill-wise due)
  const [currentView, setCurrentView] = useState<'party' | 'bill'>('party');

  // Search filter
  const [query, setQuery] = useState('');

  // Expanded parties in party-wise view
  const [expandedParties, setExpandedParties] = useState<Record<number, boolean>>({});

  // Active Bill Modal (for details & payment)
  const [selectedBill, setSelectedBill] = useState<any | null>(null);

  // Active Party Lump-sum Payment Modal
  const [selectedParty, setSelectedParty] = useState<any | null>(null);

  // Payment Form States for Bill Modal
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMode, setPayMode] = useState<string>('Bank Transfer');
  const [payRef, setPayRef] = useState<string>('');
  const [paidBy, setPaidBy] = useState<string>('Admin (Jaijeet sir)');
  const [paying, setPaying] = useState<boolean>(false);

  // Payment Form States for Party Modal
  const [partyPayAmount, setPartyPayAmount] = useState<string>('');
  const [partyPayMode, setPartyPayMode] = useState<string>('Bank Transfer');
  const [partyPayRef, setPartyPayRef] = useState<string>('');
  const [partyPaidBy, setPartyPaidBy] = useState<string>('Admin (Jaijeet sir)');
  const [partyPaying, setPartyPaying] = useState<boolean>(false);

  // Load store bills for current and history
  const { data: currentData, err: currentErr, busy: currentBusy, at: currentAt, reload: reloadCurrent } = useLoad(
    () => api.storeBills('live'),
    [],
    'store_live'
  );

  const { data: historyData, err: historyErr, busy: historyBusy, at: historyAt, reload: reloadHistory } = useLoad(
    () => api.storeBills('history'),
    [],
    'store_history'
  );

  const reloadAll = () => {
    reloadCurrent();
    reloadHistory();
  };

  const busy = subTab === 'current' ? currentBusy : historyBusy;
  const err = subTab === 'current' ? currentErr : historyErr;
  const at = subTab === 'current' ? currentAt : historyAt;

  // Live data lists
  const liveBills: any[] = useMemo(() => currentData?.bills || [], [currentData]);
  const historyBills: any[] = useMemo(() => historyData?.bills || [], [historyData]);
  const partySummaries: any[] = useMemo(() => currentData?.partySummary || [], [currentData]);

  // Aggregate stats
  const totalPendingDue = useMemo(
    () => liveBills.reduce((acc, b) => acc + (Number(b.pending_amount) || 0), 0),
    [liveBills]
  );
  const totalHistoryCleared = useMemo(
    () => historyBills.reduce((acc, b) => acc + (Number(b.total_amount) || 0), 0),
    [historyBills]
  );

  // Filtered lists based on search query
  const filteredLiveBills = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return liveBills;
    return liveBills.filter((b: any) =>
      (b.vendor_name || '').toLowerCase().includes(q) ||
      (b.vendor_mobile || '').includes(q) ||
      (b.bill_number || '').toLowerCase().includes(q) ||
      (b.notes || '').toLowerCase().includes(q)
    );
  }, [liveBills, query]);

  const filteredParties = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partySummaries;
    return partySummaries.filter((p: any) =>
      (p.vendor_name || '').toLowerCase().includes(q) ||
      (p.vendor_mobile || '').includes(q)
    );
  }, [partySummaries, query]);

  const filteredHistoryBills = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return historyBills;
    return historyBills.filter((b: any) =>
      (b.vendor_name || '').toLowerCase().includes(q) ||
      (b.vendor_mobile || '').includes(q) ||
      (b.bill_number || '').toLowerCase().includes(q) ||
      (b.notes || '').toLowerCase().includes(q)
    );
  }, [historyBills, query]);

  // Toggle party bill expansion
  const toggleParty = (vendorId: number) => {
    setExpandedParties(prev => ({ ...prev, [vendorId]: !prev[vendorId] }));
  };

  // Open Bill Details & Pay Modal
  const openBillModal = (bill: any) => {
    setSelectedBill(bill);
    setPayAmount(String(bill.pending_amount || ''));
    setPayMode(bill.payment_mode || 'Bank Transfer');
    setPayRef('');
    setPaidBy('Admin (Jaijeet sir)');
  };

  // Open Party Lump-Sum Pay Modal
  const openPartyModal = (party: any) => {
    setSelectedParty(party);
    setPartyPayAmount(String(party.total_pending || ''));
    setPartyPayMode('Bank Transfer');
    setPartyPayRef('');
    setPartyPaidBy('Admin (Jaijeet sir)');
  };

  // Process Bill Payment
  const handleBillPayment = async () => {
    if (!selectedBill) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount greater than 0.');
      return;
    }

    try {
      setPaying(true);
      await api.recordStorePayment({
        bill_id: selectedBill.id,
        payment_amount: amount,
        payment_mode: payMode,
        reference_no: payRef,
        paid_by: paidBy
      });

      const isFull = amount >= Number(selectedBill.pending_amount);
      Alert.alert(
        'Payment Recorded',
        isFull
          ? `Bill #${selectedBill.bill_number || selectedBill.id} marked as FULL and moved to History.`
          : `Partial payment of ${money(amount)} recorded. Status marked as PARTLY.`
      );

      setSelectedBill(null);
      reloadAll();
    } catch (e: any) {
      Alert.alert('Payment Failed', e?.message || 'Could not record payment. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  // Process Party Lump-Sum Payment
  const handlePartyPayment = async () => {
    if (!selectedParty) return;
    const amount = parseFloat(partyPayAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount greater than 0.');
      return;
    }

    try {
      setPartyPaying(true);
      await api.recordStorePayment({
        vendor_id: selectedParty.vendor_id,
        payment_amount: amount,
        payment_mode: partyPayMode,
        reference_no: partyPayRef,
        paid_by: partyPaidBy
      });

      Alert.alert(
        'Party Payment Recorded',
        `Payment of ${money(amount)} applied towards ${selectedParty.vendor_name}. Oldest bills allocated first.`
      );

      setSelectedParty(null);
      reloadAll();
    } catch (e: any) {
      Alert.alert('Party Payment Failed', e?.message || 'Could not record payment.');
    } finally {
      setPartyPaying(false);
    }
  };

  // Dynamic status evaluation for Bill Modal
  const billParsedAmount = parseFloat(payAmount) || 0;
  const billPendingDue = selectedBill ? Number(selectedBill.pending_amount) || 0 : 0;
  const isBillPartial = billParsedAmount > 0 && billParsedAmount < billPendingDue;
  const isBillFull = billParsedAmount >= billPendingDue && billPendingDue > 0;
  const remainingAfterBillPay = Math.max(0, billPendingDue - billParsedAmount);

  // Dynamic status evaluation for Party Modal
  const partyParsedAmount = parseFloat(partyPayAmount) || 0;
  const partyTotalDue = selectedParty ? Number(selectedParty.total_pending) || 0 : 0;
  const isPartyPartial = partyParsedAmount > 0 && partyParsedAmount < partyTotalDue;
  const isPartyFull = partyParsedAmount >= partyTotalDue && partyTotalDue > 0;
  const remainingAfterPartyPay = Math.max(0, partyTotalDue - partyParsedAmount);

  return (
    <>
      <Screen title="Store Inward Bills" {...{ busy, reload: reloadAll, at, err }}>
        {/* SUB-TABS: "Current" vs "History" */}
        <View style={st.subTabBar}>
          <Pressable
            onPress={() => setSubTab('current')}
            style={[st.subTabBtn, subTab === 'current' && st.subTabBtnActive]}
          >
            <Text style={[st.subTabLabel, subTab === 'current' && st.subTabLabelActive]}>
              Current
            </Text>
            {liveBills.length > 0 && (
              <View style={[st.tabCountBadge, subTab === 'current' && st.tabCountBadgeActive]}>
                <Text style={[st.tabCountText, subTab === 'current' && st.tabCountTextActive]}>
                  {liveBills.length}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => setSubTab('history')}
            style={[st.subTabBtn, subTab === 'history' && st.subTabBtnActive]}
          >
            <Text style={[st.subTabLabel, subTab === 'history' && st.subTabLabelActive]}>
              History (Paid)
            </Text>
            {historyBills.length > 0 && (
              <View style={[st.tabCountBadge, subTab === 'history' && st.tabCountBadgeActive]}>
                <Text style={[st.tabCountText, subTab === 'history' && st.tabCountTextActive]}>
                  {historyBills.length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* SEARCH BAR */}
        <View style={st.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={
              subTab === 'current'
                ? 'Search vendor, bill #, phone...'
                : 'Search settled bills, vendor, bill #...'
            }
            placeholderTextColor={c.mute}
            style={st.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} style={st.searchClear}>
              <CloseIcon size={14} color={c.mute} />
            </Pressable>
          )}
        </View>

        {/* ========================================================= */}
        {/* SUB-TAB 1: CURRENT BILLS (Pending / Partly Due)          */}
        {/* ========================================================= */}
        {subTab === 'current' && (
          <>
            {/* KPI BANNER */}
            <Card style={st.kpiCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={st.kpiCaption}>TOTAL OUTSTANDING DUES</Text>
                  <Text style={st.kpiValueDanger}>{money(totalPendingDue)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.kpiMini}>
                    <Text style={{ fontWeight: '700', color: c.ink }}>{liveBills.length}</Text> Pending Bills
                  </Text>
                  <Text style={st.kpiMini}>
                    <Text style={{ fontWeight: '700', color: c.ink }}>{partySummaries.length}</Text> Parties
                  </Text>
                </View>
              </View>
            </Card>

            {/* TOGGLE VIEW: Party-wise Entire Due vs Bill-wise Due */}
            <View style={st.viewToggleRow}>
              <Pressable
                onPress={() => setCurrentView('party')}
                style={[st.viewToggleBtn, currentView === 'party' && st.viewToggleBtnActive]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <UsersIcon size={14} color={currentView === 'party' ? '#fff' : c.ink} />
                  <Text style={[st.viewToggleLabel, currentView === 'party' && st.viewToggleLabelActive]}>
                    Party-wise Entire Due
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setCurrentView('bill')}
                style={[st.viewToggleBtn, currentView === 'bill' && st.viewToggleBtnActive]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <DocumentIcon size={14} color={currentView === 'bill' ? '#fff' : c.ink} />
                  <Text style={[st.viewToggleLabel, currentView === 'bill' && st.viewToggleLabelActive]}>
                    Bill-wise Due
                  </Text>
                </View>
              </Pressable>
            </View>

            {/* VIEW A: PARTY-WISE ENTIRE DUE */}
            {currentView === 'party' && (
              <>
                {!filteredParties.length && !busy && (
                  <Card>
                    <Text style={{ color: c.mute, textAlign: 'center', paddingVertical: 12 }}>
                      {query ? 'No parties matching search.' : 'No outstanding party dues! All bills cleared.'}
                    </Text>
                  </Card>
                )}

                {filteredParties.map((p: any) => {
                  const isExpanded = !!expandedParties[p.vendor_id];
                  const partyBills = p.bills || [];

                  return (
                    <Card key={p.vendor_id} style={st.partyCard}>
                      {/* Party Header Row */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={st.partyTitle}>{p.vendor_name}</Text>
                          {p.vendor_mobile ? (
                            <Pressable
                              onPress={() => Linking.openURL(`tel:${p.vendor_mobile}`)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}
                            >
                              <PhoneIcon size={13} color={c.brass} />
                              <Text style={{ color: c.brass, fontSize: 13, fontWeight: '600' }}>
                                {p.vendor_mobile}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={st.dueLabel}>ENTIRE DUE</Text>
                          <Text style={st.dueAmount}>{money(p.total_pending)}</Text>
                        </View>
                      </View>

                      {/* Party Financials Breakdown */}
                      <View style={st.partyBreakdownRow}>
                        <Text style={st.partyMeta}>
                          Total Billed: <Text style={{ fontWeight: '600', color: c.ink }}>{money(p.total_amount)}</Text>
                        </Text>
                        <Text style={st.partyMeta}>
                          Paid: <Text style={{ fontWeight: '600', color: c.ok }}>{money(p.total_paid)}</Text>
                        </Text>
                        <Text style={st.partyMeta}>
                          Bills: <Text style={{ fontWeight: '700', color: c.ink }}>{p.total_bills}</Text>
                        </Text>
                      </View>

                      {/* Action Buttons: Pay Party & View Bills */}
                      <View style={st.partyActionRow}>
                        <Pressable
                          onPress={() => openPartyModal(p)}
                          style={st.payPartyBtn}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <CreditCardIcon size={14} color="#fff" />
                            <Text style={st.payPartyBtnText}>Pay Party Balance</Text>
                          </View>
                        </Pressable>

                        <Pressable
                          onPress={() => toggleParty(p.vendor_id)}
                          style={st.viewBillsToggleBtn}
                        >
                          <Text style={st.viewBillsToggleText}>
                            {isExpanded ? '▲ Hide Bills' : `▼ View Bills (${partyBills.length})`}
                          </Text>
                        </Pressable>
                      </View>

                      {/* Expanded In-line Bills under this Party */}
                      {isExpanded && (
                        <View style={st.partyBillsContainer}>
                          <Text style={st.partyBillsHeader}>Pending Bills for {p.vendor_name}:</Text>
                          {partyBills.map((b: any) => (
                            <Pressable
                              key={b.id}
                              onPress={() => openBillModal(b)}
                              style={st.partyBillItem}
                            >
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={{ fontWeight: '700', color: c.ink, fontSize: 14 }}>
                                    {b.bill_number ? `#${b.bill_number}` : `Bill #${b.id}`}
                                  </Text>
                                  <Badge
                                    text={b.status === 'PARTLY' ? 'PARTLY' : 'PENDING'}
                                    color={b.status === 'PARTLY' ? c.warn : c.bad}
                                  />
                                </View>
                                <Text style={{ color: c.mute, fontSize: 12, marginTop: 2 }}>
                                  {b.bill_date || when(b.created_at)} · {b.payment_mode || 'Bank Transfer'}
                                </Text>
                              </View>

                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 15, fontWeight: '700', color: c.bad }}>
                                  {money(b.pending_amount)}
                                </Text>
                                <Text style={{ color: c.brass, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                                  Pay ➔
                                </Text>
                              </View>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </Card>
                  );
                })}
              </>
            )}

            {/* VIEW B: BILL-WISE DUE */}
            {currentView === 'bill' && (
              <>
                {!filteredLiveBills.length && !busy && (
                  <Card>
                    <Text style={{ color: c.mute, textAlign: 'center', paddingVertical: 12 }}>
                      {query ? 'No bills matching search.' : 'No pending bills! All cleared.'}
                    </Text>
                  </Card>
                )}

                {filteredLiveBills.map((b: any) => (
                  <Pressable key={b.id} onPress={() => openBillModal(b)}>
                    <Card style={st.billCard}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={st.billVendor}>{b.vendor_name || 'Store Vendor'}</Text>
                          <Text style={st.billSub}>
                            {b.bill_number ? `Bill #${b.bill_number}` : `ID: #${b.id}`} · {b.bill_date || when(b.created_at)}
                          </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={st.billDueCaption}>PENDING DUE</Text>
                          <Text style={st.billDueAmount}>{money(b.pending_amount)}</Text>
                        </View>
                      </View>

                      {/* Amounts row */}
                      <View style={st.billAmountsRow}>
                        <Text style={st.billAmtItem}>Total: {money(b.total_amount)}</Text>
                        <Text style={st.billAmtItem}>Paid: {money(b.paid_amount || 0)}</Text>
                        <Text style={st.billAmtItem}>Mode: {b.payment_mode || 'Bank'}</Text>
                      </View>

                      {/* Badges & Tap info */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          <Badge
                            text={b.status === 'PARTLY' ? 'PARTLY PAID' : 'PENDING'}
                            color={b.status === 'PARTLY' ? c.warn : c.bad}
                          />
                          {b.has_gst ? (
                            <Badge text="GST" color={c.ink} />
                          ) : (
                            <Badge text="NO GST" color={c.mute} />
                          )}
                        </View>
                        <Text style={{ color: c.brass, fontSize: 13, fontWeight: '700' }}>
                          View & Pay ➔
                        </Text>
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}

        {/* ========================================================= */}
        {/* SUB-TAB 2: HISTORY (All Bills Settled / Fully Paid)        */}
        {/* ========================================================= */}
        {subTab === 'history' && (
          <>
            {/* KPI BANNER */}
            <Card style={st.kpiCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={st.kpiCaption}>TOTAL CLEARED INVOICES</Text>
                  <Text style={st.kpiValueOk}>{money(totalHistoryCleared)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.kpiMini}>
                    <Text style={{ fontWeight: '700', color: c.ok }}>{historyBills.length}</Text> Bills Fully Paid
                  </Text>
                  <Text style={st.kpiMini}>Zero Pending Balance</Text>
                </View>
              </View>
            </Card>

            {!filteredHistoryBills.length && !busy && (
              <Card>
                <Text style={{ color: c.mute, textAlign: 'center', paddingVertical: 12 }}>
                  {query ? 'No history bills matching search.' : 'No paid bills recorded yet.'}
                </Text>
              </Card>
            )}

            {filteredHistoryBills.map((b: any) => (
              <Pressable key={b.id} onPress={() => openBillModal(b)}>
                <Card style={st.historyCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={st.billVendor}>{b.vendor_name || 'Store Vendor'}</Text>
                      <Text style={st.billSub}>
                        {b.bill_number ? `Bill #${b.bill_number}` : `ID: #${b.id}`} · {b.bill_date || when(b.created_at)}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={st.historyPaidAmount}>{money(b.total_amount)}</Text>
                      <Badge text="FULLY PAID" color={c.ok} />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <Text style={{ color: c.mute, fontSize: 12 }}>
                      Mode: {b.payment_mode || 'Bank Transfer'} · Settled
                    </Text>
                    <Text style={{ color: c.brass, fontSize: 12, fontWeight: '600' }}>
                      Details ➔
                    </Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </Screen>

      {/* ========================================================= */}
      {/* 💳 MODAL: BILL DETAILS & PAYMENT MODAL                    */}
      {/* ========================================================= */}
      <Modal
        visible={!!selectedBill}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedBill(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={st.modalOverlay}
        >
          <View style={st.modalContainer}>
            {/* Header */}
            <View style={st.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={st.modalTitle}>
                  {selectedBill?.bill_number ? `Bill #${selectedBill.bill_number}` : `Bill Details (#${selectedBill?.id})`}
                </Text>
                <Text style={st.modalSubtitle}>{selectedBill?.vendor_name}</Text>
              </View>
              <Pressable onPress={() => setSelectedBill(null)} style={st.modalCloseBtn}>
                <CloseIcon size={18} color={c.mute} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={st.modalScrollContent}>
              {/* BILL SUMMARY BOX */}
              <View style={st.summaryBox}>
                <View style={st.summaryRow}>
                  <Text style={st.summaryLabel}>Vendor Name:</Text>
                  <Text style={st.summaryVal}>{selectedBill?.vendor_name}</Text>
                </View>
                {selectedBill?.vendor_mobile ? (
                  <View style={st.summaryRow}>
                    <Text style={st.summaryLabel}>Vendor Contact:</Text>
                    <Pressable onPress={() => Linking.openURL(`tel:${selectedBill?.vendor_mobile}`)}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <PhoneIcon size={13} color={c.brass} />
                        <Text style={[st.summaryVal, { color: c.brass, fontWeight: '700' }]}>
                          {selectedBill?.vendor_mobile}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                ) : null}
                <View style={st.summaryRow}>
                  <Text style={st.summaryLabel}>Bill Date:</Text>
                  <Text style={st.summaryVal}>{selectedBill?.bill_date || when(selectedBill?.created_at)}</Text>
                </View>
                <View style={st.summaryRow}>
                  <Text style={st.summaryLabel}>GST Status:</Text>
                  <Text style={st.summaryVal}>
                    {selectedBill?.has_gst ? 'With GST (Default)' : 'Without GST'}
                  </Text>
                </View>
                <View style={st.summaryRow}>
                  <Text style={st.summaryLabel}>Preferred Mode:</Text>
                  <Text style={st.summaryVal}>{selectedBill?.payment_mode || 'Bank Transfer'}</Text>
                </View>
                <View style={st.summaryRow}>
                  <Text style={st.summaryLabel}>Recorded By:</Text>
                  <Text style={st.summaryVal}>{selectedBill?.created_by || 'Store Boy'}</Text>
                </View>
                {selectedBill?.notes ? (
                  <View style={st.summaryRow}>
                    <Text style={st.summaryLabel}>Notes:</Text>
                    <Text style={[st.summaryVal, { fontStyle: 'italic' }]}>{selectedBill.notes}</Text>
                  </View>
                ) : null}

                <View style={st.summaryDivider} />

                {/* Amounts Breakdown */}
                <View style={st.summaryRow}>
                  <Text style={st.summaryLabel}>Total Bill Amount:</Text>
                  <Text style={[st.summaryVal, { fontWeight: '700', color: c.ink, fontSize: 16 }]}>
                    {money(selectedBill?.total_amount)}
                  </Text>
                </View>
                <View style={st.summaryRow}>
                  <Text style={st.summaryLabel}>Already Paid:</Text>
                  <Text style={[st.summaryVal, { fontWeight: '700', color: c.ok, fontSize: 16 }]}>
                    {money(selectedBill?.paid_amount || 0)}
                  </Text>
                </View>
                <View style={st.summaryRow}>
                  <Text style={[st.summaryLabel, { fontWeight: '700', color: c.bad }]}>
                    Remaining Due:
                  </Text>
                  <Text style={[st.summaryVal, { fontWeight: '800', color: c.bad, fontSize: 18 }]}>
                    {money(selectedBill?.pending_amount)}
                  </Text>
                </View>
              </View>

              {/* PAST PAYMENTS HISTORY LIST (IF ANY) */}
              {selectedBill?.payments && selectedBill.payments.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={st.secTitle}>Past Payments on this Bill:</Text>
                  {selectedBill.payments.map((p: any, idx: number) => (
                    <View key={p.id || idx} style={st.pastPaymentItem}>
                      <View>
                        <Text style={{ fontWeight: '700', color: c.ok }}>{money(p.payment_amount)}</Text>
                        <Text style={{ color: c.mute, fontSize: 11 }}>
                          {p.payment_mode || 'Bank Transfer'} {p.reference_no ? `· Ref: ${p.reference_no}` : ''}
                        </Text>
                      </View>
                      <Text style={{ color: c.mute, fontSize: 11 }}>
                        {when(p.paid_at || p.created_at)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* INTERACTIVE PAY FORM (IF PENDING AMOUNT > 0) */}
              {Number(selectedBill?.pending_amount) > 0 ? (
                <View style={st.paySection}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <CreditCardIcon size={16} color={c.ink} />
                    <Text style={st.paySectionTitle}>Record Payment</Text>
                  </View>

                  {/* Payment Amount Input */}
                  <Text style={st.inputLabel}>Enter Payment Amount (₹):</Text>
                  <View style={st.amountInputWrap}>
                    <Text style={st.amountPrefix}>₹</Text>
                    <TextInput
                      value={payAmount}
                      onChangeText={setPayAmount}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={c.mute}
                      style={st.amountInput}
                    />
                  </View>

                  {/* Quick Pill Buttons */}
                  <View style={st.quickPillsRow}>
                    <Pressable
                      onPress={() => setPayAmount(String(selectedBill?.pending_amount || ''))}
                      style={st.quickPill}
                    >
                      <Text style={st.quickPillText}>Pay Full ({money(selectedBill?.pending_amount)})</Text>
                    </Pressable>
                    {Number(selectedBill?.pending_amount) > 1000 && (
                      <Pressable
                        onPress={() => setPayAmount(String(Math.round(Number(selectedBill?.pending_amount) / 2)))}
                        style={st.quickPill}
                      >
                        <Text style={st.quickPillText}>50%</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* DYNAMIC REMARK FEEDBACK */}
                  {billParsedAmount > 0 && (
                    <View
                      style={[
                        st.remarkBox,
                        isBillFull ? st.remarkBoxFull : st.remarkBoxPartly
                      ]}
                    >
                      <Text
                        style={[
                          st.remarkTitle,
                          isBillFull ? { color: c.ok } : { color: c.warn }
                        ]}
                      >
                        {isBillFull ? 'FULL SETTLEMENT' : 'PARTIAL PAYMENT (PARTLY)'}
                      </Text>
                      <Text style={st.remarkBody}>
                        {isBillFull
                          ? `Entered amount covers actual pending due (${money(billPendingDue)}). Bill will be marked as FULL and moved to History.`
                          : `Entered amount is less than actual due. Bill status will be marked as PARTLY. Remaining balance after payment: ${money(remainingAfterBillPay)}.`}
                      </Text>
                    </View>
                  )}

                  {/* Payment Mode Selector */}
                  <Text style={st.inputLabel}>Payment Mode:</Text>
                  <View style={st.modePillsRow}>
                    {['Bank Transfer', 'UPI', 'Cash'].map(m => (
                      <Pressable
                        key={m}
                        onPress={() => setPayMode(m)}
                        style={[st.modePill, payMode === m && st.modePillActive]}
                      >
                        <Text style={[st.modePillText, payMode === m && st.modePillTextActive]}>
                          {m}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Reference / Transaction # */}
                  <Text style={st.inputLabel}>Reference / UTR / Cheque # (Optional):</Text>
                  <TextInput
                    value={payRef}
                    onChangeText={setPayRef}
                    placeholder="e.g. UTR1238947, UPI Ref, Cheque 502"
                    placeholderTextColor={c.mute}
                    style={st.textInput}
                  />

                  {/* Paid By */}
                  <Text style={st.inputLabel}>Paid By:</Text>
                  <TextInput
                    value={paidBy}
                    onChangeText={setPaidBy}
                    placeholder="Admin (Jaijeet sir)"
                    placeholderTextColor={c.mute}
                    style={st.textInput}
                  />

                  {/* Submit Button */}
                  <Pressable
                    disabled={paying || billParsedAmount <= 0}
                    onPress={handleBillPayment}
                    style={[
                      st.confirmPayBtn,
                      (paying || billParsedAmount <= 0) && { opacity: 0.6 }
                    ]}
                  >
                    {paying ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={st.confirmPayBtnText}>
                        {isBillFull
                          ? `Clear Bill & Mark FULL (${money(billParsedAmount)})`
                          : `Record Partial Payment (${money(billParsedAmount)})`}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                <View style={st.clearedNoticeBox}>
                  <Text style={st.clearedNoticeTitle}>BILL FULLY SETTLED</Text>
                  <Text style={st.clearedNoticeBody}>
                    This bill has zero pending dues and is archived in payment History.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ========================================================= */}
      {/* 💳 MODAL: PARTY-WISE LUMP-SUM PAYMENT                     */}
      {/* ========================================================= */}
      <Modal
        visible={!!selectedParty}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedParty(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={st.modalOverlay}
        >
          <View style={st.modalContainer}>
            {/* Header */}
            <View style={st.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={st.modalTitle}>Pay Party Balance</Text>
                <Text style={st.modalSubtitle}>{selectedParty?.vendor_name}</Text>
              </View>
              <Pressable onPress={() => setSelectedParty(null)} style={st.modalCloseBtn}>
                <CloseIcon size={18} color={c.mute} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={st.modalScrollContent}>
              <View style={st.summaryBox}>
                <View style={st.summaryRow}>
                  <Text style={st.summaryLabel}>Vendor Name:</Text>
                  <Text style={st.summaryVal}>{selectedParty?.vendor_name}</Text>
                </View>
                {selectedParty?.vendor_mobile ? (
                  <View style={st.summaryRow}>
                    <Text style={st.summaryLabel}>Vendor Phone:</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <PhoneIcon size={13} color={c.brass} />
                      <Text style={st.summaryVal}>{selectedParty?.vendor_mobile}</Text>
                    </View>
                  </View>
                ) : null}
                <View style={st.summaryRow}>
                  <Text style={st.summaryLabel}>Pending Bills Count:</Text>
                  <Text style={st.summaryVal}>{selectedParty?.total_bills} bills</Text>
                </View>
                <View style={st.summaryRow}>
                  <Text style={[st.summaryLabel, { fontWeight: '700', color: c.bad }]}>
                    Entire Party Due:
                  </Text>
                  <Text style={[st.summaryVal, { fontWeight: '800', color: c.bad, fontSize: 20 }]}>
                    {money(selectedParty?.total_pending)}
                  </Text>
                </View>
              </View>

              {/* Payment Section */}
              <View style={st.paySection}>
                <Text style={st.inputLabel}>Enter Payment Amount (₹):</Text>
                <View style={st.amountInputWrap}>
                  <Text style={st.amountPrefix}>₹</Text>
                  <TextInput
                    value={partyPayAmount}
                    onChangeText={setPartyPayAmount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={c.mute}
                    style={st.amountInput}
                  />
                </View>

                {/* Quick Button */}
                <View style={st.quickPillsRow}>
                  <Pressable
                    onPress={() => setPartyPayAmount(String(selectedParty?.total_pending || ''))}
                    style={st.quickPill}
                  >
                    <Text style={st.quickPillText}>Pay Entire Due ({money(selectedParty?.total_pending)})</Text>
                  </Pressable>
                </View>

                {/* Dynamic Remark */}
                {partyParsedAmount > 0 && (
                  <View
                    style={[
                      st.remarkBox,
                      isPartyFull ? st.remarkBoxFull : st.remarkBoxPartly
                    ]}
                  >
                    <Text
                      style={[
                        st.remarkTitle,
                        isPartyFull ? { color: c.ok } : { color: c.warn }
                      ]}
                    >
                      {isPartyFull ? 'ENTIRE PARTY CLEARANCE' : 'PARTIAL ALLOCATION (PARTLY)'}
                    </Text>
                    <Text style={st.remarkBody}>
                      {isPartyFull
                        ? `Payment covers all outstanding bills. Every pending bill for ${selectedParty?.vendor_name} will be marked as FULL.`
                        : `Payment will be allocated sequentially across oldest pending bills. Any incompletely paid bill is marked as PARTLY. Remaining party due: ${money(remainingAfterPartyPay)}.`}
                    </Text>
                  </View>
                )}

                {/* Payment Mode Selector */}
                <Text style={st.inputLabel}>Payment Mode:</Text>
                <View style={st.modePillsRow}>
                  {['Bank Transfer', 'UPI', 'Cash'].map(m => (
                    <Pressable
                      key={m}
                      onPress={() => setPartyPayMode(m)}
                      style={[st.modePill, partyPayMode === m && st.modePillActive]}
                    >
                      <Text style={[st.modePillText, partyPayMode === m && st.modePillTextActive]}>
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Reference */}
                <Text style={st.inputLabel}>Reference / UTR / Cheque # (Optional):</Text>
                <TextInput
                  value={partyPayRef}
                  onChangeText={setPartyPayRef}
                  placeholder="e.g. Bank Ref / Cheque No"
                  placeholderTextColor={c.mute}
                  style={st.textInput}
                />

                {/* Paid By */}
                <Text style={st.inputLabel}>Paid By:</Text>
                <TextInput
                  value={partyPaidBy}
                  onChangeText={setPartyPaidBy}
                  placeholder="Admin (Jaijeet sir)"
                  placeholderTextColor={c.mute}
                  style={st.textInput}
                />

                {/* Submit Button */}
                <Pressable
                  disabled={partyPaying || partyParsedAmount <= 0}
                  onPress={handlePartyPayment}
                  style={[
                    st.confirmPayBtn,
                    (partyPaying || partyParsedAmount <= 0) && { opacity: 0.6 }
                  ]}
                >
                  {partyPaying ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={st.confirmPayBtnText}>
                      Confirm Party Payment ({money(partyParsedAmount)})
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  // Sub-Tab Navigation Bar
  subTabBar: {
    flexDirection: 'row',
    backgroundColor: '#EBECE8',
    borderRadius: 12,
    padding: 4,
    marginBottom: 4
  },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6
  },
  subTabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2
  },
  subTabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: c.mute
  },
  subTabLabelActive: {
    color: c.ink,
    fontWeight: '700'
  },
  tabCountBadge: {
    backgroundColor: c.line,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12
  },
  tabCountBadgeActive: {
    backgroundColor: c.ink
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: c.mute
  },
  tabCountTextActive: {
    color: '#fff'
  },

  // Search
  searchRow: {
    position: 'relative',
    justifyContent: 'center'
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    paddingRight: 36,
    borderWidth: 1,
    borderColor: c.line,
    color: c.ink,
    fontSize: 14
  },
  searchClear: {
    position: 'absolute',
    right: 12,
    padding: 4
  },

  // KPI Banner
  kpiCard: {
    backgroundColor: '#fff',
    paddingVertical: 14
  },
  kpiCaption: {
    fontSize: 11,
    fontWeight: '700',
    color: c.mute,
    letterSpacing: 0.5
  },
  kpiValueDanger: {
    fontSize: 24,
    fontWeight: '800',
    color: c.bad,
    marginTop: 2
  },
  kpiValueOk: {
    fontSize: 24,
    fontWeight: '800',
    color: c.ok,
    marginTop: 2
  },
  kpiMini: {
    fontSize: 13,
    color: c.mute,
    marginTop: 2
  },

  // View Toggle (Party vs Bill)
  viewToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 2
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center'
  },
  viewToggleBtnActive: {
    backgroundColor: c.ink,
    borderColor: c.ink
  },
  viewToggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: c.ink
  },
  viewToggleLabelActive: {
    color: '#fff',
    fontWeight: '700'
  },

  // Party Card
  partyCard: {
    padding: 14,
    gap: 8
  },
  partyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: c.ink
  },
  dueLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: c.bad,
    letterSpacing: 0.5
  },
  dueAmount: {
    fontSize: 19,
    fontWeight: '800',
    color: c.bad
  },
  partyBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9F7',
    padding: 8,
    borderRadius: 8,
    marginTop: 2
  },
  partyMeta: {
    fontSize: 12,
    color: c.mute
  },
  partyActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4
  },
  payPartyBtn: {
    flex: 1,
    backgroundColor: c.ink,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center'
  },
  payPartyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13
  },
  viewBillsToggleBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center'
  },
  viewBillsToggleText: {
    color: c.ink,
    fontSize: 12,
    fontWeight: '600'
  },
  partyBillsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.line,
    gap: 6
  },
  partyBillsHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: c.mute,
    marginBottom: 4
  },
  partyBillItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAFAF8',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.line
  },

  // Bill Card
  billCard: {
    padding: 14,
    gap: 4
  },
  billVendor: {
    fontSize: 16,
    fontWeight: '700',
    color: c.ink
  },
  billSub: {
    fontSize: 12,
    color: c.mute,
    marginTop: 2
  },
  billDueCaption: {
    fontSize: 10,
    fontWeight: '700',
    color: c.bad
  },
  billDueAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: c.bad
  },
  billAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9F7',
    padding: 8,
    borderRadius: 8,
    marginTop: 6
  },
  billAmtItem: {
    fontSize: 12,
    color: c.mute
  },

  // History Card
  historyCard: {
    padding: 14,
    gap: 4
  },
  historyPaidAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: c.ok
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 24
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.line
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: c.ink
  },
  modalSubtitle: {
    fontSize: 13,
    color: c.mute,
    marginTop: 2
  },
  modalCloseBtn: {
    padding: 6
  },
  modalScrollContent: {
    padding: 18,
    gap: 14
  },

  // Summary Box
  summaryBox: {
    backgroundColor: '#F8F9F7',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: c.line
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  summaryLabel: {
    fontSize: 13,
    color: c.mute
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '600',
    color: c.ink
  },
  summaryDivider: {
    height: 1,
    backgroundColor: c.line,
    marginVertical: 4
  },

  // Past Payments
  secTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: c.ink,
    marginBottom: 6
  },
  pastPaymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAFAF8',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.line,
    marginBottom: 4
  },

  // Pay Section
  paySection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: c.line,
    gap: 10
  },
  paySectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: c.ink
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: c.ink,
    marginTop: 2
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9F7',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: c.brass,
    paddingHorizontal: 12
  },
  amountPrefix: {
    fontSize: 22,
    fontWeight: '800',
    color: c.ink,
    marginRight: 6
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: c.ink,
    paddingVertical: 10
  },
  quickPillsRow: {
    flexDirection: 'row',
    gap: 8
  },
  quickPill: {
    backgroundColor: '#F0EBE1',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  quickPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: c.brass
  },

  // Dynamic Remark Box
  remarkBox: {
    borderRadius: 8,
    padding: 12,
    borderWidth: 1
  },
  remarkBoxPartly: {
    backgroundColor: '#FFF8E6',
    borderColor: c.warn
  },
  remarkBoxFull: {
    backgroundColor: '#E8F5E9',
    borderColor: c.ok
  },
  remarkTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2
  },
  remarkBody: {
    fontSize: 12,
    color: c.text,
    lineHeight: 17
  },

  // Mode Pills
  modePillsRow: {
    flexDirection: 'row',
    gap: 8
  },
  modePill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#F4F5F2',
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center'
  },
  modePillActive: {
    backgroundColor: c.ink,
    borderColor: c.ink
  },
  modePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.text
  },
  modePillTextActive: {
    color: '#fff',
    fontWeight: '700'
  },

  // Text Inputs
  textInput: {
    backgroundColor: '#F8F9F7',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: c.line,
    color: c.ink,
    fontSize: 13
  },

  // Confirm Button
  confirmPayBtn: {
    backgroundColor: c.ok,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6
  },
  confirmPayBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15
  },

  // Cleared notice
  clearedNoticeBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: c.ok,
    alignItems: 'center',
    gap: 4
  },
  clearedNoticeTitle: {
    color: c.ok,
    fontSize: 14,
    fontWeight: '800'
  },
  clearedNoticeBody: {
    color: c.text,
    fontSize: 12,
    textAlign: 'center'
  }
});
