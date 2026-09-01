import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const SUPABASE_URL = "https://eylztwbrgnglsxqudcgh.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5bHp0d2JyZ25nbHN4cXVkY2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzEzNTIsImV4cCI6MjA5NTc0NzM1Mn0.XGJCdAwcnPrTTE6PbnIhGasRrixguhCHwvWu91H8pJY";

const isBrowser =
  typeof window !== "undefined" && typeof window.document !== "undefined";

// AsyncStorage touches `window` under the hood. On Expo web SSR (Node), that
// crashes Metro with "window is not defined". Use memory storage there.
const memoryStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

const authStorage =
  Platform.OS === "web" && !isBrowser ? memoryStorage : AsyncStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: authStorage,
    persistSession: Platform.OS !== "web" || isBrowser,
    autoRefreshToken: Platform.OS !== "web" || isBrowser,
    detectSessionInUrl: false,
  },
});
