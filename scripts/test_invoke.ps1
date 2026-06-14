$params = '{"action":"saveTask","data":{"taskId":"v9011_deploy_verify","name":"v9.0.11 deploy verify","type":"earn","amount":10,"unit":"minutes","category":"test","multiplier":1,"isHabit":false,"habitDetails":{},"enableFloatingTimer":false,"lastUsed":null,"isSystem":false,"completionCount":7,"data":{}},"userInfo":{"openId":"v9011_test"}}'
# Validate JSON before invoking
try {
    $obj = $params | ConvertFrom-Json
    Write-Host "✓ JSON valid"
    Write-Host "  action: $($obj.action)"
    Write-Host "  completionCount: $($obj.data.completionCount)"
} catch {
    Write-Host "✗ JSON invalid: $_"
    exit 1
}
# Try invoke with both quoting styles
Write-Host "`n--- Try 1: single-quoted ---"
& tcb fn invoke tbMutation --params $params
Write-Host "`n--- Try 2: with --debug ---"
& tcb fn invoke tbMutation --params $params --debug 2>&1 | Select-Object -First 5
