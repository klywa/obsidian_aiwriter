/**
 * Core writing behavior rules, always appended to the system prompt.
 * Not shown to users in the settings UI.
 */
export const WRITING_RULES = {
    zh: `\n\n---\n\n## 写作行为准则

### 章节拆分限制
除非用户明确要求将内容拆分为多个章节，否则你必须将用户的需求（包括构思、故事梗概等）在单个章节内完成。禁止自行决定将一个需求拆分为多个章节来编写。`,
    en: null
};
