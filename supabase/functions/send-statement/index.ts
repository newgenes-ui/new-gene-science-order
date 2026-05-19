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

    // 1. 주문자에게 메일 발송 (BCC 제외하고 발송 - 첨부파일 포함)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        // 도메인 인증이 완료되었으므로 회사 메일 주소로 발송 (발신자 이름 추가)
        from: '뉴진사이언스 <order@newgenesci.com>', 
        to: to, // 수신자
        subject: subject,
        html: html,
        attachments: [
          {
            filename: fileName || '거래명세서.pdf',
            content: pdfBase64
          }
        ]
      })
    })

    const data = await res.json()

    // 2. 관리자 참조용(BCC) 주소가 있으면, 본사 메일함으로 '단독 메일(To)'로 1통 더 직접 발송하여 메일플러그 차단 우회
    // 본사 보관용 메일은 첨부파일(PDF)을 제외하고 텍스트/HTML 상세 내역표만 전송하여 메일플러그 스팸 차단을 원천 우회합니다.
    if (res.ok && bcc) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from: '뉴진사이언스 <order@newgenesci.com>', 
          to: bcc, // 본사 메일을 직접 수신처(To)로 지정하여 내부 1:1 메일로 필터 통과
          subject: `[본사 보관용] ${subject}`, // 본사 메일함 분류가 용이하도록 머리말 추가
          html: html
        })
      })
    }

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
