## TimeBank Android 项目开发准备总结

### 项目架构
- **Hybrid App**：WebView 加载前端 + 原生 Java 桥接
- 前端目录：`android_project/app/src/main/assets/www/`
- 原生代码目录：`android_project/app/src/main/java/com/jianglicheng/timebank/`

### 核心技术栈
1. **前端**：HTML5 + CloudBase SDK v2
2. **原生**：Java (Android SDK 24-36)
3. **关键能力**：
   - 悬浮窗服务
   - 精确闹钟
   - 屏幕时间统计
   - 桌面小组件 (8种样式)
   - 通知推送

### 开发者需要关注的重点文件
- `MainActivity.java` - WebView 容器
- `WebAppInterface.java` - JS 桥接接口 (60+ 方法)
- `index.html` - 前端入口
- `AndroidManifest.xml` - 权限和组件声明

### 下一步
等待用户明确开发需求（前端/原生/小组件），然后开始实现。