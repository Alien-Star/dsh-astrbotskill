---
name: astrbot-plugin-dev
description: AstrBot 插件开发教程（docs.astrbot.app/dev/star）全量总结。覆盖：从这里开始、最小实例、接收消息事件、发送消息、插件配置、插件 Pages、插件国际化、调用 AI、存储、文转图、会话控制器、杂项、发布插件。当需要开发、修改或移植 AstrBot 插件时使用。
---

# AstrBot 插件开发教程总结

来源：<https://docs.astrbot.app/dev/star/>（插件开发 🌠 系列 + 旧版指南）。本总结按教程顺序整理全部核心 API 与约定。

## 1. 从这里开始（环境与工程结构）

- 用 GitHub 模板仓库 `AstrBotDevs/helloworld` → `Use this template` 创建插件仓库；插件名推荐 `astrbot_plugin_` 开头、全小写、无空格、尽量简短。
- 本地开发：`git clone https://github.com/AstrBotDevs/AstrBot`，把插件仓库放进 `AstrBot/data/plugins/<你的插件名>`。
- **必须更新 `metadata.yaml`**（插件市场信息展示依赖它）。
- 调试：AstrBot 运行时注入插件，改代码后在 WebUI「插件管理 → 管理 → 重载插件」，失败可点"尝试一键重载修复"。
- 依赖：插件目录放 `requirements.txt`（pip 格式），防止用户安装时 Module Not Found。
- 开发原则：功能要测试、写注释、持久化数据存 `data` 目录（防更新/重装覆盖）、良好错误处理、提交前 `ruff` 格式化、**不要用 `requests`**（用 aiohttp/httpx 等异步库）、扩展现有插件优先提 PR。

## 2. 最小实例

插件类所在文件**必须命名为 `main.py`**；插件 = 继承 `Star` 的类 + 装饰器注册的 handler：

```python
from astrbot.api.event import filter, AstrMessageEvent, MessageEventResult
from astrbot.api.star import Context, Star
from astrbot.api import logger  # 使用 astrbot 提供的 logger，勿用 logging 模块

class MyPlugin(Star):
    def __init__(self, context: Context):
        super().__init__(context)

    @filter.command("helloworld")  # 注册指令：发送 /helloworld 触发
    async def helloworld(self, event: AstrMessageEvent):
        '''这是一个 hello world 指令'''  # handler 描述，会被解析展示，建议填写
        user_name = event.get_sender_name()
        message_str = event.message_str  # 消息纯文本
        logger.info("触发hello world指令!")
        yield event.plain_result(f"Hello, {user_name}!")  # 发送纯文本回复

    async def terminate(self):
        '''可选：插件被卸载/停用时调用，做清理'''
```

约定：
- Handler 必须写在插件类内，**前两个参数必须是 `self` 和 `event: AstrMessageEvent`**。
- 回复用 `yield event.xxx_result(...)`；生命周期钩子内不能 yield，用 `await event.send(...)`。
- 每个插件 `__init__` 后自动拥有独立 `self.logger`，等级可在 WebUI 单独设置。

### 消息对象与消息链

`AstrMessageEvent` 是消息事件对象，`event.message_obj` 拿到 `AstrBotMessage`：

```python
class AstrBotMessage:
    type: MessageType      # 消息类型
    self_id: str           # 机器人的识别id
    session_id: str        # 会话id
    message_id: str        # 消息id
    group_id: str = ""     # 群组id，私聊为空
    sender: MessageMember  # 发送者
    message: List[BaseMessageComponent]  # 消息链，如 [Plain("Hello"), At(qq=123456)]
    message_str: str       # 纯文本消息字符串（把消息链中 Plain 连接起来）
    raw_message: object    # 平台下发原始消息
    timestamp: int
```

消息链组件：`import astrbot.api.message_components as Comp`；`Comp.Plain(text)`（文本）、`Comp.At(qq=)`（@）、`Comp.Image(file=)`、`Comp.Face(id=)`（QQ 表情）、`Comp.Record(file=)`（语音，仅 wav）、`Comp.Video(...)`、`Comp.File(file=, name=)`、`Comp.Reply(...)`、`Comp.Node(uin=, name=, content=[...])`（群合并转发，仅 OneBot v11）等。

