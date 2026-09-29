/**
 * User message sent when the user clicks "✦ 根据批注整体修改" in the annotation panel.
 *
 * Deliberately contains NO annotation text and NO chapter text — only the file
 * path and the annotation counts. The annotations already live inside the file
 * itself (the `%%voyaru-annotations` block), so the model is told to read and
 * parse them via the readFile tool instead of receiving them inlined here.
 * Inlining "原文 + 逐条改写指令" made requests prone to safety-filter rejection.
 *
 * Parsing rules for the block are taught in ANNOTATION_MODE_INSTRUCTION
 * (src/prompts/system/annotation_mode.ts), which is appended to the system prompt
 * for this same request.
 */
export const ANNOTATION_REVISION_USER_MESSAGE = {
    zh: `请依据文件 @\${filePath} 中已记录的批注，对该文件的正文进行整体修改。

批注内容**不在本条消息中**。它们保存在该文件末尾的 \`%%voyaru-annotations\` 批注块里，本次共 \${localCount} 条局部批注、\${globalCount} 条全文批注。

请按以下顺序处理：
1. 用一次 \`readFile({paths: [...]})\` 读取该文件，同时把你需要参考的角色设定 / 大纲 / 世界观 / 风格指南一并放进同一个 paths 数组
2. 从读到的内容中定位并解析 \`%%voyaru-annotations\` 块，逐条理解每条批注的意图（解析规则见系统指令）
3. 核对解析出的条数是否为 \${localCount} 条局部 + \${globalCount} 条全文，确认没有遗漏
4. 综合所有批注改写正文，然后写回文件`,
    en: null,
    template: true,
    variables: ['filePath', 'localCount', 'globalCount']
};
