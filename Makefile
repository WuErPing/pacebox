.PHONY: start stop restart status start-notify stop-notify start-web stop-web

# 同时启动本机通知服务（39527）与 Expo Web（8081）
start:
	@node scripts/dev.mjs start

# 同时停止两者（含 Metro 子进程）
stop:
	@node scripts/dev.mjs stop

restart: stop start

status:
	@node scripts/dev.mjs status

start-notify:
	@node scripts/dev.mjs start notify

stop-notify:
	@node scripts/dev.mjs stop notify

start-web:
	@node scripts/dev.mjs start web

stop-web:
	@node scripts/dev.mjs stop web
