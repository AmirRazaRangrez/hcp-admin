export const CLOUD_TUNNEL_URL: string = 'https://hudson-universal-quite-talented.trycloudflare.com';

const SUPABASE_TUNNEL_ENDPOINT = 'https://hlwmsllmqfdxfmqulrat.supabase.co/rest/v1/room_charges_inbox?department=eq.cloud_tunnel_url&select=items_summary&limit=1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhsd21zbGxtcWZkeGZtcXVscmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3Mzc4MzgsImV4cCI6MjEwNTMxMzgzOH0.r7Nb8rEJTrZvprpf4G023nMY0suq2OqVGetG0I8esjk';

const detectServerUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    const isHttps = window.location.protocol === 'https:';
    const host = window.location.hostname;

    // When loaded over HTTPS (Netlify, Vercel, remote HTTPS web), NEVER request http://
    // Browsers strictly block http:// requests from https:// pages with Mixed Content errors.
    if (isHttps) {
      let cached: string | null = null;
      try {
        cached = window.localStorage ? window.localStorage.getItem('hcp_cached_tunnel_url') : null;
      } catch (_) {}
      return (cached && cached.startsWith('https://')) ? cached : CLOUD_TUNNEL_URL;
    }

    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3000';
    }
    if (host && !host.includes('netlify.app') && !host.includes('vercel.app')) {
      return `http://${host}:3000`;
    }
  }
  return 'http://10.160.83.195:3000';
};

export const SERVER_URL: string = detectServerUrl();

// Fetch latest active HTTPS tunnel from Supabase cloud sync
export const fetchCloudTunnelUrl = async (): Promise<string> => {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
    const res = await fetch(SUPABASE_TUNNEL_ENDPOINT, {
      signal: controller?.signal,
      headers: { apikey: SUPABASE_ANON_KEY }
    });
    if (timer) clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data[0]?.items_summary) {
        const fresh = data[0].items_summary.replace(/\/+$/, '');
        if (fresh && fresh.startsWith('https://')) {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.setItem('hcp_cached_tunnel_url', fresh);
            }
          } catch (_) {}
          return fresh;
        }
      }
    }
  } catch (_) {}
  return CLOUD_TUNNEL_URL;
};

// Eagerly resolve active cloud tunnel in background on web load
if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
  fetchCloudTunnelUrl().catch(() => {});
}

// The owner app signs in by itself with this CRM staff account (must be a manager account).
// Change these two lines to the manager username/password you use to log in to the CRM.
export const OWNER_USERNAME: string = 'admin';
export const OWNER_PASSWORD: string = 'admin123';

// Set DEMO_MODE to false so real live CRM and Supabase cloud data is used across APK and browser
export const DEMO_MODE: boolean = false;

