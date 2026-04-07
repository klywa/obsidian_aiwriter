/**
 * Default post-check items loaded when the user's list is empty.
 * Edit these to change the out-of-the-box quality checks.
 */
export const DEFAULT_POST_CHECK_ITEMS = [
    {
        id: "check-1",
        checkPrompt: {
            zh: "检查文本是否符合既定的语言风格和文风要求，如有不符，进行调整。",
            en: null
        }
    },
    {
        id: "check-2",
        checkPrompt: {
            zh: "检查情节发展是否自然流畅，前后逻辑是否连贯，有无矛盾之处。",
            en: null
        }
    }
];
