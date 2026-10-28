// All CRM access goes through here. EXISTING = routes found in the CRM audit (response shapes
// are normalised defensively; they were not verified). OWNER = routes that do NOT exist in the
// CRM yet; screens show a "not connected" state until they are added server-side.
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useAuth } from '../store/auth';
import { money, cleanRoomNumber } from '../lib/theme';
import { DEMO_MODE, CLOUD_TUNNEL_URL } from '../config';
import { makeDemoApi } from './demo';
import { isInHouse, toStay } from '../lib/stay';
import * as fb from './firebaseCloud';

const num = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v || 0).replace(/[^0-9.-]/g, '')) || 0);
export { cleanRoomNumber };
// ---- CRM safety: every path the app may touch. ROOM_BILLS = /hospitality/history (exists in the CRM; returns bookings, filtered below to checked-out stays). ----
export const ROUTES={login:'/api/auth/login',stats:'/stats',analytics:'/manager/analytics',restaurantBills:'/restaurant/settled-bills',barBills:'/bar/settled-bills',
 restaurantOrder:'/restaurant/orders/',barOrder:'/bar/orders/',ROOM_BILLS:'/hospitality/history'};
// Writes are allowed to /owner/*, /store/*, /extra-expenses*, /staff*, /restaurant/*, /bar/*
const writeAllowed=(m:string,u:string)=>m==='get'||u.startsWith('/owner/')||u.startsWith('/store/')||u.startsWith('/extra-expenses')||u.startsWith('/staff')||u.startsWith('/restaurant/')||u.startsWith('/bar/');
const http=axios.create({timeout:4000});

// Supabase decommissioned: all cloud operations redirect to Firebase Firestore
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

async function fetchSupabaseStoreBills(status: 'live' | 'history' | 'all' = 'all') {
  return fb.fetchStoreBills(status);
}

async function recordSupabaseStorePayment(body: any, sendPush: boolean = true) {
  return fb.recordStorePayment(body, sendPush);
}

http.interceptors.request.use(cfg=>{const m=(cfg.method||'get').toLowerCase();if(!writeAllowed(m,cfg.url||''))return Promise.reject(new Error('Blocked: this app is read-only on the CRM.'));return cfg});
// Identical GET requests fired within 4s share one call, so rapid refreshes cannot hammer the CRM.
const inflight=new Map<string,{t:number;p:Promise<any>}>();
export const billCache=new Map<string,any>();
const sget=(url:string,params?:any)=>{const k=url+JSON.stringify(params||{});const h=inflight.get(k);if(h&&Date.now()-h.t<4000)return h.p;const p=http.get(url,{params});inflight.set(k,{t:Date.now(),p});p.catch(()=>inflight.delete(k));return p};
http.interceptors.request.use(cfg=>{let{baseUrl,token}=useAuth.getState();if(typeof window!=='undefined'&&window.location?.protocol==='https:'&&(!baseUrl||baseUrl.startsWith('http://'))){baseUrl=CLOUD_TUNNEL_URL;}cfg.baseURL=baseUrl.replace(/\/$/,'')+'/api';if(token)cfg.headers.Authorization=`Bearer ${token}`;return cfg});
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
const ts = (s?: string) => {
  if (!s) return 0;
  const raw = String(s).trim();
  let t = NaN;
  if (raw.includes('+') || raw.endsWith('Z') || raw.endsWith('z') || /[-+]\d{2}:\d{2}$/.test(raw)) {
    t = new Date(raw).getTime();
  } else if (/^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}/.test(raw)) {
    t = new Date(raw + '+05:30').getTime();
  } else if (/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}/.test(raw)) {
    t = new Date(raw.replace(' ', 'T') + 'Z').getTime();
  } else {
    t = new Date(raw.replace(' ', 'T')).getTime();
  }
  return isNaN(t) ? 0 : t;
};
export type Ev={id:string;type:string;tags:string[];title:string;body:string;created_at:string;dept:string;billId?:any;discount?:number;total?:number;guest?:string;room?:string;by?:string;meta?:any};
async function fetchSupabaseOccupied() {
  return fb.fetchOccupiedStays();
}

async function fetchSupabaseAvailable() {
  return fb.fetchAvailableRooms();
}

