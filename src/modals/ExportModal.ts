import { App, Modal, Setting, TFile, Notice } from "obsidian";
import { FSService } from "../services/fs_service";
import { FileSuggest } from "../components/FileSuggest";

export class ExportModal extends Modal {
    private content: string;
    private fsService: FSService;
    private selectedMode: 'overwrite' | 'append' = 'append';
    private filePath: string = "";

    constructor(app: App, content: string, fsService: FSService) {
        super(app);
        this.content = content;
        this.fsService = fsService;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("export-modal");

        contentEl.createEl("h2", { text: "导出到笔记" });

        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            this.filePath = activeFile.path;
        }

        // File Selection
        new Setting(contentEl)
            .setName("目标笔记")
            .setDesc("选择现有笔记或输入新文件名")
            .addText(text => {
                text.setValue(this.filePath)
                    .setPlaceholder("Example/MyNote.md")
                    .onChange(value => {
                        this.filePath = value;
                    });
                text.inputEl.style.width = "300px";
                new FileSuggest(this.app, text.inputEl);
            });

        // Export Mode
        new Setting(contentEl)
            .setName("导出模式")
            .addDropdown(dropdown => {
                dropdown.addOption('append', '追加到末尾');
                dropdown.addOption('overwrite', '覆盖内容');
                dropdown.setValue(this.selectedMode);
                dropdown.onChange((value: 'overwrite' | 'append') => {
                    this.selectedMode = value;
                });
            });

        // Buttons
        new Setting(contentEl)
            .addButton(button => {
                button
                    .setButtonText("导出")
                    .setCta()
                    .onClick(async () => {
                        await this.handleExport();
                        this.close();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText("取消")
                    .onClick(() => {
                        this.close();
                    });
            });
    }

    async handleExport() {
        if (!this.filePath.trim()) {
            new Notice("请输入文件名");
            return;
        }

        let targetPath = this.filePath.trim();
        if (!targetPath.endsWith(".md")) {
            targetPath += ".md";
        }

        try {
            const file = this.app.vault.getAbstractFileByPath(targetPath);
            
            if (file && file instanceof TFile) {
                // File exists
                if (this.selectedMode === 'append') {
                    const currentContent = await this.app.vault.read(file);
                    await this.app.vault.modify(file, currentContent + "\n\n" + this.content);
                    new Notice(`已追加到: ${targetPath}`);
                } else {
                    // Overwrite
                    await this.app.vault.modify(file, this.content);
                    new Notice(`已覆盖: ${targetPath}`);
                }
            } else if (file) {
                 new Notice(`错误: "${targetPath}" 是一个文件夹`);
            } else {
                // File does not exist, create it
                await this.fsService.writeFile(targetPath, this.content);
                new Notice(`已创建并写入: ${targetPath}`);
            }
        } catch (e: any) {
            new Notice(`导出失败: ${e.message}`);
            console.error(e);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
