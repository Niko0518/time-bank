$json = '{"action":"getStatus"}'
Write-Host "JSON: $json"
Write-Host "Length: $($json.Length)"
Write-Host "---"
# Use the & operator and pass as a single argument
& tcb fn invoke tbMutation --params "$json" 2>&1
