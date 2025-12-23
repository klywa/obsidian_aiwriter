import { App, Modal, Notice } from "obsidian";

export class LocalEditModal extends Modal {
    private onSubmit: (query: string) => void;
    private query: string = "";
    private selectedText: string;

    constructor(app: App, selectedText: string, onSubmit: (query: string) => void) {
        super(app);
        this.selectedText = selectedText;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("local-edit-modal");

        // Header
        const header = contentEl.createDiv({ cls: "local-edit-header" });
        header.createEl("h3", { text: "局部修改" });

        // 选中文本预览
        const maxLength = 150;
        const displayContent = this.selectedText.length > maxLength 
            ? this.selectedText.substring(0, maxLength) + "..." 
            : this.selectedText;

        const previewContainer = contentEl.createDiv({ cls: "local-edit-preview" });
        previewContainer.createEl("div", { 
            text: "选中文本：", 
            cls: "local-edit-label" 
        });
        previewContainer.createEl("div", { 
            text: displayContent, 
            cls: "local-edit-content" 
        });

        // 输入区域
        const inputContainer = contentEl.createDiv({ cls: "local-edit-input-container" });
        inputContainer.createEl("label", { text: "修改要求" });
        
        const textarea = inputContainer.createEl("textarea", {
            placeholder: "例如：将这段文字改得更简洁一些",
            cls: "local-edit-textarea"
        });
        textarea.value = this.query;
        textarea.addEventListener("input", (e) => {
            this.query = (e.target as HTMLTextAreaElement).value;
        });

        // Enter 提交
        textarea.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.handleSubmit();
            }
        });

        // 按钮区域
        const buttonContainer = contentEl.createDiv({ cls: "local-edit-buttons" });
        
        const cancelBtn = buttonContainer.createEl("button", {
            text: "取消",
            cls: "local-edit-btn local-edit-btn-cancel"
        });
        cancelBtn.addEventListener("click", () => this.close());

        const submitBtn = buttonContainer.createEl("button", {
            text: "开始修改",
            cls: "local-edit-btn local-edit-btn-submit"
        });
        submitBtn.addEventListener("click", () => this.handleSubmit());

        // 自动聚焦
        setTimeout(() => textarea.focus(), 50);
    }

    private handleSubmit() {
        if (this.query.trim()) {
            this.onSubmit(this.query.trim());
            this.close();
        } else {
            new Notice("请输入修改要求");
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