## 3. 接收消息事件

注册器在 `astrbot.api.event.filter` 下，**必须显式导入**（否则与 Python 内置 `filter` 冲突）。

### 指令与指令组

```python
@filter.command("add")          # 带参指令自动解析类型
async def add(self, event: AstrMessageEvent, a: int, b: int):  # /add 1 2
    yield event.plain_result(str(a + b))

@filter.command("help", alias={'帮助', 'helpme'})   # 别名（v3.4.28+）
@filter.command("helloworld", priority=1)           # 优先级（>=v3.4.21，默认 0）

@filter.command_group("math")   # 指令组
async def math(self, event: AstrMessageEvent): pass
@math.command("add")            # /math add
async def math_add(self, event: AstrMessageEvent, a: int, b: int): ...
# 嵌套组用 @math.group("calc")，可无限嵌套
```

### 过滤器与枚举（多过滤器为 AND 关系）

```python
@filter.event_message_type(filter.EventMessageType.ALL)                # ALL / PRIVATE_MESSAGE / GROUP_MESSAGE
@filter.platform_adapter_type(filter.PlatformAdapterType.AIOCQHTTP | filter.PlatformAdapterType.QQOFFICIAL)
@filter.permission_type(filter.PermissionType.ADMIN)                   # 仅管理员
```

`PlatformAdapterType` 全量：`AIOCQHTTP, QQOFFICIAL, QQOFFICIAL_WEBHOOK, TELEGRAM, WECOM, WECOM_AI_BOT, LARK, DINGTALK, DISCORD, SLACK, KOOK, VOCECHAT, WEIXIN_OFFICIAL_ACCOUNT, SATORI, MISSKEY, LINE, MATRIX, WEIXIN_OC, MATTERMOST, WEBCHAT, ALL`。

### 事件钩子（全部不能 yield，用 `await event.send(...)`）

| 装饰器 | 签名 | 说明 |
|---|---|---|
| `@filter.on_astrbot_loaded()` | `(self, event)` | Bot 初始化完成 |
| `@filter.on_waiting_llm_request()` | `(self, event)` | 等待 LLM 请求（锁外），适合发"正在等待..." |
| `@filter.on_llm_request()` | `(self, event, req: ProviderRequest)` | 可改 `req.system_prompt`；动态内容用 `req.extra_user_content_parts.append(TextPart(text=...))`，临时内容 `.mark_as_temp()`（>=v4.24.0） |
| `@filter.on_llm_response()` | `(self, event, resp: LLMResponse)` | LLM 返回后 |
| `@filter.on_agent_begin()` | `(self, event, run_context: ContextWrapper[AstrAgentContext])` | >v4.23.1 |
| `@filter.on_using_llm_tool()` | `(self, event, tool: FunctionTool, tool_args: dict \| None)` | >v4.23.1 |
| `@filter.on_llm_tool_respond()` | `(self, event, tool, tool_args, tool_result: CallToolResult \| None)` | >v4.23.1 |
| `@filter.on_agent_done()` | `(self, event, run_context, resp: LLMResponse)` | >v4.23.1 |
| `@filter.on_decorating_result()` | `(self, event)` | 装饰 `event.get_result().chain`（如 `chain.append(Comp.Plain("!"))`） |
| `@filter.after_message_sent()` | `(self, event)` | 消息发送后 |

事件传播控制：`event.stop_event()` —— 停止后续所有步骤（其它插件 handler、LLM 请求都不再执行）。

## 4. 发送消息

### 被动回复（yield）

```python
yield event.plain_result("Hello!")                    # 纯文本
yield event.image_result("path/to/image.jpg")         # 本地图片
yield event.image_result("https://example.com/x.jpg") # URL 图片（必须以 http/https 开头）
```

### 主动推送（定时任务等场景）

