import { App, Modal, Setting } from "obsidian";

export class LocalEditModal extends Modal {
    private onSubmit: (query: string) => void;
    private query: string = "";

    constructor(app: App, onSubmit: (query: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("local-edit-modal");

        contentEl.createEl("h2", { text: "局部修改" });

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
                return text;
            });

        new Setting(contentEl)
            .addButton((button) => {
                button
                    .setButtonText("开始修改")
                    .setCta()
                    .onClick(() => {
                        if (this.query.trim()) {
                            this.onSubmit(this.query.trim());
                            this.close();
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


