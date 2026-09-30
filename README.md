# Voyaru AI Writer

面向小说创作的 Obsidian AI 写作插件。将笔记库中的章节、人物、大纲和设定接入聊天，让 AI 协助规划章节、创作正文、修订段落，并积累故事记忆和写作偏好。

**当前核心写作流程仅接通 Gemini。** 设置界面和代码中虽然包含 OpenAI、Anthropic、DeepSeek 和自定义提供商的配置及适配器，但尚未完整接入核心写作流程。能够添加提供商或获取模型列表，不代表可以使用它完成写作。

## 功能

| 功能 | 用途 |
| --- | --- |
| 聊天写作 | 多会话、流式输出，引用文件或选中文本作为上下文 |
| 文件操作 | AI 通过工具读取、创建、覆盖、按行编辑及删除笔记，部分修改提供撤销信息 |
| 局部修改 | 选中段落并输入要求，对指定文本进行修订 |
| 批注修订 | 添加批注、查看批注面板，并让 AI 根据批注修改稿件 |
| 章节规划 | 先生成章节规划，交给用户审阅确认后继续写作 |
| 后置检查 | 根据可配置的检查项检查、润色生成或修改后的内容 |
| 故事记忆 | 提取人物状态、剧情线索和世界设定，在后续写作中提供记忆索引 |
| 写作偏好积累 | 修改已有章节后反思修改经验，更新笔记库根目录的 `WRITER.md` |

## 安装

### 从源码构建

在仓库目录执行以下命令。需要 Node.js 和 npm；仓库 CI 配置使用 Node.js 20 / 22。

```bash
npm install
npm run build
```

构建先进行 TypeScript 类型检查，再在仓库根目录生成 `main.js`。

### 手动安装到 Obsidian

1. 在目标笔记库中创建 `.obsidian/plugins/voyaru-plugin/`。目录名对应当前 `manifest.json` 中的插件 ID。
2. 将构建生成的 `main.js`，以及仓库中的 `manifest.json`、`styles.css` 复制到该目录。
3. 重新加载 Obsidian，在 **设置 → 第三方插件（Community plugins）** 中启用 **Voyaru AI Writer**。

```text
<Vault>/.obsidian/plugins/voyaru-plugin/
├── main.js
├── manifest.json
└── styles.css
```

更新已有安装时替换上述文件，保留自己的 `data.json` 和可选的 `models.json`。插件未设置为仅桌面可用，但这不代表所有功能都已通过 iOS / Android 实机验证。

## 首次配置

1. 打开插件设置，在 **AI 提供商配置** 中编辑默认的 **Google Gemini**，或选择 **添加提供商** 添加 Gemini 配置。
2. 填写自己的 API Key，选择账号可用且支持工具调用的模型，将该配置选为 **当前激活的提供商**。AI 写作需要网络连接和可用的 API 额度。
3. 在 **文件夹配置 → 管理文件夹** 中指定小说资料的位置。路径相对于当前笔记库。
4. 选择侧边栏的机器人图标，或从命令面板执行 **Open Chat**，打开聊天视图。
5. 引用一个章节或设定文件，输入写作要求并发送。发送前请阅读下方的数据说明和文件修改行为。

默认目录如下，可按项目实际结构调整：

| 资料 | 默认目录 |
| --- | --- |
| 章节 | `Chapters` |
| 人物 | `Characters` |
| 大纲 | `Outlines` |
| 笔记 | `Notes` |
| 知识库 | `Knowledge` |
| 故事记忆 | `Memory` |
| 章节规划 | `Plan` |

这些目录用于组织资料和构建上下文，不是文件访问权限边界。

## 日常使用

### 聊天与文件引用

在聊天输入框输入 `@` 选择文件，也可以从编辑器右键菜单将当前文件或选中文本加入上下文。输入 `#` 可选择已配置的工具预设。

默认 **Enter** 发送，**Shift+Enter** 换行；可在 **发送方式** 中调整。

**引用方式** 控制文件如何进入请求：

| 方式 | 行为 |
| --- | --- |
| 全文引用 | 直接将引用文件的内容或选中行加入请求 |
| 路径引用（默认） | 先提供路径或行号，由模型通过读取工具获取内容 |

路径引用不代表文件内容不会发送给模型：工具读取的结果也会进入后续请求。

**上下文模式** 控制历史对话的处理：

| 模式 | 行为 |
| --- | --- |
| 所见即所得（完全同步） | 根据当前对话历史构建请求上下文 |
| 服务器维护（节省Token，默认） | 复用插件内存中的 SDK 聊天会话；重载后不会仅凭本地聊天记录自动恢复该会话上下文 |
| 单轮对话（不发送历史） | 不携带之前的对话历史，仍可包含系统指令和本轮引用内容 |

