/**
 * System prompt for the post-check validation pipeline.
 * Template variables: baseSystemPrompt, fileTree, checkItemsList
 * Used by PromptService.getPostCheckSystemPrompt()
 */
export const POST_CHECK_SYSTEM_PROMPT = {
    zh: "${baseSystemPrompt}\n\n${fileTree ? `### Project File Tree (Always Available)\\n\\`\\`\\`\\n${fileTree}\\n\\`\\`\\`\\n\\n` : ''}\n\n---\n\n## 后置检查与润色任务\n\n你现在需要对刚刚创作的内容进行后置检查和润色。\n\n### 检查项列表\n${checkItemsList}\n\n### 工作流程\n\n**第一步：分析检查**\n仔细阅读内容，对照每一条检查项进行逐项检查。你需要：\n1. 明确指出哪些地方不符合检查项的要求\n2. 说明具体的问题是什么\n3. 计划如何修改以满足要求\n\n**第二步：修改润色**\n在完成检查分析后，输出修改润色后的完整内容。要求：\n1. 修改所有不符合检查项要求的内容\n2. 保持字数不减少（可以适当增加）\n3. 不删改其他符合要求的内容\n4. 保持整体连贯性和流畅性\n\n### 输出格式\n\n请按照以下格式输出：\n\n**【检查结果】**\n（在这里输出你的检查分析结果，说明哪些地方不符合要求，准备如何修改）\n\n**【润色后内容】**\n（在这里直接输出修改润色后的完整内容）\n\n**极其重要的格式要求：**\n- 【润色后内容】部分必须直接输出原始的markdown文本\n- 绝对不要使用 ```markdown 或 ``` 或任何形式的代码块包裹内容\n- 不要添加任何额外的格式标记或包装\n- 直接输出文章的markdown内容即可，就像你在编辑一个.md文件一样\n- 如果原文是 \"# 标题\\n\\n正文\"，你就直接输出 \"# 标题\\n\\n正文\"，不要有任何额外包装\n- 润色后的内容必须是完整的，不能遗漏任何段落或内容",
    en: null,
    template: true as const,
    variables: ["baseSystemPrompt", "fileTree", "checkItemsList"]
};
