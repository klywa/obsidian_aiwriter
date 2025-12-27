import { App, Modal } from "obsidian";
import { Message } from "../settings";

export class HistoryPromptModal extends Modal {
    private messages: Message[];
    private onSelect: (query: string, referencedFiles: string[]) => void;

    constructor(
        app: App, 
        messages: Message[], 
        onSelect: (query: string, referencedFiles: string[]) => void
    ) {
        super(app);
        this.messages = messages;
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("history-prompt-modal");

        // Header
        const header = contentEl.createDiv({ cls: "history-prompt-header" });
        header.createEl("h3", { text: "历史 Prompt" });
        header.createEl("p", { 
            text: "点击任意历史 prompt 将其重新加载到输入框", 
            cls: "history-prompt-subtitle" 
        });

        // Filter user messages and reverse to show newest first
        const userMessages = this.messages
            .filter(msg => msg.role === 'user' && msg.content && msg.content.trim())
            .reverse(); // 从新到旧

        if (userMessages.length === 0) {
            contentEl.createDiv({ 
                text: "暂无历史 prompt", 
                cls: "history-prompt-empty" 
            });
            return;
        }

        // List container
        const listContainer = contentEl.createDiv({ cls: "history-prompt-list" });

        userMessages.forEach((msg, index) => {
            const item = listContainer.createDiv({ cls: "history-prompt-item" });
            
            // Extract query text (remove file tree and other system content)
            let displayContent = msg.content;
            
            // Remove "📎 Referenced Files" section if present
            displayContent = displayContent.replace(/📎 Referenced Files[\s\S]*?(\n\n|$)/, '');
            
            // Remove "User Query:" prefix if present
            if (displayContent.includes('User Query:')) {
                const parts = displayContent.split('User Query:');
                if (parts[1]) {
                    displayContent = parts[1].trim();
                }
            }
            
            // Truncate if too long
            const maxLength = 200;
            if (displayContent.length > maxLength) {
                displayContent = displayContent.substring(0, maxLength) + '...';
            }

            // Content section
            const contentDiv = item.createDiv({ cls: "history-prompt-content" });
            contentDiv.createEl("div", { 
                text: displayContent, 
                cls: "history-prompt-text" 
            });

            // Show referenced files if any
            if (msg.referencedFiles && msg.referencedFiles.length > 0) {
                const filesDiv = contentDiv.createDiv({ cls: "history-prompt-files" });
                filesDiv.createEl("span", { 
                    text: `📎 ${msg.referencedFiles.length} 个引用文件`, 
                    cls: "history-prompt-files-badge" 
                });
            }

            // Click handler
            item.addEventListener('click', () => {
                // Extract original query from message content
                let originalQuery = msg.content;
                
                // Remove "📎 Referenced Files" section
                originalQuery = originalQuery.replace(/📎 Referenced Files[\s\S]*?(\n\n|$)/, '').trim();
                
                // Remove "User Query:" prefix and everything before it
                if (originalQuery.includes('User Query:')) {
                    const parts = originalQuery.split('User Query:');
                    if (parts[1]) {
                        originalQuery = parts[1].trim();
                    }
                }
                
                this.onSelect(originalQuery, msg.referencedFiles || []);
                this.close();
            });
        });

        // Close button
        const buttonContainer = contentEl.createDiv({ cls: "history-prompt-buttons" });
        const closeBtn = buttonContainer.createEl("button", {
            text: "关闭",
            cls: "history-prompt-btn-close"
        });
        closeBtn.addEventListener('click', () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

