param([string]$Path)
$c = [System.IO.File]::ReadAllText($Path)
$c = [regex]::Replace($c, "`r`n", "`n")
[System.IO.File]::WriteAllText($Path, $c)
