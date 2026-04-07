import { App, Notice } from "obsidian";
import { BaseModal } from "./BaseModal";
import { QueryHistoryItem, AgentTool } from "../settings";
import { ToolsManagerModal } from "./ToolsManagerModal";

export class HistoryPromptModal extends BaseModal {
    private queryHistory: QueryHistoryItem[];
    private tools: AgentTool[];
    private onSelect: (query: string, referencedFiles: string[]) => void;
    private onToolsSave: (tools: AgentTool[]) => void;

    constructor(
        app: App, 
        queryHistory: QueryHistoryItem[],
        tools: AgentTool[],
        onSelect: (query: string, referencedFiles: string[]) => void,
        onToolsSave: (tools: AgentTool[]) => void
    ) {
        super(app);
        this.queryHistory = queryHistory;
        this.tools = tools;
        this.onSelect = onSelect;
        this.onToolsSave = onToolsSave;
    }

    onOpen() {
        super.onOpen();
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("history-prompt-modal");

        // Header
        const header = contentEl.createDiv({ cls: "history-prompt-header" });
        header.createEl("h3", { text: "历史 Prompt" });
        header.createEl("p", { 
            text: "点击任意历史 prompt 将其重新加载到输入框，或添加为工具", 
            cls: "history-prompt-subtitle" 
        });

        // Sort by timestamp (newest first)
        const sortedHistory = [...this.queryHistory].sort((a, b) => b.timestamp - a.timestamp);

        if (sortedHistory.length === 0) {
            contentEl.createDiv({ 
                text: "暂无历史 prompt", 
                cls: "history-prompt-empty" 
            });
            return;
        }

        // List container
        const listContainer = contentEl.createDiv({ cls: "history-prompt-list" });

        sortedHistory.forEach((item) => {
            const itemDiv = listContainer.createDiv({ cls: "history-prompt-item" });
            
            // Content section
            const contentDiv = itemDiv.createDiv({ cls: "history-prompt-content" });
            
            // Truncate if too long
            const maxLength = 200;
            let displayContent = item.query;
            if (displayContent.length > maxLength) {
                displayContent = displayContent.substring(0, maxLength) + '...';
            }
            
            contentDiv.createEl("div", { 
                text: displayContent, 
                cls: "history-prompt-text" 
            });

            // Show referenced files if any
            if (item.referencedFiles && item.referencedFiles.length > 0) {
                const filesDiv = contentDiv.createDiv({ cls: "history-prompt-files" });
                filesDiv.createEl("span", { 
                    text: `📎 ${item.referencedFiles.length} 个引用文件`, 
                    cls: "history-prompt-files-badge" 
                });
            }

            // Action buttons container
            const actionsDiv = itemDiv.createDiv({ cls: "history-prompt-actions" });
            
            // Use button
            const useBtn = actionsDiv.createEl("button", {
                text: "使用",
                cls: "history-prompt-btn history-prompt-btn-use"
            });
            useBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onSelect(item.query, item.referencedFiles || []);
                this.close();
            });
            
            // Add to tools button
            const addToolBtn = actionsDiv.createEl("button", {
                text: "添加为工具",
                cls: "history-prompt-btn history-prompt-btn-tool"
            });
            addToolBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.addToTools(item.query);
            });

            // Click on item to use it
            itemDiv.addEventListener('click', () => {
                this.onSelect(item.query, item.referencedFiles || []);
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

    private addToTools(query: string) {
        // Create initial tool with the query as prompt
        const initialTool: AgentTool = {
            name: '新工具',
            prompt: query
        };
        
        // Close this modal first
        this.close();
        
        // Open ToolsManagerModal with the initial tool
        new ToolsManagerModal(
            this.app,
            this.tools,
            (newTools) => {
                this.onToolsSave(newTools);
                new Notice('工具已保存');
            },
            initialTool
        ).open();
    }

    onClose() {
        super.onClose();
        const { contentEl } = this;
        contentEl.empty();
    }
}
