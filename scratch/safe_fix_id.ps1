$path = "src/pages/AdminDashboard.tsx"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$content = [System.IO.File]::ReadAllText($path, $utf8NoBom)
$newContent = $content -replace 'text-slate-700 truncate">\{order.id\}', 'text-slate-700">{order.id}'
[System.IO.File]::WriteAllText($path, $newContent, $utf8NoBom)
