const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://uceljklstgjucczgzdiq.supabase.co";
const supabaseAnonKey = "sb_publishable___s5rX_sZYwyCWoWz23wrg_VSw1PCez";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSupabase() {
  try {
    console.log("Querying Supabase orders...");
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('orderDateTime', { ascending: false })
      .limit(5);

    if (error) {
      console.error("Supabase error:", error);
    } else {
      console.log("Latest 5 orders:");
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error("Connection error:", err);
  }
}

testSupabase();
