$path = "src/pages/AdminDashboard.tsx"
$content = Get-Content $path -Raw
$newContent = $content -replace 'text-slate-700 truncate">\{order.id\}', 'text-slate-700">{order.id}'
$newContent | Set-Content $path