async function fetchSupabaseDailyAnalytics(startDate: string, endDate: string) {
  return fb.fetchDailyAnalytics(startDate, endDate);
}

async function fetchSupabaseApprovals() {
  return fb.fetchApprovals();
}

async function actSupabaseApproval(id: any, status: 'approved' | 'rejected') {
  return fb.actApproval(id, status);
}

async function fetchSupabaseActivity(): Promise<Ev[]> {
  return fb.fetchActivity();
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
        // User requirement: In activity tab, only show settled to room (paid / pending) bills of F&B
        const pMode = String(b.payment_mode || '').toLowerCase();
        const hasRoom = !!b.room_number || !!b.room_id || pMode === 'room_folio' || pMode.includes('room');
        if (!hasRoom) return; // Skip walk-in table bills not settled to room
        const at = b.settled_at || b.created_at;
        const d = num(b.discount);

        let summaryText = 'Food & Beverage';
        if (Array.isArray(b.items)) {
          summaryText = b.items.map((it: any) => `${it.name || it.item_name || 'Item'} × ${it.qty || it.quantity || 1}`).join(', ');
        } else if (b.items_json) {
          try {
            const parsed = typeof b.items_json === 'string' ? JSON.parse(b.items_json) : b.items_json;
            if (Array.isArray(parsed)) {
              summaryText = parsed.map((it: any) => `${it.name || it.item_name || 'Item'} × ${it.qty || it.quantity || 1}`).join(', ');
            }
          } catch {}
        }
        const roomStr = b.room_number ? `Room ${b.room_number}` : (b.room_id ? `Room ${b.room_id}` : '');
        out.push({
          id: `${dept}:${b.id}`,
          type: 'bills',
          tags: ['bills', 'fnb', ...(b.is_paid ? ['payments'] : []), ...(d > 0 ? ['discounts'] : []), 'all'],
          dept,
          billId: b.order_number || b.id,
          title: `${dept} charge${roomStr ? ' · ' + roomStr : ''}`,
          body: `${summaryText} · ${money(b.total)}${d > 0 ? ' · discount ' + money(d) : ''}`,
          created_at: at,
          discount: d,
          total: num(b.total),
          guest: b.customer_name,
          room: String(b.room_number || b.room_id || ''),
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
   const totalRooms = 40;
   return {
     rooms: { total: totalRooms, occupied: occ.length, ready: Math.max(0, totalRooms - occ.length), maintenance: 0 },
     revenue: { total: 0, hospitality: 0, restaurant: 0, bar: 0 }
   };
 },
 analytics: async (startDate: string, endDate: string) => { try { const res = await sget(ROUTES.analytics, { startDate, endDate }); if (res?.data) return res.data; } catch {} return fetchSupabaseDailyAnalytics(startDate, endDate); },
 async bills(p:any={}){
   try {
     const g=(u:string,d:string)=>sget(u,p).then(r=>arr(r.data).map((b:any)=>({...b,dept:d})));
     const room=(u:string)=>sget(u,{limit:p.limit||60,...(p.from_date?{from_date:p.from_date,to_date:p.to_date}:{}),...(p.startDate?{startDate:p.startDate,endDate:p.endDate}:{}),...(p.q?{q:p.q}:{})}).then(r=>arr(r.data).filter((b:any)=>b.status==='checked_out'||(b.actual_checkout_time||b.checkout_time)).map((b:any)=>{
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
        out.forEach((b: any) => {
          billCache.set(b.dept + ':' + b.id, b);
          if (b.order_number) {
            billCache.set(b.dept + ':' + b.order_number, b);
            billCache.set(b.dept + ':' + String(b.order_number).replace(/^#/, ''), b);
          }
          if (b.dept === 'Room') {
            billCache.set('Room_folio:' + b.id, b);
            if (b.order_number) {
              billCache.set('Room_folio:' + b.order_number, b);
              billCache.set('Room_folio:' + String(b.order_number).replace(/^#/, ''), b);
            }
          }
        });
       (out as any).roomOk=roomOk;
       return out;
     }
   } catch {}
    try {
      const out = await fb.fetchRoomChargesInbox(p.from_date);
      if (out && out.length > 0) {
        out.forEach((b: any) => {
          billCache.set(b.dept + ':' + b.id, b);
          if (b.order_number) {
            billCache.set(b.dept + ':' + b.order_number, b);
            billCache.set(b.dept + ':' + String(b.order_number).replace(/^#/, ''), b);
          }
          if (b.dept === 'Room') {
            billCache.set('Room_folio:' + b.id, b);
            if (b.order_number) {
              billCache.set('Room_folio:' + b.order_number, b);
              billCache.set('Room_folio:' + String(b.order_number).replace(/^#/, ''), b);
            }
          }
        });
        return out;
      }
    } catch {}
   return [];
 },
 occupied: async () => {
    try {
      const res = await sget(ROUTES.ROOM_BILLS, { limit: 200 });
      const list = arr(res.data).filter(isInHouse).map(toStay);
      if (list && list.length > 0) {
        return list.sort((x: any, y: any) => new Date(y.checkIn || 0).getTime() - new Date(x.checkIn || 0).getTime());
      }
    } catch {}
    const cloud = await fetchSupabaseOccupied();
    return (cloud || []).sort((x: any, y: any) => new Date(y.checkIn || 0).getTime() - new Date(x.checkIn || 0).getTime());
  },
  available: async () => {
    try {
      const res = await sget('/rooms/available');
      if (res?.data && Array.isArray(res.data)) return res.data;
      if (res?.rooms && Array.isArray(res.rooms)) return res.rooms;
    } catch {}
    return fetchSupabaseAvailable();
  },
   async roomOrders(stay: any) {
    if (stay?.folioRestaurantOrders || stay?.folioBarOrders) {
      const combined = [
        ...(stay.folioRestaurantOrders || []),
        ...(stay.folioBarOrders || [])
      ];
      if (combined.length > 0) return combined;
    }
    try {
      const rs = await Promise.allSettled([
        sget(ROUTES.restaurantBills, { period: 'week' }),
        sget(ROUTES.barBills, { period: 'week' }),
        sget('/restaurant/orders'),
        sget('/bar/orders')
      ]);
      const dept = ['Restaurant', 'Bar', 'Restaurant', 'Bar'];
      const seen = new Set<string>(), out: any[] = [];
      const stayCheckinMs = stay?.checkIn ? ts(stay.checkIn) : 0;
      rs.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        arr(r.value.data).forEach((b: any) => {
          if (String(b.department || '').toLowerCase().includes('discount') || String(b.type || '').toLowerCase().includes('discount')) return;
          const rm = String(b.room_number ?? b.room_id ?? '');
          const bk = String(b.booking_id ?? b.stay_id ?? '');
          const same = (rm !== '' && rm === String(stay.room)) || (bk !== '' && bk === String(stay.id));
          if (!same) return;
          if (stayCheckinMs > 0 && ts(b.created_at) && ts(b.created_at) < stayCheckinMs - 6e4) return;
          const k = dept[i] + ':' + b.id;
          if (seen.has(k)) return;
          seen.add(k);
          out.push({ ...b, dept: dept[i], room_number: b.room_number || stay.room });
        });
      });
      if (out.length > 0) return out.sort((x, y) => ts(y.created_at) - ts(x.created_at));
    } catch {}
    try {
      return await fb.fetchStayCharges(stay);
    } catch {}
    return [];
  },
  roomFolio: async (id: any) => {
    // 1. Live CRM server endpoint
    try {
      const res = await sget('/rooms/' + id + '/folio');
      if (res?.data?.success && res.data?.folio) {
        const localF = res.data.folio;
        // If local has 0 paid or missing guest contact, check cloud folio to ensure latest multi-terminal sync
        if (!localF.room?.email || Number(localF.summary?.advancePaid || 0) === 0) {
          try {
            const cFolio = await fb.fetchFolioByRoom(id);
            if (cFolio) {
              const cMeta = cFolio.meta || {};
              if (cMeta.email && !localF.room.email) localF.room.email = cMeta.email;
              if (cMeta.aadharNumber && !localF.room.aadhar_number) localF.room.aadhar_number = cMeta.aadharNumber;
              if (cMeta.address && !localF.room.address) localF.room.address = cMeta.address;
              if (cMeta.checkinTime && (!localF.room.checkin_time || String(localF.room.checkin_time).includes('23:07'))) localF.room.checkin_time = cMeta.checkinTime;
              if (cMeta.approxCheckout) localF.room.approx_checkout_time = cMeta.approxCheckout;
              if (Number(cMeta.paid || 0) > Number(localF.summary?.advancePaid || 0)) {
                localF.summary.advancePaid = Number(cMeta.paid);
                localF.summary.grandTotal = Math.max(localF.summary.grandTotal, Number(cMeta.total || cMeta.grandTotal));
                localF.summary.balanceDue = Math.max(0, localF.summary.grandTotal - localF.summary.advancePaid);
                localF.room.total_paid = Number(cMeta.paid);
                localF.room.total_room_charge = localF.summary.grandTotal;
                if (cMeta.payments && cMeta.payments.length > 0 && (!localF.payments || localF.payments.length === 0)) {
                  localF.payments = cMeta.payments;
                }
              }
            }
          } catch (_) {}
        }
        return localF;
      }
      if (res?.data?.room) {
        return res.data;
      }
    } catch {}

    // 1b. Check if this is a checkout stay from local CRM history (only if explicitly requested for checkout)
    if (String(id).startsWith('CO-') || String(id).startsWith('out:') || String(id).startsWith('co_')) {
      try {
        const histRes = await sget(ROUTES.ROOM_BILLS + '/' + id);
      const rec = histRes?.data?.records?.[0] || histRes?.data?.history?.[0] || histRes?.data?.record || histRes?.data;
      if (rec && (rec.guest_name || rec.room_number || rec.rooms)) {
        const totalAdults = (rec.adults_male || 0) + (rec.adults_female || 0) + (rec.adults_other || 0) || rec.adults || 1;
        const totalChildren = rec.children || 0;
        const roomList = Array.isArray(rec.rooms) ? rec.rooms : [rec.room_number || id];
        return {
          isCheckout: true,
          status: 'checked_out',
          stayStatus: 'CHECKED_OUT',
          room: {
            id: rec.id || id,
            room_number: roomList.join(', '),
            room_type: rec.room_type || 'Standard Room',
            guest_name: rec.guest_name || 'Guest',
            mobile: rec.mobile || '',
            adults: totalAdults,
            children: totalChildren,
            meal_plan: rec.meal_plan || 'without_breakfast',
            checkin_time: rec.checkin_time,
            actual_checkout_time: rec.actual_checkout_time || rec.checkout_time || new Date().toISOString(),
            checked_in_by: rec.checked_in_by || 'Front Desk',
            checked_out_by: rec.checked_out_by || 'Staff',
            room_count: roomList.length,
            room_numbers: roomList.join(', '),
            payments: (rec.payments || []).map((p: any) => ({
              amount: p.amount,
              mode: p.payment_mode || p.mode || 'Cash',
              date: p.created_at || p.realized_at,
              cashier: p.cashier_name || p.cashier || 'Staff',
              receiptNo: p.receipt_no
            }))
          },
          guestName: rec.guest_name || 'Guest',
          guest: rec.guest_name || 'Guest',
          mobile: rec.mobile || '',
          adults: totalAdults,
          children: totalChildren,
          mealPlan: rec.meal_plan || 'without_breakfast',
          roomCount: roomList.length,
          roomNumber: roomList.join(', '),
          checkIn: rec.checkin_time,
          checkOut: rec.actual_checkout_time || rec.checkout_time || new Date().toISOString(),
          checkedInBy: rec.checked_in_by || 'Front Desk',
          checkedOutBy: rec.checked_out_by || 'Staff',
          payments: (rec.payments || []).map((p: any) => ({
            amount: p.amount,
            mode: p.payment_mode || p.mode || 'Cash',
            date: p.created_at || p.realized_at,
            cashier: p.cashier_name || p.cashier || 'Staff',
            receiptNo: p.receipt_no
          })),
          restaurantOrders: [],
          barOrders: [],
          summary: {
            grandTotal: rec.grand_total || rec.total_paid || 0,
            advancePaid: rec.total_paid || 0,
            balanceDue: 0
          }
        };
      }
    } catch {}
  }

    // 2. Direct Cloud Firebase fallback (works on 4G/5G/any remote network)
    try {
      const fbStay = await fb.fetchStayDetails(id);
      if (fbStay) return fbStay;
    } catch (e) {
      console.warn('[client.ts roomFolio cloud fallback notice]', e);
    }
    return null;
  },
editBill:(dept:string,id:any,body:any)=>owner(()=>http.put(`/owner/bills/${dept.toLowerCase()}/${id}`,body).then(r=>r.data)),
  deleteBill: (dept: string, id: any) => {
    const d = String(dept || '').toLowerCase().trim();
    const cleanDept = d.includes('bar') ? 'bar' : d.includes('restaurant') ? 'restaurant' : 'room';
    const cleanId = String(id || '').replace(/^#/, '').trim();
    return owner(() => http.delete(`/owner/bills/${cleanDept}/${cleanId}`).then(r => r.data));
  },
 order: async (dept: string, id: any) => {
   const cleanId = String(id || '').replace(/^#/, '').trim();
   const dNorm = (dept || '').toLowerCase();

   // 1. Check in-memory billCache
   let cached = billCache.get(dept + ':' + id) || billCache.get(dept + ':' + cleanId);
   if (!cached && (dNorm === 'room' || dNorm === 'room_folio')) {
     cached = billCache.get('Room:' + id) || billCache.get('Room:' + cleanId) || billCache.get('Room_folio:' + id) || billCache.get('Room_folio:' + cleanId);
   }
   if (!cached) {
     for (const b of billCache.values()) {
       const bD = (b.dept || '').toLowerCase();
       if (bD === dNorm || (bD.includes('room') && dNorm.includes('room')) || dNorm === 'all') {
         if (String(b.id) === cleanId || String(b.order_number) === cleanId || String(b.order_number) === id || String(b.bill_no) === cleanId) {
           cached = b;
           break;
         }
       }
     }
   }
   if (cached) return { order: cached, logs: [] };

   // 2. Try CRM local endpoint
   try {
     const endpoint = dNorm === 'bar' ? ROUTES.barOrder : ROUTES.restaurantOrder;
     const r = await sget(endpoint + encodeURIComponent(cleanId));
     if (r?.data?.order) {
       const ord = r.data.order;
       ord.dept = dNorm === 'bar' ? 'Bar' : 'Restaurant';
       billCache.set(dept + ':' + cleanId, ord);
       return { order: ord, logs: r.data.logs || [] };
     }
     if (r?.data?.id) {
       return { order: r.data, logs: [] };
     }
   } catch {}

    // 3. Fallback: Query Firebase Cloud room_charges_inbox
    try {
      const fbOrd = await fb.fetchSingleOrderOrCharge(cleanId);
      if (fbOrd) {
        billCache.set(dept + ':' + cleanId, fbOrd.order);
        billCache.set(fbOrd.order.dept + ':' + cleanId, fbOrd.order);
        return fbOrd;
      }
    } catch {}

   return { order: { id: cleanId, order_number: `#${cleanId}`, dept, total: 0, items_json: '[]' }, logs: [] };
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

    // Fallback to Cloud (works everywhere: 5G, 4G, remote)
    try {
      const cloud: any = await fetchSupabaseApprovals();
      if (cloud?.pending?.length > 0 || cloud?.history?.length > 0) {
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

    // 2. Direct Cloud Registration to Firebase 'owner_devices' (Works everywhere: 4G, 5G, or any Wi-Fi)
    try {
      await fb.registerDeviceToken(cleanToken);
      return { success: true, cloud: true };
    } catch (cloudErr: any) {
      console.warn('[PushToken] Firebase cloud registration failed:', cloudErr?.message);
      return null;
    }
  },
  sendTestPush: async () => {
    return fb.sendTestPush();
  },
 storeBills: async (status: 'live' | 'history' | 'all' = 'all') => {
  try {
   const fbData = await fb.fetchStoreBills(status);
   if (fbData?.success && Array.isArray(fbData.bills) && fbData.bills.length > 0) return fbData;
  } catch (_) {}
  try {
   const res = await http.get('/store/bills', { params: { status } });
   if (res.data?.success && Array.isArray(res.data.bills) && res.data.bills.length > 0) return res.data;
  } catch (err: any) {
   console.warn('[Store] Local CRM unreachable, falling back to direct cloud Firebase:', err.message);
  }
  return fetchSupabaseStoreBills(status);
 },
 recordStorePayment: async (body: { bill_id?: number; vendor_id?: number; payment_amount: number; payment_mode?: string; reference_no?: string; paid_by?: string }) => {
  try {
   const res = await http.post('/store/payments', body);
   if (res.data?.success) {
     recordSupabaseStorePayment(body, false).catch(() => {});
     return res.data;
   }
  } catch (err: any) {
   console.warn('[Store Payment] Local CRM unreachable, recording directly in Supabase cloud:', err.message);
  }
  return recordSupabaseStorePayment(body, true);
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
    try {
      const all = await sget(ROUTES.ROOM_BILLS, { limit: 200 });
      const bList = arr(all?.data);
      const clean = String(id || '').trim().toLowerCase();
      const match = bList.find((b: any) =>
        String(b.id || '').toLowerCase() === clean ||
        String(b.booking_id || '').toLowerCase() === clean ||
        String(b.room_number || '').toLowerCase() === clean ||
        String(b.room || '').toLowerCase() === clean ||
        String(b.voucher_number || '').toLowerCase() === clean
      );
      if (match) {
        const bookId = match.id || match.booking_id || match.primary_booking_id;
        if (bookId) {
          try {
            const bRes = await sget('/bookings/' + bookId);
            const bData = bRes?.data?.booking || bRes?.data?.data;
            if (bData) return { ...match, ...bData };
          } catch {}
        }
        return match;
      }
    } catch {}
    const occ = await fetchSupabaseOccupied();
    const clean = String(id || '').trim().toLowerCase();
    return occ.find((o: any) =>
      String(o.id || '').toLowerCase() === clean ||
      String(o.room || '').toLowerCase() === clean ||
      String(o.room_number || '').toLowerCase() === clean
    ) || null;
  },
  expenses: async (params?: any) => {
    try {
      const res = await sget('/expenses', params);
      if (res?.data) return Array.isArray(res.data) ? res.data : (res.data.expenses || []);
    } catch {}
    return [];
  },
  fbState: async (dept: 'restaurant' | 'bar' = 'restaurant') => {
    try {
      const res = await http.get('/fb/state');
      if (res.data?.success) return res.data;
    } catch (_) {}
    try {
      return await fb.fetchLiveState();
    } catch (_) {}
    return {
      restaurantTables: [],
      barTables: [],
      restaurantOrders: [],
      barOrders: []
    };
  },
  fbOrders: async (dept: 'restaurant' | 'bar' = 'restaurant', filter: 'settled' | 'all' = 'all') => {
    try {
      if (filter === 'settled') {
        const endpoint = dept === 'bar' ? '/bar/settled-bills' : '/restaurant/settled-bills';
        const res = await http.get(endpoint);
        const bills = res.data?.bills || res.data?.orders || res.data?.data || [];
        if (Array.isArray(bills) && bills.length > 0) {
          return bills.map((o: any) => {
            let items = o.items;
            if (!items && o.items_json) {
              try { items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : o.items_json; } catch (_) { items = []; }
            }
            return {
              ...o,
              items: items || [],
              grand_total: o.grand_total || o.total || o.total_amount,
              is_settled: true,
              dept: dept === 'bar' ? 'Bar Lounge' : 'Restaurant'
            };
          });
        }
      }
      const endpoint = dept === 'bar' ? '/bar/orders' : '/restaurant/orders';
      const res = await http.get(endpoint);
      const orders = res.data?.orders || res.data?.data || [];
      const parsed = orders.map((o: any) => {
        let items = o.items;
        if (!items && o.items_json) {
          try { items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : o.items_json; } catch (_) { items = []; }
        }
        return {
          ...o,
          items: items || [],
          grand_total: o.grand_total || o.total || o.total_amount,
          is_settled: o.is_paid === 1 || String(o.status).toLowerCase() === 'completed' || String(o.status).toLowerCase() === 'settled',
          dept: dept === 'bar' ? 'Bar Lounge' : 'Restaurant'
        };
      });
      if (filter === 'settled') {
        return parsed.filter((o: any) => o.is_settled);
      }
      return parsed;
    } catch (_) {}
    try {
      const state = await (realApi as any).fbState(dept);
      const orders = dept === 'bar' ? (state.barOrders || []) : (state.restaurantOrders || []);
      if (filter === 'settled') {
        return orders.filter((o: any) => o.is_settled || o.is_paid === 1 || String(o.status).toLowerCase() === 'completed' || String(o.status).toLowerCase() === 'settled');
      }
      return orders;
    } catch (_) {}
    return [];
  },
  storeVendors: async () => {
    try {
      const fbVendors = await fb.fetchStoreVendors();
      if (Array.isArray(fbVendors) && fbVendors.length > 0) {
        return fbVendors;
      }
    } catch (_) {}
    try {
      const res = await http.get('/store/vendors');
      if (res.data?.vendors && res.data.vendors.length > 0) return res.data.vendors;
    } catch (_) {}
    try {
      const fbVendors = await fb.fetchStoreVendors();
      if (Array.isArray(fbVendors)) return fbVendors;
    } catch (_) {}
    return [];
  },
  createStoreVendor: async (data: { name: string; mobile?: string; address?: string }) => {
    try {
      await http.post('/store/vendors', data);
    } catch (_) {}
    return fb.createStoreVendor(data);
  },
  updateStoreVendor: async (id: number | string, data: { name: string; mobile?: string; address?: string }) => {
    try {
      await http.put(`/store/vendors/${id}`, data);
    } catch (_) {}
    return fb.updateStoreVendor(id, data);
  },
  deleteStoreVendor: async (id: number | string) => {
    try {
      await http.delete(`/store/vendors/${id}`);
    } catch (_) {}
    return fb.deleteStoreVendor(id);
  },
  staff: async (department?: string) => {
    try {
      const res = await sget('/staff' + (department ? `?department=${department}` : ''));
      if (res?.data?.staff && Array.isArray(res.data.staff) && res.data.staff.length > 0) return res.data.staff;
    } catch (_) {}
    try {
      const res = await sget('/owner/staff' + (department ? `?department=${department}` : ''));
      if (res?.data?.staff && Array.isArray(res.data.staff) && res.data.staff.length > 0) return res.data.staff;
    } catch (_) {}
    const list = await fb.fetchFirestoreCollection('staff_users');
    if (department) return list.filter((s: any) => s.role === department);
    return list;
  },
  updateStaffPassword: async (staffId: any, newPassword: string, staffUsername?: string) => {
    const cleanPass = String(newPassword || '').trim();
    let updatedLocal = false;
    try {
      const res = await owner(() => http.post(`/staff/${staffId}/password`, { plain_password: cleanPass, password: cleanPass }).then(r => r.data));
      if (res?.success) updatedLocal = true;
    } catch (_) {
      try {
        const res2 = await owner(() => http.put(`/staff/${staffId}`, { plain_password: cleanPass, password: cleanPass }).then(r => r.data));
        if (res2?.success) updatedLocal = true;
      } catch (_) {}
    }
    try {
      await fetch(`${fb.FIREBASE_REST_URL}/staff_users/${encodeURIComponent(staffId)}?updateMask.fieldPaths=plain_password&updateMask.fieldPaths=updated_at&key=${fb.FIREBASE_API_KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            plain_password: { stringValue: cleanPass },
            updated_at: { stringValue: new Date().toISOString() }
          }
        })
      });
    } catch (fbErr: any) {
      if (!updatedLocal) throw fbErr;
    }
    return { success: true, message: 'Password updated successfully' };
  },
  deleteExtraExpense: async (bookingIdOrId: any, expenseId?: any) => {
    const id = expenseId !== undefined ? expenseId : bookingIdOrId;
    try {
      const res = await http.delete(`/owner/extra-expenses/${id}`);
      if (res.data?.success) return res.data;
    } catch (_) {
      try {
        const res2 = await http.delete(`/extra-expenses/${id}`);
        if (res2.data?.success) return res2.data;
      } catch (__) {}
    }
    try {
      await fetch(`${fb.FIREBASE_REST_URL}/room_charges_inbox/EXP-${id}?key=${fb.FIREBASE_API_KEY}`, {
        method: 'DELETE'
      });
    } catch (_) {}
    return { success: true };
  },
};
// Web/demo build uses built-in sample data; native app uses the real CRM.
export const api:typeof realApi=DEMO_MODE?(makeDemoApi(billCache) as any):realApi;