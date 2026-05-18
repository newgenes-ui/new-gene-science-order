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

    const { to, bcc, subject, html, pdfBase64, fileName } = await req.json()

    // Resend API 호출
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        // 도메인 인증이 완료되었으므로 회사 메일 주소로 발송 (발신자 이름 추가)
        from: '뉴진사이언스 <order@newgenesci.com>', 
        to: to, // 수신자 (어떤 메일로든 발송 가능)
        bcc: bcc || undefined, // 관리자 참조용
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
