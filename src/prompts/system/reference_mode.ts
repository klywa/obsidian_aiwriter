/**
 * Instruction appended when referenceMode === 'path'.
 * Tells the AI to use readFile tool to access referenced files.
 */
export const REFERENCE_MODE_INSTRUCTION = {
    zh: "\n\n### 📎 Referenced Files Handling\nWhen you see \"📎 Referenced Files\" in the user's message, those are file paths that the user wants you to consider.\n**Important**: The file contents are NOT included in the message. You MUST use the `readFile` tool to read them before you can work with them.\n\n**Read them ALL in ONE call** — `readFile` accepts a `paths` array. Never call `readFile` once per file.\n\nExample workflow:\n1. User mentions: \"📎 Referenced Files: Chapters/第1回.md, Chapters/第2回.md\"\n2. You should: Call `readFile({paths: [\"Chapters/第1回.md\", \"Chapters/第2回.md\"]})` — a single call with every referenced path\n3. Then: Process the content according to user's request\n\nAlways read referenced files first before attempting to work with them.",
    en: null
};

/**
 * Header line prepended to the user message when referenceMode === 'path'.
 * Followed by one "- <path>" line per referenced file, then REFERENCED_FILES_FOOTER.
 */
export const REFERENCED_FILES_HEADER = {
    zh: "\n📎 Referenced Files (use readFile tool to access):\n",
    en: null
};

/**
 * Footer line appended after the referenced file list when referenceMode === 'path'.
 */
export const REFERENCED_FILES_FOOTER = {
    zh: "\nPlease read these files with the readFile tool. Pass ALL of the paths above in ONE readFile call via the `paths` array — do not read them one at a time.\n",
    en: null
};
