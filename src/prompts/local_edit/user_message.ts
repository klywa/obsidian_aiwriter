/**
 * User message for the local edit feature.
 * Template variables: filePath, startLine, endLine, originalContent, contextBefore, contextAfter, query
 */
export const LOCAL_EDIT_USER_MESSAGE = {
    zh: "\n**文件路径**: ${filePath}\n**需要修改的行数**: 第${startLine}行到第${endLine}行\n\n**修改前的内容**:\n```\n${originalContent}\n```\n\n**上下文（修改部分之前5行）**:\n```\n${contextBefore}\n```\n\n**上下文（修改部分之后5行）**:\n```\n${contextAfter}\n```\n\n**用户要求**: ${query}",
    en: null,
    template: true as const,
    variables: ["filePath", "startLine", "endLine", "originalContent", "contextBefore", "contextAfter", "query"]
};
