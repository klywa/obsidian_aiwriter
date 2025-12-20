import { App, Modal } from "obsidian";

export class LogModal extends Modal {
    private logs: any;

    constructor(app: App, logs: any) {
        super(app);
        this.logs = logs;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("log-modal");
        
        // Ensure modal is wide
        this.modalEl.style.width = "80vw";
        this.modalEl.style.maxWidth = "1000px";

        contentEl.createEl("h2", { text: "响应日志 (JSON)" });

        const pre = contentEl.createEl("pre");
        pre.style.maxHeight = "60vh";
        pre.style.overflow = "auto";
        pre.style.backgroundColor = "var(--background-secondary)";
        pre.style.padding = "16px";
        pre.style.borderRadius = "8px";
        pre.style.whiteSpace = "pre-wrap";
        pre.style.wordBreak = "break-all";
        
        try {
            // Check if logs is already string or object
            const jsonString = typeof this.logs === 'string' ? this.logs : JSON.stringify(this.logs, null, 2);
            pre.setText(jsonString);
        } catch (e) {
            pre.setText("Error parsing logs: " + e);
        }

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = "flex";
        btnContainer.style.justifyContent = "flex-end";
        btnContainer.style.marginTop = "16px";
        btnContainer.style.gap = "10px";

        const copyBtn = btnContainer.createEl("button", { text: "复制" });
        copyBtn.onclick = () => {
            const jsonString = typeof this.logs === 'string' ? this.logs : JSON.stringify(this.logs, null, 2);
            navigator.clipboard.writeText(jsonString);
            // Simple toast
            const notice = document.createElement("div");
            notice.className = "notice";
            notice.textContent = "已复制";
            document.body.appendChild(notice);
            setTimeout(() => notice.remove(), 2000);
        };

        const closeBtn = btnContainer.createEl("button", { text: "关闭" });
        closeBtn.onclick = () => this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

