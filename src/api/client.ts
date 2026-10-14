// All CRM access goes through here. EXISTING = routes found in the CRM audit (response shapes
// are normalised defensively; they were not verified). OWNER = routes that do NOT exist in the
// CRM yet; screens show a "not connected" state until they are added server-side.
import axios from 'axios';import AsyncStorage from '@react-native-async-storage/async-storage';import {Platform} from 'react-native';import {useAuth} from '../store/auth';import {money} from '../lib/theme';import {DEMO_MODE} from '../config';import {makeDemoApi} from './demo';import {isInHouse,toStay} from '../lib/stay';
// ---- CRM safety: every path the app may touch. ROOM_BILLS = /hospitality/history (exists in the CRM; returns bookings, filtered below to checked-out stays). ----
export const ROUTES={login:'/api/auth/login',stats:'/stats',analytics:'/manager/analytics',restaurantBills:'/restaurant/settled-bills',barBills:'/bar/settled-bills',
 restaurantOrder:'/restaurant/orders/',barOrder:'/bar/orders/',ROOM_BILLS:'/hospitality/history'};
// Writes are only allowed to /owner/* and /store/* (store bills, vendor payments). Anything else that is not a GET is blocked inside the app.
const writeAllowed=(m:string,u:string)=>m==='get'||u.startsWith('/owner/')||u.startsWith('/store/');
const http=axios.create({timeout:4000});

const SUPABASE_URL = 'https://hlwmsllmqfdxfmqulrat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhsd21zbGxtcWZkeGZtcXVscmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3Mzc4MzgsImV4cCI6MjEwNTMxMzgzOH0.r7Nb8rEJTrZvprpf4G023nMY0suq2OqVGetG0I8esjk';