“服务器维护”是界面中的名称，实际由插件复用 SDK 会话，不代表历史永久保存在服务端，也不保证降低 API 的计费 Token。

### 局部修改与批注

- **局部修改**：在编辑器选中文本，执行 **局部修改** 命令或使用右键菜单，填写修改要求。可通过 **Cancel Local Edit** 命令请求取消。
- **批注**：选中文本后执行 **添加批注**；通过 **打开批注面板** 查看并处理批注，发起 AI 修订。
- **批注高亮显示**：在插件设置中切换后，需要重新加载插件才能生效。

### 规划、检查与记忆

- **章节规划模式**：默认关闭。启用后先生成规划，在聊天中的规划卡片审阅确认，再继续写作。
- **启用后置检查**：默认开启。通过 **管理后置检查项** 调整规则；检查可能进一步改写正文，并产生额外模型请求。
- **启用记忆系统**：默认关闭。开启后可使用 **自动更新记忆**，在章节写入或修改后提取人物、剧情和世界设定；也可通过 `#刷新记忆` 发起全量重建。
- **启用自我进化**：默认开启。修改已有章节后提炼写作经验和用户偏好，写入根目录 `WRITER.md`；首次创建章节不触发这项反思。

记忆归纳和自进化模型默认跟随主模型，可在对应设置中单独选择。这些后续处理也会调用模型。

## 高级配置

### 自定义可选模型

将 [models.example.json](models.example.json) 复制为插件目录下的 `models.json`，按照示例结构填入实际可用的模型 ID。

- 顶层按提供商类型分组，每项至少提供 `id`，可填写显示名称 `name`、默认标记 `default` 和能力字段。
- 与内置模型同 ID 的条目覆盖其配置，新 ID 追加到可选列表前部。
- 文件缺失或格式有误时回退到内置列表。
- 保存后通常自动生效；也可执行 **重新加载模型配置** 命令，或选择设置页同名按钮。

示例中的模型名称和 ID 仅展示配置格式，不保证账号或服务实际提供这些模型。添加模型条目不会增加核心流程尚未接通的提供商支持。

### 写作指令与风格指南

在设置中的 **自定义提示词** 填写项目要求；**核心系统指令 (只读)** 用于查看内置指令。笔记库根目录的 `WRITER.md` 也会作为写作指令读取。

插件会在知识库目录、笔记目录和笔记库根目录依次查找 `风格指南.md`、`StyleGuide.md` 或 `style_guide.md`，找到后在系统指令中引导模型读取。

核心提示词内嵌于 `src/prompts/`，通过 `DEFAULT_PROMPTS` 加载，**不再从本地 `prompts.json` 读取核心指令**。修改源码提示词需要重新执行 `npm run build`。

### 提示词源码索引

下表面向开发维护；普通使用不需要修改这些文件。

| 模块 | 源码 |
| --- | --- |
| 核心系统指令与写作规则 | [base.ts](src/prompts/system/base.ts)、[writing_rules.ts](src/prompts/system/writing_rules.ts) |
| 可选 Jailbreak 扩展 | [jailbreak.ts](src/prompts/system/jailbreak.ts) |
| 风格指南与文件引用 | [style_guide_instruction.ts](src/prompts/system/style_guide_instruction.ts)、[reference_mode.ts](src/prompts/system/reference_mode.ts) |
| 规划、记忆与批注模式 | [plan_mode.ts](src/prompts/system/plan_mode.ts)、[memory_mode.ts](src/prompts/system/memory_mode.ts)、[annotation_mode.ts](src/prompts/system/annotation_mode.ts) |
| 工具预设与文件操作定义 | [agent_tools.ts](src/prompts/tools/agent_tools.ts)、[function_definitions.ts](src/prompts/tools/function_definitions.ts) |
| 规划、询问用户与批注工具 | [plan_tools.ts](src/prompts/tools/plan_tools.ts)、[ask_user_tools.ts](src/prompts/tools/ask_user_tools.ts)、[annotation_tools.ts](src/prompts/tools/annotation_tools.ts) |
| 后置检查 | [系统指令](src/prompts/post_check/system_prompt.ts)、[用户消息](src/prompts/post_check/user_message.ts)、[默认检查项](src/prompts/post_check/default_items.ts) |
| 局部修改 | [系统指令](src/prompts/local_edit/system_instruction.ts)、[用户消息](src/prompts/local_edit/user_message.ts) |
| 记忆提取 | [系统指令](src/prompts/memory/extraction_system.ts)、[用户消息](src/prompts/memory/extraction_user_message.ts) |
| 写作反思 | [系统指令](src/prompts/reflection/system_prompt.ts)、[用户消息](src/prompts/reflection/user_message.ts) |
| 批注修订 | [revision_user_message.ts](src/prompts/annotation/revision_user_message.ts) |
| 类型与汇总入口 | [types.ts](src/prompts/types.ts)、[index.ts](src/prompts/index.ts) |

