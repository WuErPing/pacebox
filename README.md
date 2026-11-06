# Pacebox

番茄式提醒计时器：一套代码覆盖 **Android**（原生）与 **macOS**（Expo Web / PWA）。

技术栈与 solo 项目对齐：Expo SDK 57 · expo-router · react-native-web · zustand · AsyncStorage · expo-notifications · expo-audio（录音）· expo-speech（语音提醒）· Vitest · Playwright。

## 功能

- 默认即有一个 25 分钟计时器，按「开始」立即开始（无需任何配置）
- 可配置：总时长（缺省 25 分钟）、第一次提醒（缺省时间过半 50%）、第二次提醒（缺省过 3/4 即 75%）
- 提醒与结束时的语音播报和系统通知均随系统语言切换（中文环境中文，英文环境英文）；macOS（Web/PWA）弹 macOS 系统横幅通知（Web Notification API）；Android 弹系统通知，且预调度保证 App 退到后台后仍准时提醒
- 设置持久化（AsyncStorage / localStorage）

## 开发

```bash
npm install

npm run web        # macOS：浏览器打开 http://localhost:8081（可安装为 PWA）
npm run android    # Android：需要 Android SDK / 模拟器
npm start          # Metro，可选任意平台
```

macOS 上首次使用请在页面内点击「开始」（浏览器要求用户手势后才允许通知），
并在浏览器提示时允许通知；也可用「设置 → 测试语音与系统提示」验证。

### macOS 系统通知（服务端 osascript）

Web 端会优先调用本机通知服务，由服务端执行 `osascript` 弹出系统通知；服务未启动或调用失败时
回退到浏览器通知。另开一个终端常驻：

```bash
npm run notify:server   # http://127.0.0.1:39527，仅本机可访问
```

首次使用可能需要在「系统设置 → 通知」中允许「脚本编辑器」显示通知。Android 端后续单独处理。

## 一键启停

```bash
make start    # 同时启动 notify（39527）与 Expo Web（8081）
make status
make stop     # 同时停止（含 Metro 子进程）
```

也可单独操作：`make start-notify` / `make stop-notify` / `make start-web` / `make stop-web`。
PID 与日志存放在 `.run/`（`notify.log` / `web.log`）。

## 检查

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint-config-expo
npm test           # vitest（计时核心与状态机）
npm run build:web  # expo export --platform web
npm run test:e2e   # playwright（web 冒烟）
```

## 结构

```
src/
  app/            expo-router 页面：index(计时器) settings(设置)
  hooks/          useTimerEngine：tick 循环 + 语音/通知触发 + 原生后台预调度
  lib/
    timer-core.ts 纯逻辑：设置清洗、提醒点计算、格式化（含单测）
    notifier.ts   原生通知（expo-notifications，预调度）
    notifier.web.ts Web 通知（本机 osascript 服务优先，回退 Notification API）
    voice.ts      语音播报（expo-speech）
    messages.ts   中英文语音/通知文案与语言判定（含单测）
  store/          settings(持久化) / timer(状态机)
scripts/notify-server.mjs  本机 macOS 通知服务（osascript）
```
