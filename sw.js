指令 2：更新版本号至 v4.7.1
指令： 请帮我更新版本信息到 v4.7.1。

修改 const APP_VERSION 为 'v4.7.1'。

修改 <title> 和 header 中的版本号。

在“关于”部分进行日志归档，并添加新日志：

HTML

<div class="version-history-item">
    <p><strong>版本 v4.7.1 (2025-12-05)</strong></p>
    <ul>
        <li><strong>[Fix]</strong> 修复严重 Bug：点击“开始”后任务偶尔会自动取消或按钮消失。</li>
        <li><strong>[Core]</strong> 引入“本地保护机制”：在操作后的短时间内优先信任本地状态，防止云端旧数据覆盖。</li>
        <li><strong>[Fix]</strong> 解决悬浮窗与应用内状态不同步的问题。</li>
    </ul>
</div>