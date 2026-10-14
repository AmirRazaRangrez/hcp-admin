import React, { useState, useMemo, useRef } from 'react';
import { useRouter } from 'expo-router';
import {
  Text,
  TextInput,
  View,
  Pressable,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Animated
} from 'react-native';
import { api } from '../src/api/client';
import { Screen, Card, Badge, useLoad } from '../src/lib/ui';
import { c, money, when } from '../src/lib/theme';
import { FilterIcon, CloseIcon, CalendarIcon } from '../src/lib/icons';

const DEPTS = ['All', 'Room', 'Restaurant', 'Bar'];
const STATUS = ['Any', 'Paid', 'Pending'];

const iso = (d: Date) => d.toLocaleDateString('en-CA');
const ago = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
const T = iso(new Date());

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getShortcuts = () => {
  const list = [];
  const now = new Date();

  list.push({ id: 'Today', label: 'Today', from: iso(now), to: iso(now) });

  const y = new Date();
  y.setDate(y.getDate() - 1);
  list.push({ id: 'Yesterday', label: 'Yesterday', from: iso(y), to: iso(y) });

  for (let i = 2; i <= 6; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = iso(d);
    const label = `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} (${WEEKDAYS[d.getDay()]})`;
    list.push({ id: dateStr, label, from: dateStr, to: dateStr });
  }

  list.push({ id: '7 Days', label: '7 Days', from: ago(6), to: iso(now) });
  list.push({ id: '30 Days', label: '30 Days', from: ago(29), to: iso(now) });
  list.push({ id: 'This Month', label: 'This Month', from: iso(now).slice(0, 8) + '01', to: iso(now) });

  return list;
};

