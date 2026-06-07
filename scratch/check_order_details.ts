import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkOrderDetails() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .ilike('id', '%20260526%180109%');

  if (error) {
    console.error('Error fetching order:', error);
  } else {
    console.log('Order found:', orders);
  }
}

checkOrderDetails();
