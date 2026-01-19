/**
 * Default embedded prompts configuration
 * This is a fallback when prompts.json is not available
 * Used to ensure the plugin works for end users without requiring prompts.json file
 */
export const DEFAULT_PROMPTS = {
  "version": "1.0.0",
  "system": {
    "base": {
      "zh": "",
      "en": null
    },
    "jailbreak": {
      "zh": "",
      "en": null,
      "optional": true,
      "warning": "This content may bypass safety guidelines and is designed to override content moderation. Use with extreme caution or consider removing it entirely."
    },
    "styleGuideInstruction": {
      "zh": "---\n\n### 📖 风格指南（必读）\n\n**重要**：本项目存在风格指南文件，位于 `${styleGuidePath}`。\n\n**强制要求**：在进行任何创作任务之前，你必须首先使用 `readFile` 工具读取风格指南的完整内容，并在创作过程中严格遵循其中的所有规范和要求。\n\n请立即执行：\n1. 调用 `readFile(\"${styleGuidePath}\")` 读取风格指南\n2. 仔细理解并记住其中的风格要求\n3. 在后续创作中严格遵循这些要求",
      "en": null,
      "template": true,
      "variables": ["styleGuidePath"]
    },
    "referenceModeInstruction": {
      "zh": "\n\n### 📎 Referenced Files Handling\nWhen you see \"📎 Referenced Files\" in the user's message, those are file paths that the user wants you to consider.\n**Important**: The file contents are NOT included in the message. You MUST use the `readFile` tool to read each file before you can work with it.\n\nExample workflow:\n1. User mentions: \"📎 Referenced Files: Chapters/第1回.md\"\n2. You should: Call readFile(\"Chapters/第1回.md\") to read the content\n3. Then: Process the content according to user's request\n\nAlways read referenced files first before attempting to work with them.",
      "en": null
    }
  },
  "tools": {
    "default": [
      {
        "id": "plan-next-chapter",
        "name": {
          "zh": "规划下一章节",
          "en": null
        },
        "prompt": {
          "zh": "根据当前已有章节，构思下一个章节的内容，写入大纲中。",
          "en": null
        }
      },
      {
        "id": "write-next-chapter",
        "name": {
          "zh": "写下一章",
          "en": null
        },
        "prompt": {
          "zh": "根据当前已有章节，编写下一回（直接写入文档）。若大纲已经规划了下一回的内容，应该严格按照大纲中的情节进行编写。若存在风格指南，章节的风格必须严格遵守《风格指南》中的要求。章节目标字数：",
          "en": null
        }
      },
      {
        "id": "update-character",
        "name": {
          "zh": "更新人设",
          "en": null
        },
        "prompt": {
          "zh": "根据当前已有章节，更新人设文档。若没有人设文档，则新建以人设名命名的人设文档，放入characters目录下。更新时需要注意，能做**增量**的更新（不改动以往的设定）。如果涉及到某些属性的转变，应该**清晰**地写出变化历程。",
          "en": null
        }
      },
      {
        "id": "update-outline",
        "name": {
          "zh": "更新大纲",
          "en": null
        },
        "prompt": {
          "zh": "根据当前已有章节，更新大纲文文档（大纲）。若没有人设文档，新建大纲，outlines目录下。",
          "en": null
        }
      }
    ],
    "functionDefinitions": {
      "writeFile": {
        "name": "writeFile",
        "description": {
          "zh": "创建或覆盖文件内容。用于保存章节、大纲、角色设定等。",
          "en": "Create or overwrite a file with content. Use this to save chapters, outlines, characters, etc."
        },
        "parameters": {
          "type": "OBJECT",
          "properties": {
            "_reasoning": {
              "type": "STRING",
              "description": {
                "zh": "内部思考过程，解释为什么要调用这个工具。",
                "en": "Internal thought process explaining why this tool is being called."
              }
            },
            "path": {
              "type": "STRING",
              "description": {
                "zh": "文件路径（例如：'Chapters/第1回.md'）",
                "en": "The path to the file. (e.g., 'Chapters/第1回.md')"
              }
            },
            "content": {
              "type": "STRING",
              "description": {
                "zh": "要写入文件的完整内容",
                "en": "The full content to write to the file."
              }
            }
          },
          "required": ["path", "content"]
        }
      },
      "readFile": {
        "name": "readFile",
        "description": {
          "zh": "读取文件内容以获取上下文信息。",
          "en": "Read the content of a file to get context."
        },
        "parameters": {
          "type": "OBJECT",
          "properties": {
            "path": {
              "type": "STRING",
              "description": {
                "zh": "文件路径",
                "en": "The path to the file."
              }
            }
          },
          "required": ["path"]
        }
      },
      "deleteFile": {
        "name": "deleteFile",
        "description": {
          "zh": "删除文件。",
          "en": "Delete a file."
        },
        "parameters": {
          "type": "OBJECT",
          "properties": {
            "path": {
              "type": "STRING",
              "description": {
                "zh": "文件路径",
                "en": "The path to the file."
              }
            }
          },
          "required": ["path"]
        }
      },
      "editFile": {
        "name": "editFile",
        "description": {
          "zh": "对现有文件进行部分编辑。支持替换、插入、删除和追加操作。相比 writeFile 的全量覆盖，editFile 只需要提供修改部分的内容，大幅减少 token 消耗。\n\n**使用场景**:\n- 修改文件中的某些段落\n- 在文件特定位置插入新内容\n- 删除文件中的某些行\n- 在文件末尾追加内容\n\n**工作流程**:\n1. 先使用 readFile 读取文件内容，查看行号\n2. 确定要修改的行范围\n3. 调用 editFile 执行精确修改\n\n**重要提示**:行号从 1 开始计数 (第一行是 line 1)。",
          "en": null
        },
        "parameters": {
          "type": "OBJECT",
          "properties": {
            "path": {
              "type": "STRING",
              "description": {
                "zh": "文件路径 (例如:'Chapters/第1回.md')",
                "en": null
              }
            },
            "operation": {
              "type": "STRING",
              "description": {
                "zh": "编辑操作类型。可选值:\n- 'replace': 替换指定行范围的内容 (需要 startLine, endLine, content)\n- 'insert': 在指定行之后插入新内容 (需要 startLine, content)\n- 'delete': 删除指定行范围 (需要 startLine, endLine)\n- 'append': 在文件末尾追加内容 (仅需要 content)",
                "en": null
              }
            },
            "startLine": {
              "type": "NUMBER",
              "description": {
                "zh": "起始行号 (从1开始)。对于 replace/insert/delete 操作必填。",
                "en": null
              }
            },
            "endLine": {
              "type": "NUMBER",
              "description": {
                "zh": "结束行号 (从1开始,包含此行)。仅对 replace 和 delete 操作必填。",
                "en": null
              }
            },
            "content": {
              "type": "STRING",
              "description": {
                "zh": "新内容。对于 replace/insert/append 操作必填。",
                "en": null
              }
            }
          },
          "required": ["path", "operation"]
        }
      }
    }
  },
  "postCheck": {
    "systemPrompt": {
      "zh": "${baseSystemPrompt}\n\n${fileTree ? `### Project File Tree (Always Available)\\n\\`\\`\\`\\n${fileTree}\\n\\`\\`\\`\\n\\n` : ''}\n\n---\n\n## 后置检查与润色任务\n\n你现在需要对刚刚创作的内容进行后置检查和润色。\n\n### 检查项列表\n${checkItemsList}\n\n### 工作流程\n\n**第一步：分析检查**\n仔细阅读内容，对照每一条检查项进行逐项检查。你需要：\n1. 明确指出哪些地方不符合检查项的要求\n2. 说明具体的问题是什么\n3. 计划如何修改以满足要求\n\n**第二步：修改润色**\n在完成检查分析后，输出修改润色后的完整内容。要求：\n1. 修改所有不符合检查项要求的内容\n2. 保持字数不减少（可以适当增加）\n3. 不删改其他符合要求的内容\n4. 保持整体连贯性和流畅性\n\n### 输出格式\n\n请按照以下格式输出：\n\n**【检查结果】**\n（在这里输出你的检查分析结果，说明哪些地方不符合要求，准备如何修改）\n\n**【润色后内容】**\n（在这里直接输出修改润色后的完整内容）\n\n**极其重要的格式要求：**\n- 【润色后内容】部分必须直接输出原始的markdown文本\n- 绝对不要使用 ```markdown 或 ``` 或任何形式的代码块包裹内容\n- 不要添加任何额外的格式标记或包装\n- 直接输出文章的markdown内容即可，就像你在编辑一个.md文件一样\n- 如果原文是 \"# 标题\\n\\n正文\"，你就直接输出 \"# 标题\\n\\n正文\"，不要有任何额外包装\n- 润色后的内容必须是完整的，不能遗漏任何段落或内容",
      "en": null,
      "template": true,
      "variables": ["baseSystemPrompt", "fileTree", "checkItemsList"]
    },
    "userMessage": {
      "zh": "请对以下内容进行后置检查和润色：\n\n**文件路径**: ${filePath}\n\n**原始内容**:\n${originalContent}\n\n请按照system prompt中的要求，进行检查分析并输出润色后的内容。\n\n⚠️ 特别提醒：在【润色后内容】部分，直接输出markdown文本，不要使用 ```markdown 或 ``` 包裹！这会导致内容损坏！",
      "en": null,
      "template": true,
      "variables": ["filePath", "originalContent"]
    },
    "defaultItems": [
      {
        "id": "check-1",
        "checkPrompt": {
          "zh": "检查文本是否符合既定的语言风格和文风要求，如有不符，进行调整。",
          "en": null
        }
      },
      {
        "id": "check-2",
        "checkPrompt": {
          "zh": "检查情节发展是否自然流畅，前后逻辑是否连贯，有无矛盾之处。",
          "en": null
        }
      }
    ]
  },
  "localEdit": {
    "systemInstruction": {
      "zh": "${baseSystemPrompt}\n\n你是一个文本编辑助手。用户要求你对文档中的特定部分进行修改。\n\n**重要：仅输出对原文的修改，不要输出思考过程。**\n\n**输出规则**:\n1. 只输出修改后的文本内容。\n2. 不要包含任何 \"好的\"、\"修改如下\" 等对话用语。\n3. 不要包含任何 <think> 标签或思考过程。\n4. 不要使用 markdown 代码块包裹（除非内容本身包含代码）。\n5. 保持与上下文的连贯性。\n6. 直接输出修改后的文本，不要添加任何解释、说明或额外内容。",
      "en": null,
      "template": true,
      "variables": ["baseSystemPrompt"]
    },
    "userMessage": {
      "zh": "\n**文件路径**: ${filePath}\n**需要修改的行数**: 第${startLine}行到第${endLine}行\n\n**修改前的内容**:\n```\n${originalContent}\n```\n\n**上下文（修改部分之前5行）**:\n```\n${contextBefore}\n```\n\n**上下文（修改部分之后5行）**:\n```\n${contextAfter}\n```\n\n**用户要求**: ${query}",
      "en": null,
      "template": true,
      "variables": ["filePath", "startLine", "endLine", "originalContent", "contextBefore", "contextAfter", "query"]
    }
  }
} as const;
