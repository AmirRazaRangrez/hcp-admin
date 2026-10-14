const detectServerUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3000';
    }
    if (host) {
      return `http://${host}:3000`;
    }
  }
  return 'http://10.160.83.195:3000';
};

export const SERVER_URL: string = detectServerUrl();

// The owner app signs in by itself with this CRM staff account (must be a manager account).
// Change these two lines to the manager username/password you use to log in to the CRM.
export const OWNER_USERNAME: string = 'admin';
export const OWNER_PASSWORD: string = 'admin123';

// Set DEMO_MODE to false so real live CRM and Supabase cloud data is used across APK and browser
export const DEMO_MODE: boolean = false;

