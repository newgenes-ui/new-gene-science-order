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

    const { to, subject, html, pdfBase64, fileName } = await req.json()

    // Resend API 호출
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        // 현재는 샌드박스 모드이므로 보내는 사람은 Resend 기본 주소 사용
        from: 'onboarding@resend.dev', 
        to: to, // 수신자 (현재는 ngs.202403@gmail.com 만 가능)
        subject: subject,
        html: html,
        attachments: [
          {
            filename: fileName || '거래명세서.pdf',
            content: pdfBase64 // 프론트엔드에서 생성한 PDF를 base64 문자열로 전달받음
          }
        ]
      })
    })

    const data = await res.json()

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: res.ok ? 200 : 400,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
