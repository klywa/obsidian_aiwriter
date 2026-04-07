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
    }
];
