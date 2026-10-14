// Same API as expo-secure-store, but falls back to the browser's localStorage on web
// (secure-store does not exist in browsers).
import {Platform} from 'react-native';
import * as Secure from 'expo-secure-store';

const web = Platform.OS === 'web';
const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);

export const getItemAsync = async (k: string): Promise<string | null> => web ? (ls()?.getItem(k) ?? null) : Secure.getItemAsync(k);
export const setItemAsync = async (k: string, v: string): Promise<void> => { if (web) { ls()?.setItem(k, v); } else { await Secure.setItemAsync(k, v); } };
export const deleteItemAsync = async (k: string): Promise<void> => { if (web) { ls()?.removeItem(k); } else { await Secure.deleteItemAsync(k); } };
