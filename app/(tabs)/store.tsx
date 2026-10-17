import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  Linking,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '../../src/api/client';
import { Screen, Card, Badge, useLoad } from '../../src/lib/ui';
import { c, money, when } from '../../src/lib/theme';
import {
  UsersIcon,
  DocumentIcon,
  PhoneIcon,
  CreditCardIcon,
  CloseIcon,
  CheckIcon,
  AlertIcon,
  FilterIcon
} from '../../src/lib/icons';

export default function StoreScreen() {
  const params = useLocalSearchParams<{ filterStatus?: string }>();

  // Primary View Mode: 'party' (Party-wise) vs 'bill' (Bill-wise)
  const [currentView, setCurrentView] = useState<'party' | 'bill'>('party');

  // Search query (vendor name, phone, bill #)
  const [query, setQuery] = useState('');

  // Aging status filter: 'all' | 'red' | 'yellow' | 'green' | 'pending'
  const [filterAging, setFilterAging] = useState<'all' | 'red' | 'yellow' | 'green' | 'pending'>('all');

  // Filter popup modal state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterVendor, setFilterVendor] = useState('');
  const [filterBillDate, setFilterBillDate] = useState('');
  const [filterPaidDate, setFilterPaidDate] = useState('');

  // Expanded parties in party-wise view
  const [expandedParties, setExpandedParties] = useState<Record<string, boolean>>({});

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

  // Custom Themed Notice Modal State
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; type?: 'success' | 'error' | 'info' } | null>(null);

  // Sync route params (e.g. from Home page red/yellow alert strips)
  useEffect(() => {
    if (params.filterStatus === 'red' || params.filterStatus === 'yellow' || params.filterStatus === 'green') {
      setFilterAging(params.filterStatus as any);
      setCurrentView('bill'); // Switch to bill-wise to see all matched bills immediately
    }
  }, [params.filterStatus]);

  // Helper to format date and time
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${day}/${month}/${year} at ${hours}:${minutes} ${ampm}`;
    } catch (_) {
      return dateStr;
    }
  };

  const formatDateOnly = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    try {
      const parts = String(dateStr).split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    } catch (_) {
      return dateStr;
    }
  };

  // Helper to safely format bill numbers
  const formatBillNo = (b: any) => {
    if (!b) return 'Bill';
    const raw = String(b.bill_number || '').trim();
    if (!raw || raw.toUpperCase() === 'N/A' || raw.toUpperCase() === '#N/A' || raw.toUpperCase() === 'NULL' || raw.toUpperCase() === 'UNDEFINED') {
      return `Bill #${b.id || ''}`;
    }
    return raw.startsWith('#') ? raw : `#${raw}`;
  };

  // Load all store bills
  const { data: storeData, err, busy, at, reload: reloadAll } = useLoad(
    () => api.storeBills('all'),
    [],
    'store_bills_all'
  );

  const rawBills: any[] = useMemo(() => storeData?.bills || [], [storeData]);

  // Calculate Aging for a Bill:
  // Red: pending from 25-40+ days (days >= 25)
  // Yellow: pending from 15-25 days (days >= 15 && days < 25)
  // Green: full paid (pending_amount <= 0 or status == FULL / PAID)
  // Neutral: pending < 15 days
  const getBillAging = (b: any) => {
    const pending = Number(b.pending_amount) || 0;
    const isFullPaid = pending <= 0 || b.status === 'FULL' || b.status === 'PAID';

    if (isFullPaid) {
      return {
        level: 'green' as const,
        color: '#059669',
        bgColor: '#ECFDF5',
        borderColor: '#10B981',
        badgeText: '🟢 FULL PAID',
        badgeBg: '#D1FAE5',
        badgeColor: '#065F46',
        days: 0,
        label: 'Full Paid'
      };
    }

    const rawDate = b.bill_date || b.created_at;
    let diffDays = 0;
    if (rawDate) {
      try {
        const parts = String(rawDate).split('T')[0].split('-');
        const billDate = parts.length === 3
          ? new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
          : new Date(rawDate);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const d1 = new Date(billDate.getFullYear(), billDate.getMonth(), billDate.getDate());
        diffDays = Math.max(0, Math.floor((today.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
      } catch (_) {
        diffDays = 0;
      }
    }

    if (diffDays >= 25) {
      return {
        level: 'red' as const,
        color: '#DC2626',
        bgColor: '#FEF2F2',
        borderColor: '#EF4444',
        badgeText: `🔴 ${diffDays}d Overdue`,
        badgeBg: '#FEE2E2',
        badgeColor: '#991B1B',
        days: diffDays,
        label: `${diffDays}d Overdue (25-40+d)`
      };
    } else if (diffDays >= 15) {
      return {
        level: 'yellow' as const,
        color: '#D97706',
        bgColor: '#FFFBEB',
        borderColor: '#F59E0B',
        badgeText: `🟡 ${diffDays}d Pending`,
        badgeBg: '#FEF3C7',
        badgeColor: '#92400E',
        days: diffDays,
        label: `${diffDays}d Pending (15-25d)`
      };
    } else {
      return {
        level: 'pending' as const,
        color: '#475569',
        bgColor: '#F8FAFC',
        borderColor: '#CBD5E1',
        badgeText: `⏱️ ${diffDays}d`,
        badgeBg: '#E2E8F0',
        badgeColor: '#334155',
        days: diffDays,
        label: `${diffDays}d Pending`
      };
    }
  };

  // Helper to match dates in various formats (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, etc.)
  const matchDateString = (rawDate: any, searchDate: string) => {
    if (!rawDate || !searchDate) return false;
    const s = searchDate.trim().toLowerCase();
    const raw = String(rawDate).trim().toLowerCase();
    if (raw.includes(s)) return true;

    const clean = raw.split('t')[0].split(' ')[0];
    const parts = clean.split(/[-/]/);
    if (parts.length === 3) {
      let y = '', m = '', d = '';
      if (parts[0].length === 4) {
        y = parts[0];
        m = parts[1].padStart(2, '0');
        d = parts[2].padStart(2, '0');
      } else if (parts[2].length === 4) {
        d = parts[0].padStart(2, '0');
        m = parts[1].padStart(2, '0');
        y = parts[2];
      }
      const formats = [
        `${y}-${m}-${d}`,
        `${d}/${m}/${y}`,
        `${d}-${m}-${y}`,
        `${d}/${m}`,
        `${d}-${m}`,
        `${y}-${m}`
      ];
      return formats.some(f => f.includes(s));
    }
    return false;
  };

  // Calculate Aging for a Party:
  // Red: if party has any pending bill from 25-40+ days
  // Yellow: if party has pending bill from 15-25 days (and none >= 25 days)
  // Green: if full paid (total_pending <= 0)
  // Neutral: if pending < 15 days
  const getPartyAging = (p: any, billsList?: any[]) => {
    const list = billsList || p.bills || [];
    const pendingAmt = list.reduce((sum: number, b: any) => sum + (Number(b.pending_amount) || 0), 0);
    if (pendingAmt <= 0) {
      return {
        level: 'green' as const,
        color: '#059669',
        bgColor: '#ECFDF5',
        borderColor: '#10B981',
        badgeText: '🟢 FULL PAID',
        badgeBg: '#D1FAE5',
        badgeColor: '#065F46',
        label: 'Full Paid'
      };
    }

    let maxDays = 0;
    for (const b of list) {
      if (Number(b.pending_amount) > 0) {
        const info = getBillAging(b);
        if (info.days > maxDays) maxDays = info.days;
      }
    }

    if (maxDays >= 25) {
      return {
        level: 'red' as const,
        color: '#DC2626',
        bgColor: '#FEF2F2',
        borderColor: '#EF4444',
        badgeText: `🔴 Due (${maxDays}d)`,
        badgeBg: '#FEE2E2',
        badgeColor: '#991B1B',
        label: `Overdue (25-40+d)`
      };
    } else if (maxDays >= 15) {
      return {
        level: 'yellow' as const,
        color: '#D97706',
        bgColor: '#FFFBEB',
        borderColor: '#F59E0B',
        badgeText: `🟡 Due (${maxDays}d)`,
        badgeBg: '#FEF3C7',
        badgeColor: '#92400E',
        label: `Pending (15-25d)`
      };
    } else {
      return {
        level: 'pending' as const,
        color: '#475569',
        bgColor: '#F8FAFC',
        borderColor: '#CBD5E1',
        badgeText: `⏱️ Due (${maxDays}d)`,
        badgeBg: '#E2E8F0',
        badgeColor: '#334155',
        label: `Due (<15d)`
      };
    }
  };

  // Group and re-aggregate all bills by Party
  const allParties = useMemo(() => {
    const map: Record<string, any> = {};
    rawBills.forEach(b => {
      const vId = String(b.vendor_id || b.vendor_name || 'unknown');
      if (!map[vId]) {
        map[vId] = {
          vendor_id: b.vendor_id,
          vendor_name: b.vendor_name || 'Vendor #' + b.vendor_id,
          vendor_mobile: b.vendor_mobile || '',
          total_bills: 0,
          total_amount: 0,
          total_paid: 0,
          total_pending: 0,
          bills: []
        };
      }
      map[vId].total_bills += 1;
      map[vId].total_amount += Number(b.total_amount) || 0;
      map[vId].total_paid += Number(b.paid_amount) || 0;
      map[vId].total_pending += Number(b.pending_amount) || 0;
      map[vId].bills.push(b);
    });
    return Object.values(map);
  }, [rawBills]);

  // Aggregate stats across all bills
  const stats = useMemo(() => {
    let pendingDue = 0;
    let clearedTotal = 0;
    let redCount = 0;
    let yellowCount = 0;
    let greenCount = 0;

    rawBills.forEach(b => {
      const pending = Number(b.pending_amount) || 0;
      const total = Number(b.total_amount) || 0;
      const isFull = pending <= 0 || b.status === 'FULL' || b.status === 'PAID';

      if (isFull) {
        clearedTotal += total;
        greenCount++;
      } else {
        pendingDue += pending;
        const aging = getBillAging(b);
        if (aging.level === 'red') redCount++;
        else if (aging.level === 'yellow') yellowCount++;
      }
    });

    return { pendingDue, clearedTotal, redCount, yellowCount, greenCount };
  }, [rawBills]);

  // Check if a bill matches active filters
  const matchesFilter = (b: any) => {
    // 1. Text Query (Vendor Name, Mobile, Bill #, Notes)
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const m =
        (b.vendor_name || '').toLowerCase().includes(q) ||
        (b.vendor_mobile || '').includes(q) ||
        (b.bill_number || '').toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q);
      if (!m) return false;
    }

    // 2. Vendor Filter
    if (filterVendor.trim()) {
      const v = filterVendor.trim().toLowerCase();
      if (!(b.vendor_name || '').toLowerCase().includes(v)) return false;
    }

    // 3. Bill Date Filter
    if (filterBillDate.trim()) {
      const bDate = String(b.bill_date || b.created_at || '');
      if (!matchDateString(bDate, filterBillDate)) return false;
    }

    // 4. Paid Date Filter
    if (filterPaidDate.trim()) {
      const hasMatchingPayment = (b.payments || []).some((p: any) =>
        matchDateString(p.paid_at || p.created_at || '', filterPaidDate)
      );
      if (!hasMatchingPayment) return false;
    }

    // 5. Aging Status Filter
    if (filterAging !== 'all') {
      const aging = getBillAging(b);
      if (filterAging === 'red' && aging.level !== 'red') return false;
      if (filterAging === 'yellow' && aging.level !== 'yellow') return false;
      if (filterAging === 'green' && aging.level !== 'green') return false;
      if (filterAging === 'pending' && aging.level !== 'pending') return false;
    }

    return true;
  };

  // Filtered bills list
  const filteredBills = useMemo(() => {
    return rawBills.filter(matchesFilter);
  }, [rawBills, query, filterVendor, filterBillDate, filterPaidDate, filterAging]);

  // Filtered parties list
  const filteredParties = useMemo(() => {
    return allParties
      .map(p => {
        const partyMatchingBills = p.bills.filter(matchesFilter);
        return {
          ...p,
          matchingBills: partyMatchingBills
        };
      })
      .filter(p => {
        // Must have at least one bill matching the active filters
        return p.matchingBills.length > 0;
      });
  }, [allParties, matchesFilter]);

  // Active filters count for filter button badge
  const activeFiltersCount = useMemo(() => {
    let c = 0;
    if (filterAging !== 'all') c++;
    if (filterVendor.trim()) c++;
    if (filterBillDate.trim()) c++;
    if (filterPaidDate.trim()) c++;
    return c;
  }, [filterAging, filterVendor, filterBillDate, filterPaidDate]);

  const clearAllFilters = () => {
    setFilterAging('all');
    setFilterVendor('');
    setFilterBillDate('');
    setFilterPaidDate('');
    setQuery('');
  };

  // Toggle party bill expansion
  const toggleParty = (vendorId: string | number) => {
    setExpandedParties(prev => ({ ...prev, [String(vendorId)]: !prev[String(vendorId)] }));
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
      setNoticeModal({
        title: 'Invalid Amount',
        message: 'Please enter a valid payment amount greater than 0.',
        type: 'error'
      });
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
      setNoticeModal({
        title: 'Payment Recorded',
        message: isFull
          ? `${formatBillNo(selectedBill)} marked as FULL PAID.`
          : `Partial payment of ${money(amount)} recorded for ${formatBillNo(selectedBill)}.`,
        type: 'success'
      });

      setSelectedBill(null);
      reloadAll();
    } catch (e: any) {
      setNoticeModal({
        title: 'Payment Failed',
        message: e?.message || 'Could not record payment. Please try again.',
        type: 'error'
      });
    } finally {
      setPaying(false);
    }
  };

  // Process Party Lump-Sum Payment
  const handlePartyPayment = async () => {
    if (!selectedParty) return;
    const amount = parseFloat(partyPayAmount);
    if (isNaN(amount) || amount <= 0) {
      setNoticeModal({
        title: 'Invalid Amount',
        message: 'Please enter a valid payment amount greater than 0.',
        type: 'error'
      });
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

      setNoticeModal({
        title: 'Party Payment Recorded',
        message: `Payment of ${money(amount)} applied towards ${selectedParty.vendor_name}. Oldest bills allocated first.`,
        type: 'success'
      });

      setSelectedParty(null);
      reloadAll();
    } catch (e: any) {
      setNoticeModal({
        title: 'Party Payment Failed',
        message: e?.message || 'Could not record payment.',
        type: 'error'
      });
    } finally {
      setPartyPaying(false);
    }
  };

  // Dynamic status evaluation for Bill Modal
  const billParsedAmount = parseFloat(payAmount) || 0;
  const billPendingDue = selectedBill ? Number(selectedBill.pending_amount) || 0 : 0;
  const isBillFull = billParsedAmount >= billPendingDue && billPendingDue > 0;
  const remainingAfterBillPay = Math.max(0, billPendingDue - billParsedAmount);

  // Dynamic status evaluation for Party Modal
  const partyParsedAmount = parseFloat(partyPayAmount) || 0;
  const partyTotalDue = selectedParty ? Number(selectedParty.total_pending) || 0 : 0;
  const isPartyFull = partyParsedAmount >= partyTotalDue && partyTotalDue > 0;
  const remainingAfterPartyPay = Math.max(0, partyTotalDue - partyParsedAmount);

  return (
    <>
      <Screen title="Store Inward Bills" {...{ busy, reload: reloadAll, at, err }}>
        {/* KPI BANNER */}
        <Card style={st.kpiCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={st.kpiCaption}>TOTAL OUTSTANDING DUES</Text>
              <Text style={st.kpiValueDanger}>{money(stats.pendingDue)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={[st.kpiBadge, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={[st.kpiBadgeText, { color: '#991B1B' }]}>🔴 {stats.redCount} Overdue</Text>
                </View>
                <View style={[st.kpiBadge, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[st.kpiBadgeText, { color: '#92400E' }]}>🟡 {stats.yellowCount} Warning</Text>
                </View>
              </View>
              <Text style={st.kpiSubText}>
                {allParties.length} Parties · {rawBills.length} Bills ({stats.greenCount} Cleared)
              </Text>
            </View>
          </View>
        </Card>

        {/* TOP TOGGLE: Party-wise vs Bill-wise */}
        <View style={st.viewToggleRow}>
          <Pressable
            onPress={() => setCurrentView('party')}
            style={[st.viewToggleBtn, currentView === 'party' && st.viewToggleBtnActive]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <UsersIcon size={15} color={currentView === 'party' ? '#fff' : c.ink} />
              <Text style={[st.viewToggleLabel, currentView === 'party' && st.viewToggleLabelActive]}>
                Party-wise
              </Text>
              <View style={[st.viewToggleBadge, currentView === 'party' && st.viewToggleBadgeActive]}>
                <Text style={[st.viewToggleBadgeText, currentView === 'party' && st.viewToggleBadgeTextActive]}>
                  {filteredParties.length}
                </Text>
              </View>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setCurrentView('bill')}
            style={[st.viewToggleBtn, currentView === 'bill' && st.viewToggleBtnActive]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <DocumentIcon size={15} color={currentView === 'bill' ? '#fff' : c.ink} />
              <Text style={[st.viewToggleLabel, currentView === 'bill' && st.viewToggleLabelActive]}>
                Bill-wise
              </Text>
              <View style={[st.viewToggleBadge, currentView === 'bill' && st.viewToggleBadgeActive]}>
                <Text style={[st.viewToggleBadgeText, currentView === 'bill' && st.viewToggleBadgeTextActive]}>
                  {filteredBills.length}
                </Text>
              </View>
            </View>
          </Pressable>
        </View>

        {/* SEARCH & FILTER BAR */}
        <View style={st.searchFilterBar}>
          <View style={st.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search party, bill #, phone..."
              placeholderTextColor={c.mute}
              style={st.searchInput}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} style={st.searchClear}>
                <CloseIcon size={14} color={c.mute} />
              </Pressable>
            )}
          </View>

          {/* Filter Button */}
          <Pressable
            onPress={() => setShowFilterModal(true)}
            style={[st.filterBtn, activeFiltersCount > 0 && st.filterBtnActive]}
          >
            <FilterIcon size={15} color={activeFiltersCount > 0 ? '#fff' : c.ink} />
            <Text style={[st.filterBtnText, activeFiltersCount > 0 && st.filterBtnTextActive]}>
              Filter
            </Text>
            {activeFiltersCount > 0 && (
              <View style={st.filterActiveBadge}>
                <Text style={st.filterActiveBadgeText}>{activeFiltersCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* ACTIVE FILTER PILLS (IF ACTIVE) */}
        {activeFiltersCount > 0 && (
          <View style={st.activeFilterPillsRow}>
            {filterAging !== 'all' && (
              <View style={st.activeFilterPill}>
                <Text style={st.activeFilterPillText}>
                  {filterAging === 'red' ? '🔴 25-40d Overdue' : filterAging === 'yellow' ? '🟡 15-25d Pending' : filterAging === 'green' ? '🟢 Full Paid' : '⏱️ <15d'}
                </Text>
                <Pressable onPress={() => setFilterAging('all')} style={st.pillCloseBtn}>
                  <CloseIcon size={11} color="#64748B" />
                </Pressable>
              </View>
            )}
            {filterVendor.trim().length > 0 && (
              <View style={st.activeFilterPill}>
                <Text style={st.activeFilterPillText}>Vendor: {filterVendor}</Text>
                <Pressable onPress={() => setFilterVendor('')} style={st.pillCloseBtn}>
                  <CloseIcon size={11} color="#64748B" />
                </Pressable>
              </View>
            )}
            {filterBillDate.trim().length > 0 && (
              <View style={st.activeFilterPill}>
                <Text style={st.activeFilterPillText}>Bill Date: {filterBillDate}</Text>
                <Pressable onPress={() => setFilterBillDate('')} style={st.pillCloseBtn}>
                  <CloseIcon size={11} color="#64748B" />
                </Pressable>
              </View>
            )}
            {filterPaidDate.trim().length > 0 && (
              <View style={st.activeFilterPill}>
                <Text style={st.activeFilterPillText}>Paid Date: {filterPaidDate}</Text>
                <Pressable onPress={() => setFilterPaidDate('')} style={st.pillCloseBtn}>
                  <CloseIcon size={11} color="#64748B" />
                </Pressable>
              </View>
            )}
            <Pressable onPress={clearAllFilters} style={st.clearAllBtn}>
              <Text style={st.clearAllBtnText}>Clear All</Text>
            </Pressable>
          </View>
        )}

        {/* ========================================================= */}
        {/* VIEW 1: PARTY-WISE VIEW                                   */}
        {/* ========================================================= */}
        {currentView === 'party' && (
          <>
            {!filteredParties.length && !busy && (
              <Card>
                <Text style={{ color: c.mute, textAlign: 'center', paddingVertical: 14 }}>
                  {activeFiltersCount > 0 ? 'No parties matching active filters.' : 'No party bills recorded yet.'}
                </Text>
              </Card>
            )}

            {filteredParties.map((p: any) => {
              const isExpanded = !!expandedParties[String(p.vendor_id)];
              const partyBills = p.matchingBills || p.bills || [];
              const partyAging = getPartyAging(p, partyBills);
              const partyPending = partyBills.reduce((sum: number, b: any) => sum + (Number(b.pending_amount) || 0), 0);

              return (
                <Card
                  key={String(p.vendor_id)}
                  style={[
                    st.partyCard,
                    { borderColor: partyAging.borderColor, backgroundColor: partyAging.bgColor }
                  ]}
                >
                  {/* Party Header: Party Name, Indicator (Red/Yellow/Green), Due Amount ONLY */}
                  <Pressable onPress={() => toggleParty(p.vendor_id)}>
                    <View style={st.partyHeaderRow}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={st.partyTitle} numberOfLines={1}>{p.vendor_name}</Text>
                        <Text style={st.partyBillsSub}>{partyBills.length} Bill{partyBills.length === 1 ? '' : 's'}</Text>
                      </View>

                      {/* Due Amount with color indicator pill */}
                      <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                        <View style={[st.partyIndicatorPill, { backgroundColor: partyAging.badgeBg }]}>
                          <Text style={[st.partyIndicatorText, { color: partyAging.badgeColor }]}>
                            {partyAging.badgeText}
                          </Text>
                        </View>
                        <Text style={[st.partyDueAmount, { color: partyAging.color }]}>
                          {partyPending > 0 ? money(partyPending) : 'Due: ₹0'}
                        </Text>
                      </View>

                      {/* Expand Chevron */}
                      <View style={st.partyChevronWrap}>
                        <Text style={{ color: c.mute, fontSize: 13, fontWeight: '700' }}>
                          {isExpanded ? '▲' : '▼'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  {/* Expanded In-line Bills under this Party */}
                  {isExpanded && (
                    <View style={st.partyExpandedBillsWrap}>
                      <View style={st.billsTableHeader}>
                        <Text style={[st.tableColHeader, { flex: 1.3 }]}>Date / Bill #</Text>
                        <Text style={[st.tableColHeader, { flex: 0.9, textAlign: 'right' }]}>Total</Text>
                        <Text style={[st.tableColHeader, { flex: 0.9, textAlign: 'right' }]}>Paid</Text>
                        <Text style={[st.tableColHeader, { flex: 1.1, textAlign: 'right' }]}>Pending</Text>
                      </View>

                      {partyBills.map((b: any) => {
                        const billAging = getBillAging(b);

                        return (
                          <Pressable
                            key={b.id}
                            onPress={() => openBillModal(b)}
                            style={({ pressed }) => [
                              st.partyBillRowItem,
                              { borderColor: billAging.borderColor, backgroundColor: billAging.bgColor },
                              pressed && { opacity: 0.85 }
                            ]}
                          >
                            <View style={{ flex: 1.3 }}>
                              <Text style={{ fontWeight: '800', color: c.ink, fontSize: 13 }}>
                                {formatBillNo(b)}
                              </Text>
                              <Text style={{ color: c.mute, fontSize: 11, marginTop: 1 }}>
                                {formatDateOnly(b.bill_date || b.created_at)}
                              </Text>
                              <View style={[st.rowStatusBadge, { backgroundColor: billAging.badgeBg, marginTop: 3 }]}>
                                <Text style={[st.rowStatusBadgeText, { color: billAging.badgeColor }]}>
                                  {billAging.badgeText}
                                </Text>
                              </View>
                            </View>

                            <View style={{ flex: 0.9, alignItems: 'flex-end', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.ink }}>
                                {money(b.total_amount)}
                              </Text>
                            </View>

                            <View style={{ flex: 0.9, alignItems: 'flex-end', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#047857' }}>
                                {money(b.paid_amount || 0)}
                              </Text>
                            </View>

                            <View style={{ flex: 1.1, alignItems: 'flex-end', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: billAging.color }}>
                                {money(b.pending_amount)}
                              </Text>
                              {Number(b.pending_amount) > 0 ? (
                                <Text style={{ color: c.brass, fontSize: 11, fontWeight: '800', marginTop: 1 }}>
                                  Pay ➔
                                </Text>
                              ) : (
                                <Text style={{ color: '#059669', fontSize: 10, fontWeight: '800', marginTop: 1 }}>
                                  ✓ Cleared
                                </Text>
                              )}
                            </View>
                          </Pressable>
                        );
                      })}

                      {partyPending > 0 && (
                        <Pressable
                          onPress={() => openPartyModal(p)}
                          style={st.partyLumpPayBtn}
                        >
                          <CreditCardIcon size={14} color="#fff" />
                          <Text style={st.partyLumpPayBtnText}>
                            Pay Entire Party Balance ({money(partyPending)})
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </Card>
              );
            })}
          </>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: BILL-WISE VIEW (ALL BILLS IN ROWS)                */}
        {/* ========================================================= */}
        {currentView === 'bill' && (
          <>
            {!filteredBills.length && !busy && (
              <Card>
                <Text style={{ color: c.mute, textAlign: 'center', paddingVertical: 14 }}>
                  {activeFiltersCount > 0 ? 'No bills matching active filters.' : 'No bills recorded yet.'}
                </Text>
              </Card>
            )}

            {filteredBills.map((b: any) => {
              const billAging = getBillAging(b);

              return (
                <Pressable key={b.id} onPress={() => openBillModal(b)}>
                  <Card
                    style={[
                      st.billRowCard,
                      { borderColor: billAging.borderColor, backgroundColor: billAging.bgColor }
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      {/* Left: Vendor Name, Bill # & Date */}
                      <View style={{ flex: 1.3, paddingRight: 6 }}>
                        <Text style={st.billVendorTitle} numberOfLines={1}>{b.vendor_name || 'Store Vendor'}</Text>
                        <Text style={st.billSubMeta}>
                          {formatBillNo(b)} · {formatDateOnly(b.bill_date || b.created_at)}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' }}>
                          <Badge text={b.payment_mode || 'Bank'} color={c.ink} />
                          {b.payments && b.payments.length > 0 && (
                            <View style={st.installmentsPill}>
                              <Text style={st.installmentsPillText}>
                                {b.payments.length} Installment{b.payments.length > 1 ? 's' : ''}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Middle: Total & Paid */}
                      <View style={{ flex: 0.9, alignItems: 'flex-end', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 10, color: c.mute, fontWeight: '600' }}>TOTAL</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: c.ink }}>{money(b.total_amount)}</Text>
                        <Text style={{ fontSize: 10, color: '#047857', fontWeight: '700', marginTop: 2 }}>
                          Paid: {money(b.paid_amount || 0)}
                        </Text>
                      </View>

                      {/* Right: Pending Due with Highlight Badge (Red / Yellow / Green) */}
                      <View style={{ flex: 1.1, alignItems: 'flex-end', justifyContent: 'center', paddingLeft: 6 }}>
                        <View style={[st.billAgingBadge, { backgroundColor: billAging.badgeBg }]}>
                          <Text style={[st.billAgingBadgeText, { color: billAging.badgeColor }]}>
                            {billAging.badgeText}
                          </Text>
                        </View>
                        <Text style={[st.billRowDue, { color: billAging.color }]}>
                          {money(b.pending_amount)}
                        </Text>
                        <Text style={{ color: c.brass, fontSize: 11, fontWeight: '800', marginTop: 1 }}>
                          {Number(b.pending_amount) > 0 ? 'Pay ➔' : 'View ➔'}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </>
        )}
      </Screen>

      {/* ========================================================= */}
      {/* 🔍 MODAL: ADVANCED FILTER POPUP                           */}
      {/* ========================================================= */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilterModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={st.modalOverlay}
        >
          <View style={st.modalContainer}>
            {/* Header */}
            <View style={st.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FilterIcon size={18} color={c.ink} />
                <Text style={st.modalTitle}>Filter Store Bills</Text>
              </View>
              <Pressable onPress={() => setShowFilterModal(false)} style={st.modalCloseBtn}>
                <CloseIcon size={18} color={c.mute} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={st.modalScrollContent}>
              {/* Filter 1: Aging Status (Red, Yellow, Green, All) */}
              <View style={st.filterGroup}>
                <Text style={st.filterGroupLabel}>Status & Aging Indicator:</Text>
                <View style={st.filterChipsRow}>
                  {[
                    { key: 'all', label: 'All Bills' },
                    { key: 'red', label: '🔴 Red (25-40+d)' },
                    { key: 'yellow', label: '🟡 Yellow (15-25d)' },
                    { key: 'green', label: '🟢 Full Paid' },
                    { key: 'pending', label: '⏱️ Under 15d' }
                  ].map(item => (
                    <Pressable
                      key={item.key}
                      onPress={() => setFilterAging(item.key as any)}
                      style={[
                        st.filterChip,
                        filterAging === item.key && st.filterChipActive
                      ]}
                    >
                      <Text
                        style={[
                          st.filterChipText,
                          filterAging === item.key && st.filterChipTextActive
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Filter 2: Party / Vendor Name */}
              <View style={st.filterGroup}>
                <Text style={st.filterGroupLabel}>Party / Vendor Name:</Text>
                <TextInput
                  value={filterVendor}
                  onChangeText={setFilterVendor}
                  placeholder="e.g. Gupta, Sharma, Tara..."
                  placeholderTextColor={c.mute}
                  style={st.textInput}
                />
                {/* Quick Vendor Chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {allParties.slice(0, 6).map((p: any) => (
                      <Pressable
                        key={String(p.vendor_id)}
                        onPress={() => setFilterVendor(p.vendor_name)}
                        style={[
                          st.quickVendorPill,
                          filterVendor === p.vendor_name && st.quickVendorPillActive
                        ]}
                      >
                        <Text style={[st.quickVendorPillText, filterVendor === p.vendor_name && { color: '#fff' }]}>
                          {p.vendor_name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Filter 3: Bill Date */}
              <View style={st.filterGroup}>
                <Text style={st.filterGroupLabel}>Bill Date (YYYY-MM-DD or Substring):</Text>
                <TextInput
                  value={filterBillDate}
                  onChangeText={setFilterBillDate}
                  placeholder="e.g. 2026-10 or 2026-10-15"
                  placeholderTextColor={c.mute}
                  style={st.textInput}
                />
              </View>

              {/* Filter 4: Paid Date */}
              <View style={st.filterGroup}>
                <Text style={st.filterGroupLabel}>Payment Settled Date (YYYY-MM-DD):</Text>
                <TextInput
                  value={filterPaidDate}
                  onChangeText={setFilterPaidDate}
                  placeholder="e.g. 2026-10-17"
                  placeholderTextColor={c.mute}
                  style={st.textInput}
                />
              </View>

              {/* Filter Action Buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable
                  onPress={clearAllFilters}
                  style={st.filterResetBtn}
                >
                  <Text style={st.filterResetBtnText}>Reset Filters</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowFilterModal(false)}
                  style={st.filterApplyBtn}
                >
                  <Text style={st.filterApplyBtnText}>Apply Filters</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
                  {formatBillNo(selectedBill)}
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
                  <Text style={st.summaryVal}>{formatDateOnly(selectedBill?.bill_date || selectedBill?.created_at)}</Text>
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
                  <Text style={[st.summaryVal, { fontWeight: '700', color: '#047857', fontSize: 16 }]}>
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

              {/* PAYMENT HISTORY: With Date - Time, Mode, Amount */}
              {selectedBill?.payments && selectedBill.payments.length > 0 && (
                <View style={st.historySectionBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Text style={st.secTitle}>Payment Installment History ({selectedBill.payments.length}):</Text>
                  </View>
                  {selectedBill.payments.map((p: any, idx: number) => (
                    <View key={p.id || idx} style={st.pastPaymentItem}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontWeight: '800', color: '#047857', fontSize: 14 }}>
                            {money(p.payment_amount)}
                          </Text>
                          <Text style={{ color: c.ink, fontSize: 12, fontWeight: '700' }}>
                            {p.payment_mode || 'Bank Transfer'}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                          <Text style={{ color: c.mute, fontSize: 11 }}>
                            📅 {formatDateTime(p.paid_at || p.created_at)}
                          </Text>
                          {p.paid_by && (
                            <Text style={{ color: c.mute, fontSize: 11 }}>
                              👤 {p.paid_by}
                            </Text>
                          )}
                        </View>
                        {p.reference_no ? (
                          <Text style={{ color: c.brass, fontSize: 11, marginTop: 2, fontWeight: '600' }}>
                            Ref: {p.reference_no}
                          </Text>
                        ) : null}
                      </View>
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
                      <>
                        <Pressable
                          onPress={() => setPayAmount(String(Math.round(Number(selectedBill?.pending_amount) / 2)))}
                          style={st.quickPill}
                        >
                          <Text style={st.quickPillText}>50%</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setPayAmount(String(Math.round(Number(selectedBill?.pending_amount) * 0.25)))}
                          style={st.quickPill}
                        >
                          <Text style={st.quickPillText}>25%</Text>
                        </Pressable>
                      </>
                    )}
                  </View>

                  {/* Dynamic Remark Feedback */}
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
                          ? `Entered amount covers actual pending due (${money(billPendingDue)}). Bill will be marked as FULL PAID.`
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
                  <Text style={st.clearedNoticeTitle}>✓ BILL FULLY SETTLED</Text>
                  <Text style={st.clearedNoticeBody}>
                    This bill has zero pending dues. All installments are cleared.
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
                        : `Payment will be allocated sequentially across oldest pending bills. Remaining party due: ${money(remainingAfterPartyPay)}.`}
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

      {/* ========================================================= */}
      {/* 🔔 CUSTOM BRANDED NOTICE MODAL (Replaces OS Alert)         */}
      {/* ========================================================= */}
      <Modal
        visible={!!noticeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setNoticeModal(null)}
      >
        <View style={st.noticeOverlay}>
          <View style={st.noticeContainer}>
            <View style={[
              st.noticeIconCircle,
              noticeModal?.type === 'error' ? st.noticeIconCircleError : st.noticeIconCircleSuccess
            ]}>
              {noticeModal?.type === 'error' ? (
                <AlertIcon size={28} color="#D9381E" />
              ) : (
                <CheckIcon size={28} color="#0E7A4A" />
              )}
            </View>
            <Text style={st.noticeTitle}>{noticeModal?.title}</Text>
            <Text style={st.noticeMessage}>{noticeModal?.message}</Text>
            <Pressable
              onPress={() => setNoticeModal(null)}
              style={[
                st.noticeBtn,
                noticeModal?.type === 'error' ? st.noticeBtnError : st.noticeBtnSuccess
              ]}
            >
              <Text style={st.noticeBtnText}>Okay, Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  // KPI Banner
  kpiCard: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    marginBottom: 4
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
  kpiBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  kpiBadgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  kpiSubText: {
    fontSize: 11.5,
    color: c.mute,
    marginTop: 2
  },

  // View Toggle (Party vs Bill)
  viewToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center'
  },
  viewToggleBtnActive: {
    backgroundColor: c.ink,
    borderColor: c.ink
  },
  viewToggleLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: c.ink
  },
  viewToggleLabelActive: {
    color: '#fff'
  },
  viewToggleBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8
  },
  viewToggleBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)'
  },
  viewToggleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: c.ink
  },
  viewToggleBadgeTextActive: {
    color: '#fff'
  },

  // Search & Filter Bar
  searchFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4
  },
  searchWrap: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center'
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingRight: 34,
    borderWidth: 1,
    borderColor: c.line,
    color: c.ink,
    fontSize: 13.5
  },
  searchClear: {
    position: 'absolute',
    right: 10,
    padding: 4
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  filterBtnActive: {
    backgroundColor: c.ink,
    borderColor: c.ink
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: c.ink
  },
  filterBtnTextActive: {
    color: '#fff'
  },
  filterActiveBadge: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1
  },
  filterActiveBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800'
  },

  // Active Filter Pills
  activeFilterPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    marginBottom: 6
  },
  activeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 8
  },
  activeFilterPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155'
  },
  pillCloseBtn: {
    padding: 2
  },
  clearAllBtn: {
    paddingVertical: 3,
    paddingHorizontal: 6
  },
  clearAllBtnText: {
    fontSize: 11.5,
    color: '#DC2626',
    fontWeight: '700',
    textDecorationLine: 'underline'
  },

  // Party Card
  partyCard: {
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderRadius: 12
  },
  partyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  partyBillsSub: {
    fontSize: 11.5,
    color: c.mute,
    marginTop: 2,
    fontWeight: '600'
  },
  partyChevronWrap: {
    marginLeft: 8,
    padding: 2
  },
  partyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: c.ink
  },
  partyIndicatorPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2
  },
  partyIndicatorText: {
    fontSize: 11,
    fontWeight: '800'
  },
  partyDueAmount: {
    fontSize: 18,
    fontWeight: '900'
  },

  // Party Expanded Bills Table
  partyExpandedBillsWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    gap: 6
  },
  billsTableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingBottom: 4
  },
  tableColHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: c.mute,
    textTransform: 'uppercase'
  },
  partyBillRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1
  },
  rowStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  rowStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800'
  },
  partyLumpPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: c.ink,
    borderRadius: 8,
    paddingVertical: 9,
    marginTop: 4
  },
  partyLumpPayBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13
  },

  // Bill Row Card (Bill-wise View)
  billRowCard: {
    padding: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderRadius: 12
  },
  billRowDue: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2
  },
  billVendorTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: c.ink
  },
  billSubMeta: {
    fontSize: 12,
    color: c.mute,
    marginTop: 2
  },
  billAgingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  billAgingBadgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  billAmountsGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 8
  },
  amtCol: {
    flex: 1
  },
  amtColCaption: {
    fontSize: 10.5,
    color: c.mute,
    fontWeight: '600'
  },
  amtColVal: {
    fontSize: 14,
    fontWeight: '700',
    color: c.ink,
    marginTop: 1
  },
  billCardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  installmentsPill: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  installmentsPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#3730A3'
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

  // Filter Modal
  filterGroup: {
    gap: 6
  },
  filterGroupLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: c.ink
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  filterChip: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  filterChipActive: {
    backgroundColor: c.ink,
    borderColor: c.ink
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155'
  },
  filterChipTextActive: {
    color: '#fff'
  },
  quickVendorPill: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8
  },
  quickVendorPillActive: {
    backgroundColor: c.brass,
    borderColor: c.brass
  },
  quickVendorPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: c.ink
  },
  filterResetBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  filterResetBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#475569'
  },
  filterApplyBtn: {
    flex: 1.5,
    backgroundColor: c.ink,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  filterApplyBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#fff'
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

  // History Installment Section Box
  historySectionBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  secTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: c.ink
  },
  pastPaymentItem: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6
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
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#10B981',
    alignItems: 'center',
    gap: 4
  },
  clearedNoticeTitle: {
    color: '#047857',
    fontSize: 15,
    fontWeight: '800'
  },
  clearedNoticeBody: {
    color: '#065F46',
    fontSize: 12.5,
    textAlign: 'center'
  },

  // Notice Modal
  noticeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  noticeContainer: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8
  },
  noticeIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  noticeIconCircleSuccess: {
    backgroundColor: '#E6F4EA'
  },
  noticeIconCircleError: {
    backgroundColor: '#FCE8E6'
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: c.ink,
    textAlign: 'center',
    marginBottom: 8
  },
  noticeMessage: {
    fontSize: 14,
    color: c.text,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20
  },
  noticeBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  noticeBtnSuccess: {
    backgroundColor: c.ink
  },
  noticeBtnError: {
    backgroundColor: '#D9381E'
  },
  noticeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700'
  }
});
