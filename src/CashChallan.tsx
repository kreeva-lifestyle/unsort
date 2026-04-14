/* eslint-disable */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ulphprdnswznfztawbvg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGhwcmRuc3d6bmZ6dGF3YnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjE4NzYsImV4cCI6MjA4OTkzNzg3Nn0.RRNY3KQhYnkJzSfh-GRoTCgdhDQNhE7kJJrpTq2n_K0'
);

const T = {
  bg: '#060810',
  bd: 'rgba(255,255,255,0.05)', bd2: 'rgba(255,255,255,0.08)',
  tx: '#E2E8F0', tx2: '#8896B0', tx3: '#4A5568',
  ac: '#6366F1', ac2: '#818CF8',
  gr: '#22C55E', re: '#EF4444', yl: '#F59E0B', bl: '#38BDF8',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', -apple-system, sans-serif",
  sora: "'Sora', 'Inter', sans-serif",
};

interface ChallanItem { id?: string; sku: string; description: string; quantity: number; price: number; total: number; }
interface Challan {
  id: string; challan_number: number; customer_id: string | null; customer_name: string;
  status: string; subtotal: number; discount_type: string | null; discount_value: number;
  discount_amount: number; round_off: number; total: number; amount_paid: number;
  payment_mode: string | null; payment_date: string | null; notes: string; tags: string[];
  created_by: string; modified_by: string; voided_by: string | null; voided_at: string | null;
  created_at: string; updated_at: string; items?: ChallanItem[];
}
interface Customer { id: string; name: string; phone: string; address: string; }

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  paid: { bg: 'rgba(34,197,94,.10)', color: T.gr },
  unpaid: { bg: 'rgba(239,68,68,.10)', color: T.re },
  partial: { bg: 'rgba(245,158,11,.10)', color: T.yl },
  voided: { bg: 'rgba(255,255,255,.05)', color: T.tx3 },
};

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

export default function CashChallan() {
  // TODO: Component body in next parts
  return <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>Cash Challan</div>
    <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>Loading module...</div>
  </div>;
}
