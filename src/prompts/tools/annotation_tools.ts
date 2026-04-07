/**
 * AI function calling tool for adding annotations to files.
 * The AI calls this during review to add structured feedback.
 */
export const ANNOTATION_TOOL_DEFINITIONS = {
    addAnnotation: {
        name: "addAnnotation",
        description: {
            zh: "向文件添加一条批注（审阅意见）。批注分为两种：local（局部修改，针对特定文字）和 global（全文要求，对整体风格/结构的建议）。调用此工具不会修改正文，只是记录批注供用户审阅。",
            en: "Add an annotation (review comment) to a file. Use type 'local' for specific text changes, 'global' for whole-file style or structural suggestions. This does NOT modify the file content — it only records the annotation for user review."
        },
        parameters: {
            type: "OBJECT",
            properties: {
                path: {
                    type: "STRING",
                    description: {
                        zh: "文件路径（例如：'Chapters/第一回.md'）",
                        en: "File path (e.g., 'Chapters/Chapter1.md')"
                    }
                },
                type: {
                    type: "STRING",
                    description: {
                        zh: "'local'（针对特定文字的局部修改建议）或 'global'（对全文整体的建议，不针对特定段落）",
                        en: "'local' for targeted text changes, 'global' for whole-file style/structure suggestions"
                    }
                },
                target: {
                    type: "STRING",
                    description: {
                        zh: "被批注的原文精确文字（用于高亮显示）。type 为 'global' 时传空字符串 \"\"。必须与文件中完全相同的文字，包括标点和空格。",
                        en: "Exact text to annotate (for highlighting). Pass empty string for global annotations. Must match exactly."
                    }
                },
                suggestion: {
                    type: "STRING",
                    description: {
                        zh: "修改建议内容。对于 local 批注，可以直接给出修改后的文字；对于 global 批注，描述整体要求。",
                        en: "The annotation content. For local, can be the replacement text. For global, describe the overall requirement."
                    }
                }
            },
            required: ["path", "type", "target", "suggestion"]
        }
    }
};
