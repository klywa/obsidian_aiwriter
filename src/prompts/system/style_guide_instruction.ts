/**
 * Instruction added to system prompt when a style guide file is found in the vault.
 * Template variable: ${styleGuidePath}
 */
export const STYLE_GUIDE_INSTRUCTION = {
    zh: "---\n\n### 📖 风格指南（必读）\n\n**重要**：本项目存在风格指南文件，位于 `${styleGuidePath}`。\n\n**强制要求**：在进行任何创作任务之前，你必须首先使用 `readFile` 工具读取风格指南的完整内容，并在创作过程中严格遵循其中的所有规范和要求。\n\n请立即执行：\n1. 调用 `readFile(\"${styleGuidePath}\")` 读取风格指南\n2. 仔细理解并记住其中的风格要求\n3. 在后续创作中严格遵循这些要求",
    en: null,
    template: true as const,
    variables: ["styleGuidePath"]
};
