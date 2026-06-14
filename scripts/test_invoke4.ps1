$json = '{"action":"getStatus"}'
Write-Host "JSON: [$json]"

# Test 1: direct
Write-Host "`n=== Test 1: $ tcb fn invoke tbMutation --params $json ==="
& tcb fn invoke tbMutation --params $json
Write-Host "Exit: $LASTEXITCODE"

# Test 2: try invoke --name
Write-Host "`n=== Test 2: --name param style ==="
& tcb fn invoke --name tbMutation --params $json
Write-Host "Exit: $LASTEXITCODE"

# Test 3: tcb fn list
Write-Host "`n=== Test 3: tcb fn list ==="
& tcb fn list 2>&1 | Select-Object -First 15
