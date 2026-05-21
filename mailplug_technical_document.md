# [기술 증빙 자료] 뉴진사이언스 외부 메일 연동 및 수신 차단 원인 분석 요청서

본 문서는 주식회사 뉴진사이언스의 공식 도메인(`newgenesci.com`)을 활용한 신규 주문 관리 어플리케이션 개발 과정에서 발생한 **메일플러그 메일 수신 및 전송 차단(Drop) 현상**에 대한 상세 기술 규격과 설정 증빙 자료입니다. 

메일플러그 기술지원팀의 원활한 로그 분석 및 스팸 게이트웨이 보안 예외 처리를 위해 아래와 같이 당사의 도메인 및 메일 발송 설정 정보를 제공합니다.

---

## 1. 개요 및 장애 현상

*   **시스템 구성**: 주문 어플리케이션에서 거래명세서 발행 요청 시, 클라우드 API를 거쳐 고객(주문자)과 본사 관리자에게 메일플러그 도메인(`order@newgenesci.com`) 이름으로 메일을 동시 발송하도록 설계됨.
*   **장애 현상**:
    *   **개인 포털 메일 (네이버 등)**: 지연이나 오류 없이 첨부파일(PDF)까지 완벽하게 수신 성공.
    *   **본사 메일플러그 메일 (`newgenes@newgenesci.com`)**: 받은메일함 및 스팸메일함 전체에서 수신 불가 (서버 게이트웨이 단에서 원천 차단 추정).
    *   **주문자 회사 메일 (외부 기업 메일)**: 본사 메일과 동일하게 강력한 기업용 메일 보안 필터에 걸려 전송 실패 또는 차단되는 것으로 강력히 추정됨.

---

## 2. 메일 발송 아키텍처 및 경로

당사 서비스에서 발송되는 이메일은 글로벌 메일 전송 표준인 **Resend API**의 안전한 보안 발송 서버망을 통하여 신뢰성 있게 처리되고 있습니다.

```mermaid
graph TD
    App["1. 주문 관리 앱 (거래명세서 발행)"] -->|PDF & HTML 데이터 전달| Edge["2. Supabase 클라우드 서버 (Edge Function)"]
    Edge -->|보안 API 호출 (HTTPS)| Resend["3. Resend 메일 전송 플랫폼 (SMTP 발송)"]
    
    Resend -->|SPF/DKIM 정상 통과| Naver["4. 일반 개인 메일 (네이버 등) - [수신 성공]"]
    Resend -->|SPF/DKIM 정상 통과 시도| Mailplug["5. 메일플러그 수신 서버 (newgenes@newgenesci.com) - [수신 거부/차단]"]
    Resend -->|SPF/DKIM 정상 통과 시도| CorpMail["6. 고객사 기업 메일 (기업 보안 필터) - [수신 거부/차단 추정]"]

    style Naver fill:#e1f5fe,stroke:#039be5,stroke-width:2px
    style Mailplug fill:#ffebee,stroke:#e53935,stroke-width:2px
    style CorpMail fill:#ffebee,stroke:#e53935,stroke-width:2px
```

*   **발신자 표기 (From)**: `뉴진사이언스 <order@newgenesci.com>`
*   **실물 사서함 상태**: `order@newgenesci.com`은 메일플러그 관리자 패널에 정상 개설된 실제 물리 사서함 계정입니다.

---

## 3. 도메인 DNS 설정 및 메일 인증 현황

당사는 메일플러그 네임서버(`ns.mailplug.com`)를 사용 중이며, 메일 사칭 방지 규격(SPF, DKIM, DMARC)을 아래와 같이 표준 규격에 맞추어 완벽하게 구성하여 정상 작동 중임을 증빙합니다.

| 구분 (Type) | 레코드 이름 (Host/Name) | 설정 값 (TXT Record Value) | 검증 상태 (Verification Status) | 비고 |
| :--- | :--- | :--- | :--- | :--- |
| **SPF** | `@` (root) | `v=spf1 mx include:mailplug.com include:_spf.resend.com ~all` | **정상 조회 완료** | 메일플러그 및 Resend 발송망을 모두 승인 처리 완료 |
| **DMARC** | `_dmarc` | `v=DMARC1; p=none;` | **정상 조회 완료** | 메일 위조 방지 정책 기본값 적용 |
| **DKIM #1** | `resend._domainkey` | `CNAME` ➔ `dkim1.resend.com` | **인증 성공 (Verified)** | Resend 발송 서버 인증 토큰 |
| **DKIM #2** | `resend2._domainkey` | `CNAME` ➔ `dkim2.resend.com` | **인증 성공 (Verified)** | Resend 발송 서버 인증 토큰 |
| **DKIM #3** | `resend3._domainkey` | `CNAME` ➔ `dkim3.resend.com` | **인증 성공 (Verified)** | Resend 발송 서버 인증 토큰 |

---

## 4. 상세 분석 및 차단 원인 추정

1.  **발송 서버의 무결성**: 네이버 등의 포털 메일로 정상 전송되고 헤더 값 확인 시 SPF 및 DKIM이 모두 `PASS` 처리되는 것으로 보아, 외부 발송 엔진(Resend) 자체의 스팸 점수나 차단 문제는 없습니다.
2.  **메일플러그 스팸 게이트웨이 오차단**:
    *   보낸 사람 도메인이 자사 도메인(`newgenesci.com`)인데, 내부 메일플러그 SMTP가 아닌 외부 발송 엔진(Resend API)의 IP 대역을 거쳐 유입되므로, 메일플러그 보안 필터가 이를 **'자사 도메인 불법 사칭'**으로 오인하여 강제 드롭(Drop)시키는 현상으로 보입니다.
    *   마찬가지로 주문자의 회사 메일 서버들도 엄격한 기업 보안 규칙을 사용하므로, SPF 레코드가 합산되어 있음에도 불구하고 외부 발송 엔진 대역 전체가 스팸 차단 처리가 되어 전달되지 않는 현상일 가능성이 높습니다.

---

## 5. 메일플러그 기술지원팀 요청 사항

1.  **메일 수신/반송 로그 추적 요청**:
    *   **발송 일시**: 2026년 5월 19일 오전 9시 25분 ~ 10시 00분 경 (한국 표준시)
    *   **발신자**: `order@newgenesci.com`
    *   **수신자**: `newgenes@newgenesci.com`
    *   위 발송 시도 건에 대하여 메일플러그 스팸 차단 게이트웨이 및 수신 서버 단에서 **어떤 규칙/차단 필터(예: 자사 도메인 사칭 방지, 발송 IP 차단 등)**에 걸려 차단 처리가 되었는지 상세 로그 분석을 요청합니다.
2.  **보안 필터 예외 처리 및 화이트리스트 등록**:
    *   당사 공식 발송 시스템 주소인 `order@newgenesci.com` 및 연동 발송 서버(Resend 대시보드 도메인 서명 완료 상태)에서 인입되는 메일에 대해, 스팸 차단 필터를 거치지 않고 **100% 정상 수신되도록 화이트리스트 등록 및 보안 예외 설정**을 처리해 주시기 바랍니다.
