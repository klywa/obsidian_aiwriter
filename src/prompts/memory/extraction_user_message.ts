import type { TemplateConfig } from '../types';

export const MEMORY_EXTRACTION_USER_MESSAGE: TemplateConfig = {
    zh: `请从以下章节中提取记忆变化并更新记忆文件。

## 章节信息

**文件路径**：\${chapterPath}

## 章节内容

\${chapterContent}

---

## 当前记忆索引

\${memoryIndex}

---

## 相关实体的现有记忆文件内容

\${relatedEntityContents}

---

请按照系统提示的格式，输出本章中发生变化的所有实体的更新后记忆文件内容。`,
    en: null,
    template: true,
    variables: ['chapterPath', 'chapterContent', 'memoryIndex', 'relatedEntityContents']
};
