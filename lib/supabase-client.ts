'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://rvcfhnwqatxdldobpmss.supabase.co';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2Y2ZobndxYXR4ZGxkb2JwbXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjAyMDMsImV4cCI6MjEwMDE5NjIwM30.4-4saXGQzRAksYJBnlIttSXC0v63CUbGHzTUIIs3gLU';

/**
 * Untyped Supabase client. We keep hand-maintained row types in
 * lib/database-types.ts and cast query results where needed, but do not
 * bind the client generic so inserts/updates with Partial shapes resolve
 * cleanly without fighting Supabase's generated-type inference.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
