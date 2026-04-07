/**
 * Instruction appended when referenceMode === 'path'.
 * Tells the AI to use readFile tool to access referenced files.
 */
export const REFERENCE_MODE_INSTRUCTION = {
    zh: "\n\n### 📎 Referenced Files Handling\nWhen you see \"📎 Referenced Files\" in the user's message, those are file paths that the user wants you to consider.\n**Important**: The file contents are NOT included in the message. You MUST use the `readFile` tool to read each file before you can work with it.\n\nExample workflow:\n1. User mentions: \"📎 Referenced Files: Chapters/第1回.md\"\n2. You should: Call readFile(\"Chapters/第1回.md\") to read the content\n3. Then: Process the content according to user's request\n\nAlways read referenced files first before attempting to work with them.",
    en: null
};
