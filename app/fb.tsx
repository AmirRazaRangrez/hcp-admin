import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Modal,
  FlatList,
  Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { Screen, Card, Badge, useLoad } from '../src/lib/ui';
import { c, money, when } from '../src/lib/theme';
import {
  RestaurantIcon,
  BarIcon,
  SearchIcon,
  CloseIcon,
  HotelIcon,
  ClockIcon,
  UserIcon,
  CreditCardIcon
} from '../src/lib/icons';

type DeptType = 'restaurant' | 'bar';
type ViewMode = 'tables' | 'settled' | 'all';

export default function FBScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialDept: DeptType = params.dept === 'bar' ? 'bar' : 'restaurant';

  const [activeDept, setActiveDept] = useState<DeptType>(initialDept);
  const [viewMode, setViewMode] = useState<ViewMode>('tables');
  const [search, setSearch] = useState('');
  
  // Selected Table Modal State
  const [selectedTable, setSelectedTable] = useState<any>(null);
  // Selected Bill Modal State
  const [selectedBill, setSelectedBill] = useState<any>(null);

  // Poll live F&B state every 6s
  const { data: fbState, busy, reload } = useLoad(
    () => api.fbState(activeDept),
    [activeDept],
    'fb_state_' + activeDept,
    6000
  );

  // Pull orders list for settled/all views
  const { data: fbOrdersList, busy: ordersBusy, reload: reloadOrders } = useLoad(
    () => api.fbOrders(activeDept, viewMode === 'settled' ? 'settled' : 'all'),
    [activeDept, viewMode],
    'fb_orders_' + activeDept + '_' + viewMode,
    8000
  );

  // Department Tables
  const tables = useMemo(() => {
    const list = activeDept === 'bar' ? (fbState?.barTables || []) : (fbState?.restaurantTables || []);
    if (!search.trim()) return list;
    const q = search.toLowerCase().trim();
    return list.filter((t: any) =>
      String(t.table_number || '').toLowerCase().includes(q) ||
      String(t.table_type || '').toLowerCase().includes(q) ||
      String(t.waiter_name || '').toLowerCase().includes(q) ||
      String(t.status || '').toLowerCase().includes(q)
    );
  }, [fbState, activeDept, search]);

  // KPI Metrics
  const kpis = useMemo(() => {
    const all = activeDept === 'bar' ? (fbState?.barTables || []) : (fbState?.restaurantTables || []);
    const occupied = all.filter((t: any) => t.is_occupied || t.status === 'in_process' || t.status === 'occupied' || t.status === 'billed');
    const available = all.filter((t: any) => !t.is_occupied && t.status !== 'occupied' && t.status !== 'in_process' && t.status !== 'billed');
    const runningTotal = occupied.reduce((sum: number, t: any) => sum + (Number(t.running_total) || 0), 0);
    return {
      total: all.length,
      occupiedCount: occupied.length,
      availableCount: available.length,
      runningTotal
    };
  }, [fbState, activeDept]);

  // Filtered Orders / Bills
  const bills = useMemo(() => {
    const source = Array.isArray(fbOrdersList) && fbOrdersList.length > 0
      ? fbOrdersList
      : (activeDept === 'bar' ? (fbState?.barOrders || []) : (fbState?.restaurantOrders || []));

    let filtered = source;
    if (viewMode === 'settled') {
      filtered = filtered.filter((b: any) => b.is_settled || b.is_paid === 1 || String(b.status).toLowerCase() === 'completed' || String(b.status).toLowerCase() === 'settled');
    }

    if (!search.trim()) return filtered;
    const q = search.toLowerCase().trim();
    return filtered.filter((b: any) =>
      String(b.order_number || b.bill_no || '').toLowerCase().includes(q) ||
      String(b.table_number || '').toLowerCase().includes(q) ||
      String(b.customer_name || '').toLowerCase().includes(q) ||
      String(b.customer_phone || '').toLowerCase().includes(q) ||
      String(b.room_number || '').toLowerCase().includes(q) ||
      String(b.payment_mode || '').toLowerCase().includes(q)
    );
  }, [fbOrdersList, fbState, activeDept, viewMode, search]);

  const settledKpis = useMemo(() => {
    const sum = bills.reduce((acc: number, b: any) => acc + (Number(b.grand_total || b.total || b.total_amount) || 0), 0);
    return { count: bills.length, totalAmount: sum };
  }, [bills]);

  return (
    <Screen
      title="F&B Operations"
      subtitle="Live Tables, Running KOTs & Settled Bills"
      back={true}
      busy={busy || ordersBusy}
      reload={() => { reload(); reloadOrders(); }}
    >
      {/* 1. Department Tabs: Restaurant & Bar */}
      <View style={styles.deptTabRow}>
        <Pressable
          onPress={() => { setActiveDept('restaurant'); setSearch(''); }}
          style={[styles.deptTab, activeDept === 'restaurant' && styles.deptTabActive]}
        >
          <View style={[styles.deptTabIconWrap, activeDept === 'restaurant' && styles.deptTabIconWrapActive]}>
            <RestaurantIcon size={16} color={activeDept === 'restaurant' ? '#FFFFFF' : '#6B7280'} />
          </View>
          <Text style={[styles.deptTabText, activeDept === 'restaurant' && styles.deptTabTextActive]}>
            Restaurant
          </Text>
          {fbState?.restaurantTables ? (
            <View style={[styles.deptBadge, activeDept === 'restaurant' && styles.deptBadgeActive]}>
              <Text style={[styles.deptBadgeText, activeDept === 'restaurant' && styles.deptBadgeTextActive]}>
                {fbState.restaurantTables.filter((t: any) => t.is_occupied).length} Live
              </Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          onPress={() => { setActiveDept('bar'); setSearch(''); }}
          style={[styles.deptTab, activeDept === 'bar' && styles.deptTabActive]}
        >
          <View style={[styles.deptTabIconWrap, activeDept === 'bar' && styles.deptTabIconWrapActive]}>
            <BarIcon size={16} color={activeDept === 'bar' ? '#FFFFFF' : '#6B7280'} />
          </View>
          <Text style={[styles.deptTabText, activeDept === 'bar' && styles.deptTabTextActive]}>
            Bar Lounge
          </Text>
          {fbState?.barTables ? (
            <View style={[styles.deptBadge, activeDept === 'bar' && styles.deptBadgeActive]}>
              <Text style={[styles.deptBadgeText, activeDept === 'bar' && styles.deptBadgeTextActive]}>
                {fbState.barTables.filter((t: any) => t.is_occupied).length} Live
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* 2. Sub-views Switcher: Live Tables | Settled Bills | All Bills */}
      <View style={styles.viewModeRow}>
        <Pressable
          onPress={() => setViewMode('tables')}
          style={[styles.viewModeBtn, viewMode === 'tables' && styles.viewModeBtnActive]}
        >
          <Text style={[styles.viewModeText, viewMode === 'tables' && styles.viewModeTextActive]}>
            Live Tables
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setViewMode('settled')}
          style={[styles.viewModeBtn, viewMode === 'settled' && styles.viewModeBtnActive]}
        >
          <Text style={[styles.viewModeText, viewMode === 'settled' && styles.viewModeTextActive]}>
            Settled Bills
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setViewMode('all')}
          style={[styles.viewModeBtn, viewMode === 'all' && styles.viewModeBtnActive]}
        >
          <Text style={[styles.viewModeText, viewMode === 'all' && styles.viewModeTextActive]}>
            All Bills
          </Text>
        </Pressable>
      </View>

      {/* 3. Search Bar */}
      <View style={styles.searchBar}>
        <SearchIcon size={16} color="#9CA3AF" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={viewMode === 'tables' ? "Search table (e.g. 'T-1', 'Lounge')..." : "Search bill #, guest, room, mode..."}
          placeholderTextColor="#9CA3AF"
          style={styles.searchInput}
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} style={styles.clearBtn}>
            <CloseIcon size={14} color="#6B7280" />
          </Pressable>
        )}
      </View>

      {/* 4. CONTENT AREA */}
      {viewMode === 'tables' ? (
        /* LIVE TABLES VIEW */
        <View style={{ gap: 10 }}>
          {/* KPI Strip */}
          <View style={styles.kpiStrip}>
            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>TOTAL</Text>
              <Text style={styles.kpiValue}>{kpis.total}</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>ACTIVE / OCCUPIED</Text>
              <Text style={[styles.kpiValue, { color: '#D97706' }]}>{kpis.occupiedCount}</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>RUNNING TOTAL</Text>
              <Text style={[styles.kpiValue, { color: '#0F2A2E' }]}>{money(kpis.runningTotal)}</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>AVAILABLE</Text>
              <Text style={[styles.kpiValue, { color: '#16A34A' }]}>{kpis.availableCount}</Text>
            </View>
          </View>

          {/* Tables Grid */}
          {tables.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No tables found</Text>
              <Text style={styles.emptySub}>No tables match the current filter or department.</Text>
            </View>
          ) : (
            <View style={styles.tablesGrid}>
              {tables.map((t: any) => {
                const isOcc = t.is_occupied || t.status === 'in_process' || t.status === 'occupied' || t.status === 'billed';
                const isBilled = t.status === 'billed';
                const statusColor = isBilled ? '#2563EB' : isOcc ? '#D97706' : '#16A34A';
                const statusBg = isBilled ? '#EFF6FF' : isOcc ? '#FFFBEB' : '#F0FDF4';
                const statusLabel = isBilled ? 'BILLED' : isOcc ? 'OCCUPIED' : 'AVAILABLE';

                return (
                  <Pressable
                    key={t.id || t.table_number}
                    onPress={() => setSelectedTable(t)}
                    style={({ pressed }) => [
                      styles.tableCard,
                      isOcc && styles.tableCardOccupied,
                      pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }
                    ]}
                  >
                    <View style={styles.tableCardHeader}>
                      <Text style={styles.tableNumberText}>{t.table_number}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusBg, borderColor: statusColor }]}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    </View>

                    <View style={styles.tableMetaRow}>
                      <Text style={styles.tableTypeBadge}>{String(t.table_type || 'table').toUpperCase()}</Text>
                      {t.capacity ? <Text style={styles.tableCapacity}>👥 {t.capacity} Seats</Text> : null}
                    </View>

                    {isOcc ? (
                      <View style={styles.tableOccupiedInfo}>
                        <View style={styles.runningRow}>
                          <Text style={styles.itemCountText}>
                            {t.items_count || (t.active_cart || []).length} items
                          </Text>
                          <Text style={styles.runningTotalText}>{money(t.running_total || 0)}</Text>
                        </View>
                        {t.waiter_name ? (
                          <Text style={styles.waiterText} numberOfLines={1}>
                            👤 {t.waiter_name}
                          </Text>
                        ) : null}
                        {t.room_id ? (
                          <Text style={styles.roomTag} numberOfLines={1}>
                            🏨 Room Linked
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <View style={styles.tableAvailInfo}>
                        <Text style={styles.availText}>Ready for guests</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : (
        /* SETTLED / ALL BILLS VIEW */
        <View style={{ gap: 10 }}>
          {/* Summary Strip */}
          <View style={styles.billsSummaryStrip}>
            <Text style={styles.billsSummaryText}>
              Showing <Text style={{ fontWeight: '800', color: '#0F2A2E' }}>{settledKpis.count}</Text> {viewMode === 'settled' ? 'Settled' : ''} Bills
            </Text>
            <Text style={styles.billsSummaryTotal}>
              Total: <Text style={{ fontWeight: '900', color: '#0F2A2E' }}>{money(settledKpis.totalAmount)}</Text>
            </Text>
          </View>

          {/* Bills List */}
          {bills.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No bills found</Text>
              <Text style={styles.emptySub}>No bills match the search criteria.</Text>
            </View>
          ) : (
            bills.map((b: any) => {
              const total = Number(b.grand_total || b.total || b.total_amount || 0);
              const isSettled = b.is_settled || b.is_paid === 1 || String(b.status).toLowerCase() === 'completed' || String(b.status).toLowerCase() === 'settled';
              const isRoomFolio = String(b.payment_mode || '').toLowerCase().includes('room') || Boolean(b.room_id);
              const badgeColor = isSettled ? '#16A34A' : '#DC2626';

              return (
                <Pressable
                  key={b.id || b.order_number}
                  onPress={() => setSelectedBill(b)}
                  style={({ pressed }) => [
                    styles.billCard,
                    pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }
                  ]}
                >
                  <View style={styles.billCardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.billOrderRow}>
                        <Text style={styles.billOrderNumber}>{b.order_number || b.bill_no || `ORD-${b.id}`}</Text>
                        {b.token_number ? (
                          <View style={styles.tokenBadge}>
                            <Text style={styles.tokenText}>Token #{b.token_number}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.billTimeText}>{when(b.created_at)}</Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.billTotalText}>{money(total)}</Text>
                      <View style={[styles.settledBadge, { borderColor: badgeColor, backgroundColor: isSettled ? '#F0FDF4' : '#FEF2F2' }]}>
                        <Text style={[styles.settledBadgeText, { color: badgeColor }]}>
                          {isSettled ? 'PAID / SETTLED' : 'PENDING'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.billDivider} />

                  <View style={styles.billCardBottom}>
                    <View style={styles.billTableGuest}>
                      <Text style={styles.billTableBadge}>
                        {b.table_number || (b.room_number ? `Room ${b.room_number}` : 'Counter/Takeaway')}
                      </Text>
                      {b.customer_name ? (
                        <Text style={styles.billGuestName} numberOfLines={1}>
                          · {b.customer_name}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.billModeWrap}>
                      {isRoomFolio ? (
                        <View style={styles.roomFolioTag}>
                          <HotelIcon size={12} color="#0D9488" />
                          <Text style={styles.roomFolioText}>ROOM FOLIO</Text>
                        </View>
                      ) : null}
                      <Text style={styles.billModeText}>{b.payment_mode || 'Cash'}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      )}

      {/* ================= MODAL 1: TABLE ORDER DETAILS ================= */}
      <Modal
        visible={!!selectedTable}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedTable(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.modalTitle}>Table {selectedTable?.table_number}</Text>
                  <View style={[
                    styles.modalStatusBadge,
                    { backgroundColor: selectedTable?.is_occupied ? '#FFFBEB' : '#F0FDF4' }
                  ]}>
                    <Text style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: selectedTable?.is_occupied ? '#D97706' : '#16A34A'
                    }}>
                      {selectedTable?.is_occupied ? 'OCCUPIED' : 'AVAILABLE'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.modalSub}>
                  {activeDept === 'bar' ? 'Bar Lounge' : 'Restaurant'} · Type: {selectedTable?.table_type || 'Dine In'}
                </Text>
              </View>

              <Pressable onPress={() => setSelectedTable(null)} style={styles.modalCloseBtn}>
                <CloseIcon size={18} color="#0F2A2E" />
              </Pressable>
            </View>

            {/* Modal Scrollable Body */}
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Table Info Bar */}
              <View style={styles.tableInfoBar}>
                <View style={styles.infoCol}>
                  <Text style={styles.infoColLabel}>WAITER</Text>
                  <Text style={styles.infoColVal}>{selectedTable?.waiter_name || 'Front Staff'}</Text>
                </View>
                {selectedTable?.order_started_at ? (
                  <View style={styles.infoCol}>
                    <Text style={styles.infoColLabel}>STARTED AT</Text>
                    <Text style={styles.infoColVal}>{when(selectedTable.order_started_at)}</Text>
                  </View>
                ) : null}
                {selectedTable?.room_id ? (
                  <View style={styles.infoCol}>
                    <Text style={styles.infoColLabel}>ROOM CHARGE</Text>
                    <Text style={[styles.infoColVal, { color: '#0D9488' }]}>Linked to Room</Text>
                  </View>
                ) : null}
              </View>

              {/* Special Notes if any */}
              {selectedTable?.special_notes ? (
                <View style={styles.notesBox}>
                  <Text style={styles.notesLabel}>Kitchen Notes:</Text>
                  <Text style={styles.notesText}>{selectedTable.special_notes}</Text>
                </View>
              ) : null}

              {/* Order Cart Items */}
              <Text style={styles.sectionHeaderTitle}>
                Ordered Items ({selectedTable?.active_cart?.length || 0})
              </Text>

              {(!selectedTable?.active_cart || selectedTable.active_cart.length === 0) ? (
                <View style={styles.noItemsBox}>
                  <Text style={styles.noItemsText}>No active items currently added to this table.</Text>
                </View>
              ) : (
                <View style={styles.cartItemsTable}>
                  <View style={styles.cartTableHeader}>
                    <Text style={[styles.thText, { flex: 2 }]}>ITEM</Text>
                    <Text style={[styles.thText, { width: 45, textAlign: 'center' }]}>QTY</Text>
                    <Text style={[styles.thText, { width: 75, textAlign: 'right' }]}>RATE</Text>
                    <Text style={[styles.thText, { width: 85, textAlign: 'right' }]}>TOTAL</Text>
                  </View>

                  {selectedTable.active_cart.map((it: any, idx: number) => {
                    const qty = Number(it.quantity || it.qty || 1);
                    const rate = Number(it.price || it.rate || 0);
                    const lineTotal = qty * rate;

                    return (
                      <View key={it.id || idx} style={styles.cartTableRow}>
                        <View style={{ flex: 2 }}>
                          <Text style={styles.itNameText}>{it.name || it.item_name || 'Item'}</Text>
                          {it.portion ? <Text style={styles.itPortionText}>{it.portion}</Text> : null}
                          {it.notes ? <Text style={styles.itNotesText}>• {it.notes}</Text> : null}
                        </View>
                        <Text style={[styles.tdText, { width: 45, textAlign: 'center', fontWeight: '700' }]}>{qty}</Text>
                        <Text style={[styles.tdText, { width: 75, textAlign: 'right' }]}>{money(rate)}</Text>
                        <Text style={[styles.tdText, { width: 85, textAlign: 'right', fontWeight: '800', color: '#0F2A2E' }]}>
                          {money(lineTotal)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Table Financial Breakdown */}
              <View style={styles.modalFinanceCard}>
                <View style={styles.financeLine}>
                  <Text style={styles.financeLineLabel}>Subtotal</Text>
                  <Text style={styles.financeLineVal}>{money(selectedTable?.running_total || 0)}</Text>
                </View>
                <View style={styles.financeLine}>
                  <Text style={styles.financeLineLabel}>Estimated Taxes (5% GST)</Text>
                  <Text style={styles.financeLineVal}>{money(Math.round((selectedTable?.running_total || 0) * 0.05))}</Text>
                </View>
                <View style={styles.financeDivider} />
                <View style={styles.financeLine}>
                  <Text style={styles.financeTotalLabel}>Running Grand Total</Text>
                  <Text style={styles.financeTotalVal}>
                    {money(Math.round((selectedTable?.running_total || 0) * 1.05))}
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Modal Bottom Action */}
            <View style={styles.modalFooter}>
              <Pressable onPress={() => setSelectedTable(null)} style={styles.modalDismissBtn}>
                <Text style={styles.modalDismissText}>Close Details</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 2: ITEMIZED RECEIPT (BILL) ================= */}
      <Modal
        visible={!!selectedBill}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedBill(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {selectedBill?.order_number || selectedBill?.bill_no || `Bill #${selectedBill?.id}`}
                </Text>
                <Text style={styles.modalSub}>
                  {selectedBill?.dept || (activeDept === 'bar' ? 'Bar Lounge' : 'Restaurant')} · {when(selectedBill?.created_at)}
                </Text>
              </View>

              <Pressable onPress={() => setSelectedBill(null)} style={styles.modalCloseBtn}>
                <CloseIcon size={18} color="#0F2A2E" />
              </Pressable>
            </View>

            {/* Modal Scrollable Body */}
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Receipt Top Info */}
              <View style={styles.receiptHeaderBox}>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaKey}>Table / Location:</Text>
                  <Text style={styles.receiptMetaVal}>{selectedBill?.table_number || (selectedBill?.room_number ? `Room ${selectedBill.room_number}` : 'Walk-in')}</Text>
                </View>
                {selectedBill?.token_number ? (
                  <View style={styles.receiptMetaRow}>
                    <Text style={styles.receiptMetaKey}>Daily Token:</Text>
                    <Text style={[styles.receiptMetaVal, { fontWeight: '800' }]}>#{selectedBill.token_number}</Text>
                  </View>
                ) : null}
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaKey}>Guest Name:</Text>
                  <Text style={styles.receiptMetaVal}>{selectedBill?.customer_name || 'Walk-in Guest'}</Text>
                </View>
                {selectedBill?.customer_phone ? (
                  <View style={styles.receiptMetaRow}>
                    <Text style={styles.receiptMetaKey}>Guest Phone:</Text>
                    <Text style={styles.receiptMetaVal}>{selectedBill.customer_phone}</Text>
                  </View>
                ) : null}
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaKey}>Payment Mode:</Text>
                  <Text style={[styles.receiptMetaVal, { fontWeight: '700', color: '#0F2A2E' }]}>
                    {selectedBill?.payment_mode || 'Cash'}
                  </Text>
                </View>
                {selectedBill?.settled_by || selectedBill?.waiter_name ? (
                  <View style={styles.receiptMetaRow}>
                    <Text style={styles.receiptMetaKey}>Settled / Cashier:</Text>
                    <Text style={styles.receiptMetaVal}>{selectedBill?.settled_by || selectedBill?.waiter_name || 'Front Desk Staff'}</Text>
                  </View>
                ) : null}
              </View>

              {/* Items List */}
              <Text style={styles.sectionHeaderTitle}>
                Billed Items ({selectedBill?.items?.length || 0})
              </Text>

              {(!selectedBill?.items || selectedBill.items.length === 0) ? (
                <View style={styles.noItemsBox}>
                  <Text style={styles.noItemsText}>Itemized breakdown not available for this record.</Text>
                </View>
              ) : (
                <View style={styles.cartItemsTable}>
                  <View style={styles.cartTableHeader}>
                    <Text style={[styles.thText, { flex: 2 }]}>ITEM</Text>
                    <Text style={[styles.thText, { width: 45, textAlign: 'center' }]}>QTY</Text>
                    <Text style={[styles.thText, { width: 75, textAlign: 'right' }]}>RATE</Text>
                    <Text style={[styles.thText, { width: 85, textAlign: 'right' }]}>TOTAL</Text>
                  </View>

                  {selectedBill.items.map((it: any, idx: number) => {
                    const qty = Number(it.quantity || it.qty || 1);
                    const rate = Number(it.price || it.rate || 0);
                    const lineTotal = Number(it.total) || (qty * rate);

                    return (
                      <View key={it.id || idx} style={styles.cartTableRow}>
                        <View style={{ flex: 2 }}>
                          <Text style={styles.itNameText}>{it.name || it.item_name || 'Item'}</Text>
                          {it.portion ? <Text style={styles.itPortionText}>{it.portion}</Text> : null}
                        </View>
                        <Text style={[styles.tdText, { width: 45, textAlign: 'center', fontWeight: '700' }]}>{qty}</Text>
                        <Text style={[styles.tdText, { width: 75, textAlign: 'right' }]}>{money(rate)}</Text>
                        <Text style={[styles.tdText, { width: 85, textAlign: 'right', fontWeight: '800', color: '#0F2A2E' }]}>
                          {money(lineTotal)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Bill Financial Summary */}
              <View style={styles.modalFinanceCard}>
                <View style={styles.financeLine}>
                  <Text style={styles.financeLineLabel}>Subtotal</Text>
                  <Text style={styles.financeLineVal}>
                    {money(selectedBill?.subtotal || selectedBill?.grand_total || selectedBill?.total || 0)}
                  </Text>
                </View>
                {selectedBill?.cgst ? (
                  <View style={styles.financeLine}>
                    <Text style={styles.financeLineLabel}>CGST (2.5%)</Text>
                    <Text style={styles.financeLineVal}>{money(selectedBill.cgst)}</Text>
                  </View>
                ) : null}
                {selectedBill?.sgst ? (
                  <View style={styles.financeLine}>
                    <Text style={styles.financeLineLabel}>SGST (2.5%)</Text>
                    <Text style={styles.financeLineVal}>{money(selectedBill.sgst)}</Text>
                  </View>
                ) : null}
                {Number(selectedBill?.discount || selectedBill?.discount_amount) > 0 ? (
                  <View style={styles.financeLine}>
                    <Text style={[styles.financeLineLabel, { color: '#DC2626' }]}>Discount</Text>
                    <Text style={[styles.financeLineVal, { color: '#DC2626' }]}>
                      - {money(selectedBill.discount || selectedBill.discount_amount)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.financeDivider} />
                <View style={styles.financeLine}>
                  <Text style={styles.financeTotalLabel}>Grand Total Settled</Text>
                  <Text style={styles.financeTotalVal}>
                    {money(selectedBill?.grand_total || selectedBill?.total || selectedBill?.total_amount || 0)}
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Modal Bottom Action */}
            <View style={styles.modalFooter}>
              <Pressable onPress={() => setSelectedBill(null)} style={styles.modalDismissBtn}>
                <Text style={styles.modalDismissText}>Close Receipt</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  deptTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
    marginBottom: 4
  },
  deptTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1.5
  },
  deptTabActive: {
    backgroundColor: '#0F2A2E',
    borderColor: '#0F2A2E'
  },
  deptTabIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  deptTabIconWrapActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)'
  },
  deptTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151'
  },
  deptTabTextActive: {
    color: '#FFFFFF'
  },
  deptBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  deptBadgeActive: {
    backgroundColor: 'rgba(199, 154, 75, 0.3)'
  },
  deptBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280'
  },
  deptBadgeTextActive: {
    color: '#F9DF9C'
  },
  viewModeRow: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    padding: 3,
    gap: 3,
    marginBottom: 4
  },
  viewModeBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8
  },
  viewModeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2
  },
  viewModeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280'
  },
  viewModeTextActive: {
    fontWeight: '800',
    color: '#0F2A2E'
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
    marginBottom: 6
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    paddingVertical: 0
  },
  clearBtn: {
    padding: 4
  },
  kpiStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1
  },
  kpiCol: {
    flex: 1,
    alignItems: 'center'
  },
  kpiDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB'
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.3,
    marginBottom: 2
  },
  kpiValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827'
  },
  tablesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  tableCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 90,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1.5
  },
  tableCardOccupied: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFDF9'
  },
  tableCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  tableNumberText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F2A2E'
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5
  },
  statusText: {
    fontSize: 9.5,
    fontWeight: '800'
  },
  tableMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4
  },
  tableTypeBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280'
  },
  tableCapacity: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF'
  },
  tableOccupiedInfo: {
    backgroundColor: '#FEF3C7',
    padding: 6,
    borderRadius: 8,
    gap: 2
  },
  runningRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  itemCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E'
  },
  runningTotalText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#92400E'
  },
  waiterText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#B45309'
  },
  roomTag: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0F766E'
  },
  tableAvailInfo: {
    paddingVertical: 4
  },
  availText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16A34A'
  },
  billsSummaryStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2
  },
  billsSummaryText: {
    fontSize: 12,
    color: '#6B7280'
  },
  billsSummaryTotal: {
    fontSize: 12,
    color: '#6B7280'
  },
  billCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1.5,
    gap: 8
  },
  billCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  billOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  billOrderNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F2A2E'
  },
  tokenBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5
  },
  tokenText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E'
  },
  billTimeText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2
  },
  billTotalText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F2A2E'
  },
  settledBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 3
  },
  settledBadgeText: {
    fontSize: 9,
    fontWeight: '800'
  },
  billDivider: {
    height: 1,
    backgroundColor: '#F3F4F6'
  },
  billCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  billTableGuest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1
  },
  billTableBadge: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#374151',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5
  },
  billGuestName: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6B7280',
    flex: 1
  },
  billModeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  roomFolioTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4
  },
  roomFolioText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0F766E'
  },
  billModeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563'
  },
  emptyWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4
  },
  emptySub: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center'
  },

  /* MODAL STYLES */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end'
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    minHeight: '40%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F2A2E'
  },
  modalSub: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 2
  },
  modalStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingTop: 12
  },
  tableInfoBar: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6'
  },
  infoCol: {
    flex: 1
  },
  infoColLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.3
  },
  infoColVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2
  },
  notesBox: {
    backgroundColor: '#FFFBEB',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E'
  },
  notesText: {
    fontSize: 12,
    color: '#78350F',
    marginTop: 2
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
    marginBottom: 8,
    letterSpacing: 0.2
  },
  cartItemsTable: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14
  },
  cartTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  thText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280'
  },
  cartTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  tdText: {
    fontSize: 12,
    color: '#374151'
  },
  itNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827'
  },
  itPortionText: {
    fontSize: 10,
    color: '#6B7280'
  },
  itNotesText: {
    fontSize: 10,
    color: '#D97706',
    fontStyle: 'italic'
  },
  noItemsBox: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12
  },
  noItemsText: {
    fontSize: 12,
    color: '#9CA3AF'
  },
  modalFinanceCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
    marginBottom: 20
  },
  financeLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  financeLineLabel: {
    fontSize: 12,
    color: '#64748B'
  },
  financeLineVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B'
  },
  financeDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4
  },
  financeTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F2A2E'
  },
  financeTotalVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F2A2E'
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB'
  },
  modalDismissBtn: {
    backgroundColor: '#0F2A2E',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalDismissText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800'
  },
  receiptHeaderBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  receiptMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  receiptMetaKey: {
    fontSize: 11,
    color: '#6B7280'
  },
  receiptMetaVal: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#111827'
  }
});
