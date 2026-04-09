/**
 * Tool definition for askUser — allows the AI to pause and ask the user
 * a structured question with multiple options, each with pros/cons analysis.
 * The AI decides autonomously when to use this tool based on task ambiguity.
 */
export const ASK_USER_TOOL_DEFINITIONS = {
    askUser: {
        name: "askUser",
        description: {
            zh: "当遇到需求不明确、存在多种实现方案、或有重要决策点时，主动调用此工具询问用户。每个选项必须提供客观的优劣分析。如果有推荐选项，通过 recommendation 字段标记并在 pros 中说明推荐理由。\n\n**使用原则**：只在真正需要用户输入时才调用，不要滥用——琐碎的决策应自行判断。",
            en: "Call this tool when requirements are unclear, multiple approaches exist, or there is an important decision point. Each option must include objective pros and cons analysis. Mark a recommendation with the recommendation field if applicable. Only use this when user input is truly needed — make trivial decisions independently."
        },
        parameters: {
            type: "OBJECT",
            properties: {
                question: {
                    type: "STRING",
                    description: {
                        zh: "向用户提出的问题",
                        en: "The question to ask the user"
                    }
                },
                context: {
                    type: "STRING",
                    description: {
                        zh: "背景说明：解释为什么需要询问用户，当前任务进展到哪一步",
                        en: "Background context: why user input is needed and where the task currently stands"
                    }
                },
                options: {
                    type: "ARRAY",
                    description: {
                        zh: "候选选项列表，每个选项需包含名称及优劣分析",
                        en: "List of options, each with label and pros/cons analysis"
                    },
                    items: {
                        type: "OBJECT",
                        properties: {
                            label: {
                                type: "STRING",
                                description: {
                                    zh: "选项名称（简洁，5字以内为佳）",
                                    en: "Option label (concise, preferably under 5 words)"
                                }
                            },
                            pros: {
                                type: "STRING",
                                description: {
                                    zh: "此选项的优势分析",
                                    en: "Advantages of this option"
                                }
                            },
                            cons: {
                                type: "STRING",
                                description: {
                                    zh: "此选项的劣势或风险",
                                    en: "Disadvantages or risks of this option"
                                }
                            }
                        },
                        required: ["label", "pros", "cons"]
                    }
                },
                multiSelect: {
                    type: "BOOLEAN",
                    description: {
                        zh: "是否允许用户多选，默认为 false（单选）",
                        en: "Whether to allow the user to select multiple options, default false (single select)"
                    }
                },
                recommendation: {
                    type: "NUMBER",
                    description: {
                        zh: "推荐选项的索引（从 0 开始），在 pros 中说明推荐理由。可选字段。",
                        en: "Index of the recommended option (0-based). Explain the reason in pros. Optional field."
                    }
                }
            },
            required: ["question", "context", "options"]
        }
    }
};
