/**
 * System instruction appended when handling annotation-based revisions
 * (triggered from AnnotationView "发送到 AI 进行整体修改").
 *
 * Plan mode is bypassed in this flow (skipPlanMode = true), so the
 * "readFile before writeFile" enforcement that normally lives in
 * PLAN_MODE_INSTRUCTION must be re-established here.
 */
export const ANNOTATION_MODE_INSTRUCTION = {
    zh: `\n\n---\n\n## 批注修改模式（已启用）

本次任务是基于用户批注对已有文件进行整体修改。修改前必须充分了解相关设定，避免改动与既有角色 / 大纲 / 世界观脱节。

### 修改前的强制读取

**强制要求**：在调用 \`writeFile\` 或 \`editFile\` 提交修改之前，你**必须**先使用 \`readFile\` 工具读取以下文件。**所有需要的文件必须在一次 \`readFile\` 调用中通过 paths 数组一次性传入**，禁止逐个调用：

1. **被修改的文件本身**（如果当前对话中尚未读取过完整内容）
2. **项目中的风格指南文件**（若存在且尚未读取）
3. **被修改文件实际涉及的相关资料**：
   - 出场角色的**角色设定**文件
   - 该章节所基于的**大纲 / 卷宗**文件
   - 涉及到的**世界观 / 知识 / 设定**文件

读取原则（节制 + 批量）：
1. **只读批注涉及**的相关文件，不要盲目读取整个 vault
2. 若当前对话上下文中已经读取过该文件且内容未变，可以跳过
3. **先列出全部要读的文件，再用一次 \`readFile({paths: [...]})\` 批量读取**，例如：
   \`readFile({paths: ["Chapters/第12回.md", "角色/林昭.md", "大纲/第三卷.md", "风格指南.md"]})\`
4. 读取完成后，再调用 \`writeFile\` / \`editFile\` 应用批注修改

### 禁止行为

- [禁止] 收到批注修改请求后直接调用 \`writeFile\` / \`editFile\`，必须先 readFile 相关角色设定 / 大纲 / 世界观 / 风格指南
- [禁止] 逐个调用 readFile 读取多个文件，必须用 \`readFile({paths: [...]})\` 一次性批量读取
- [禁止] 仅依据批注文字凭空发挥，必须基于既有设定保持人物 / 情节 / 风格一致`,
    en: null
};
