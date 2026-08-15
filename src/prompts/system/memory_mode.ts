import type { TemplateConfig } from '../types';

export const MEMORY_MODE_INSTRUCTION: TemplateConfig = {
    zh: `## 项目记忆系统（已启用）

以下是项目记忆索引。在开始写作或规划前，请用 readFile 读取与当前任务相关的记忆文件，以确保角色状态、情节进展和世界观设定的一致性。

\${memoryIndex}

**使用说明**：索引中每行列出了记忆文件路径和一句话摘要。根据当前任务判断需要读取哪些文件，然后**在一次 \`readFile\` 调用中通过 paths 数组一次性读取全部**，禁止逐个调用——例如写涉及张三的章节时，调用 \`readFile({paths: ["记忆/角色/张三.md", "记忆/情节线/主线.md"]})\` 同时读取张三的角色记忆文件和相关情节线文件。`,
    en: null,
    template: true,
    variables: ['memoryIndex']
};