async function fetchSupabaseStoreBills(status: 'live' | 'history' = 'live') {
  const h = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY };
  const filter = status === 'history' ? '&status=eq.FULL' : '&status=in.(PENDING,PARTLY)&pending_amount=gt.0';
  const [bRes, vRes, pRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/store_bills?select=*${filter}&order=created_at.desc`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/store_vendors?select=*`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/store_vendor_payments?select=*&order=paid_at.desc`, { headers: h }).then(r => r.json()).catch(() => [])
  ]);

  const vendors = Array.isArray(vRes) ? vRes : [];
  const vMap = new Map(vendors.map((v: any) => [v.id, v]));
  const payments = Array.isArray(pRes) ? pRes : [];

  const rawBills = Array.isArray(bRes) ? bRes : [];
  const bills = rawBills.map((b: any) => {
    const v = vMap.get(b.vendor_id);
    const billPayments = payments.filter((p: any) => String(p.bill_id) === String(b.id));
    return {
      ...b,
      vendor_name: v?.name || 'Store Vendor',
      vendor_mobile: v?.mobile || '',
      payments: billPayments
    };
  });

  const partyMap: Record<string, any> = {};
  for (const b of bills) {
    if (!partyMap[b.vendor_id]) {
      partyMap[b.vendor_id] = {
        vendor_id: b.vendor_id,
        vendor_name: b.vendor_name,
        vendor_mobile: b.vendor_mobile,
        total_bills: 0,
        total_amount: 0,
        total_paid: 0,
        total_pending: 0,
        bills: []
      };
    }
    partyMap[b.vendor_id].total_bills += 1;
    partyMap[b.vendor_id].total_amount += Number(b.total_amount) || 0;
    partyMap[b.vendor_id].total_paid += Number(b.paid_amount) || 0;
    partyMap[b.vendor_id].total_pending += Number(b.pending_amount) || 0;
    partyMap[b.vendor_id].bills.push(b);
  }

  return {
    success: true,
    status,
    bills,
    partySummary: Object.values(partyMap),
    paymentsHistory: payments.map((p: any) => {
      const v = vMap.get(p.vendor_id);
      return { ...p, vendor_name: v?.name, vendor_mobile: v?.mobile };
    })
  };
}

async function recordSupabaseStorePayment(body: any) {
  const h = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
  const amount = parseFloat(body.payment_amount);
  if (isNaN(amount) || amount <= 0) throw new Error('Valid payment amount is required');

  if (body.bill_id) {
    const bRes = await fetch(`${SUPABASE_URL}/rest/v1/store_bills?id=eq.${body.bill_id}&select=*`, { headers: h }).then(r => r.json());
    const targetBill = Array.isArray(bRes) && bRes[0];
    if (!targetBill) throw new Error('Bill not found in cloud database');

    const newPaid = Math.round(((Number(targetBill.paid_amount) || 0) + amount) * 100) / 100;
    const newPending = Math.max(0, Math.round(((Number(targetBill.total_amount) || 0) - newPaid) * 100) / 100);
    const newStatus = (newPending === 0) ? 'FULL' : 'PARTLY';

    await fetch(`${SUPABASE_URL}/rest/v1/store_bills?id=eq.${body.bill_id}`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ paid_amount: newPaid, pending_amount: newPending, status: newStatus })
    });

    await fetch(`${SUPABASE_URL}/rest/v1/store_vendor_payments`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        bill_id: targetBill.id,
        vendor_id: targetBill.vendor_id,
        payment_amount: amount,
        payment_mode: body.payment_mode || 'Bank Transfer',
        reference_no: body.reference_no || '',
        paid_by: body.paid_by || 'Admin (Jaijeet sir)'
      })
    });

    targetBill.paid_amount = newPaid;
    targetBill.pending_amount = newPending;
    targetBill.status = newStatus;
    return { success: true, updatedBill: targetBill };
  } else if (body.vendor_id) {
    const bRes = await fetch(`${SUPABASE_URL}/rest/v1/store_bills?vendor_id=eq.${body.vendor_id}&pending_amount=gt.0&status=in.(PENDING,PARTLY)&order=created_at.asc`, { headers: h }).then(r => r.json());
    const pendingBills = Array.isArray(bRes) ? bRes : [];
    let rem = amount;
    for (const pb of pendingBills) {
      if (rem <= 0) break;
      const curPending = Number(pb.pending_amount) || 0;
      const curPaid = Number(pb.paid_amount) || 0;
      const curTotal = Number(pb.total_amount) || 0;
      const payThis = Math.min(curPending, rem);
      const newPaid = Math.round((curPaid + payThis) * 100) / 100;
      const newPending = Math.max(0, Math.round((curTotal - newPaid) * 100) / 100);
      const newStatus = (newPending === 0) ? 'FULL' : 'PARTLY';

      await fetch(`${SUPABASE_URL}/rest/v1/store_bills?id=eq.${pb.id}`, {
        method: 'PATCH',
        headers: h,
        body: JSON.stringify({ paid_amount: newPaid, pending_amount: newPending, status: newStatus })
      });
      rem = Math.round((rem - payThis) * 100) / 100;
    }

    await fetch(`${SUPABASE_URL}/rest/v1/store_vendor_payments`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        bill_id: null,
        vendor_id: body.vendor_id,
        payment_amount: amount,
        payment_mode: body.payment_mode || 'Bank Transfer',
        reference_no: body.reference_no || '',
        paid_by: body.paid_by || 'Admin (Jaijeet sir)'
      })
    });
    return { success: true };
  }
  throw new Error('Either bill_id or vendor_id is required');
}

http.interceptors.request.use(cfg=>{const m=(cfg.method||'get').toLowerCase();if(!writeAllowed(m,cfg.url||''))return Promise.reject(new Error('Blocked: this app is read-only on the CRM.'));return cfg});
// Identical GET requests fired within 4s share one call, so rapid refreshes cannot hammer the CRM.
const inflight=new Map<string,{t:number;p:Promise<any>}>();
export const billCache=new Map<string,any>();
const sget=(url:string,params?:any)=>{const k=url+JSON.stringify(params||{});const h=inflight.get(k);if(h&&Date.now()-h.t<4000)return h.p;const p=http.get(url,{params});inflight.set(k,{t:Date.now(),p});p.catch(()=>inflight.delete(k));return p};
http.interceptors.request.use(cfg=>{const{baseUrl,token}=useAuth.getState();cfg.baseURL=baseUrl.replace(/\/$/,'')+'/api';if(token)cfg.headers.Authorization=`Bearer ${token}`;return cfg});
http.interceptors.response.use(r=>r,async e=>{const cfg:any=e.config;if(e.response?.status===401&&cfg&&!cfg._retry){cfg._retry=true;inflight.clear();const ok=await useAuth.getState().signIn();if(ok)return http.request(cfg)}return Promise.reject(e)});
export class NotConnected extends Error{constructor(){super('This feature needs an owner endpoint that the CRM server does not have yet.')}}
export const errMsg=(e:any)=>e instanceof NotConnected?e.message:e?.response?.data?.error||(e?.isAxiosError&&!e?.response?'Cannot reach the CRM server. Check your connection.':e?.message||'Something went wrong');
async function owner<T>(fn:()=>Promise<T>){try{return await fn()}catch(e:any){if(e?.response?.status===404)throw new NotConnected();throw e}}
const arr=(d:any)=>Array.isArray(d)?d:d?.data||d?.items||d?.bills||d?.orders||d?.history||[];

// ---- Owner features built from CRM routes that DO exist ----------------------------------------
// The CRM has no /api/owner/* routes. Until it does, Activity, Notifications and the discount review are
// built here from the read-only bill / stay lists. If /api/owner/* is ever added, it is used automatically.
let ownerRoutes:boolean=true; // Server now implements /api/owner/* routes
async function ownerOr<T>(real: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (ownerRoutes === false) return fallback();
  try {
    const r = await real();
    ownerRoutes = true;
    return r;
  } catch (e: any) {
    return fallback();
  }
}
const num=(x:any)=>Number(x)||0;
const ts=(s?:string)=>{const t=new Date(String(s||'').replace(' ','T')).getTime();return isNaN(t)?0:t};
export type Ev={id:string;type:string;tags:string[];title:string;body:string;created_at:string;dept:string;billId?:any;discount?:number;total?:number;guest?:string;room?:string;by?:string};
async function fetchSupabaseOccupied() {
  const h = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/active_occupancies?select=*&order=room_number.asc`, { headers: h }).then(x => x.json()).catch(() => []);
  if (Array.isArray(r) && r.length > 0) {
    return r.map((o: any) => ({
      id: String(o.booking_id || o.room_number),
      room: String(o.room_number),
      guest: o.guest_name || 'In-House Guest',
      mobile: o.guest_mobile || '',
      type: o.room_type || 'Standard',
      roomType: o.room_type || 'Standard Room',
      checkIn: o.checkin_time,
      total: 0,
      paid: 0,
      pending: 0,
      roomCharge: 0,
      restaurant: 0,
      bar: 0,
      extra: 0,
      discount: 0,
      source: 'Front Desk',
      paymentMode: 'Cash'
    }));
  }
  return [];
}

