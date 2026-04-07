/**
 * User message for the post-check pipeline.
 * Template variables: filePath, originalContent
 */
export const POST_CHECK_USER_MESSAGE = {
    zh: "请对以下内容进行后置检查和润色：\n\n**文件路径**: ${filePath}\n\n**原始内容**:\n${originalContent}\n\n请按照system prompt中的要求，进行检查分析并输出润色后的内容。\n\n⚠️ 特别提醒：在【润色后内容】部分，直接输出markdown文本，不要使用 ```markdown 或 ``` 包裹！这会导致内容损坏！",
    en: null,
    template: true as const,
    variables: ["filePath", "originalContent"]
};
