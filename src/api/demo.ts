// Built-in SAMPLE data for the web/demo build. Nothing here is real hotel data.
import {money} from '../lib/theme';

const pad = (n: number) => String(n).padStart(2, '0');
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const dayKey = (iso: string) => iso.slice(0, 10);
const NOW = new Date();
function at(daysAgo: number, h: number, m: number) {
  const d = new Date(NOW); d.setDate(d.getDate() - daysAgo);
  if (daysAgo === 0 && h >= NOW.getHours()) h = Math.max(0, NOW.getHours() - 1);
  d.setHours(h, m, 0, 0); return local(d);
}
// small stable pseudo-random so the demo looks the same every time it loads
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const FOOD: [string, number][] = [['Paneer Butter Masala', 280], ['Butter Naan', 60], ['Dal Tadka', 220], ['Veg Biryani', 260], ['Masala Dosa', 140], ['Fresh Lime Soda', 70], ['Gulab Jamun', 90], ['Chicken Curry', 340], ['Jeera Rice', 150], ['Tandoori Roti', 30]];
const DRINK: [string, number][] = [['Kingfisher Beer', 220], ['Old Monk Rum (90ml)', 180], ['Whisky & Soda', 320], ['Mojito', 350], ['Masala Peanuts', 120], ['Cold Drink', 60]];
const NAMES = ['Rahul Mehta', 'Sneha Kulkarni', 'Amit Deshmukh', 'Priya Nair', 'Vikram Singh', 'Anjali Joshi', 'Rohan Patil', 'Kavita Sharma', 'Imran Shaikh', 'Neha Gupta', 'Suresh Rao', 'Pooja Bansal'];
const MODES = ['cash', 'card', 'online'];

type Bill = any;
function fnbBill(dept: 'Restaurant' | 'Bar', id: number, created: string): Bill {
  const src = dept === 'Bar' ? DRINK : FOOD;
  const n = 2 + Math.floor(rnd() * 3);
  const lines = Array.from({length: n}, () => { const [name, price] = pick(src); return {name, qty: 1 + Math.floor(rnd() * 3), price}; });
  const subtotal = lines.reduce((t, l) => t + l.price * l.qty, 0);
  const discount = id % 6 === 0 ? Math.round(subtotal * 0.1) : 0;
  const tax = Math.round((subtotal - discount) * (dept === 'Bar' ? 0.18 : 0.05));
  const total = subtotal - discount + tax;
  const walkin = rnd() > 0.45;
  return {id, dept, order_number: `${dept === 'Bar' ? 'BAR' : 'RES'}-${1000 + id}`, customer_name: walkin ? '' : pick(NAMES),
    subtotal, discount, tax, total, items_json: JSON.stringify(lines), payment_mode: pick(MODES), is_paid: rnd() > 0.08 ? 1 : 0,
    created_at: created, settled_by: pick(['Ramesh', 'Amit', 'Ajay']), room_number: ''};
}
function roomBill(id: number, outDaysAgo: number, nights: number, room: string): Bill {
  const rate = pick([2200, 2800, 3500, 4200]);
  const roomCharge = rate * nights, food = Math.round(rnd() * 1800), bar = rnd() > 0.5 ? Math.round(rnd() * 1500) : 0;
  const discount = id % 3 === 0 ? 500 : 0;
  const gst = Math.round(roomCharge * 0.12);
  const total = roomCharge + food + bar + gst - discount;
  const lines = [{name: `Room charges (${nights} night${nights > 1 ? 's' : ''})`, qty: 1, price: roomCharge}, {name: 'GST on room', qty: 1, price: gst}, ...(food ? [{name: 'Restaurant (room)', qty: 1, price: food}] : []), ...(bar ? [{name: 'Bar (room)', qty: 1, price: bar}] : [])];
  return {id, dept: 'Room', order_number: `R-${200 + id}`, customer_name: pick(NAMES), room_number: room, nights, subtotal: total + discount, discount, tax: gst, total,
    items_json: JSON.stringify(lines), payment_mode: pick(['Cash', 'Card', 'Online', 'Cash + Card']), is_paid: 1, created_at: at(outDaysAgo, 11, 15 + id % 40),
    checkin_at: at(outDaysAgo + nights, 14, 10 + id % 40), settled_by: 'Front Desk'};
}