async function fetchSupabaseApprovals() {
  const h = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY };
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/room_charges_inbox?department=eq.discount_approval&order=created_at.desc`,
    { headers: h }
  ).then(x => x.json()).catch(() => []);

  if (!Array.isArray(r)) return { pending: [], history: [] };

  const pending: any[] = [];
  const history: any[] = [];

  for (const row of r) {
    let meta: any = {};
    try { meta = JSON.parse(row.items_summary || '{}'); } catch {}
    const isPending = (row.status || 'pending').toLowerCase() === 'pending';
    const isApproved = (row.status || '').toLowerCase() === 'approved';
    const item = {
      id: meta.approval_id || (row.bill_no ? row.bill_no.replace('APP-', '') : row.id),
      cloud_id: row.id,
      dept: 'Room',
      room_number: row.room_number || meta.room_number || '',
      guest_name: meta.guest_name || '',
      members: meta.members || '',
      expected_checkout: meta.expected_checkout || '',
      current_total: Number(meta.current_total || 0),
      discount: Number(meta.discount || 0),
      discount_pct: Number(meta.discount_pct || 0),
      final_amount: Number(row.grand_total || meta.final_amount || 0),
      requested_by: row.settled_by || 'Reception Staff',
      requested_at: row.created_at,
      status: isPending ? 'PENDING' : isApproved ? 'APPROVED' : 'REJECTED',
      reason: meta.reason || ''
    };
    if (isPending) pending.push(item);
    else history.push(item);
  }

  return { pending, history };
}

async function actSupabaseApproval(id: any, status: 'approved' | 'rejected') {
  const h = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
  const billNo = String(id).startsWith('APP-') ? String(id) : 'APP-' + id;
  await fetch(`${SUPABASE_URL}/rest/v1/room_charges_inbox?bill_no=eq.${billNo}`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ status, settled_by: 'Admin' })
  }).catch(() => null);
  await fetch(`${SUPABASE_URL}/rest/v1/room_charges_inbox?id=eq.${id}`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ status, settled_by: 'Admin' })
  }).catch(() => null);
}

async function fetchSupabaseActivity(): Promise<Ev[]> {
  const h = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY };
  const out: Ev[] = [];

  const [occRes, chargesRes, storeRes, payRes] = await Promise.allSettled([
    fetch(`${SUPABASE_URL}/rest/v1/active_occupancies?select=*&order=checkin_time.desc`, { headers: h }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/rest/v1/room_charges_inbox?select=*&order=created_at.desc&limit=50`, { headers: h }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/rest/v1/store_bills?select=*&order=created_at.desc&limit=30`, { headers: h }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/rest/v1/store_vendor_payments?select=*&order=paid_at.desc&limit=30`, { headers: h }).then(r => r.json())
  ]);

  // 1. Live Occupied Rooms Check-ins
  if (occRes.status === 'fulfilled' && Array.isArray(occRes.value)) {
    occRes.value.forEach((o: any) => {
      out.push({
        id: `in:${o.room_number}`,
        type: 'checkin',
        tags: ['checkin', 'stay', 'all'],
        dept: 'Room',
        billId: undefined,
        title: `Check-in · Room ${o.room_number}`,
        body: `${o.guest_name || 'Guest'} · ${o.room_type || 'Standard'}`,
        created_at: o.checkin_time || o.updated_at || new Date().toISOString(),
        guest: o.guest_name,
        room: String(o.room_number)
      });
    });
  }

  // 2. Room Charges & Approvals
  if (chargesRes.status === 'fulfilled' && Array.isArray(chargesRes.value)) {
    chargesRes.value.forEach((c: any) => {
      if (c.department === 'discount_approval') {
        let meta: any = {};
        try { meta = JSON.parse(c.items_summary || '{}'); } catch {}
        const isApp = (c.status || '').toLowerCase() === 'approved';
        const isRej = (c.status || '').toLowerCase() === 'rejected';
        const stLabel = isApp ? 'APPROVED' : isRej ? 'REJECTED' : 'PENDING APPROVAL';
        out.push({
          id: `app:${c.id}`,
          type: 'discount',
          tags: ['discounts', 'approvals', 'all'],
          dept: 'Room',
          billId: c.bill_no,
          discount: Number(meta.discount || 0),
          total: Number(c.grand_total || meta.final_amount || 0),
          title: `Discount Request · Room ${c.room_number || meta.room_number || ''}`,
          body: `${meta.guest_name || 'Guest'} · ₹${meta.discount || 0} (${meta.discount_pct || 0}%) · ${stLabel}`,
          created_at: c.created_at,
          guest: meta.guest_name,
          room: String(c.room_number || meta.room_number || ''),
          by: c.settled_by
        });
      } else {
        const dept = (c.department || 'Restaurant').charAt(0).toUpperCase() + (c.department || 'restaurant').slice(1);
        out.push({
          id: `charge:${c.id}`,
          type: 'bills',
          tags: ['bills', 'fnb', 'payments', 'all'],
          dept,
          billId: c.bill_no || c.id,
          total: Number(c.grand_total || 0),
          title: `${dept} charge · Room ${c.room_number}`,
          body: `${c.items_summary || 'Food & Beverage'} · ${money(Number(c.grand_total || 0))}`,
          created_at: c.created_at,
          room: String(c.room_number),
          by: c.settled_by
        });
      }
    });
  }

  // 3. Store Bills
  if (storeRes.status === 'fulfilled' && Array.isArray(storeRes.value)) {
    storeRes.value.forEach((b: any) => {
      out.push({
        id: `store:${b.id}`,
        type: 'bills',
        tags: ['bills', 'store', 'all'],
        dept: 'Store',
        billId: b.id,
        total: Number(b.total_amount || 0),
        title: `Store Bill #${b.bill_number || b.id}`,
        body: `Total: ${money(Number(b.total_amount || 0))} · Status: ${b.status || 'PENDING'}`,
        created_at: b.created_at,
        by: b.created_by
      });
    });
  }

  // 4. Store Vendor Payments
  if (payRes.status === 'fulfilled' && Array.isArray(payRes.value)) {
    payRes.value.forEach((p: any) => {
      out.push({
        id: `pay:${p.id}`,
        type: 'payments',
        tags: ['payments', 'store', 'all'],
        dept: 'Store',
        billId: p.bill_id,
        total: Number(p.payment_amount || 0),
        title: `Store Payment · ${money(Number(p.payment_amount || 0))}`,
        body: `${p.payment_mode || 'Bank'} · Paid by ${p.paid_by || 'Admin'}`,
        created_at: p.paid_at || p.created_at || new Date().toISOString(),
        by: p.paid_by
      });
    });
  }

  return out.sort((a, b) => ts(b.created_at) - ts(a.created_at));
}

