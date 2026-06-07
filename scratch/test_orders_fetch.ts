import { getOrdersFromSupabase } from '../src/store/orderStore';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testFetch() {
  const orders = await getOrdersFromSupabase();
  console.log('Returned orders:', orders ? orders.slice(0, 3) : null);
}

testFetch();
