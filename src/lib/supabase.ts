// Supabase client and auth helpers
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ulphprdnswznfztawbvg.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGhwcmRuc3d6bmZ6dGF3YnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjE4NzYsImV4cCI6MjA4OTkzNzg3Nn0.RRNY3KQhYnkJzSfh-GRoTCgdhDQNhE7kJJrpTq2n_K0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
