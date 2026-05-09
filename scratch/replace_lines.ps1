$c = Get-Content src/pages/OrderPage.tsx
$c[774] = 'REPLACEME1'
$c[845] = 'REPLACEME2'
$c | Set-Content src/pages/OrderPage.tsx
