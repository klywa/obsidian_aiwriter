import { App, Modal, Setting } from "obsidian";
import { AgentTool } from "../settings";

export class ToolsManagerModal extends Modal {
    private tools: AgentTool[];
    private onSave: (tools: AgentTool[]) => void;
    private toolsContainer: HTMLElement;

    constructor(app: App, tools: AgentTool[], onSave: (tools: AgentTool[]) => void) {
        super(app);
        this.tools = JSON.parse(JSON.stringify(tools)); // Deep copy
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.empty();
        contentEl.addClass('tools-manager-modal');
        
        // Title
        contentEl.createEl('h2', { text: 'Manage Agent Tools' });
        
        // Description
        contentEl.createEl('p', { 
            text: 'Add, edit, or remove custom tools for your AI agent.',
            cls: 'setting-item-description'
        });
        
        // Tools Container
        this.toolsContainer = contentEl.createDiv('tools-list-container');
        this.renderTools();
        
        // Add Tool Button
        const addButtonContainer = contentEl.createDiv('tools-add-button-container');
        const addBtn = addButtonContainer.createEl('button', {
            text: '+ Add Tool',
            cls: 'mod-cta'
        });
        addBtn.addEventListener('click', () => {
            this.tools.push({ name: 'New Tool', prompt: '' });
            this.renderTools();
        });
        
        // Save/Cancel Buttons Container
        const buttonContainer = contentEl.createDiv('tools-button-container');
        
        // Save Button
        const saveBtn = buttonContainer.createEl('button', {
            text: 'Save All',
            cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', () => {
            this.onSave(this.tools);
            this.close();
        });
        
        // Cancel Button
        const cancelBtn = buttonContainer.createEl('button', {
            text: 'Cancel'
        });
        cancelBtn.addEventListener('click', () => {
            this.close();
        });
    }

    private renderTools() {
        this.toolsContainer.empty();
        
        if (this.tools.length === 0) {
            this.toolsContainer.createEl('p', {
                text: 'No tools configured. Click "Add Tool" to create one.',
                cls: 'tools-empty-message'
            });
            return;
        }
        
        this.tools.forEach((tool, index) => {
            const toolItem = this.toolsContainer.createDiv('tool-item');
            
            // Tool Header with Name and Delete Button
            const toolHeader = toolItem.createDiv('tool-item-header');
            
            // Name Input
            const nameContainer = toolHeader.createDiv('tool-name-container');
            nameContainer.createEl('label', { text: 'Tool Name:' });
            const nameInput = nameContainer.createEl('input', {
                type: 'text',
                value: tool.name,
                cls: 'tool-name-input'
            });
            nameInput.addEventListener('input', (e) => {
                tool.name = (e.target as HTMLInputElement).value;
            });
            
            // Delete Button
            const deleteBtn = toolHeader.createEl('button', {
                text: 'Delete',
                cls: 'mod-warning'
            });
            deleteBtn.addEventListener('click', () => {
                this.tools.splice(index, 1);
                this.renderTools();
            });
            
            // Prompt TextArea
            const promptContainer = toolItem.createDiv('tool-prompt-container');
            promptContainer.createEl('label', { text: 'Prompt:' });
            const promptTextArea = promptContainer.createEl('textarea', {
                cls: 'tool-prompt-textarea',
                attr: {
                    rows: '4',
                    placeholder: 'Enter the tool prompt/instruction...'
                }
            });
            promptTextArea.value = tool.prompt;
            promptTextArea.addEventListener('input', (e) => {
                tool.prompt = (e.target as HTMLTextAreaElement).value;
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}








