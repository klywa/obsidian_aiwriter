import type { TemplateConfig } from '../types';

export const REFLECTION_USER_MESSAGE: TemplateConfig = {
    zh: `请分析以下章节修改，提炼写作经验并更新写作指南。

## 修改指令

\${userInstruction}

## 修改前内容

\`\`\`
\${originalContent}
\`\`\`

## 修改后内容

\`\`\`
\${modifiedContent}
\`\`\`

## 现有写作指南（请在此基础上合并更新）

\${existingGuidelines}

---

请输出更新后的完整写作指南内容（放置在 \`<!-- voyaru-auto-guidelines-start -->\` 与 \`<!-- voyaru-auto-guidelines-end -->\` 标记之间的内容）。`,
    en: null,
    template: true,
    variables: ['userInstruction', 'originalContent', 'modifiedContent', 'existingGuidelines']
};