```python
from astrbot.api.event import MessageChain

umo = event.unified_msg_origin   # 会话唯一 ID 字符串，可存储后定时/延后发送
chain = MessageChain().message("Hello!").file_image("path/to/image.jpg")
await self.context.send_message(umo, chain)   # 部分平台不支持主动消息
```

### 富媒体（消息链）

```python
chain = [
    Comp.At(qq=event.get_sender_id()),
    Comp.Plain("来看这个图："),
    Comp.Image.fromURL("https://example.com/image.jpg"),
    Comp.Image.fromFileSystem("path/to/image.jpg"),
]
yield event.chain_result(chain)
```

提示：aiocqhttp 对 plain 发送会 `strip()`，可用零宽空格 `\u200b` 保留首尾空白。

## 5. 插件配置

在插件目录放 **`_conf_schema.json`**（JSON Schema 格式），AstrBot 自动解析、WebUI 可视化，配置以 `AstrBotConfig`（Dict 子类）注入 `__init__`：

```json
{
  "token": { "description": "Bot Token", "type": "string" },
  "sub_config": {
    "description": "测试嵌套配置",
    "type": "object",
    "hint": "xxxx",
    "items": {
      "name": {"description": "testsub", "type": "string", "hint": "xxxx"},
      "id": {"description": "testsub", "type": "int", "hint": "xxxx"},
      "time": {"description": "testsub", "type": "int", "hint": "xxxx", "default": 123}
    }
  }
}
```

```python
from astrbot.api import AstrBotConfig

class ConfigPlugin(Star):
    def __init__(self, context: Context, config: AstrBotConfig):  # AstrBotConfig 继承 Dict
        super().__init__(context)
        self.config = config
        # self.config.save_config()  # 可主动保存配置
```

字段说明：
- `type`（必填）：`string, text, int, float, bool, object, list, dict, template_list`（text 渲染为可拖拽 textarea）。
- `description`（描述）、`hint`（问号提示）、`obvious_hint`（醒目）、`default`（缺省：int 0 / float 0.0 / bool False / string "" / object {} / list []）、`items`（object 的子 Schema，可无限嵌套）、`invisible`（隐藏，默认 false）、`options`（下拉可选项）、`editor_mode` / `editor_language` / `editor_theme`（代码编辑器配置）。
- `_special`（>=v4.0.0）：`select_provider, select_provider_tts, select_provider_stt, select_persona`（结果字符串）、`select_knowledgebase`（结果 list，多选）。**勿用** Core 内部值（select_providers/provider_pool/persona_pool/select_plugin_set/t2i_template/get_embedding_dim/select_agent_runner_provider:*）。
- `file` 类型（v4.13.0+，多文件上传）：`{"type": "file", "default": [], "file_types": ["pdf", "docx"]}`。
- `dict` 类型可配 `template_schema`（内嵌项可含 `slider: {"min","max","step"}`）。
- `template_list` 类型（v4.10.4+）：`"templates": {"template_1": {"name", "hint", "display_item", "hide_hint_in_list", "items": {...}}}`；保存后每项带 `"__template_key": "template_1"`；`display_item` 用点号支持嵌套（如 `meta.name`）。

配置文件实体保存在 `data/config/<plugin_name>_config.json`；更新 Schema 时自动递归补默认值、移除已不存在的配置项。description/hint/labels 支持 i18n（见第 7 节）。

## 6. 插件 Pages

插件可在 WebUI 提供自绘页面：`pages/` 目录下的页面由 Dashboard 以受限 iframe 加载，页面脚本经 `window.AstrBotPluginPage` bridge 通信，后端用 `context.register_web_api()` 注册 Web API。简单配置优先用 `_conf_schema.json`，Pages 适合复杂表单/面板/日志/文件/SSE/图表。

### 目录结构（只扫描 `pages/<page_name>/index.html`，无 index.html 的目录忽略）

```
astrbot_plugin_page_demo/
├─ main.py
└─ pages/
   ├─ bridge-demo/
   │  ├─ index.html
   │  ├─ app.js
   │  ├─ style.css
   │  └─ assets/
   │     └─ logo.svg
   └─ settings/
      └─ index.html
```

