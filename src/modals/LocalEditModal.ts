import { App, Modal, Setting, Notice } from "obsidian";

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

        contentEl.createEl("h2", { text: "局部修改" });

        // 展示被框选的文字
        const maxLength = 300;
        const displayContent = this.selectedText.length > maxLength 
            ? this.selectedText.substring(0, maxLength) + "..." 
            : this.selectedText;

        const previewContainer = contentEl.createDiv({ cls: "local-edit-preview" });
        previewContainer.style.marginBottom = "15px";
        previewContainer.style.padding = "10px";
        previewContainer.style.backgroundColor = "var(--background-secondary)";
        previewContainer.style.borderRadius = "4px";
        
        previewContainer.createEl("div", { 
            text: "选中文本预览：", 
            cls: "local-edit-label" 
        }).style.fontWeight = "bold";
        
        const contentDiv = previewContainer.createEl("div", { 
            text: displayContent, 
            cls: "local-edit-content" 
        });
        contentDiv.style.fontStyle = "italic";
        contentDiv.style.marginTop = "5px";
        contentDiv.style.color = "var(--text-muted)";

        new Setting(contentEl)
            .setName("修改要求")
            .setDesc("请描述您希望如何修改选中的文本")
            .addTextArea((text) => {
                text
                    .setPlaceholder("例如：将这段文字改得更简洁一些")
                    .setValue(this.query)
                    .onChange((value) => {
                        this.query = value;
                    });
                text.inputEl.rows = 4;
                text.inputEl.style.width = "100%";
                // 移动端优化：防止iOS自动缩放
                text.inputEl.style.fontSize = "16px";
                return text;
            });

        const buttonSetting = new Setting(contentEl);
        buttonSetting.settingEl.style.flexWrap = "wrap";
        
        buttonSetting
            .addButton((button) => {
                button
                    .setButtonText("开始修改")
                    .setCta()
                    .onClick(() => {
                        if (this.query.trim()) {
                            this.onSubmit(this.query.trim());
                            this.close();
                        } else {
                            new Notice("请输入修改要求");
                        }
                    });
            })
            .addButton((button) => {
                button
                    .setButtonText("取消")
                    .onClick(() => {
                        this.close();
                    });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}


