import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Animated
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { api } from '../../src/api/client';
import { Screen, Card, Badge, useLoad } from '../../src/lib/ui';
import { c, money, when } from '../../src/lib/theme';
import {
  PaymentIcon,
  CreditCardIcon,
  ReceiptIcon,
  DocumentIcon,
  HotelIcon,
  RestaurantIcon,
  BarIcon,
  CalendarIcon,
  FilterIcon,
  CloseIcon
} from '../../src/lib/icons';

const iso = (d: Date) => d.toLocaleDateString('en-CA');
const ago = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
const T = iso(new Date());

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const OK = /^\d{4}-\d{2}-\d{2}$/;

const formatShort = (dateStr: string) => {
  if (!dateStr || !OK.test(dateStr)) return dateStr;
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
};

const dayName = (dateStr: string) => {
  if (!dateStr || !OK.test(dateStr)) return '';
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return WEEKDAYS[d.getDay()];
};

// Generates quick shortcuts: Today, Yesterday, and 5 previous days (with date and day name in one row)
const getShortcuts = () => {
  const list: { id: string; label: string; from: string; to: string }[] = [];
  const now = new Date();

  // 1. Today
  list.push({
    id: 'Today',
    label: 'Today',
    from: iso(now),
    to: iso(now)
  });

  // 2. Yesterday
  const y = new Date();
  y.setDate(y.getDate() - 1);
  list.push({
    id: 'Yesterday',
    label: 'Yesterday',
    from: iso(y),
    to: iso(y)
  });

  // 3. 5 previous days before yesterday with date & day name: e.g. "12 Oct (Mon)"
  for (let i = 2; i <= 6; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = iso(d);
    const label = `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} (${WEEKDAYS[d.getDay()]})`;
    list.push({
      id: dateStr,
      label,
      from: dateStr,
      to: dateStr
    });
  }

  // 4. Extended ranges
  list.push({ id: '7 Days', label: '7 Days', from: ago(6), to: iso(now) });
  list.push({ id: '30 Days', label: '30 Days', from: ago(29), to: iso(now) });
  list.push({ id: 'This Month', label: 'This Month', from: iso(now).slice(0, 8) + '01', to: iso(now) });

  return list;
};

