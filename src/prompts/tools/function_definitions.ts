/**
 * Function calling tool definitions for the Gemini AI.
 * These define the tools the AI can call (writeFile, readFile, deleteFile, editFile).
 * Add new tools here and register handlers in ai_service.ts streamChat().
 */
export const FUNCTION_DEFINITIONS = {
    writeFile: {
        name: "writeFile",
        description: {
            zh: "创建或覆盖文件内容。用于保存章节、大纲、角色设定等。",
            en: "Create or overwrite a file with content. Use this to save chapters, outlines, characters, etc."
        },
        parameters: {
            type: "OBJECT",
            properties: {
                _reasoning: {
                    type: "STRING",
                    description: {
                        zh: "内部思考过程，解释为什么要调用这个工具。",
                        en: "Internal thought process explaining why this tool is being called."
                    }
                },
                path: {
                    type: "STRING",
                    description: {
                        zh: "文件路径（例如：'Chapters/第1回.md'）",
                        en: "The path to the file. (e.g., 'Chapters/第1回.md')"
                    }
                },
                content: {
                    type: "STRING",
                    description: {
                        zh: "要写入文件的完整内容",
                        en: "The full content to write to the file."
                    }
                }
            },
            required: ["path", "content"]
        }
    },
    readFile: {
        name: "readFile",
        description: {
            zh: "读取文件内容以获取上下文信息。",
            en: "Read the content of a file to get context."
        },
        parameters: {
            type: "OBJECT",
            properties: {
                path: {
                    type: "STRING",
                    description: {
                        zh: "文件路径",
                        en: "The path to the file."
                    }
                }
            },
            required: ["path"]
        }
    },
    deleteFile: {
        name: "deleteFile",
        description: {
            zh: "删除文件。",
            en: "Delete a file."
        },
        parameters: {
            type: "OBJECT",
            properties: {
                path: {
                    type: "STRING",
                    description: {
                        zh: "文件路径",
                        en: "The path to the file."
                    }
                }
            },
            required: ["path"]
        }
    },
    editFile: {
        name: "editFile",
        description: {
            zh: "对现有文件进行部分编辑。支持替换、插入、删除和追加操作。相比 writeFile 的全量覆盖，editFile 只需要提供修改部分的内容，大幅减少 token 消耗。\n\n**使用场景**:\n- 修改文件中的某些段落\n- 在文件特定位置插入新内容\n- 删除文件中的某些行\n- 在文件末尾追加内容\n\n**工作流程**:\n1. 先使用 readFile 读取文件内容，查看行号\n2. 确定要修改的行范围\n3. 调用 editFile 执行精确修改\n\n**重要提示**:行号从 1 开始计数 (第一行是 line 1)。",
            en: null
        },
        parameters: {
            type: "OBJECT",
            properties: {
                path: {
                    type: "STRING",
                    description: { zh: "文件路径 (例如:'Chapters/第1回.md')", en: null }
                },
                operation: {
                    type: "STRING",
                    description: {
                        zh: "编辑操作类型。可选值:\n- 'replace': 替换指定行范围的内容 (需要 startLine, endLine, content)\n- 'insert': 在指定行之后插入新内容 (需要 startLine, content)\n- 'delete': 删除指定行范围 (需要 startLine, endLine)\n- 'append': 在文件末尾追加内容 (仅需要 content)",
                        en: null
                    }
                },
                startLine: {
                    type: "NUMBER",
                    description: { zh: "起始行号 (从1开始)。对于 replace/insert/delete 操作必填。", en: null }
                },
                endLine: {
                    type: "NUMBER",
                    description: { zh: "结束行号 (从1开始,包含此行)。仅对 replace 和 delete 操作必填。", en: null }
                },
                content: {
                    type: "STRING",
                    description: { zh: "新内容。对于 replace/insert/append 操作必填。", en: null }
                }
            },
            required: ["path", "operation"]
        }
    }
};
