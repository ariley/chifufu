import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

/*
 * ── Supabase Setup ──────────────────────────────────────────────────────────
 * Create a .env file (or .env.local) at the project root and add:
 *
 *   EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
 *
 * Get these from: Supabase Dashboard → Project Settings → API
 *
 * ── SQL Schema (run in Supabase SQL Editor) ─────────────────────────────────
 *
 *   create table public.saved_items (
 *     id uuid default gen_random_uuid() primary key,
 *     user_id uuid references auth.users not null,
 *     item_data jsonb not null,
 *     created_at timestamptz default now()
 *   );
 *   create table public.saved_routes (
 *     id uuid default gen_random_uuid() primary key,
 *     user_id uuid references auth.users not null,
 *     name text not null,
 *     items jsonb not null,
 *     created_at timestamptz default now()
 *   );
 *   alter table public.saved_items enable row level security;
 *   alter table public.saved_routes enable row level security;
 *   create policy "Users own their saved items"
 *     on public.saved_items for all using (auth.uid() = user_id);
 *   create policy "Users own their saved routes"
 *     on public.saved_routes for all using (auth.uid() = user_id);
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
