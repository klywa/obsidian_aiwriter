/**
 * Default agent tools shown in the # mention popup.
 * Each tool has an id, name (i18n), and prompt (i18n).
 * Add or modify tools here to change the preset tool list.
 */
export const DEFAULT_AGENT_TOOLS = [
    {
        id: "plan-next-chapter",
        name: { zh: "规划下一章节", en: null },
        prompt: { zh: "根据当前已有章节，构思下一个章节的内容，写入大纲中。", en: null }
    },
    {
        id: "write-next-chapter",
        name: { zh: "写下一章", en: null },
        prompt: { zh: "根据当前已有章节，编写下一回（直接写入文档）。若大纲已经规划了下一回的内容，应该严格按照大纲中的情节进行编写。若存在风格指南，章节的风格必须严格遵守《风格指南》中的要求。章节目标字数：", en: null }
    },
    {
        id: "update-character",
        name: { zh: "更新人设", en: null },
        prompt: { zh: "根据当前已有章节，更新人设文档。若没有人设文档，则新建以人设名命名的人设文档，放入characters目录下。更新时需要注意，能做**增量**的更新（不改动以往的设定）。如果涉及到某些属性的转变，应该**清晰**地写出变化历程。", en: null }
    },
    {
        id: "update-outline",
        name: { zh: "更新大纲", en: null },
        prompt: { zh: "根据当前已有章节，更新大纲文文档（大纲）。若没有人设文档，新建大纲，outlines目录下。", en: null }
    },
    {
        id: "review-and-annotate",
        name: { zh: "审阅并标注", en: null },
        prompt: { zh: "仔细阅读当前指定的章节，生成修改建议批注。对于措辞、表达等局部问题，使用 local 类型批注并给出具体的修改建议文字；对于节奏、结构、主题等全局问题，使用 global 类型批注并描述整体要求。批注要具体、可执行。", en: null }
    },
    {
        id: "update-memory",
        name: { zh: "更新记忆", en: null },
        prompt: { zh: "请根据当前对话中涉及的章节内容，立即更新记忆文件（角色状态、情节进展、世界观设定）。\n\n用户指令：{用户指令}\n\n执行步骤：\n1. 确认当前对话中涉及了哪些章节（如果不明确，使用 listFiles 查看章节目录，然后询问用户需要更新哪些章节的记忆）\n2. 读取相关章节内容和现有记忆文件\n3. 根据用户指令的要求，提取/更新记忆\n4. 将更新后的记忆写入对应的记忆文件\n5. 报告更新了哪些记忆文件及主要变更", en: null }
    },
    {
        id: "refresh-memory",
        name: { zh: "刷新记忆", en: null },
        prompt: { zh: "请执行全量记忆刷新：清空现有记忆文件，按顺序重新读取所有章节，逐章提取角色状态、情节进展和世界观设定，写入记忆文件夹中。完成后报告生成了哪些记忆文件。", en: null }
    }
];
