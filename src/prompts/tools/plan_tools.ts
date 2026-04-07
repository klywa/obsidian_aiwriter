/**
 * Tool definition for proposePlan — used in Plan Mode.
 * When plan mode is enabled, the AI calls this instead of writeFile directly.
 */
export const PLAN_TOOL_DEFINITIONS = {
    proposePlan: {
        name: "proposePlan",
        description: {
            zh: "在规划模式下，提交章节规划供用户审阅确认。调用此工具后，规划将显示给用户，等待用户确认后才能继续写作。在收到用户的 [Plan Confirmed] 消息之前，不得调用 writeFile 写入章节正文。",
            en: "In plan mode, submit a chapter plan for user review. Writing will only proceed after the user confirms with [Plan Confirmed]."
        },
        parameters: {
            type: "OBJECT",
            properties: {
                path: {
                    type: "STRING",
                    description: {
                        zh: "规划对应的章节文件路径（例如：'Chapters/第二回.md'）",
                        en: "The chapter file path this plan is for (e.g., 'Chapters/Chapter2.md')"
                    }
                },
                content: {
                    type: "STRING",
                    description: {
                        zh: "规划的完整 Markdown 内容，包含情节概要、场景列表、角色出场、关键伏笔、目标字数等章节",
                        en: "Full Markdown content of the plan including plot summary, scene list, characters, key beats, and target word count"
                    }
                }
            },
            required: ["path", "content"]
        }
    }
};