function RangeCalendar({ from, to, onChange, single }: { from: string; to: string; onChange: (f: string, t: string) => void; single?: boolean }) {
  const base = OK.test(from) ? new Date(from + 'T00:00:00') : new Date();
  const [y, setY] = useState(base.getFullYear());
  const [m, setM] = useState(base.getMonth());
  const [step, setStep] = useState(0);
  const [view, setView] = useState<'day' | 'month' | 'year'>('day');
  const today = iso(new Date());
  const nowY = new Date().getFullYear();
  const nowM = new Date().getMonth();
  const [ys, setYs] = useState(Math.min(base.getFullYear() - 6, nowY - 11));
  const atMax = y > nowY || (y === nowY && m >= nowM);
  const first = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const key = (d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const go = (d: number) => {
    let ny = y, nm = m + d;
    if (nm < 0) { nm = 11; ny--; }
    if (nm > 11) { nm = 0; ny++; }
    setY(ny);
    setM(nm);
  };
  const pick = (k: string) => {
    if (k > today) return;
    if (single) { onChange(k, k); return; }
    if (step === 0 || !OK.test(from)) { onChange(k, k); setStep(1); }
    else { k < from ? onChange(k, from) : onChange(from, k); setStep(0); }
  };

  const Arrow = ({ label, onPress, off }: any) => (
    <Pressable disabled={off} onPress={onPress} hitSlop={8} style={{ width: 34, height: 30, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.25 : 1 }}>
      <Text style={{ fontSize: 20, color: c.ink, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  const Head = ({ children, onPress }: any) => (
    <Pressable onPress={onPress} hitSlop={6} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: onPress ? '#EEF2F0' : 'transparent' }}>
      <Text style={{ fontWeight: '800', color: c.ink, fontSize: 15 }}>{children}{onPress ? ' ▾' : ''}</Text>
    </Pressable>
  );

  const Cell = ({ label, sel, now, off, onPress }: any) => (
    <Pressable disabled={off} onPress={onPress} style={{ flexBasis: '31%', flexGrow: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? c.ink : '#F6F8F7', borderWidth: now && !sel ? 1 : 0, borderColor: c.brass, opacity: off ? 0.3 : 1 }}>
      <Text style={{ color: sel ? '#fff' : c.text, fontWeight: sel ? '800' : '600' }}>{label}</Text>
    </Pressable>
  );

  const openYear = () => { setYs(Math.min(y - 6, nowY - 11)); setView('year'); };

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 14 }}>
      {view === 'day' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Arrow label="‹" onPress={() => go(-1)} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Head onPress={() => setView('month')}>{MONTHS[m]}</Head>
            <Head onPress={openYear}>{y}</Head>
          </View>
          <Arrow label="›" off={atMax} onPress={() => go(1)} />
        </View>
      )}

      {view === 'month' && (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontWeight: '800', fontSize: 15, color: c.ink }}>Select Month</Text>
            <Pressable onPress={() => setView('day')} hitSlop={8}><Text style={{ color: c.ink, fontWeight: '700' }}>Back</Text></Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {MONTHS.map((name, i) => (
              <Cell key={name} label={name.slice(0, 3)} sel={i === m} now={i === nowM && y === nowY} off={y === nowY && i > nowM} onPress={() => { setM(i); setView('day'); }} />
            ))}
          </View>
        </View>
      )}

      {view === 'year' && (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Arrow label="‹" onPress={() => setYs(ys - 12)} />
            <Text style={{ fontWeight: '800', fontSize: 15, color: c.ink }}>{ys} - {ys + 11}</Text>
            <Arrow label="›" off={ys + 11 >= nowY} onPress={() => setYs(ys + 12)} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: 12 }, (_, i) => ys + i).map(year => (
              <Cell key={year} label={year} sel={year === y} now={year === nowY} off={year > nowY} onPress={() => { setY(year); setView('day'); }} />
            ))}
          </View>
        </View>
      )}

      {view === 'day' && (
        <>
          <View style={{ flexDirection: 'row', marginTop: 10, marginBottom: 4 }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.mute, fontSize: 11, fontWeight: '700' }}>{d}</Text>
            ))}
          </View>
          {weeks.map((w, wi) => (
            <View key={wi} style={{ flexDirection: 'row', marginVertical: 1 }}>
              {w.map((d, di) => {
                if (!d) return <View key={di} style={{ flex: 1, height: 32 }} />;
                const k = key(d);
                const isFrom = k === from;
                const isTo = k === to;
                const inR = !single && from && to && k >= from && k <= to;
                const end = isFrom || isTo;
                const future = k > today;
                return (
                  <Pressable
                    key={di}
                    disabled={future}
                    onPress={() => pick(k)}
                    style={{
                      flex: 1,
                      height: 32,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: end ? c.ink : inR ? '#E3ECE9' : 'transparent',
                      borderRadius: end ? 16 : 0,
                      borderWidth: k === today && !end ? 1 : 0,
                      borderColor: c.brass,
                      opacity: future ? 0.3 : 1
                    }}
                  >
                    <Text style={{ color: end ? '#fff' : c.text, fontSize: 13, fontWeight: end ? '700' : '500' }}>{d}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Text style={{ color: c.mute, fontSize: 12, marginTop: 10, textAlign: 'center' }}>
            {OK.test(from) ? (from === to ? from : `${from}  →  ${to}`) : 'Tap a day'}
            {!single && step === 1 && from === to ? '  ·  tap another day to extend' : ''}
          </Text>
        </>
      )}
    </View>
  );
}

export default function AnalyticsTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ dept?: string }>();

  // Department filter state: 'all' | 'hospitality' | 'bar' | 'restaurant'
  const [activeDept, setActiveDept] = useState<'all' | 'hospitality' | 'bar' | 'restaurant'>('all');

  useEffect(() => {
    if (params.dept) {
      const p = params.dept.toLowerCase();
      if (p === 'bar') setActiveDept('bar');
      else if (p === 'restaurant') setActiveDept('restaurant');
      else if (p === 'hospitality') setActiveDept('hospitality');
    }
  }, [params.dept]);

  // Active filter state
  const [activeShortcut, setActiveShortcut] = useState('Today');
  const [from, setFrom] = useState(T);
  const [to, setTo] = useState(T);
  const [fromBillNo, setFromBillNo] = useState('');
  const [toBillNo, setToBillNo] = useState('');
  const [sortOrder, setSortOrder] = useState<'new' | 'old'>('new');

  // Filter Modal & staging state
  const [filterModal, setFilterModal] = useState(false);
  const sheetAnim = useRef(new Animated.Value(600)).current;
  const [tempShortcut, setTempShortcut] = useState('Today');
  const [tempFrom, setTempFrom] = useState(T);
  const [tempTo, setTempTo] = useState(T);
  const [tempFromBill, setTempFromBill] = useState('');
  const [tempToBill, setTempToBill] = useState('');
  const [tempSort, setTempSort] = useState<'new' | 'old'>('new');

  // Calendar sub-modal state
  const [pk, setPk] = useState<'' | 'from' | 'to'>('');

  const shortcuts = useMemo(() => getShortcuts(), []);

  const openFilterModal = () => {
    setTempShortcut(activeShortcut);
    setTempFrom(from);
    setTempTo(to);
    setTempFromBill(fromBillNo);
    setTempToBill(toBillNo);
    setTempSort(sortOrder);
    sheetAnim.setValue(600);
    setFilterModal(true);
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

  const closeFilterModal = () => {
    Animated.timing(sheetAnim, {
      toValue: 600,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web'
    }).start(() => {
      setFilterModal(false);
    });
  };

  const handleApplyFilter = () => {
    setActiveShortcut(tempShortcut);
    setFrom(tempFrom || T);
    setTo(tempTo || T);
    setFromBillNo(tempFromBill.trim());
    setToBillNo(tempToBill.trim());
    setSortOrder(tempSort);
    closeFilterModal();
  };

  const handleClearFilter = () => {
    setActiveShortcut('Today');
    setFrom(T);
    setTo(T);
    setFromBillNo('');
    setToBillNo('');
    setSortOrder('new');
    setTempShortcut('Today');
    setTempFrom(T);
    setTempTo(T);
    setTempFromBill('');
    setTempToBill('');
    setTempSort('new');
    closeFilterModal();
  };

  const ok = OK.test(from) && OK.test(to);

  // Load analytics and bills concurrently
  const { data, err, busy, at, reload } = useLoad(
    async () => {
      const an = ok ? await api.analytics(from, to) : null;
      const bList = await api.bills().catch(() => []);
      return { an, bList };
    },
    [from, to, ok],
    `an:${from}:${to}`
  );

  const s = data?.an?.analytics?.stats ?? data?.an?.stats;
  const bd = data?.an?.analytics?.breakdown;
  const allBills: any[] = data?.bList || [];

  const n = (x: any) => Number(x) || 0;

  // Departmental breakdowns
  const hosp = bd?.hospitality;
  const bar = bd?.bar;
  const rest = bd?.restaurant;

  const hospTotal = n(hosp?.total ?? s?.roomRevenue);
  const hospCash = n(hosp?.cash ?? (s?.totalCashInflow ? Math.max(0, s.totalCashInflow - (bar?.cash || 0) - (rest?.cash || 0)) : 0));
  const hospUpi = n(hosp?.upi ?? (s?.totalUpiInflow ? Math.max(0, s.totalUpiInflow - (bar?.upi || 0) - (rest?.upi || 0)) : 0));
  const hospCard = n(hosp?.card ?? (s?.totalCardInflow ? Math.max(0, s.totalCardInflow - (bar?.card || 0) - (rest?.card || 0)) : 0));
  const hospGst = n(hosp?.gst ?? (s?.gstCollections ? Math.max(0, s.gstCollections - (bar?.tax || 0) - (rest?.tax || 0)) : 0));
  const hospBase = n(hosp?.base ?? Math.max(hospTotal - hospGst, 0));
  const hospCheque = n(hosp?.cheque ?? hosp?.cheque_realized);

  const barTotal = n(bar?.total ?? s?.barRevenue);
  const barCash = n(bar?.cash);
  const barUpi = n(bar?.upi);
  const barCard = n(bar?.card);
  const barGst = n(bar?.tax);
  const barBase = n(bar?.subtotal ?? Math.max(barTotal - barGst, 0));
  const barCount = n(bar?.count ?? allBills.filter(b => b.dept === 'Bar').length);

  const restTotal = n(rest?.total ?? s?.restaurantRevenue);
  const restCash = n(rest?.cash);
  const restUpi = n(rest?.upi);
  const restCard = n(rest?.card);
  const restGst = n(rest?.tax);
  const restBase = n(rest?.subtotal ?? Math.max(restTotal - restGst, 0));
  const restCount = n(rest?.count ?? allBills.filter(b => b.dept === 'Restaurant').length);

  // Filter & sort bills based on user criteria
  const filteredBills = useMemo(() => {
    let list = allBills.filter((b: any) => {
      // Department filter if single department is active
      if (activeDept === 'hospitality' && b.dept !== 'Room') return false;
      if (activeDept === 'bar' && b.dept !== 'Bar') return false;
      if (activeDept === 'restaurant' && b.dept !== 'Restaurant') return false;

      // 1. Date Range Filter
      const bDate = b.created_at ? String(b.created_at).slice(0, 10) : '';
      if (from && bDate && bDate < from) return false;
      if (to && bDate && bDate > to) return false;

      // 2. Bill / Tax No Filter
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

    // 3. Sort Order: New First vs Old First
    list = [...list].sort((x: any, y: any) => {
      const dX = String(x.created_at || '');
      const dY = String(y.created_at || '');
      return sortOrder === 'old' ? dX.localeCompare(dY) : dY.localeCompare(dX);
    });

    return list;
  }, [allBills, from, to, fromBillNo, toBillNo, sortOrder, activeDept]);

  const Box = ({ t, v, sub, ic, solid, col, line, bg }: any) => (
    <View style={{
      flexBasis: '48%',
      flexGrow: 1,
      borderRadius: 16,
      padding: 14,
      backgroundColor: solid || bg || '#fff',
      borderWidth: 1.5,
      borderColor: solid || line || '#E2E8F0',
      minHeight: 110,
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.03,
      shadowRadius: 6,
      elevation: 2
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: solid ? '#fff' : c.ink, fontWeight: '800', fontSize: 11, letterSpacing: 0.5, flexShrink: 1 }}>{t}</Text>
        <View>{ic}</View>
      </View>
      <Text style={{ color: solid ? '#fff' : col, fontWeight: '900', fontSize: 23, marginVertical: 4 }}>{v}</Text>
      <Text style={{ color: solid ? '#E3F2EC' : col, fontWeight: '600', fontSize: 11 }}>{sub}</Text>
    </View>
  );

  // Active filter label for top bar summary
  const getActiveSummary = () => {
    let dateStr = '';
    if (from === to) {
      if (from === T) dateStr = `Today (${formatShort(T)})`;
      else if (from === ago(1)) dateStr = `Yesterday (${formatShort(from)})`;
      else dateStr = `${formatShort(from)} (${dayName(from)})`;
    } else {
      dateStr = `${formatShort(from)} → ${formatShort(to)}`;
    }

    const billStr = fromBillNo || toBillNo ? ` · Bills #${fromBillNo || '1'}–#${toBillNo || '...'}` : '';
    const sortStr = sortOrder === 'old' ? ' · Old First' : '';
    return `${dateStr}${billStr}${sortStr}`;
  };

  const isFiltered = activeShortcut !== 'Today' || from !== T || to !== T || !!fromBillNo || !!toBillNo || sortOrder === 'old';

  // Dynamic Page Title
  const pageTitle = activeDept === 'bar'
    ? 'Bar Analytics'
    : activeDept === 'restaurant'
      ? 'Restaurant Analytics'
      : activeDept === 'hospitality'
        ? 'Hospitality Analytics'
        : 'Analytics';

  return (
    <Screen
      title={pageTitle}
      subtitle={`${from} to ${to}`}
      busy={busy}
      reload={reload}
      at={at}
      err={err}
    >
      {/* ========================================================= */}
      {/* DEPARTMENT SELECTOR TABS                                  */}
      {/* ========================================================= */}
      <View style={styles.deptTabRow}>
        {[
          { id: 'all', label: 'All' },
          { id: 'hospitality', label: 'Hospitality' },
          { id: 'bar', label: 'Bar' },
          { id: 'restaurant', label: 'Restaurant' }
        ].map(item => {
          const active = activeDept === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setActiveDept(item.id as any)}
              style={[styles.deptTabBtn, active && styles.deptTabBtnActive]}
            >
              <Text
                numberOfLines={1}
                style={[styles.deptTabBtnText, active && styles.deptTabBtnTextActive]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ========================================================= */}
      {/* TOP FILTER BAR: Left Summary + Right Filter Button        */}
      {/* ========================================================= */}
      <View style={styles.topFilterBar}>
        <Pressable onPress={openFilterModal} style={styles.activeFilterPill}>
          <CalendarIcon size={15} color={c.ink} />
          <Text style={styles.activeFilterText} numberOfLines={1}>
            {getActiveSummary()}
          </Text>
          {isFiltered && <View style={styles.activeDot} />}
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {isFiltered && (
            <Pressable
              onPress={handleClearFilter}
              style={styles.clearFilterBtn}
            >
              <CloseIcon size={12} color="#E11D48" />
              <Text style={styles.clearFilterBtnText}>Clear</Text>
            </Pressable>
          )}

          <Pressable
            onPress={openFilterModal}
            style={({ pressed }) => [
              styles.filterBtn,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }
            ]}
          >
            <FilterIcon size={16} color="#FFFFFF" />
            <Text style={styles.filterBtnText}>Filter</Text>
          </Pressable>
        </View>
      </View>

      {/* ========================================================= */}
      {/* SECTION 1: HOSPITALITY ANALYTICS                          */}
      {/* ========================================================= */}
      {(activeDept === 'all' || activeDept === 'hospitality') && (
        <View style={styles.deptSection}>
          <View style={styles.sectionHeaderCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.sectionIconBadge, { backgroundColor: '#EFF6FF' }]}>
                <HotelIcon size={18} color="#2563EB" />
              </View>
              <Text style={styles.sectionTitle}>Room Hospitality Analytics</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Box t="TOTAL REALIZATION" v={money(hospTotal)} sub="Room Realized Paid" ic={<PaymentIcon size={16} color="#fff" />} solid="#0E8A5F" />
            <Box t="CASH INFLOW" v={money(hospCash)} sub="Front Desk Cash Drawer" ic={<PaymentIcon size={16} color="#1E8E5A" />} col="#1E8E5A" line="#BFE3CF" bg="#F2FAF6" />
            <Box t="ONLINE UPI" v={money(hospUpi)} sub="QR Code & Online UPI" ic={<CreditCardIcon size={16} color="#4B3FBF" />} col="#4B3FBF" line="#D5D0F5" bg="#F6F5FD" />
            <Box t="CARD POS" v={money(hospCard)} sub="POS Machine Swipes" ic={<CreditCardIcon size={16} color="#1F6FB5" />} col="#1F6FB5" line="#C4DDF2" bg="#F2F7FC" />
            <Box t="GST COLLECTION (5%)" v={money(hospGst)} sub="Hospitality GST" ic={<DocumentIcon size={16} color="#B45309" />} col="#B45309" line="#F3DFA6" bg="#FFFDF5" />
            <Box t="NET BASE REVENUE" v={money(hospBase)} sub="Excluding GST" ic={<HotelIcon size={16} color="#1F3A8A" />} col="#1F3A8A" line="#9DB4E8" bg="#F0F4FA" />
            {hospCheque > 0 && (
              <Box t="CHEQUES REALIZED" v={money(hospCheque)} sub="Passed Cheques" ic={<PaymentIcon size={16} color="#0284C7" />} col="#0284C7" line="#BAE6FD" bg="#F0F9FF" />
            )}
          </View>
        </View>
      )}

      {/* ========================================================= */}
      {/* SECTION 2: BAR ANALYTICS                                  */}
      {/* ========================================================= */}
      {(activeDept === 'all' || activeDept === 'bar') && (
        <View style={styles.deptSection}>
          <View style={styles.sectionHeaderCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.sectionIconBadge, { backgroundColor: '#F5F3FF' }]}>
                <BarIcon size={18} color="#7C3AED" />
              </View>
              <Text style={styles.sectionTitle}>Bar Analytics</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Box t="BAR TOTAL SALES" v={money(barTotal)} sub={`${barCount} Orders Settled`} ic={<BarIcon size={16} color="#fff" />} solid="#6D28D9" />
            <Box t="BAR CASH" v={money(barCash)} sub="Cash Paid" ic={<PaymentIcon size={16} color="#1E8E5A" />} col="#1E8E5A" line="#BFE3CF" bg="#F2FAF6" />
            <Box t="BAR ONLINE UPI" v={money(barUpi)} sub="UPI QR Swipes" ic={<CreditCardIcon size={16} color="#4B3FBF" />} col="#4B3FBF" line="#D5D0F5" bg="#F6F5FD" />
            <Box t="BAR CARD POS" v={money(barCard)} sub="Card Machine" ic={<CreditCardIcon size={16} color="#1F6FB5" />} col="#1F6FB5" line="#C4DDF2" bg="#F2F7FC" />
            <Box t="BAR GST TAX" v={money(barGst)} sub="Liquor / VAT / GST" ic={<DocumentIcon size={16} color="#B45309" />} col="#B45309" line="#F3DFA6" bg="#FFFDF5" />
            <Box t="BAR NET BASE" v={money(barBase)} sub="Net Beverage Revenue" ic={<BarIcon size={16} color="#7C3AED" />} col="#7C3AED" line="#DDD6FE" bg="#FAF5FF" />
          </View>
        </View>
      )}

      {/* ========================================================= */}
      {/* SECTION 3: RESTAURANT ANALYTICS                           */}
      {/* ========================================================= */}
      {(activeDept === 'all' || activeDept === 'restaurant') && (
        <View style={styles.deptSection}>
          <View style={styles.sectionHeaderCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.sectionIconBadge, { backgroundColor: '#FFF1F2' }]}>
                <RestaurantIcon size={18} color="#E11D48" />
              </View>
              <Text style={styles.sectionTitle}>Restaurant Analytics</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Box t="RESTAURANT TOTAL" v={money(restTotal)} sub={`${restCount} Orders Settled`} ic={<RestaurantIcon size={16} color="#fff" />} solid="#BE123C" />
            <Box t="RESTAURANT CASH" v={money(restCash)} sub="Cash Paid" ic={<PaymentIcon size={16} color="#1E8E5A" />} col="#1E8E5A" line="#BFE3CF" bg="#F2FAF6" />
            <Box t="RESTAURANT UPI" v={money(restUpi)} sub="Online UPI" ic={<CreditCardIcon size={16} color="#4B3FBF" />} col="#4B3FBF" line="#D5D0F5" bg="#F6F5FD" />
            <Box t="RESTAURANT CARD" v={money(restCard)} sub="Card Swipes" ic={<CreditCardIcon size={16} color="#1F6FB5" />} col="#1F6FB5" line="#C4DDF2" bg="#F2F7FC" />
            <Box t="RESTAURANT GST" v={money(restGst)} sub="Food GST 5%" ic={<DocumentIcon size={16} color="#B45309" />} col="#B45309" line="#F3DFA6" bg="#FFFDF5" />
            <Box t="RESTAURANT NET BASE" v={money(restBase)} sub="Net Food Revenue" ic={<RestaurantIcon size={16} color="#E11D48" />} col="#E11D48" line="#FECDD3" bg="#FFF1F2" />
          </View>
        </View>
      )}

      {/* ========================================================= */}
      {/* SECTION 4: SETTLED BILLS & INVOICES LIST                  */}
      {/* ========================================================= */}
      <View style={{ marginTop: 8 }}>
        <View style={styles.billsHeaderRow}>
          <Text style={styles.billsHeaderTitle}>
            Settled Bills & Invoices ({filteredBills.length})
          </Text>
          <Text style={styles.billsHeaderSub}>
            {sortOrder === 'new' ? 'Newest first' : 'Oldest first'}
            {(fromBillNo || toBillNo) ? ` · #${fromBillNo || '1'}–#${toBillNo || '...'}` : ''}
          </Text>
        </View>

        {filteredBills.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: 18 }}>
            <Text style={{ color: c.mute, fontSize: 13 }}>
              No settled bills found matching the selected filter criteria.
            </Text>
          </Card>
        ) : (
          filteredBills.map((b: any, idx: number) => {
            const deptColor = b.dept === 'Room' ? '#2563EB' : b.dept === 'Bar' ? '#7C3AED' : '#E11D48';
            return (
              <Pressable
                key={`${b.dept}:${b.id || idx}`}
                onPress={() => router.push({ pathname: '/bill', params: { dept: b.dept, id: String(b.id) } })}
              >
                <Card style={styles.billItemCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.billNumber}>{b.order_number || `#${b.id}`}</Text>
                        <Badge text={b.dept} color={deptColor} />
                      </View>
                      <Text style={styles.billCustomer}>
                        {b.customer_name || 'Walk-in'} {b.room_number ? `· Room ${b.room_number}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.billAmount}>{money(b.total)}</Text>
                      <Badge text={b.payment_mode || 'Settled'} color={c.ok} />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text style={{ color: c.mute, fontSize: 11 }}>{when(b.created_at)}</Text>
                    <Text style={{ color: c.brass, fontSize: 12, fontWeight: '700' }}>Details ➔</Text>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}
      </View>

      {/* ========================================================= */}
      {/* FILTER MODAL: Shortcuts, Date Range, Bill No, Sort Order */}
      {/* ========================================================= */}
      <Modal
        visible={filterModal}
        transparent
        animationType="fade"
        onRequestClose={closeFilterModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.backdropPress} onPress={closeFilterModal} />
          <Animated.View style={[styles.modalSheet, { transform: [{ translateY: sheetAnim }] }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Filter Analytics & Bills</Text>
                <Text style={styles.modalSubtitle}>Shortcuts, date range, invoice numbers & sorting</Text>
              </View>
              <Pressable onPress={closeFilterModal} style={styles.modalCloseBtn} hitSlop={10}>
                <CloseIcon size={18} color={c.mute} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              {/* 1. Filter Shortcuts: Today, Yesterday, 5 Previous Days in ONE ROW */}
              <View style={styles.filterSection}>
                <Text style={styles.sectionLabel}>QUICK SHORTCUTS (1 ROW)</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.shortcutsRow}
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
                        style={[styles.shortcutChip, active && styles.shortcutChipActive]}
                      >
                        <Text style={[styles.shortcutChipText, active && styles.shortcutChipTextActive]}>
                          {s.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 2. Below that: From Date to Date */}
              <View style={styles.filterSection}>
                <Text style={styles.sectionLabel}>FROM DATE  TO  DATE</Text>
                <View style={styles.dateInputsRow}>
                  <View style={styles.dateInputWrap}>
                    <Text style={styles.inputMiniLabel}>From Date</Text>
                    <TextInput
                      value={tempFrom}
                      onChangeText={(t) => { setTempFrom(t); setTempShortcut('Custom'); }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={c.mute}
                      style={styles.dateInput}
                    />
                    <Pressable onPress={() => setPk('from')} style={styles.inputIconBtn} hitSlop={6}>
                      <CalendarIcon size={16} color={c.ink} />
                    </Pressable>
                  </View>

                  <View style={styles.dateInputWrap}>
                    <Text style={styles.inputMiniLabel}>To Date</Text>
                    <TextInput
                      value={tempTo}
                      onChangeText={(t) => { setTempTo(t); setTempShortcut('Custom'); }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={c.mute}
                      style={styles.dateInput}
                    />
                    <Pressable onPress={() => setPk('to')} style={styles.inputIconBtn} hitSlop={6}>
                      <CalendarIcon size={16} color={c.ink} />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* 3. Below that: From "Bill/Tax No" to "Bill/Tax No" */}
              <View style={styles.filterSection}>
                <Text style={styles.sectionLabel}>BILL / TAX INVOICE NO. RANGE</Text>
                <View style={styles.dateInputsRow}>
                  <View style={styles.dateInputWrap}>
                    <Text style={styles.inputMiniLabel}>From Bill/Tax #</Text>
                    <TextInput
                      value={tempFromBill}
                      onChangeText={setTempFromBill}
                      placeholder="e.g. 1001"
                      placeholderTextColor={c.mute}
                      style={styles.dateInput}
                    />
                  </View>

                  <View style={styles.dateInputWrap}>
                    <Text style={styles.inputMiniLabel}>To Bill/Tax #</Text>
                    <TextInput
                      value={tempToBill}
                      onChangeText={setTempToBill}
                      placeholder="e.g. 1050"
                      placeholderTextColor={c.mute}
                      style={styles.dateInput}
                    />
                  </View>
                </View>
              </View>

              {/* 4. Below that: "New First", "Old First" */}
              <View style={styles.filterSection}>
                <Text style={styles.sectionLabel}>SORT ORDER</Text>
                <View style={styles.sortToggleRow}>
                  <Pressable
                    onPress={() => setTempSort('new')}
                    style={[styles.sortBtn, tempSort === 'new' && styles.sortBtnActive]}
                  >
                    <Text style={[styles.sortBtnText, tempSort === 'new' && styles.sortBtnTextActive]}>
                      New First
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setTempSort('old')}
                    style={[styles.sortBtn, tempSort === 'old' && styles.sortBtnActive]}
                  >
                    <Text style={[styles.sortBtnText, tempSort === 'old' && styles.sortBtnTextActive]}>
                      Old First
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.modalFooter}>
              <Pressable onPress={handleClearFilter} style={styles.resetBtn}>
                <Text style={styles.resetBtnText}>Clear Filter</Text>
              </Pressable>

              <Pressable onPress={handleApplyFilter} style={styles.applyBtn}>
                <Text style={styles.applyBtnText}>Apply Filters</Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Calendar Sub-Modal for Date Pickers */}
      <Modal transparent animationType="fade" visible={!!pk} onRequestClose={() => setPk('')}>
        <Pressable style={styles.calendarModalOverlay} onPress={() => setPk('')}>
          <Pressable onPress={() => {}}>
            <RangeCalendar
              single
              from={pk === 'to' ? tempTo : tempFrom}
              to={pk === 'to' ? tempTo : tempFrom}
              onChange={(d) => {
                if (pk === 'from') {
                  setTempFrom(d);
                  if (tempTo && tempTo < d) setTempTo(d);
                } else {
                  setTempTo(d);
                  if (tempFrom && tempFrom > d) setTempFrom(d);
                }
                setTempShortcut('Custom');
                setPk('');
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Department Selector Tabs
  deptTabRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
    width: '100%',
    alignItems: 'center'
  },
  deptTabBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8E6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  deptTabBtnActive: {
    backgroundColor: '#0F2A2E',
    borderColor: '#0F2A2E'
  },
  deptTabBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: c.mute,
    textAlign: 'center'
  },
  deptTabBtnTextActive: {
    color: '#FFFFFF'
  },

  // Top Filter Bar
  topFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4
  },
  activeFilterPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8E6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1
  },
  activeFilterText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: c.ink,
    marginLeft: 6,
    flex: 1
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: c.brass,
    marginLeft: 4
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F2A2E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2
  },
  filterBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800'
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  clearFilterBtnText: {
    color: '#E11D48',
    fontSize: 12.5,
    fontWeight: '800'
  },

  // Department Section
  deptSection: {
    gap: 8,
    marginTop: 4
  },
  sectionHeaderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8E6'
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: c.ink
  },
  sectionSubtitle: {
    fontSize: 10.5,
    color: c.mute,
    marginTop: 1
  },

  // Filter Modal
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

  // Quick Shortcuts Row (1 Row)
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

  // Date Inputs Row
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
    paddingBottom: 4,
    position: 'relative'
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
    paddingVertical: 4,
    paddingRight: 24
  },
  inputIconBtn: {
    position: 'absolute',
    right: 8,
    top: 14,
    padding: 4
  },

  // Sort Order Toggle
  sortToggleRow: {
    flexDirection: 'row',
    gap: 10
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

  // Modal Footer
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
  },

  // Calendar Modal Overlay
  calendarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
    } : {})
  },

  // Settled Bills List Section
  billsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
    marginTop: 8
  },
  billsHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: c.ink
  },
  billsHeaderSub: {
    fontSize: 11,
    color: c.mute,
    fontWeight: '600',
    marginTop: 1
  },
  billItemCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 2
  },
  billNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: c.ink
  },
  billCustomer: {
    fontSize: 12,
    color: c.mute,
    marginTop: 2
  },
  billAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: c.ink
  }
});