function build() {
  seed = 7;
  const bills: Bill[] = []; let fid = 1;
  for (let d = 0; d < 7; d++) {
    for (let i = 0; i < 4; i++) bills.push(fnbBill('Restaurant', fid++, at(d, 9 + i * 3, 5 + i * 11)));
    for (let i = 0; i < 2; i++) bills.push(fnbBill('Bar', fid++, at(d, 17 + i * 2, 20 + i * 9)));
  }
  let rid = 1; const rooms = ['101', '102', '105', '203', '204', '207', '301', '305'];
  for (let d = 0; d < 7; d++) { const n = d % 3 === 0 ? 2 : 1; for (let i = 0; i < n; i++) bills.push(roomBill(rid++, d, 1 + Math.floor(rnd() * 3), rooms[(rid + i) % rooms.length])); }
  bills.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return bills;
}
const BILLS = build();

type Ev = any;
function events(): Ev[] {
  const out: Ev[] = [];
  BILLS.forEach(b => {
    const d = Number(b.discount) || 0;
    if (b.dept === 'Room') {
      out.push({id: `in:${b.id}`, type: 'checkin', tags: ['checkin'], dept: 'Room', title: `Check-in · Room ${b.room_number}`, body: `${b.customer_name} · by Front Desk`, created_at: b.checkin_at, guest: b.customer_name, room: b.room_number});
      out.push({id: `out:${b.id}`, type: 'checkout', tags: ['checkout', 'bills', 'payments', ...(d > 0 ? ['discounts'] : [])], dept: 'Room', billId: b.id, title: `Check-out · Room ${b.room_number}`,
        body: `${b.customer_name} · ${money(b.total)}${d > 0 ? ' · discount ' + money(d) : ''}`, created_at: b.created_at, discount: d, total: b.total, guest: b.customer_name, room: b.room_number, by: 'Front Desk'});
    } else {
      out.push({id: `${b.dept}:${b.id}`, type: 'bills', tags: ['bills', 'fnb', ...(b.is_paid ? ['payments'] : []), ...(d > 0 ? ['discounts'] : [])], dept: b.dept, billId: b.id,
        title: `${b.dept} bill ${b.order_number} settled`, body: `${b.customer_name || 'Walk-in'} · ${money(b.total)} · ${b.payment_mode}${d > 0 ? ' · discount ' + money(d) : ''}`,
        created_at: b.created_at, discount: d, total: b.total, guest: b.customer_name, by: b.settled_by});
    }
  });
  // guests currently in-house (checked in recently, not checked out yet)
  [['106', 'Arjun Kapoor', 0, 12], ['208', 'Meera Iyer', 0, 10], ['302', 'Farhan Ali', 1, 15]].forEach(([room, g, d, h], i) =>
    out.push({id: `inhouse:${i}`, type: 'checkin', tags: ['checkin'], dept: 'Room', title: `Check-in · Room ${room}`, body: `${g} · by Front Desk`, created_at: at(d as number, h as number, 20 + i * 7), guest: g, room}));
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
const EVENTS = events();
const readIds = new Set<string>();

function sumBy(from: string, to: string) {
  const inr = BILLS.filter(b => dayKey(b.created_at) >= from && dayKey(b.created_at) <= to);
  const s = (dept: string) => inr.filter(b => b.dept === dept).reduce((t, b) => t + b.total, 0);
  const mode = (m: string) => inr.filter(b => b.is_paid && String(b.payment_mode).toLowerCase().includes(m)).reduce((t, b) => t + b.total, 0);
  const roomRevenue = s('Room'), restaurantRevenue = s('Restaurant'), barRevenue = s('Bar');
  const totalRealized = roomRevenue + restaurantRevenue + barRevenue;
  const totalExpenses = Math.round(totalRealized * 0.27);
  return {roomRevenue, restaurantRevenue, barRevenue, totalRealized, totalCashInflow: mode('cash'), totalCardInflow: mode('card'), totalUpiInflow: mode('online'),
    gstCollections: inr.reduce((t, b) => t + (Number(b.tax) || 0), 0), totalExpenses, netProfit: totalRealized - totalExpenses, pendingChequesAmount: 18500};
}

// Sample occupied rooms for the demo build (12, matching the Occupied count on Home).
const DEMO_STAYS = ['101', '102', '105', '106', '203', '204', '207', '208', '301', '302', '303', '305'].map((room, i) => {
  const nights = 1 + i % 3, roomCharge = [2200, 2800, 3500, 4200][i % 4] * nights, restaurant = (i * 370) % 1800, bar = i % 2 ? (i * 210) % 1400 : 0;
  const extra = i % 5 === 2 ? 1500 : 0, total = roomCharge + restaurant + bar + extra, paid = i % 3 === 0 ? total : Math.round(roomCharge * 0.5 / 100) * 100;
  return {id: 'd' + i, room, guest: NAMES[i % NAMES.length], checkIn: at(i % 2, 8 + i % 6, 10 + i * 3), checkOut: at(-Math.max(1, nights - i % 2), 11, 0),
    roomCharge, restaurant, bar, extra, discount: 0, total, paid, pending: Math.max(total - paid, 0)};
});

const wait = <T,>(v: T) => new Promise<T>(r => setTimeout(() => r(v), 250));

const ROOM_ORDERS: Record<string, any[]> = {};
const findRoomOrder = (dept: string, id: any) => Object.values(ROOM_ORDERS).flat().find(b => b.dept.toLowerCase() === dept.toLowerCase() && String(b.id) === String(id));

export function makeDemoApi(billCache: Map<string, any>) {
  BILLS.forEach(b => billCache.set(b.dept + ':' + b.id, b));
  return {
    login: async () => ({token: 'demo', user: {username: 'owner', role: 'manager'}}),
    stats: () => { const k = dayKey(at(0, 0, 0)); const t = sumBy(k, k);
      return wait({rooms: {total: 24, ready: 9, occupied: 12, cleaning: 2, maintenance: 1}, revenue: {hospitality: t.roomRevenue, restaurant: t.restaurantRevenue, bar: t.barRevenue, total: t.totalRealized}}); },
    analytics: (from: string, to: string) => wait({stats: sumBy(from, to)}),
    occupied: async () => wait(DEMO_STAYS),
    roomOrders: async (stay: any) => {
      if (!ROOM_ORDERS[stay.room]) ROOM_ORDERS[stay.room] = (['Restaurant', 'Bar'] as const).map((dept, i) => {
        const src = BILLS.find(b => b.dept === dept)!;
        return {...src, id: 'D' + stay.room + i, order_number: (dept === 'Bar' ? 'BAR-' : 'RES-') + stay.room + i, room_number: stay.room, is_paid: i === 0 ? 0 : 1,
          payment_mode: i === 0 ? 'room_folio' : 'cash', created_at: at(i === 0 ? 5 : 0, 9, 51)};
      });
      return wait([...ROOM_ORDERS[stay.room]]);
    },
    editBill: async (dept: string, id: any, body: any) => {
      const o = findRoomOrder(dept, id); if (!o) throw new Error('Bill not found.');
      o.items_json = JSON.stringify(body.items || []); o.subtotal = body.subtotal; o.tax = body.tax; o.discount = body.discount; o.total = body.total;
      return wait({ok: true});
    },
    deleteBill: async (dept: string, id: any) => {
      for (const k of Object.keys(ROOM_ORDERS)) ROOM_ORDERS[k] = ROOM_ORDERS[k].filter(b => !(b.dept.toLowerCase() === dept.toLowerCase() && String(b.id) === String(id)));
      return wait({ok: true});
    },
    bills: async (_p: any = {}) => { const out: any = [...BILLS]; out.roomOk = true; return wait(out); },
    order: async (dept: string, id: any) => { const o = findRoomOrder(dept, id) || BILLS.find(b => b.dept === dept && String(b.id) === String(id));
      if (!o) throw new Error('Bill not found in demo data.');
      const logs = Number(o.discount) > 0 ? [{id: 1, action: 'settled', staff_user: o.settled_by, change_summary: `Bill settled with discount ${money(o.discount)}`, previous_total: o.subtotal + o.tax, new_total: o.total, timestamp: o.created_at}] : [];
      return wait({order: o, logs}); },
    approvals: async () => { const f: any = EVENTS.filter(e => (e.discount || 0) > 0).map(e => ({id: e.id, dept: e.dept, bill_id: e.billId, bill_number: BILLS.find(b => b.id === e.billId && b.dept === e.dept)?.order_number, guest_name: e.guest, room_number: e.room,
      discount: e.discount, current_total: e.total + e.discount, final_amount: e.total, requested_by: e.by, requested_at: e.created_at, status: 'APPLIED'})); f.readOnly = true; return wait(f); },
    approve: async () => { throw new Error('Approvals are not available in the demo.'); },
    reject: async () => { throw new Error('Approvals are not available in the demo.'); },
    activity: async (type = 'all') => wait((type === 'all' ? EVENTS : EVENTS.filter(e => e.tags.includes(type))).slice(0, 100)),
    notifications: async () => wait(EVENTS.slice(0, 30).map(e => ({id: e.id, type: e.type, title: e.title, body: e.body, created_at: e.created_at, read: readIds.has(e.id)}))),
    markRead: async (id?: any) => { if (id) readIds.add(String(id)); else EVENTS.slice(0, 30).forEach(e => readIds.add(e.id)); return null; },
    pushToken: async () => null,
    sendTestPush: async () => wait({ success: true, message: 'Test notification simulated in demo mode' }),
    storeBills: async (status: 'live' | 'history' = 'live') => {
      const demoBills = [
        { id: 1, vendor_id: 1, vendor_name: 'Gupta Grocery', vendor_mobile: '9876543210', bill_number: 'INV-101', bill_date: '2026-10-09', total_amount: 5000, paid_amount: 5000, pending_amount: 0, status: 'FULL', payment_mode: 'Bank Transfer', has_gst: 1, notes: 'Full cleared' },
        { id: 2, vendor_id: 2, vendor_name: 'Sharma Dairy', vendor_mobile: '9123456789', bill_number: 'MILK-88', bill_date: '2026-10-09', total_amount: 1800, paid_amount: 800, pending_amount: 1000, status: 'PARTLY', payment_mode: 'UPI', has_gst: 1, notes: 'Partial milk supply' },
        { id: 3, vendor_id: 1, vendor_name: 'Gupta Grocery', vendor_mobile: '9876543210', bill_number: 'INV-204', bill_date: '2026-10-10', total_amount: 3200, paid_amount: 0, pending_amount: 3200, status: 'PENDING', payment_mode: 'Bank Transfer', has_gst: 1, notes: 'Fresh spices and grains' },
      ];
      const filtered = status === 'history' ? demoBills.filter(b => b.status === 'FULL') : demoBills.filter(b => b.status !== 'FULL');
      const partyMap: Record<string, any> = {};
      for (const b of filtered) {
        if (!partyMap[b.vendor_id]) {
          partyMap[b.vendor_id] = { vendor_id: b.vendor_id, vendor_name: b.vendor_name, vendor_mobile: b.vendor_mobile, total_bills: 0, total_amount: 0, total_paid: 0, total_pending: 0, bills: [] };
        }
        partyMap[b.vendor_id].total_bills += 1;
        partyMap[b.vendor_id].total_amount += b.total_amount;
        partyMap[b.vendor_id].total_paid += b.paid_amount;
        partyMap[b.vendor_id].total_pending += b.pending_amount;
        partyMap[b.vendor_id].bills.push(b);
      }
      return wait({ success: true, status, bills: filtered, partySummary: Object.values(partyMap), paymentsHistory: [] });
    },
    recordStorePayment: async (body: any) => wait({ success: true, updatedBill: { id: body.bill_id, status: 'FULL' } }),
    booking: async (id: any) => wait(null),
    expenses: async () => wait([
      { id: 1, voucher_no: 'EXP-101', category: 'Kitchen', paid_to: 'Local Market', amount: 1250, actual_used_amount: 1250, payment_mode: 'Cash', cashier_name: 'Front Desk', purpose_details: 'Vegetables & spices', created_at: new Date().toISOString() },
      { id: 2, voucher_no: 'EXP-102', category: 'Housekeeping', paid_to: 'Clean Co', amount: 800, actual_used_amount: 800, payment_mode: 'Cash', cashier_name: 'Front Desk', purpose_details: 'Detergent & laundry supplies', created_at: new Date().toISOString() }
    ]),
    storeVendors: async () => wait([
      { id: 1, name: 'Gupta Grocery', mobile: '9876543210' },
      { id: 2, name: 'Sharma Dairy', mobile: '9123456789' }
    ])
  };
}