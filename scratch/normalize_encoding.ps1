$c = Get-Content -Path src/pages/OrderPage.tsx
$c | Set-Content -Path src/pages/OrderPage.tsx -Encoding UTF8
