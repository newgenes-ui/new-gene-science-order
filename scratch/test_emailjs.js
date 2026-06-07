// Native fetch will be used

async function testEmailJS() {
  const serviceId = 'service_h8f3lfs';
  const templateId = 'template_67u1m86';
  const publicKey = 'Y4Bf666YxL-LOnR4h';

  const emailParams = {
    order_id:       "TEST-123456",
    order_date:     "2026-06-07",
    client_name:    "테스트 업체 (공용)",
    orderer_name:   "테스트 주문자",
    orderer_phone:  "010-1234-5678",
    orderer_email:  "newgenes@newgenesci.com",
    customer_name:  "테스트 주문자",
    from_name:      "테스트 주문자",
    contact_number: "010-1234-5678",
    reply_to:       "newgenes@newgenesci.com",
    items_text:     "• 테스트 상품 1개",
    subtotal_amount: "₩10,000",
    vat_amount:      "₩1,000",
    total_amount:   "₩11,000",
    other_request:  "테스트 요청사항입니다.",
    to_email:       "newgenes@newgenesci.com",
    ngs_email:      "newgenes@newgenesci.com",
    client_email:   "newgenes@newgenesci.com",
    order_title:    "[테스트 업체 견적 접수]",
  };

  const payload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: emailParams
  };

  try {
    console.log("Sending POST to EmailJS...");
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response Text:", text);
  } catch (err) {
    console.error("Error sending POST:", err);
  }
}

testEmailJS();
