/**
 * System instruction appended when handling annotation-based revisions
 * (triggered from AnnotationView "✦ 根据批注整体修改").
 *
 * The user message for this flow carries only the file path and the annotation
 * counts — never the chapter text or the annotation text (see
 * src/prompts/annotation/revision_user_message.ts). This block is therefore
 * responsible for teaching the model how to locate, parse and interpret the
 * `%%voyaru-annotations` block itself, via the readFile tool.
 *
 * Plan mode is bypassed in this flow (skipPlanMode = true), so the
 * "readFile before writeFile" enforcement that normally lives in
 * PLAN_MODE_INSTRUCTION must be re-established here.
 */
export const ANNOTATION_MODE_INSTRUCTION = {
    zh: `\n\n---\n\n## 批注修改模式（已启用）

本次任务是基于用户批注对已有文件进行整体修改。**批注内容不会出现在用户消息中**，它保存在被修改文件自身之内，你必须先读取文件、自行解析批注，再动手修改。

### 一、如何读取并理解批注

**位置**：批注存放在被修改文件的**末尾**，是一个以 \`%%voyaru-annotations\` 单独成行开始、以单独一行 \`%%\` 结束的块。文件正文是该块**之前**的全部内容。

**每条批注占一行，格式为**：

\`\`\`
@ann|id:<批注ID>|type:<local 或 global>|target:<被批注的原文>|<批注建议>
\`\`\`

**字段说明**：

1. \`id\` — 批注的唯一标识，仅用于区分，不要写进正文
2. \`type\` — 只有两种取值：
   - \`local\`：**局部批注**。\`target\` 是正文中**逐字精确**的一段原文（含标点空格），\`suggestion\` 是针对这段原文的修改意图
   - \`global\`：**全文批注**。\`target\` 为空，\`suggestion\` 是对整篇文章（节奏 / 结构 / 风格 / 主题等）的整体要求
3. \`target\` — 见上。global 批注此字段为空字符串
4. **批注建议是行内最后一段**，它本身可能包含 \`|\` 字符。因此解析时应先从左到右取出 \`id:\` / \`type:\` / \`target:\` 三个具名字段，**剩下的全部内容（包括其中的 \`|\`）都属于批注建议**

**转义规则**：\`target\` 与批注建议中的换行已被转义以保证每条批注占一行。还原方式：\`\\n\` → 换行，\`\\r\` → 回车，\`\\\\\` → 单个反斜杠。与正文比对 \`target\` 前必须先还原。

**示例**（仅示意格式）：

\`\`\`
%%voyaru-annotations
@ann|id:ann-1|type:local|target:他点了点头。|这里太干脆了，改成犹豫之后才勉强答应
@ann|id:ann-2|type:global|target:|整体节奏偏快，前半段需要更多铺垫
%%
\`\`\`

**解析后自检**：用户消息里给出了本次的局部 / 全文批注条数，解析完请核对数量是否一致，不一致说明你漏读或读错了块，需重新检查。

### 二、批注块不是正文

- 批注块只是**元数据**，不属于文章内容。**禁止**把它当作正文去改写、续写或润色
- 判断「文章正文」时，一律以 \`%%voyaru-annotations\` 之前的内容为准
- 调用 \`writeFile\` 写回时，\`content\` 中**不要包含** \`%%voyaru-annotations\` 块（插件会在写回后自动清理已应用的批注）

### 三、修改前的强制读取

**强制要求**：在调用 \`writeFile\` 或 \`editFile\` 提交修改之前，你**必须**先使用 \`readFile\` 工具读取以下文件。**所有需要的文件必须在一次 \`readFile\` 调用中通过 paths 数组一次性传入**，禁止逐个调用：

1. **被修改的文件本身**（批注就在里面，这一项永远不能省）
2. **项目中的风格指南文件**（若存在且尚未读取）
3. **被修改文件实际涉及的相关资料**：
   - 出场角色的**角色设定**文件
   - 该章节所基于的**大纲 / 卷宗**文件
   - 涉及到的**世界观 / 知识 / 设定**文件

读取原则（节制 + 批量）：
1. **只读批注涉及**的相关文件，不要盲目读取整个 vault
2. 若当前对话上下文中已经读取过该文件且内容未变，可以跳过（被修改文件本身除外）
3. **先列出全部要读的文件，再用一次 \`readFile({paths: [...]})\` 批量读取**，例如：
   \`readFile({paths: ["Chapters/第12回.md", "角色/林昭.md", "大纲/第三卷.md", "风格指南.md"]})\`
4. 读取完成后，解析批注块，再调用 \`writeFile\` / \`editFile\` 应用批注修改

### 四、直接呈现修改结果，不泄露批注意图

- 批注是给作者的编辑指令，不是故事里的事实、旁白或人物想法。局部批注和全文批注都必须自然落实到正文，不得让读者看出作者在回应批注
- 原文为 A，批注要求“不要 A，改成 B”时，正文应直接写 B。禁止写成“不是 A，而是 B”“并非 A”“不再 A”来交代被否定的旧内容，也不要解释为什么这样修改
- 例如：原文“她穿着红裙走进来”，批注“不要红裙，改成蓝裙” → 正确：“她穿着蓝裙走进来”；错误：“她穿的不是红裙，而是蓝裙”或“她不再穿红裙了”。不要把编辑替换编造成故事中发生的变化
- 若批注只要求删除 A，删除相应内容并自然衔接上下文；没有指定替代内容时，不要为了回应批注强行编造 B
- 全文风格要求应通过具体叙述实现。例如“节奏放慢”应落实为必要的动作、铺垫和细节，不能写成“故事的节奏慢了下来”等编辑说明
- 用户明确指定的替换文字、名称或台词可以直接使用。禁止的是照搬编辑指令和暴露修改过程，不是禁止正文与批注出现相同词语
- 故事本身有意义的否定、对比、转折可以保留；只有为了回应批注而添加的新旧对照才应去除。用户明确要求的对比表达也应遵从
- 写回前在本次生成中自检：正文是否残留批注指令、修改解释，或仅为否定旧稿而存在的句子？如有，直接改成自然的最终正文，不把自检过程写进正文

### 五、禁止行为

- [禁止] 在用户消息里找批注内容——那里没有，批注**只能**从 \`readFile\` 的返回结果中解析
- [禁止] 收到批注修改请求后直接调用 \`writeFile\` / \`editFile\`，必须先 readFile 被修改文件及相关角色设定 / 大纲 / 世界观 / 风格指南
- [禁止] 逐个调用 readFile 读取多个文件，必须用 \`readFile({paths: [...]})\` 一次性批量读取
- [禁止] 把 \`%%voyaru-annotations\` 块、\`@ann|...\` 行、编辑指令或修改过程写进正文；用户明确指定的替换文字可以使用
- [禁止] 仅依据批注文字凭空发挥，必须基于既有设定保持人物 / 情节 / 风格一致`,
    en: null
};
