import { App, Modal, Setting } from "obsidian";

export class SystemPromptModal extends Modal {
    private prompt: string;
    private onSave: (prompt: string) => void;
    private textAreaEl: HTMLTextAreaElement;

    constructor(app: App, prompt: string, onSave: (prompt: string) => void) {
        super(app);
        this.prompt = prompt;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.empty();
        contentEl.addClass('system-prompt-modal');
        
        // Title
        contentEl.createEl('h2', { text: 'Edit System Prompt' });
        
        // Description
        contentEl.createEl('p', { 
            text: 'Define the core instructions for the AI Agent.',
            cls: 'setting-item-description'
        });
        
        // Text Area Container
        const textAreaContainer = contentEl.createDiv('system-prompt-textarea-container');
        this.textAreaEl = textAreaContainer.createEl('textarea', {
            cls: 'system-prompt-textarea',
            attr: {
                rows: '20',
                placeholder: 'Enter system prompt...'
            }
        });
        this.textAreaEl.value = this.prompt;
        
        // Buttons Container
        const buttonContainer = contentEl.createDiv('system-prompt-button-container');
        
        // Save Button
        const saveBtn = buttonContainer.createEl('button', {
            text: 'Save',
            cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', () => {
            this.onSave(this.textAreaEl.value);
            this.close();
        });
        
        // Cancel Button
        const cancelBtn = buttonContainer.createEl('button', {
            text: 'Cancel'
        });
        cancelBtn.addEventListener('click', () => {
            this.close();
        });
        
        // Focus on text area
        this.textAreaEl.focus();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}




