// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://imxobwmjctlptqtxmfyh.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_qPUcR1JcsuyCUHwQ5S-5Tw_N9eKfoMN";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);