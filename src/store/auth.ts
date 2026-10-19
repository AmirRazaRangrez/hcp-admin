import {create} from 'zustand';
import * as SS from '../lib/storage';
import axios from 'axios';
import {SERVER_URL,OWNER_USERNAME,OWNER_PASSWORD,DEMO_MODE,CLOUD_TUNNEL_URL,fetchCloudTunnelUrl} from '../config';

const DEMO_USER = {id: 0, username: 'owner', full_name: 'Demo Owner', role: 'manager', can_access_manager: true};

// The Owner app is a dedicated device app. It silently authenticates as the
// manager account so the owner never has to see or enter a login form.

const DEFAULT_USER = {id: 1, username: OWNER_USERNAME, full_name: 'Hotel Admin (Jaijeet Sir)', role: 'manager', can_access_manager: true};

type S = {
  ready: boolean; baseUrl: string; token: string | null; user: any; authError: string | null;
  badges: {approvals: number; unread: number};
  load(): Promise<void>;
  signIn(): Promise<boolean>;
  login(b: string, t: string, u: any): Promise<void>;
  logout(): Promise<void>;
  setBadges(p: Partial<S['badges']>): void;
};

// One shared sign-in at a time, so several screens hitting a 401 together only log in once.
let pending: Promise<boolean> | null = null;

export const useAuth = create<S>((set, get) => ({
  ready: false, baseUrl: SERVER_URL, token: null, user: DEFAULT_USER, authError: null, badges: {approvals: 0, unread: 0},

  async load() {
    if (DEMO_MODE) { set({baseUrl: 'demo', token: 'demo', user: DEMO_USER, authError: null, ready: true}); return; }
    let initialBase = SERVER_URL;
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
      initialBase = CLOUD_TUNNEL_URL;
      fetchCloudTunnelUrl().then(fresh => {
        if (fresh && fresh !== get().baseUrl) {
          set({ baseUrl: fresh });
        }
      }).catch(() => {});
    }
    const [t, u] = await Promise.all([SS.getItemAsync('tok'), SS.getItemAsync('usr')]);
    if (t) {
      let user: any = null;
      try { user = u ? JSON.parse(u) : null; } catch {}
      set({baseUrl: initialBase, token: t, user: user || DEFAULT_USER, ready: true});
      return;
    }
    await get().signIn();
    set({ready: true, baseUrl: initialBase, user: get().user || DEFAULT_USER});
  },

  // Silent login with the built-in owner account. Safe to call any time.
  signIn() {
    if (DEMO_MODE) { set({baseUrl: 'demo', token: 'demo', user: DEMO_USER, authError: null}); return Promise.resolve(true); }
    if (pending) return pending;
    pending = (async () => {
      try {
        let activeBase = get().baseUrl || SERVER_URL;
        if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && activeBase.startsWith('http://')) {
          activeBase = CLOUD_TUNNEL_URL;
        }
        const r = await axios.post(activeBase.replace(/\/$/, '') + '/api/auth/login',
          {username: OWNER_USERNAME, password: OWNER_PASSWORD}, {timeout: 6000});
        const user = r.data?.user;
        if (!r.data?.token) throw new Error('No token returned');
        await SS.setItemAsync('base', activeBase);
        await SS.setItemAsync('tok', r.data.token);
        await SS.setItemAsync('usr', JSON.stringify(user || DEFAULT_USER));
        set({baseUrl: activeBase, token: r.data.token, user: user || DEFAULT_USER, authError: null});
        return true;
      } catch (e: any) {
        // When CRM local server is not accessible, operate in Cloud DB mode with default admin identity
        set({token: null, user: DEFAULT_USER, authError: null});
        return false;
      } finally {
        pending = null;
      }
    })();
    return pending;
  },

  async login(b, t, u) { await SS.setItemAsync('base', SERVER_URL); await SS.setItemAsync('tok', t); await SS.setItemAsync('usr', JSON.stringify(u)); set({baseUrl: b, token: t, user: u}); },

  // There is no login screen, so "log out" means: drop the saved session and sign in fresh.
  async logout() {
    await SS.deleteItemAsync('tok').catch(() => {});
    await SS.deleteItemAsync('usr').catch(() => {});
    set({token: null, user: null});
    await get().signIn();
  },

  setBadges(p) { set({badges: {...get().badges, ...p}}); },
}));
