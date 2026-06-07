// Native fetch will be used

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby2VTQXY6niWG4_agJULS6NUUGQIjlwXxhzld9LfwMo_22evJbjwrDtE697Oze5iV1rog/exec";

async function testGAS() {
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

  try {
    console.log("Sending POST to Google Apps Script...");
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailParams)
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response Text:", text);
  } catch (err) {
    console.error("Error sending POST:", err);
  }
}

testGAS();