async function feed(): Promise<Ev[]> {
  try {
    const week = { period: 'week' };
    const rs = await Promise.allSettled([
      sget(ROUTES.restaurantBills, week),
      sget(ROUTES.barBills, week),
      sget(ROUTES.ROOM_BILLS, { limit: 100 })
    ]);
    const out: Ev[] = [];
    if (rs.every(x => x.status === 'rejected')) {
      return fetchSupabaseActivity();
    }
    (['Restaurant', 'Bar'] as const).forEach((dept, i) => {
      const r = rs[i];
      if (r.status !== 'fulfilled') return;
      arr(r.value.data).forEach((b: any) => {
        const at = b.settled_at || b.created_at;
        const d = num(b.discount);
        out.push({
          id: `${dept}:${b.id}`,
          type: 'bills',
          tags: ['bills', 'fnb', ...(b.is_paid ? ['payments'] : []), ...(d > 0 ? ['discounts'] : []), 'all'],
          dept,
          billId: b.id,
          title: `${dept} bill ${b.order_number || '#' + b.id} settled`,
          body: `${b.customer_name || 'Walk-in'} · ${money(b.total)}${b.payment_mode ? ' · ' + String(b.payment_mode).replace('_', ' ') : ''}${d > 0 ? ' · discount ' + money(d) : ''}`,
          created_at: at,
          discount: d,
          total: num(b.total),
          guest: b.customer_name,
          room: b.room_number,
          by: b.settled_by || b.cashier_name
        });
      });
    });
    const h = rs[2];
    if (h.status === 'fulfilled') {
      arr(h.value.data).forEach((b: any) => {
        const id = b.id ?? b.booking_id;
        const room = b.room_number || (b.rooms || []).join(', ');
        const g = b.guest_name || 'Guest';
        if (b.checkin_time && ts(b.checkin_time) > Date.now() - 7 * 864e5) {
          out.push({
            id: `in:${id}`,
            type: 'checkin',
            tags: ['checkin', 'stay', 'all'],
            dept: 'Room',
            billId: undefined,
            title: `Check-in · Room ${room}`,
            body: `${g}${b.checked_in_by ? ' · by ' + b.checked_in_by : ''}`,
            created_at: b.checkin_time,
            guest: g,
            room
          });
        }
        const co = b.actual_checkout_time || b.checkout_time;
        if (co && (b.status === 'checked_out' || b.booking_status === 'checked_out' || co) && ts(co) > Date.now() - 7 * 864e5) {
          const d = num(b.discount_amount);
          const total = num(b.grand_total);
          out.push({
            id: `out:${id}`,
            type: 'checkout',
            tags: ['checkout', 'bills', ...(num(b.total_paid) > 0 ? ['payments'] : []), ...(d > 0 ? ['discounts'] : []), 'all'],
            dept: 'Room',
            billId: id,
            title: `Check-out · Room ${room}`,
            body: `${g} · ${money(total)}${d > 0 ? ' · discount ' + money(d) : ''}`,
            created_at: co,
            discount: d,
            total,
            guest: g,
            room,
            by: b.checked_out_by
          });
        }
      });
    }
    if (out.length > 0) {
      return out.sort((a, b) => ts(b.created_at) - ts(a.created_at));
    }
  } catch {}
  return fetchSupabaseActivity();
}

