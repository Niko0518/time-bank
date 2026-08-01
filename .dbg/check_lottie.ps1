$json = Get-Content 'd:\TimeBank\log&data\Split Jump Exercise.json' -Raw | ConvertFrom-Json
Write-Host "Version: $($json.v)"
Write-Host "Frame Rate: $($json.fr)"
Write-Host "Width: $($json.w)"
Write-Host "Height: $($json.h)"
Write-Host "Total Frames: $($json.op)"
Write-Host "Layers count: $($json.layers.Count)"
Write-Host "Assets count: $($json.assets.Count)"
foreach ($layer in $json.layers) {
    Write-Host "Layer: $($layer.nm) | Type: $($layer.ty)"
}
Write-Host "File size: $((Get-Item 'd:\TimeBank\log&data\Split Jump Exercise.json').Length) bytes"
