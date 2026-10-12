$root = 'D:\TripleSeven\TrailAsia'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$changed = 0

Get-ChildItem -Path $root -Recurse -File -Include *.js, *.md, *.ps1 |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
    ForEach-Object {
        $text = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
        if ($text -like '*utf8mb4_0900_ai_ci*') {
            $text = $text.Replace('utf8mb4_0900_ai_ci', 'utf8mb4_general_ci')
            [System.IO.File]::WriteAllText($_.FullName, $text, $utf8NoBom)
            Write-Host "  updated  $($_.FullName.Substring($root.Length + 1))"
            $changed++
        }
    }
Write-Host "`n$changed file(s) updated."
