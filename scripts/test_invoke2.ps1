# Try a minimal JSON first
Write-Host "=== Test 1: minimal JSON ==="
& tcb fn invoke tbMutation --params '{"action":"getStatus"}' 2>&1

Write-Host "`n=== Test 2: action only ==="
& tcb fn invoke tbMutation --params '{""action"":""getStatus""}' 2>&1

Write-Host "`n=== Test 3: with escaped quotes ==="
$json = '{""action"":""saveTask"",""data"":{""taskId"":""v9011_dep"",""name"":""v9.0.11 verify"",""completionCount"":7}}'
Write-Host "JSON: $json"
& tcb fn invoke tbMutation --params $json 2>&1