### 后端（main.py）

```python
from astrbot.api.star import Context, Star
from astrbot.api.web import error_response, json_response, request

PLUGIN_NAME = "astrbot_plugin_page_demo"

class MyPlugin(Star):
    def __init__(self, context: Context):
        super().__init__(context)
        context.register_web_api(f"/{PLUGIN_NAME}/ping", self.page_ping, ["GET"], "Page ping")
        context.register_web_api(f"/{PLUGIN_NAME}/settings/save", self.save_settings, ["POST"], "Save Page settings")

    async def page_ping(self):
        limit = request.query.get("limit", 20, type=int)
        return json_response({"message": "pong", "limit": limit, "username": request.username})

    async def save_settings(self):
        payload = await request.json(default={})
        if not isinstance(payload.get("enabled"), bool):
            return error_response("enabled must be a boolean")
        return json_response({"saved": True})
```

要点：
- `context.register_web_api(route, view_handler, methods, desc)`；**路由须含插件名前缀**（`/{PLUGIN_NAME}/items/<item_id>`），Page 端 endpoint 不含前缀。
- 动态片段：`<name>` 匹配单段、`<path:name>` 匹配多级路径，动态参数以关键字参数传入 handler。
- 推荐用 `astrbot.api.web`，**不要**把 FastAPI/Starlette/Quart 原始请求对象作为公共 API 暴露。

### request 代理（`from astrbot.api.web import request`）

字段：`method, path, plugin_name, username, headers, cookies, content_type, client_host, path_params, query`（`query.get(name, default, type=)` / `query.getlist()`）。
方法：`await request.body()`、`await request.json(default={})`、`await request.form()`（不含上传）、`await request.files()`（form/files 会缓存，各调一次）。
文件上传：`from astrbot.api.web import PluginUploadFile`；`files.get("file")`；`await upload.save(target)`。

### 响应 helper（`from astrbot.api.web import ...`）

- `json_response({...})`
- `error_response("invalid threshold", status_code=400)`
- `file_response(export_path, filename="export.json", content_type="application/json")`
- `stream_response(events())` —— SSE，events 为 async generator，yield `data: {json}\n\n`
- 直接返回 dict/list / `(body, status_code)` / 底层 Response 仍可用

### 前端 bridge（`window.AstrBotPluginPage`）

```js
const bridge = window.AstrBotPluginPage;
const context = await bridge.ready();   // {pluginName, displayName, pageName, pageTitle, locale, i18n, isDark}
const result = await bridge.apiGet("ping", { limit: 20 });   // GET，params 作 query
const saved = await bridge.apiPost("settings/save", { enabled: true });  // POST JSON
```

| API | 说明 |
|---|---|
| `ready()` | 等待 bridge 就绪，返回 Promise<context> |
| `getContext()` / `getLocale()` / `getI18n()` | 同步读取上下文 / 当前语言 / 插件 i18n 资源 |
| `t(key, fallback)` | 点分隔 key 读翻译，缺失回退 fallback |
| `onContext(handler)` | 监听上下文变化（语言/主题），返回取消函数 |
| `apiGet(endpoint, params)` / `apiPost(endpoint, body)` | GET / POST JSON |
| `upload(endpoint, file)` | multipart 单文件，字段名固定 `file` |
| `download(endpoint, params, filename)` | 触发浏览器下载 |
| `subscribeSSE(endpoint, handlers, params)` / `unsubscribeSSE(id)` | SSE 订阅；handlers: onOpen/onMessage/onError |

