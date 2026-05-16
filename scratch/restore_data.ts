
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

// .env 파일이 없으면 직접 src/lib/supabase.ts에서 정보를 가져와야 함
// 여기서는 안전하게 프로젝트 내의 supabase 설정 파일을 읽거나 환경 변수를 사용합니다.

const supabaseUrl = 'https://uovpvtntkghpxhghfkvp.supabase.co';
// API Key는 보안상 파일에서 직접 읽거나 유추해야 함. 
// src/lib/supabase.ts 내용을 확인하여 키를 가져옵니다.

async function restoreData() {
  const supabaseKey = 'YOUR_KEY_HERE'; // 이 부분은 실제 파일에서 읽어올 예정입니다.
  const supabase = createClient(supabaseUrl, supabaseKey);

  const targets = ['20260511-71659-084840', '20260511-1'];
  
  console.log('🔄 데이터 복구 시작...');

  for (const id of targets) {
    const { data: order } = await supabase.from('orders').select('other_request').eq('id', id).single();
    const currentReq = order?.other_request || '';
    if (!currentReq.includes('[명세서발행]')) {
      const updatedReq = currentReq ? `${currentReq} [명세서발행]` : '[명세서발행]';
      const { error } = await supabase.from('orders').update({ other_request: updatedReq }).eq('id', id);
      if (error) console.error(`❌ ${id} 복구 실패:`, error.message);
      else console.log(`✅ ${id} 복구 완료!`);
    } else {
      console.log(`ℹ️ ${id}는 이미 복구되어 있습니다.`);
    }
  }
}
