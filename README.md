# Pacebox

番茄式提醒计时器：一套代码覆盖 **Android**（原生）与 **macOS**（Expo Web / PWA）。

技术栈与 solo 项目对齐：Expo SDK 57 · expo-router · react-native-web · zustand · AsyncStorage · expo-notifications · expo-audio · Vitest · Playwright。

## 功能

- 默认即有一个 25 分钟计时器，按「开始」立即开始（无需任何配置）
- 可配置：总时长（缺省 25 分钟）、第一次提醒（缺省时间过半 50%）、第二次提醒（缺省过 3/4 即 75%）
- 提醒与结束时响铃；macOS（Web/PWA）弹 macOS 系统横幅通知（Web Notification API）；Android 弹系统通知，且预调度保证 App 退到后台后仍准时提醒
- 设置持久化（AsyncStorage / localStorage）

## 开发

```bash
npm install

npm run web        # macOS：浏览器打开 http://localhost:8081（可安装为 PWA）
npm run android    # Android：需要 Android SDK / 模拟器
npm start          # Metro，可选任意平台
```

macOS 上首次使用请在页面内点击「开始」（浏览器要求用户手势后才允许声音/通知），
并在浏览器提示时允许通知；也可用「设置 → 测试铃声与系统提示」验证。

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
  hooks/          useTimerEngine：tick 循环 + 响铃/通知触发 + 原生后台预调度
  lib/
    timer-core.ts 纯逻辑：设置清洗、提醒点计算、格式化（含单测）
    notifier.ts   原生通知（expo-notifications，预调度）
    notifier.web.ts Web 通知（Notification API）
    bell.ts       铃声（expo-audio，assets/sounds/bell.wav）
  store/          settings(持久化) / timer(状态机)
scripts/generate-bell.mjs  生成铃声资源
```
