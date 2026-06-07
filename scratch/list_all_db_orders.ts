import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function listAll() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, client_id, client_name, order_date, status, order_type');

  if (error) {
    console.error('Error fetching orders:', error);
  } else {
    console.log('Total orders in DB:', orders?.length);
    console.log(orders);
  }
}

listAll();