const READ_KEY = 'readn';
const readSet = async (): Promise<Set<string>> => {
  try { return new Set(JSON.parse(await AsyncStorage.getItem(READ_KEY) || '[]')); } catch { return new Set(); }
};

const derived = {
  activity: async (type = 'all') => {
    try {
      const f = await feed();
      if (type === 'all') return f.slice(0, 100);
      return f.filter(e => e.tags.includes(type) || e.type === type).slice(0, 100);
    } catch {
      return [];
    }
  },
  notifications: async () => {
    try {
      const f = (await feed()).slice(0, 30);
      const r = await readSet();
      return f.map(e => ({ id: e.id, type: e.type, title: e.title, body: e.body, created_at: e.created_at, read: r.has(e.id) }));
    } catch {
      return [];
    }
  },
  markRead: async (id?: any) => {
    const r = await readSet();
    if (id) r.add(String(id));
    else (await feed()).slice(0, 30).forEach(e => r.add(e.id));
    await AsyncStorage.setItem(READ_KEY, JSON.stringify([...r].slice(-300)));
  },
  // Discounts already applied on settled bills. Read-only fallback if server route not reachable.
  approvals: async () => {
    const f = (await feed()).filter(e => num(e.discount) > 0).map(e => ({
      id: e.id,
      dept: e.dept,
      bill_id: e.billId,
      bill_number: e.title.replace(/ settled$/, '').replace(/^(Restaurant|Bar) bill /, ''),
      guest_name: e.guest,
      room_number: e.room,
      discount: e.discount,
      current_total: num(e.total) + num(e.discount),
      final_amount: e.total,
      requested_by: e.by,
      requested_at: e.created_at,
      status: 'APPROVED',
      action_by: 'Billed',
      reason: 'Applied at checkout/billing'
    }));
    return { pending: [], history: f, readOnly: true };
  },
};
const realApi={
 async login(baseUrl:string,username:string,password:string){const r=await axios.post(baseUrl.replace(/\/$/,'')+'/api/auth/login',{username,password},{timeout:15000});
  const u=r.data.user;if(!(u.role==='manager'||u.can_access_manager))throw new Error('This account does not have owner/manager access.');return r.data as {token:string;user:any}},
 stats: async () => {
   try {
     const res = await sget(ROUTES.stats);
     if (res?.data?.stats) return res.data.stats;
   } catch {}
   const occ = await fetchSupabaseOccupied();
   const totalRooms = 24;
   return {
     rooms: { total: totalRooms, occupied: occ.length, ready: Math.max(0, totalRooms - occ.length), maintenance: 0 },
     revenue: { total: 0, hospitality: 0, restaurant: 0, bar: 0 }
   };
 },
 analytics:(startDate:string,endDate:string)=>sget(ROUTES.analytics,{startDate,endDate}).then(r=>r.data).catch(()=>null),
 async bills(p:any={}){
   try {
     const g=(u:string,d:string)=>sget(u,p).then(r=>arr(r.data).map((b:any)=>({...b,dept:d})));
     const room=(u:string)=>sget(u,{limit:200,...(p.q?{q:p.q}:{})}).then(r=>arr(r.data).filter((b:any)=>b.status==='checked_out'||(b.actual_checkout_time||b.checkout_time)).map((b:any)=>{
      const n=(x:any)=>Number(x)||0;const lines=[['Room charges',n(b.total_room_charge)],['Restaurant (room)',n(b.food_total)],['Bar (room)',n(b.bar_total)]].filter(l=>(l[1] as number)>0).map(l=>({name:l[0],qty:1,price:l[1]}));
      const total=n(b.grand_total)||lines.reduce((a:number,l:any)=>a+l.price,0);
      const modes=[['Cash',b.split_cash],['Card',b.split_card],['Online',b.split_online],['Cheque',b.split_cheque]].filter(m=>n(m[1])>0).map(m=>m[0]).join(' + ');
      const ps=String(b.payment_status||'').toLowerCase();
      return {...b,dept:'Room',id:b.id??b.booking_id,order_number:b.final_receipt_no||b.voucher_number||`R-${b.id??b.booking_id??''}`,
       customer_name:b.guest_name,room_number:b.room_number||(b.rooms||[]).join(', '),total,subtotal:total,discount:n(b.discount_amount),items_json:JSON.stringify(lines),
       payment_mode:modes||b.final_settlement_mode||'-',is_paid:ps==='settled'||ps==='paid'||(n(b.total_paid)>0&&n(b.total_paid)>=total)?1:0,
       created_at:b.actual_checkout_time||b.checkout_time||b.checkin_time||b.created_at}}));
     const rs=await Promise.allSettled([g(ROUTES.restaurantBills,'Restaurant'),g(ROUTES.barBills,'Bar'),room(ROUTES.ROOM_BILLS)]);
     const core=rs.slice(0,2);
     if(!core.every(x=>x.status==='rejected')){
       const roomOk=rs[2].status==='fulfilled';
       const out=rs.flatMap(x=>x.status==='fulfilled'?x.value:[]).sort((x:any,y:any)=>String(y.created_at||'').localeCompare(String(x.created_at||'')));
       out.forEach((b:any)=>billCache.set(b.dept+':'+b.id,b));
       (out as any).roomOk=roomOk;
       return out;
     }
   } catch {}
   try {
     const h = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY };
     const r = await fetch(`${SUPABASE_URL}/rest/v1/room_charges_inbox?select=*&order=created_at.desc`, { headers: h }).then(x => x.json()).catch(() => []);
     if (Array.isArray(r) && r.length > 0) {
       const out = r.map((c: any) => ({
         id: c.id,
         dept: (c.department || 'Restaurant').charAt(0).toUpperCase() + (c.department || 'restaurant').slice(1),
         order_number: c.bill_no || `RES-${c.id}`,
         room_number: c.room_number,
         total: Number(c.grand_total) || 0,
         subtotal: Number(c.subtotal) || 0,
         tax: Number(c.gst) || 0,
         discount: 0,
         is_paid: 1,
         created_at: c.created_at,
         customer_name: `Room ${c.room_number}`,
         items_json: JSON.stringify([{ name: c.items_summary || 'Food & Beverage', qty: 1, price: Number(c.grand_total) || 0 }])
       }));
       out.forEach((b: any) => billCache.set(b.dept + ':' + b.id, b));
       return out;
     }
   } catch {}
   return [];
 },
 occupied: async () => {
   try {
     const res = await sget(ROUTES.ROOM_BILLS, { limit: 200 });
     const list = arr(res.data).filter(isInHouse).map(toStay).sort((x: any, y: any) => String(x.room).localeCompare(String(y.room), undefined, { numeric: true }));
     if (list && list.length > 0) return list;
   } catch {}
   return fetchSupabaseOccupied();
 },
 async roomOrders(stay:any){
   try {
     const rs=await Promise.allSettled([sget(ROUTES.restaurantBills,{period:'week'}),sget(ROUTES.barBills,{period:'week'}),sget('/restaurant/orders'),sget('/bar/orders')]);const dept=['Restaurant','Bar','Restaurant','Bar'];const seen=new Set<string>(),out:any[]=[];
     rs.forEach((r,i)=>{if(r.status!=='fulfilled')return;arr(r.value.data).forEach((b:any)=>{const rm=String(b.room_number??b.room_id??''),bk=String(b.booking_id??b.stay_id??'');const same=(rm!==''&&rm===String(stay.room))||(bk!==''&&bk===String(stay.id));if(!same)return;
      if(stay.checkIn&&ts(b.created_at)&&ts(b.created_at)<ts(stay.checkIn)-6e4)return;const k=dept[i]+':'+b.id;if(seen.has(k))return;seen.add(k);out.push({...b,dept:dept[i],room_number:b.room_number||stay.room})})});
     if (out.length > 0) return out.sort((x,y)=>ts(y.created_at)-ts(x.created_at));
   } catch {}
   try {
     const h = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY };
     const r = await fetch(`${SUPABASE_URL}/rest/v1/room_charges_inbox?room_number=eq.${encodeURIComponent(stay.room)}&select=*`, { headers: h }).then(x => x.json()).catch(() => []);
     if (Array.isArray(r) && r.length > 0) {
       return r.map((c: any) => ({
         id: c.id,
         dept: (c.department || 'Restaurant').charAt(0).toUpperCase() + (c.department || 'restaurant').slice(1),
         order_number: c.bill_no || `RES-${c.id}`,
         room_number: c.room_number,
         total: Number(c.grand_total) || 0,
         subtotal: Number(c.subtotal) || 0,
         tax: Number(c.gst) || 0,
         discount: 0,
         is_paid: 1,
         created_at: c.created_at,
         customer_name: stay.guest || 'In-House Guest',
         items_json: JSON.stringify([{ name: c.items_summary || 'Food & Beverage', qty: 1, price: Number(c.grand_total) || 0 }])
       }));
     }
   } catch {}
   return [];
 },
 editBill:(dept:string,id:any,body:any)=>owner(()=>http.put(`/owner/bills/${dept.toLowerCase()}/${id}`,body).then(r=>r.data)),
 deleteBill:(dept:string,id:any)=>owner(()=>http.delete(`/owner/bills/${dept.toLowerCase()}/${id}`).then(r=>r.data)),
 order: async (dept:string,id:any)=>{
   const cached = billCache.get(dept + ':' + id);
   try {
     const r = await sget((dept==='Bar'?ROUTES.barOrder:ROUTES.restaurantOrder)+id);
     if (r?.data) return r.data as {order:any;logs:any[]};
   } catch {}
   if (cached) return { order: cached, logs: [] };
   return { order: { id, order_number: `#${id}`, dept, total: 0, items_json: '[]' }, logs: [] };
 },
  approvals: async () => {
    try {
      const res = await http.get('/owner/approvals');
      const d = res.data;
      if (d && (d.pending !== undefined || d.history !== undefined)) {
        return {
          pending: d.pending || [],
          history: d.history || []
        };
      }
      const list = arr(d);
      if (list.length > 0) {
        return {
          pending: list.filter((x: any) => (x.status || 'PENDING').toUpperCase() === 'PENDING'),
          history: list.filter((x: any) => (x.status || 'PENDING').toUpperCase() !== 'PENDING')
        };
      }
    } catch {}

    // Fallback to Supabase Cloud (works everywhere: 5G, 4G, remote)
    try {
      const cloud = await fetchSupabaseApprovals();
      if (cloud.pending.length > 0 || cloud.history.length > 0) {
        return cloud;
      }
    } catch {}

    return derived.approvals();
  },
  approve: async (id: any) => {
    try { await http.post('/owner/approvals/' + id + '/approve'); } catch {}
    await actSupabaseApproval(id, 'approved');
    return { success: true };
  },
  reject: async (id: any, reason?: string) => {
    try { await http.post('/owner/approvals/' + id + '/reject', { reason }); } catch {}
    await actSupabaseApproval(id, 'rejected');
    return { success: true };
  },
 activity:(type='all')=>ownerOr(()=>owner(()=>http.get('/owner/activity',{params:{type}}).then(r=>arr(r.data))),()=>derived.activity(type)),
 notifications:()=>ownerOr(()=>owner(()=>http.get('/owner/notifications').then(r=>arr(r.data))),derived.notifications),
 markRead:(id?:any)=>ownerRoutes===false?derived.markRead(id):owner(()=>http.post(id?`/owner/notifications/${id}/read`:'/owner/notifications/read-all').then(r=>r.data)).catch(()=>derived.markRead(id)),
 pushToken: async (token: string) => {
    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.trim();
    if (!cleanToken || cleanToken.includes('TEST_TOKEN')) return null;

    try {
      await AsyncStorage.setItem('owner_device_push_token', cleanToken);
    } catch {}

    // 1. Try local CRM server if reachable
    http.post('/owner/push-token', { token: cleanToken, platform: Platform.OS }).catch(() => null);

    // 2. Direct Cloud Registration to Supabase 'owner_devices' (Works everywhere: 4G, 5G, or any Wi-Fi)
    try {
      const h = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      };
      const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/owner_devices?fcm_token=eq.${encodeURIComponent(cleanToken)}&select=id`, { headers: h });
      const existing = await checkRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/owner_devices?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: h,
          body: JSON.stringify({
            updated_at: new Date().toISOString(),
            device_name: Platform.OS === 'android' ? 'Owner Android Phone' : 'Owner Device'
          })
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/owner_devices`, {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            fcm_token: cleanToken,
            device_name: Platform.OS === 'android' ? 'Owner Android Phone' : 'Owner Device',
            updated_at: new Date().toISOString()
          })
        });
      }
      return { success: true, cloud: true };
    } catch (cloudErr: any) {
      console.warn('[PushToken] Supabase cloud registration failed:', cloudErr?.message);
      return null;
    }
  },
  sendTestPush: async () => {
    try {
      const token = await AsyncStorage.getItem('owner_device_push_token');
      const h = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          title: '🛎️ Hotel City Park Push Test',
          body: 'Push notifications are connected and working perfectly on this phone!',
          type: 'test',
          tokens: token ? [token] : []
        })
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
 storeBills: async (status: 'live' | 'history' = 'live') => {
  try {
   const res = await http.get('/store/bills', { params: { status } });
   if (res.data?.success && res.data?.bills) return res.data;
  } catch (err: any) {
   console.warn('[Store] Local CRM unreachable, falling back to direct cloud Supabase:', err.message);
  }
  return fetchSupabaseStoreBills(status);
 },
 recordStorePayment: async (body: { bill_id?: number; vendor_id?: number; payment_amount: number; payment_mode?: string; reference_no?: string; paid_by?: string }) => {
  try {
   const res = await http.post('/store/payments', body);
   if (res.data?.success) return res.data;
  } catch (err: any) {
   console.warn('[Store Payment] Local CRM unreachable, recording directly in Supabase cloud:', err.message);
  }
  return recordSupabaseStorePayment(body);
 },
  booking: async (id: any) => {
    try {
      const res = await sget('/bookings/' + id);
      if (res?.data?.booking) return res.data.booking;
      if (res?.data?.data) return res.data.data;
    } catch {}
    try {
      const res = await sget(ROUTES.ROOM_BILLS + '/' + id);
      if (res?.data?.booking) return res.data.booking;
      if (res?.data) return res.data;
    } catch {}
    const occ = await fetchSupabaseOccupied();
    const clean = String(id || '').trim().toLowerCase();
    return occ.find((o: any) =>
      String(o.id || '').toLowerCase() === clean ||
      String(o.room || '').toLowerCase() === clean ||
      String(o.room_number || '').toLowerCase() === clean
    ) || null;
  },
  storeVendors: async () => {
  try {
   const res = await http.get('/store/vendors');
   if (res.data?.vendors) return res.data.vendors;
  } catch {
   const h = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY };
   const r = await fetch(`${SUPABASE_URL}/rest/v1/store_vendors?select=*`, { headers: h }).then(x => x.json()).catch(() => []);
   return Array.isArray(r) ? r : [];
  }
 },
};
// Web/demo build uses built-in sample data; native app uses the real CRM.
export const api:typeof realApi=DEMO_MODE?(makeDemoApi(billCache) as any):realApi;