带模板变量的提示词由 [PromptService](src/services/prompt_service.ts) 在运行时替换。

## 数据与当前限制

### 本地存储和外部请求

- API Key、插件设置及聊天会话保存在插件目录的 `data.json` 中。API Key 以普通配置字段保存，未做专门加密；不要将此文件提交到仓库或分享给他人。它已被本仓库的 `.gitignore` 排除。
- `models.json` 是本地模型覆盖配置，也被版本控制忽略。仓库中的 `data.json.example` 是旧版配置示例，首次配置请使用设置界面。
- 使用 AI 功能时，会向配置的模型服务发送完成任务所需的数据，可能包括对话、引用文本、文件路径和目录结构、工具读取的内容、写作规则及记忆信息。
- 局部修改、后置检查、记忆提取和写作反思也会发送相关内容并消耗 API 额度。配置 API Key 并使用这些功能前，请确认接受相应服务的数据处理方式。

### 文件修改与任务中断

- AI 工具会直接写入、覆盖或编辑笔记；并非所有写入都有逐项确认界面。部分修改提供撤销信息，但不构成完整版本管理。
- 删除操作调用 Obsidian 的回收站接口。重要稿件仍应保留独立备份，避免在 AI 修改同一文件时同时手动编辑；当前写入流程未提供完整的并发冲突保护。
- 全量记忆刷新先清理旧记忆，再逐章提取。失败或取消可能留下不完整的新记忆，重建前请备份 `Memory` 或自定义记忆目录。
- 取消操作会请求停止后续处理，但主聊天请求未完整接入网络层取消，不能保证点击停止后立即终止远端请求或计费。

## 开发与发布

项目使用 TypeScript、React 和 esbuild。入口为 `src/main.ts`，界面位于 `src/views/`、`src/components/` 和 `src/modals/`，服务逻辑位于 `src/services/`。

```bash
# 安装依赖
npm install

# 监听源码变化并重新打包
npm run dev

# 类型检查并生成生产构建
npm run build

# 静态检查
npm run lint

# 构建并整理发布文件
npm run prepare-release
```

`npm run prepare-release` 将 `main.js`、`manifest.json`、`styles.css` 和 `models.example.json` 复制到 `dist/`。前三项用于安装；模型示例为可选参考。

发布时保持 `manifest.json`、`package.json` 与 `versions.json` 的版本信息一致。项目提供 `npm version patch` 对应的版本更新脚本；该操作会涉及 Git 版本操作，发布时再执行。GitHub release 标签应与 manifest 版本完全一致，不加 `v` 前缀，并将安装文件作为独立附件上传。

不要提交 `node_modules/`、`main.js`、`dist/` 或个人配置。修改源码后的人工验证方式是更新笔记库中的插件文件，重新加载 Obsidian，再检查相关功能。

## 常见问题

| 问题 | 排查方式 |
| --- | --- |
| 插件没有加载 | 检查 `main.js`、`manifest.json` 和 `styles.css` 是否位于插件目录顶层，构建是否成功，以及是否已在第三方插件设置中启用 |
| 不能发送请求 | 确认激活的是 Gemini 配置，API Key 非空，模型可用且有额度；修改配置后仍异常时重新加载插件 |
| 添加其他提供商后不能写作 | 核心流程目前仅接通 Gemini，其他提供商配置成功不等于写作功能可用 |
| 新模型没有出现在列表 | 检查插件目录下 `models.json` 的格式，执行 **重新加载模型配置**；模型条目不会自动赋予账号访问权限 |
| AI 没有引用预期资料 | 检查文件夹配置和本轮引用文件；路径引用需要模型实际调用读取工具 |
| 重载后聊天似乎忘记前文 | 默认上下文模式复用内存中的 SDK 会话；需要按界面历史构建上下文时选择 **所见即所得 (完全同步)** |
| 修改核心提示词没有生效 | 修改 `src/prompts/` 后重新构建、更新安装文件并重载；本地 `prompts.json` 不再用于覆盖核心指令 |

## 许可证

[0-BSD](LICENSE)
