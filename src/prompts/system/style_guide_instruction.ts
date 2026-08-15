/**
 * Instruction added to system prompt when a style guide file is found in the vault.
 * Template variable: ${styleGuidePath}
 */
export const STYLE_GUIDE_INSTRUCTION = {
    zh: "---\n\n### 📖 风格指南（必读）\n\n**重要**：本项目存在风格指南文件，位于 `${styleGuidePath}`。\n\n**强制要求**：在进行任何创作任务之前，你必须首先使用 `readFile` 工具读取风格指南的完整内容，并在创作过程中严格遵循其中的所有规范和要求。\n\n请立即执行：\n1. 调用 `readFile({paths: [\"${styleGuidePath}\"]})` 读取风格指南。**如果同时还需要读取角色设定 / 大纲 / 世界观等其他文件，请把风格指南和这些文件的路径合并进同一次 `readFile` 调用的 paths 数组，不要分多次读取**\n2. 仔细理解并记住其中的风格要求\n3. 在后续创作中严格遵循这些要求",
    en: null,
    template: true as const,
    variables: ["styleGuidePath"]
};
