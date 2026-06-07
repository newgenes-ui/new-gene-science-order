import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS 처리 (웹에서 직접 호출 시 필요)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY가 설정되지 않았습니다.')
    }

    const { to, bcc, subject, html } = await req.json()

    // 1. 주문자에게 메일 발송
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: '뉴진사이언스 <order@newgenesci.com>', 
        to: to,
        subject: subject,
        html: html
      })
    })

    const data = await res.json()
    
    if (!res.ok) {
      console.error('❌ Resend API 주문자 메일 발송 실패:', JSON.stringify(data))
    } else {
      console.log('✅ Resend API 주문자 메일 발송 성공:', to)
    }

    // 2. 관리자 참조용(BCC) 주소가 있으면, 본사 메일함으로 '단독 메일(To)'로 직접 발송
    // 주문자 메일 성공/실패와 무관하게 항상 시도
    if (bcc) {
      try {
        const adminRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`
          },
          body: JSON.stringify({
            from: '뉴진사이언스 <order@newgenesci.com>', 
            to: bcc,
            subject: `[본사 보관용] ${subject}`,
            html: html
          })
        })
        const adminData = await adminRes.json()
        if (!adminRes.ok) {
          console.error('❌ Resend API 관리자 메일 발송 실패:', JSON.stringify(adminData))
        } else {
          console.log('✅ Resend API 관리자 메일 발송 성공:', bcc)
        }
      } catch (adminErr) {
        console.error('❌ 관리자 메일 발송 중 예외:', adminErr)
      }
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: res.ok ? 200 : 400,
    })
  } catch (error: any) {
    console.error('❌ Edge Function 전체 오류:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
