import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://eylztwbrgnglsxqudcgh.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5bHp0d2JyZ25nbHN4cXVkY2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzEzNTIsImV4cCI6MjA5NTc0NzM1Mn0.XGJCdAwcnPrTTE6PbnIhGasRrixguhCHwvWu91H8pJY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
