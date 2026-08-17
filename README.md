# dsh-astrbotskill

AstrBot 插件开发教程（<https://docs.astrbot.app/dev/star/plugin-new.html>）的**总结**，以 DSH 技能包形式提供。

安装后，插件会把技能 **`astrbot-plugin-dev`** 注册到 DeepSeek Harness，agent 编写/移植 AstrBot 插件时可直接加载该技能。

## 内容（AstrBot 插件开发教程全量）

| # | 主题 | 要点 |
|---|---|---|
| 1 | 从这里开始 | 模板仓库、工程结构、`metadata.yaml`、调试重载 |
| 2 | 最小实例 | `main.py` + `class XxxPlugin(Star)` + `@filter.command` + `yield event.plain_result` |
| 3 | 接收消息事件 | 指令/指令组/别名、事件类型与平台过滤器、生命周期钩子 |
| 4 | 发送消息 | 被动回复、主动推送、富媒体消息链 |
| 5 | 插件配置 | `_conf_schema.json`（JSON Schema）+ `AstrBotConfig` |
| 6 | 插件 Pages | `pages/` + `register_web_api()` + `AstrBotPluginPage` bridge |
| 7 | 插件国际化 | `.astrbot-plugin/i18n/<locale>.json`（metadata/config/pages 三段式） |
| 8 | 调用 AI | `llm_generate`、`FunctionTool`、`tool_loop_agent`、conversation/persona manager |
| 9 | 存储 | `put/get/delete_kv_data`、大文件目录规范 |
| 10 | 文转图 | `text_to_image`、`html_render`（HTML+Jinja2） |
| 11 | 会话控制器 | `session_waiter` / `SessionController` / `SessionFilter` |
| 12 | 杂项 | 平台实例、协议端 API、已加载插件/平台枚举 |
| 13 | 发布插件 | `metadata.yaml` 字段、zip ≤16MB、发布流程 |
| 14 | 共性清单 | 新插件从零到发布 |

## 安装

```sh
直接让DeepseekHarness自己装
```

安装后重启 DeepSeek Harness Desktop 生效；技能出现在技能列表中，名称为 `astrbot-plugin-dev`。

## 仓库结构

```
dsh-astrbotskill/
├── index.js                     # Cordis 插件入口：仅注册技能提供者
├── cordis.patch.yml             # DSH bundle 层声明（id: astrbotskill）
├── package.json
├── skills/
│   └── astrbot-plugin-dev/
│       └── SKILL.md             # AstrBot 插件开发教程全量总结
└── README.md
```