export default function Bills() {
  const { data, err, busy, at, reload } = useLoad(() => api.bills(), [], 'bills');
  const [q, setQ] = useState('');
  const [d, setD] = useState('All');
  const [status, setStatus] = useState('Any');
  const [sort, setSort] = useState<'new' | 'old'>('new');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fromBillNo, setFromBillNo] = useState('');
  const [toBillNo, setToBillNo] = useState('');
  const [activeShortcut, setActiveShortcut] = useState('');

  // Filter modal staging
  const [modalVisible, setModalVisible] = useState(false);
  const [tempShortcut, setTempShortcut] = useState('');
  const [tempFrom, setTempFrom] = useState('');
  const [tempTo, setTempTo] = useState('');
  const [tempFromBill, setTempFromBill] = useState('');
  const [tempToBill, setTempToBill] = useState('');
  const [tempSort, setTempSort] = useState<'new' | 'old'>('new');
  const [tempStatus, setTempStatus] = useState('Any');

  const r = useRouter();
  const shortcuts = useMemo(() => getShortcuts(), []);
  const sheetAnim = useRef(new Animated.Value(600)).current;

  const openModal = () => {
    setTempShortcut(activeShortcut);
    setTempFrom(fromDate);
    setTempTo(toDate);
    setTempFromBill(fromBillNo);
    setTempToBill(toBillNo);
    setTempSort(sort);
    setTempStatus(status);
    sheetAnim.setValue(600);
    setModalVisible(true);
    requestAnimationFrame(() => {
      Animated.spring(sheetAnim, {
        toValue: 0,
        damping: 26,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: Platform.OS !== 'web'
      }).start();
    });
  };

  const closeModal = () => {
    Animated.timing(sheetAnim, {
      toValue: 600,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web'
    }).start(() => {
      setModalVisible(false);
    });
  };

  const applyModal = () => {
    setActiveShortcut(tempShortcut);
    setFromDate(tempFrom.trim());
    setToDate(tempTo.trim());
    setFromBillNo(tempFromBill.trim());
    setToBillNo(tempToBill.trim());
    setSort(tempSort);
    setStatus(tempStatus);
    closeModal();
  };

  const clearFilters = () => {
    setActiveShortcut('');
    setFromDate('');
    setToDate('');
    setFromBillNo('');
    setToBillNo('');
    setSort('new');
    setStatus('Any');
    setTempShortcut('');
    setTempFrom('');
    setTempTo('');
    setTempFromBill('');
    setTempToBill('');
    setTempSort('new');
    setTempStatus('Any');
    closeModal();
  };

  const resetModal = () => {
    setTempShortcut('');
    setTempFrom('');
    setTempTo('');
    setTempFromBill('');
    setTempToBill('');
    setTempSort('new');
    setTempStatus('Any');
  };

  const roomMissing = !!data && (data as any).roomOk === false;

  const list = useMemo(() => {
    let bills = (data || []).filter((b: any) => {
      // Dept filter
      if (d !== 'All' && b.dept !== d) return false;

      // Status filter
      if (status !== 'Any' && (status === 'Paid') !== !!b.is_paid) return false;

      // Text search
      if (q && !JSON.stringify(b).toLowerCase().includes(q.toLowerCase())) return false;

      // Date filter
      const bDate = b.created_at ? String(b.created_at).slice(0, 10) : '';
      if (fromDate && bDate && bDate < fromDate) return false;
      if (toDate && bDate && bDate > toDate) return false;

      // Bill / Tax No range filter
      const numMatch = String(b.order_number || b.id || '').match(/\d+/);
      const bNum = numMatch ? parseInt(numMatch[0], 10) : 0;

      const fNumMatch = fromBillNo ? String(fromBillNo).match(/\d+/) : null;
      const fNum = fNumMatch ? parseInt(fNumMatch[0], 10) : 0;

      const tNumMatch = toBillNo ? String(toBillNo).match(/\d+/) : null;
      const tNum = tNumMatch ? parseInt(tNumMatch[0], 10) : 0;

      if (fNum > 0 && bNum < fNum) return false;
      if (tNum > 0 && bNum > tNum) return false;

      if (fromBillNo && isNaN(Number(fromBillNo))) {
        const str = String(b.order_number || b.id || '').toLowerCase();
        if (!str.includes(fromBillNo.toLowerCase())) return false;
      }

      return true;
    });

    // Sorting: New First vs Old First
    bills = [...bills].sort((x: any, y: any) => {
      const dX = String(x.created_at || '');
      const dY = String(y.created_at || '');
      return sort === 'old' ? dX.localeCompare(dY) : dY.localeCompare(dX);
    });

    return bills;
  }, [data, d, status, q, fromDate, toDate, fromBillNo, toBillNo, sort]);

  const isFiltered = status !== 'Any' || sort !== 'new' || !!fromDate || !!toDate || !!fromBillNo || !!toBillNo;

  return (
    <>
      <Screen title="Bills" back {...{ busy, reload, at, err }}>
        {/* Search bar + Filter icon button on right side */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search bill, guest, room..."
            placeholderTextColor={c.mute}
            style={{
              flex: 1,
              backgroundColor: '#fff',
              borderRadius: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: c.line,
              fontSize: 14
            }}
          />
          <Pressable
            onPress={openModal}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'center',
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: isFiltered ? '#0F2A2E' : '#fff',
              borderWidth: 1,
              borderColor: isFiltered ? '#0F2A2E' : c.line
            }}
          >
            <FilterIcon size={16} color={isFiltered ? '#fff' : c.ink} />
            <Text style={{ color: isFiltered ? '#fff' : c.ink, fontWeight: '700', fontSize: 13 }}>
              Filter
            </Text>
            {isFiltered && (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.brass }} />
            )}
          </Pressable>
        </View>

        {/* Department Pills */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {DEPTS.map(x => (
            <Pressable
              key={x}
              onPress={() => setD(x)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: d === x ? c.ink : '#fff',
                borderWidth: 1,
                borderColor: c.line
              }}
            >
              <Text style={{ color: d === x ? '#fff' : c.text, fontWeight: '700', fontSize: 13 }}>{x}</Text>
            </Pressable>
          ))}
        </View>

        {/* Active Filters Summary Badge */}
        {isFiltered && (
          <View style={st.activeSummaryBar}>
            <Text style={st.activeSummaryText}>
              Filters: {fromDate ? `${fromDate} → ${toDate || 'Now'}` : ''}
              {fromBillNo || toBillNo ? ` · #${fromBillNo || '1'}–#${toBillNo || '...'}` : ''}
              {status !== 'Any' ? ` · ${status}` : ''}
              {` · ${sort === 'new' ? 'New First' : 'Old First'}`}
            </Text>
            <Pressable onPress={() => { setFromDate(''); setToDate(''); setFromBillNo(''); setToBillNo(''); setSort('new'); setStatus('Any'); setActiveShortcut(''); }}>
              <Text style={{ color: c.brass, fontWeight: '700', fontSize: 12 }}>Clear</Text>
            </Pressable>
          </View>
        )}

        {roomMissing && (d === 'All' || d === 'Room') && (
          <Card>
            <Text style={{ color: c.mute }}>
              Room-stay bills could not be loaded from the CRM (/hospitality/history). Restaurant and bar bills are still shown.
            </Text>
          </Card>
        )}

        {!list.length && !err && (
          <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
            <Text style={{ color: c.mute, fontSize: 13 }}>No bills matching the selected filter criteria.</Text>
          </Card>
        )}

        {list.map((b: any, i: number) => (
          <Pressable
            key={`${b.dept}${b.id || i}`}
            onPress={() => r.push({ pathname: '/bill', params: { dept: b.dept, id: String(b.id) } })}
          >
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '800', fontSize: 15, color: c.ink }}>
                  {b.order_number || `#${b.id}`}
                </Text>
                <Text style={{ fontWeight: '800', color: c.ink, fontSize: 15 }}>
                  {money(b.total)}
                </Text>
              </View>
              <Text style={{ color: c.mute, marginTop: 3, fontSize: 12 }}>
                {b.dept} · {b.customer_name || 'Walk-in'} {b.room_number ? `· Room ${b.room_number}` : ''} · {when(b.created_at)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <Badge text={b.is_paid ? 'PAID' : 'PENDING'} color={b.is_paid ? c.ok : c.warn} />
                <Badge text={b.payment_mode || 'Cash'} color="#2563EB" />
                {Number(b.discount) > 0 && <Badge text={`Discount ${money(b.discount)}`} color={c.brass} />}
              </View>
            </Card>
          </Pressable>
        ))}
      </Screen>

      {/* Filter Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={st.modalOverlay}
        >
          <Pressable style={st.backdropPress} onPress={closeModal} />
          <Animated.View style={[st.modalSheet, { transform: [{ translateY: sheetAnim }] }]}>
            {/* Header */}
            <View style={st.modalHeader}>
              <View>
                <Text style={st.modalTitle}>Filter Bills</Text>
                <Text style={st.modalSubtitle}>Date shortcuts, range, tax invoice number & sorting</Text>
              </View>
              <Pressable onPress={closeModal} style={st.modalCloseBtn} hitSlop={10}>
                <CloseIcon size={18} color={c.mute} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.modalBody}>
              {/* 1. Filter Shortcuts: Today, Yesterday, 5 Previous Days in ONE ROW */}
              <View style={st.filterSection}>
                <Text style={st.sectionLabel}>QUICK SHORTCUTS (1 ROW)</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={st.shortcutsRow}
                >
                  {shortcuts.map(s => {
                    const active = tempShortcut === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => {
                          setTempShortcut(s.id);
                          setTempFrom(s.from);
                          setTempTo(s.to);
                        }}
                        style={[st.shortcutChip, active && st.shortcutChipActive]}
                      >
                        <Text style={[st.shortcutChipText, active && st.shortcutChipTextActive]}>
                          {s.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 2. Below that: From Date to Date */}
              <View style={st.filterSection}>
                <Text style={st.sectionLabel}>FROM DATE  TO  DATE</Text>
                <View style={st.dateInputsRow}>
                  <View style={st.dateInputWrap}>
                    <Text style={st.inputMiniLabel}>From Date</Text>
                    <TextInput
                      value={tempFrom}
                      onChangeText={(t) => { setTempFrom(t); setTempShortcut(''); }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={c.mute}
                      style={st.dateInput}
                    />
                  </View>
                  <View style={st.dateInputWrap}>
                    <Text style={st.inputMiniLabel}>To Date</Text>
                    <TextInput
                      value={tempTo}
                      onChangeText={(t) => { setTempTo(t); setTempShortcut(''); }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={c.mute}
                      style={st.dateInput}
                    />
                  </View>
                </View>
              </View>

              {/* 3. Below that: From "Bill/Tax No" to "Bill/Tax No" */}
              <View style={st.filterSection}>
                <Text style={st.sectionLabel}>BILL / TAX INVOICE NO. RANGE</Text>
                <View style={st.dateInputsRow}>
                  <View style={st.dateInputWrap}>
                    <Text style={st.inputMiniLabel}>From Bill/Tax #</Text>
                    <TextInput
                      value={tempFromBill}
                      onChangeText={setTempFromBill}
                      placeholder="e.g. 1001"
                      placeholderTextColor={c.mute}
                      style={st.dateInput}
                    />
                  </View>
                  <View style={st.dateInputWrap}>
                    <Text style={st.inputMiniLabel}>To Bill/Tax #</Text>
                    <TextInput
                      value={tempToBill}
                      onChangeText={setTempToBill}
                      placeholder="e.g. 1050"
                      placeholderTextColor={c.mute}
                      style={st.dateInput}
                    />
                  </View>
                </View>
              </View>

              {/* 4. Below that: "New First", "Old First" */}
              <View style={st.filterSection}>
                <Text style={st.sectionLabel}>SORT ORDER</Text>
                <View style={st.sortToggleRow}>
                  <Pressable
                    onPress={() => setTempSort('new')}
                    style={[st.sortBtn, tempSort === 'new' && st.sortBtnActive]}
                  >
                    <Text style={[st.sortBtnText, tempSort === 'new' && st.sortBtnTextActive]}>
                      New First
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setTempSort('old')}
                    style={[st.sortBtn, tempSort === 'old' && st.sortBtnActive]}
                  >
                    <Text style={[st.sortBtnText, tempSort === 'old' && st.sortBtnTextActive]}>
                      Old First
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* 5. Payment Status */}
              <View style={st.filterSection}>
                <Text style={st.sectionLabel}>PAYMENT STATUS</Text>
                <View style={st.sortToggleRow}>
                  {STATUS.map(stt => (
                    <Pressable
                      key={stt}
                      onPress={() => setTempStatus(stt)}
                      style={[st.sortBtn, tempStatus === stt && st.sortBtnActive]}
                    >
                      <Text style={[st.sortBtnText, tempStatus === stt && st.sortBtnTextActive]}>
                        {stt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Footer Buttons */}
            <View style={st.modalFooter}>
              <Pressable onPress={clearFilters} style={st.resetBtn}>
                <Text style={st.resetBtnText}>Clear Filter</Text>
              </Pressable>

              <Pressable onPress={applyModal} style={st.applyBtn}>
                <Text style={st.applyBtnText}>Apply Filters</Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  activeSummaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAFBFB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8E6'
  },
  activeSummaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.ink,
    flex: 1
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
    } : {})
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0'
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: c.ink
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: c.mute,
    marginTop: 2
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F6F4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 16
  },
  filterSection: {
    gap: 6
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: c.mute,
    letterSpacing: 0.6
  },
  shortcutsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2
  },
  shortcutChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F6F4',
    borderWidth: 1,
    borderColor: '#E2E8E6'
  },
  shortcutChipActive: {
    backgroundColor: '#0F2A2E',
    borderColor: '#0F2A2E'
  },
  shortcutChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: c.text
  },
  shortcutChipTextActive: {
    color: '#FFFFFF'
  },
  dateInputsRow: {
    flexDirection: 'row',
    gap: 10
  },
  dateInputWrap: {
    flex: 1,
    backgroundColor: '#FAFBFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8E6',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4
  },
  inputMiniLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: c.mute
  },
  dateInput: {
    fontSize: 13.5,
    fontWeight: '700',
    color: c.ink,
    paddingVertical: 4
  },
  sortToggleRow: {
    flexDirection: 'row',
    gap: 8
  },
  sortBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F6F4',
    borderWidth: 1,
    borderColor: '#E2E8E6',
    alignItems: 'center'
  },
  sortBtnActive: {
    backgroundColor: '#0F2A2E',
    borderColor: '#0F2A2E'
  },
  sortBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: c.ink
  },
  sortBtnTextActive: {
    color: '#FFFFFF'
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F0'
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F6F4',
    borderWidth: 1,
    borderColor: '#E2E8E6',
    alignItems: 'center'
  },
  resetBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: c.ink
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0F2A2E',
    alignItems: 'center',
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2
  },
  applyBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF'
  }
});