注意：
- endpoint 为插件内相对路径（推荐不以 `/` 开头）；**不要用原生 `EventSource`**（带不了 Authorization 头，SSE 会 401）。
- 返回值兼容：`{"status":"ok","data":value}` → resolve 为 value；普通 JSON → 完整 JSON；`{"status":"error",...}` 或 HTTP 失败 → reject。
- i18n：`.astrbot-plugin/i18n/<locale>.json` 的 `"pages": {"<page_name>": {"title", "description", ...}}`；页面内用 `bridge.t("pages.xxx.yyy", "fallback")` + `onContext(render)` 响应语言切换。
- 主题：SDK 维护 `<html data-theme="light|dark">`，推荐 CSS 变量 `:root {}` + `[data-theme="dark"] {}`。
- 静态资源用相对路径（`./style.css`、`./assets/logo.svg`），不要手动拼 `/api/plugin/page/content/...`；SPA 用 hash routing。
- 安全：iframe sandbox `allow-scripts allow-forms allow-downloads`；Page 不能访问 Dashboard cookies/LocalStorage/父 DOM；响应带 `X-Frame-Options: SAMEORIGIN`、CSP `frame-ancestors 'self'; object-src 'none'; base-uri 'self'`、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff`；后端必须校验输入、文件落盘用安全目录并重命名。

## 7. 插件国际化

插件目录下 `.astrbot-plugin/i18n/*.json` 按 WebUI locale 提供翻译，覆盖插件名/描述（metadata）、配置项文案（config）、Page 文案（pages）；缺失时回退到 metadata.yaml / _conf_schema.json / Page 默认值。

```
your_plugin/
  metadata.yaml
  _conf_schema.json
  .astrbot-plugin/
    i18n/
      zh-CN.json
      en-US.json
```

```json
{
  "metadata": {
    "display_name": "天气助手",
    "short_desc": "一句话天气查询。",
    "desc": "查询天气并提供出行建议。"
  },
  "config": {
    "enable": { "description": "启用", "hint": "是否启用这个插件。" },
    "mode": { "description": "模式", "labels": ["快速", "安全"] }
  },
  "pages": {
    "settings": {
      "title": "设置",
      "description": "管理这个插件的高级设置。",
      "save": "保存",
      "reset": "重置"
    }
  }
}
```

约束：语言文件名用 WebUI locale（如 `zh-CN.json`）；**只读 `.astrbot-plugin/i18n` 目录；必须嵌套 JSON 结构，不支持点号扁平 key**；`options` 是保存值不建议翻译，下拉展示文本用 `labels`；嵌套 object 配置按同样结构继续嵌套（`config.sub_config.name.description`）；`template_list` 的模板名放 `config.<field>.templates.<模板名>.name`。

## 8. 调用 AI

### 获取当前会话使用的聊天模型 ID 并调用（v4.5.7+ 推荐）

```python
umo = event.unified_msg_origin
provider_id = await self.context.get_current_chat_provider_id(umo=umo)
llm_resp = await self.context.llm_generate(chat_provider_id=provider_id, prompt="Hello, world!")
# llm_resp.completion_text  # 返回文本
```

### 定义 Tool（@dataclass 方式，手动控制 schema）

```python
from pydantic import Field
from pydantic.dataclasses import dataclass
from astrbot.core.agent.run_context import ContextWrapper
from astrbot.core.agent.tool import FunctionTool, ToolExecResult
from astrbot.core.astr_agent_context import AstrAgentContext

@dataclass
class BilibiliTool(FunctionTool[AstrAgentContext]):
    name: str = "bilibili_videos"
    description: str = "A tool to fetch Bilibili videos."
    parameters: dict = Field(default_factory=lambda: {
        "type": "object",
        "properties": {"keywords": {"type": "string", "description": "Keywords to search for Bilibili videos."}},
        "required": ["keywords"],
    })

    async def call(self, context: ContextWrapper[AstrAgentContext], **kwargs) -> ToolExecResult:
        return "1. 视频标题：如何使用AstrBot\n视频链接：xxxxxx"
```

注册：`self.context.add_llm_tools(BilibiliTool(), SecondTool(), ...)`（>=v4.5.1）；旧版 `tool_mgr = self.context.provider_manager.llm_tools; tool_mgr.func_list.append(...)`；`context.register_llm_tool()` **已弃用**（旧兼容用法要求 `func_args` 必须是字典列表）。

### 装饰器方式定义 Tool

```python
@filter.llm_tool(name="get_weather")  # name 不填则用函数名
async def get_weather(self, event: AstrMessageEvent, location: str) -> MessageEventResult:
    '''获取天气信息。

    Args:
        location(string): 地点
    '''
    resp = self.get_weather_from_api(location)
    yield event.plain_result("天气信息: " + resp)
```

踩坑：docstring 中 `Args:` 段**必须存在且格式正确**（`参数名(类型): 描述`）；支持类型 `string, number, object, boolean, array`（v4.5.7 后 array 可指定子类型如 `array[string]`）；装饰器**只解析 docstring** 生成 schema，不读函数签名类型注解；**不支持** `parameters=...` 显式传参（会被忽略）。

### 调用 Agent（v4.5.7+）

```python
llm_resp = await self.context.tool_loop_agent(
    event=event,
    chat_provider_id=prov_id,
    prompt="搜索一下 bilibili 上关于 AstrBot 的相关视频。",
    tools=ToolSet([BilibiliTool()]),
    max_steps=30,          # Agent 最大执行步骤
    tool_call_timeout=60,  # 工具调用超时
)
```

`tool_loop_agent()` 自动循环"工具调用 ↔ 大模型请求"，直到模型不再调用工具或达到最大步骤；可传 `system_prompt=`。

### Multi-Agent（agent-as-tool 模式）

- 子智能体定义为 `FunctionTool[AstrAgentContext]`，其 `call()` 内通过 `context.context.context` / `context.context.event` 拿到主上下文，嵌套调用 `tool_loop_agent`。
- 主智能体用 `AssignAgentTool` 决定把任务分给哪个子智能体，主入口同样用 `tool_loop_agent`（可传 `system_prompt`）。

### 对话管理器（conversation_manager）

```python
conv_mgr = self.context.conversation_manager
uid = event.unified_msg_origin
curr_cid = await conv_mgr.get_curr_conversation_id(uid)
conversation = await conv_mgr.get_conversation(uid, curr_cid)  # Conversation
```

| 方法 | 说明 |
|---|---|
| `new_conversation(umo, platform_id=None, content=None, title=None, persona_id=None)` | 新建会话，返回新 UUID 对话 ID |
| `switch_conversation(umo, conversation_id)` / `delete_conversation(umo, conversation_id=None)` | 切换 / 删除（None 删当前） |
| `get_curr_conversation_id(umo)` | 当前对话 ID |
| `get_conversation(umo, cid, create_if_not_exists=False)` | 获取会话 |
| `get_conversations(umo=None, platform_id=None)` | 列举（umo 为 None 不过滤用户） |
| `update_conversation(umo, cid, history=None, title=None, persona_id=None)` | 更新 |

`Conversation` 字段：`platform_id, user_id, cid, history, title, persona_id, created_at, updated_at`。`add_message_pair(cid, user_message=..., assistant_message=...)` 可快速把一对消息写入对话历史（`UserMessageSegment(content=[TextPart(text=...)])` / `AssistantMessageSegment(...)`）。

### 人格设定管理器（PersonaManager）

`persona_mgr = self.context.persona_manager`；方法：`get_persona(id)`（不存在抛 ValueError）、`get_all_personas()`、`create_persona(id, system_prompt, begin_dialogs=None, tools=None)`（tools=None=全部工具，[]=禁用全部）、`update_persona(...)`、`delete_persona(id)`、`get_default_persona_v3(umo)`。v4.0.0 起推荐 `Persona`（SQLModel，表 `personas`），`Personality`（TypedDict）与 `mood_imitation_dialogs` 已废弃。

## 9. 存储

### 简单 KV 存储（需 AstrBot >= 4.9.2，插件维度独立空间）

```python
class Main(star.Star):
    @filter.command("hello")
    async def hello(self, event: AstrMessageEvent):
        """Aloha!"""
        await self.put_kv_data("greeted", True)
        greeted = await self.get_kv_data("greeted", False)
        await self.delete_kv_data("greeted")
```

### 大文件规范（存 `data/plugin_data/{plugin_name}/`）

```python
from pathlib import Path
from astrbot.core.utils.astrbot_path import get_astrbot_data_path

plugin_data_path = Path(get_astrbot_data_path()) / "plugin_data" / self.name
```

## 10. 文转图

```python
@filter.command("image")
async def on_aiocqhttp(self, event: AstrMessageEvent, text: str):
    url = await self.text_to_image(text)                    # 默认返回图片 URL
    # path = await self.text_to_image(text, return_url=False)  # 保存到本地返回路径
    yield event.image_result(url)
```

自定义模板（HTML + Jinja2，基于 Playwright 截图）：

```python
TMPL = '''
<div style="font-size: 32px;">
<h1 style="color: black">Todo List</h1>
<ul>
{% for item in items %}
    <li>{{ item }}</li>
{% endfor %}
</div>
'''

@filter.command("todo")
async def custom_t2i_tmpl(self, event: AstrMessageEvent):
    url = await self.html_render(TMPL, {"items": ["吃饭", "睡觉", "玩原神"]}, options={})
    yield event.image_result(url)
```

`html_render(template, data, options=None)` —— 模板字符串 + Jinja2 渲染数据 + 渲染选项（参考 Playwright screenshot API）：`timeout, type(jpeg|png), quality, omit_background, full_page(默认True), clip, animations, caret(默认hide), scale(css|device)`。可用 AstrBot Text2Image Playground 在线可视化编辑测试模板。

## 11. 会话控制器

为多轮交互场景（如成语接龙）提供"会话状态"：激活后，该发送人后续消息先经 waiter 函数处理，直到被停止或超时（需 AstrBot >= v3.4.36）。

```python
from astrbot.core.utils.session_waiter import session_waiter, SessionController

@filter.command("成语接龙")
async def handle_empty_mention(self, event: AstrMessageEvent):
    """成语接龙具体实现"""
    try:
        yield event.plain_result("请发送一个成语~")

        @session_waiter(timeout=60, record_history_chains=False)
        async def empty_mention_waiter(controller: SessionController, event: AstrMessageEvent):
            idiom = event.message_str
            if idiom == "退出":
                await event.send(event.plain_result("已退出成语接龙~"))
                controller.stop()      # 立即结束会话
                return
            if len(idiom) != 4:
                await event.send(event.plain_result("成语必须是四个字的呢~"))
                return                 # 不中断会话，后续输入仍进入当前会话
            controller.keep(timeout=60, reset_timeout=True)  # 重置超时

        try:
            await empty_mention_waiter(event)
        except TimeoutError as _:      # 超时抛出 TimeoutError
            yield event.plain_result("你超时了！")
        except Exception as e:
            yield event.plain_result("发生错误，请联系管理员: " + str(e))
        finally:
            event.stop_event()
    except Exception as e:
        logger.error("handle_empty_mention error: " + str(e))
```

- `SessionController.keep(timeout, reset_timeout)`：保持会话；`reset_timeout=True` 重置超时（timeout 必须 > 0，<= 0 立即结束）；`False` 则新 timeout = 剩余 + timeout（可 < 0）。
- `SessionController.stop()`：结束会话，立即生效。
- `controller.get_history_chains() -> List[List[Comp.BaseMessageComponent]]`：历史消息链（需 `record_history_chains=True`）。
- 自定义会话 ID 算子：继承 `SessionFilter`，`def filter(self, event) -> str`（默认按 `sender_id` 区分；返回 `event.get_group_id()` 可让"整个群"作为一个会话），调用 `await empty_mention_waiter(event, session_filter=CustomFilter())`。

## 12. 杂项

### 获取消息平台实例（v3.4.34+）

```python
from astrbot.core.platform.sources.aiocqhttp.aiocqhttp_platform_adapter import AiocqhttpAdapter

platform_id = event.get_platform_id()
platform = self.context.get_platform_inst(platform_id)   # >= v4.0.0
assert isinstance(platform, AiocqhttpAdapter)
```

### 调用协议端 API（如 QQ）

```python
if event.get_platform_name() == "aiocqhttp":
    from astrbot.core.platform.sources.aiocqhttp.aiocqhttp_message_event import AiocqhttpMessageEvent
    assert isinstance(event, AiocqhttpMessageEvent)
    client = event.bot
    ret = await client.api.call_action('delete_msg', message_id=event.message_obj.message_id)
```

协议端 API 参考：Napcat（https://napcat.apifox.cn/）、Lagrange（https://lagrange-onebot.apifox.cn/）。

### 获取已加载的插件 / 平台

```python
plugins = self.context.get_all_stars()  # StarMetadata：插件类实例、配置等

from astrbot.api.platform import Platform
platforms = self.context.platform_manager.get_insts()  # List[Platform]
```

## 13. 发布插件

AstrBot 使用 GitHub 托管插件：推送代码到仓库后，在 AstrBot 插件发布页面（需注册 AstrBot Cloud 账号）提交，系统自动解析 `metadata.yaml`。

### metadata.yaml 完整示例

```yaml
name: astrbot_plugin_example          # 插件标识符，英文，唯一
display_name: 示例插件名称              # 插件展示名称
# short_desc: 一句话介绍你的插件功能    # （可选）紧凑 UI 短描述
desc: 详细描述插件的功能、特性、使用方法等信息。
version: 1.0.0                        # 语义化版本
author: 作者名称
repo: https://github.com/your-name/repo
# astrbot_version: ">=4.17.0"         # （可选）PEP 440 版本范围，如 ">=4.16,<5"；不满足则阻止加载
# support_platforms:                  # （可选）支持平台：aiocqhttp / qq_official / telegram ...
#   - aiocqhttp
# social_link: https://github.com/your-web
# tags:
#   - example
```

可选增强：`logo.png`（v4.5.0+，1:1，推荐 256x256）、`skills/` 目录（随插件提供 Skill：多 Skill 时 `skills/<name>/SKILL.md`；单 Skill 时 `skills/SKILL.md`，名称用插件目录名）、`display_name` 支持按 WebUI 语言显示。

### 大小限制与瘦身

- 插件压缩包（zip）**不得超过 16MB**，超限 CI/CD 自动拒绝。
- 建议：压缩图片/音频等静态资源；避免提交 `.git`、`__pycache__`、`node_modules`、开发配置文件（加 `.gitignore`）；精简/按需引入大依赖；用 `.gitattributes` 或发布分支只包含发布所需文件。
- 确因业务需要超限可联系维护者手动 bypass。

## 14. 共性清单：新插件从零到发布

1. **仓库与命名**：GitHub 模板 `helloworld` 创建；目录/仓库名 `astrbot_plugin_*`、全小写、无空格、简短；clone 进 `AstrBot/data/plugins/`。
2. **`metadata.yaml`（必须）**：`name`、`desc`、`version`、`author`、`repo`；可选 `display_name`、`short_desc`、`support_platforms`、`astrbot_version`。
3. **`main.py`（必须，文件名固定）**：`class XxxPlugin(Star)`，`__init__(self, context: Context)` 调 `super().__init__(context)`；Handler 前两个参数必须是 `self, event`；用 `@filter.*` 装饰器注册；回复用 `yield event.xxx_result(...)`，钩子内 `await event.send(...)`；可选 `terminate()`。
4. **`requirements.txt`（可选但推荐）**：第三方依赖，pip 格式。
5. **可选增强组件**：`_conf_schema.json`（配置）、`pages/<page_name>/index.html` + `context.register_web_api()`（Pages）、`.astrbot-plugin/i18n/<locale>.json`（国际化）、`logo.png`、`skills/` 目录。
6. **调试与发布**：改代码后 WebUI 重载插件；发布走"发布插件"页，需 AstrBot Cloud 账号，系统解析 `metadata.yaml`，CI/CD 校验通过后上架。
7. **通用规范**：数据持久化到 `data` 目录；异步网络请求（aiohttp/httpx，禁 requests）；ruff 格式化；错误处理防崩溃；日志用 `from astrbot.api import logger` 或 `self.logger`。
