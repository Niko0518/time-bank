@echo off
chcp 65001 >nul
echo ========================================
echo CloudBase Watch 订阅自动配置工具
echo ========================================
echo.
echo 正在检查 CloudBase CLI...
tcb --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 CloudBase CLI，请先安装
    pause
    exit /b 1
)

echo [OK] CloudBase CLI 已安装
echo.

set ENV_ID=cloud1-8gvjsmyd7860b4a3
set COLLECTION=tb_transaction
set FUNCTION=transaction-watcher

echo 正在配置触发器...
echo 环境 ID: %ENV_ID%
echo 集合：%COLLECTION%
echo 函数：%FUNCTION%
echo.

echo 请确保已在浏览器中登录 CloudBase 控制台
pause

echo 正在调用 CloudBase API 创建触发器...
powershell -ExecutionPolicy Bypass -Command ^
"$body = @{^
    envId = '%ENV_ID%^';^
    triggerName = 'tb_transaction_watcher_trigger';^
    triggerType = 'database';^
    triggerConfig = @{^
        collection = '%COLLECTION%^';^
        event = 'insert';^
        functionName = '%FUNCTION%'^
    }^
} | ConvertTo-Json -Depth 10;^
Invoke-RestMethod -Uri 'https://tcb.cloud.tencent.com/api/trigger/create' -Method Post -Body $body -ContentType 'application/json'" 2>$null

if %errorlevel% equ 0 (
    echo.
    echo [成功] 触发器配置完成！
    echo.
    echo 请前往 CloudBase 控制台验证：
    echo https://tcb.cloud.tencent.com/dev?envId=%ENV_ID%#/scf
    echo.
    echo 在「云函数」页面找到 %FUNCTION%，点击「触发器管理」标签查看
    pause
) else (
    echo.
    echo [提示] API 调用需要浏览器登录状态
    echo 请手动配置：
    echo 1. 打开 https://tcb.cloud.tencent.com/dev?envId=%ENV_ID%
    echo 2. 左侧菜单 → 「云函数」
    echo 3. 找到 %FUNCTION% 函数，点击进入详情
    echo 4. 点击顶部「触发器管理」标签
    echo 5. 点击「添加触发器」
    echo 6. 类型选择「数据库触发器」
    echo 7. 配置：集合=%COLLECTION%, 事件=INSERT
    echo 8. 保存
    pause
)
