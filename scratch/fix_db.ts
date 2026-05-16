import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://uovpvtntkghpxhghfkvp.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error("VITE_SUPABASE_ANON_KEY is missing in env!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const ids = ['20260511-71659-084840', '20260511-1'];
  for (const id of ids) {
    const { data: order } = await supabase.from('orders').select('other_request').eq('id', id).single();
    const req = order?.other_request || '';
    if (!req.includes('[명세서발행]')) {
      const updated = req ? `${req} [명세서발행]` : '[명세서발행]';
      const { error } = await supabase.from('orders').update({ other_request: updated }).eq('id', id);
      if (error) {
        console.error(`❌ Failed to update ${id}:`, error.message);
      } else {
        console.log(`✅ Successfully fixed ${id}`);
      }
    } else {
      console.log(`ℹ️ ${id} is already tagged as invoiced.`);
    }
  }
}

fix();
