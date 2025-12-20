import { App, Editor, MarkdownView, Modal, Notice, Plugin, WorkspaceLeaf, Menu } from 'obsidian';
import { DEFAULT_SETTINGS, VoyaruSettings, VoyaruSettingTab } from "./settings";
import { ChatView, VIEW_TYPE_CHAT } from "./views/chat_view";
import { AIService } from "./services/ai_service";
import { FSService } from "./services/fs_service";
import { LocalEditModal } from "./modals/LocalEditModal";
import { LocalEditStatusModal } from "./modals/LocalEditStatusModal";

export default class VoyaruPlugin extends Plugin {
	settings: VoyaruSettings;
    aiService: AIService;
    fsService: FSService;
    localEditStatusModal: LocalEditStatusModal | null = null;
    private localEditAbortController: AbortController | null = null;

	async onload() {
		await this.loadSettings();

        // Initialize Services
        this.fsService = new FSService(this.app);
        this.aiService = new AIService(this.settings, this.fsService);

        // Register View
        this.registerView(
            VIEW_TYPE_CHAT,
            (leaf) => new ChatView(leaf, this)
        );

		// Ribbon Icon
		this.addRibbonIcon('bot', 'Voyaru Agent', (evt: MouseEvent) => {
			this.activateView();
		});

		// Status Bar
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Voyaru Active');

        // Command to open chat
		this.addCommand({
			id: 'open-voyaru-chat',
			name: 'Open Chat',
			callback: () => {
				this.activateView();
			}
		});

        // Command to cancel local edit
        this.addCommand({
            id: 'cancel-local-edit',
            name: 'Cancel Local Edit',
            callback: () => {
                this.cancelLocalEdit();
            }
        });

        // Editor Command: Rewrite Selection
		this.addCommand({
			id: 'rewrite-selection',
			name: 'Rewrite Selection',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
                if (selection) {
                    // Open a modal or send to chat?
                    // Requirement: "Popover... input instruction... streaming replacement"
                    // For simplicity, we'll send it to Chat with a special prompt or open a specific Modal.
                    // Let's activate chat and pre-fill it for now.
                    this.activateView();
                    // Ideally we'd have a method on the view to pre-fill input.
                    // But accessing the view instance is hard.
                    new Notice("Rewrite feature: Please copy selection to chat for now (feature in progress).");
                } else {
                    new Notice("No text selected.");
                }
			}
		});

        // Context Menu: Add to Context and Local Edit
        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, view: MarkdownView) => {
                const selection = editor.getSelection();
                const file = view.file;
                
                if (selection && file) {
                    // 计算选中文本的行数区间
                    const startLine = editor.getCursor("from").line;
                    const endLine = editor.getCursor("to").line;
                    
                    menu.addItem((item) => {
                        item
                            .setTitle("Add to Voyaru Context")
                            .setIcon("paperclip")
                            .onClick(async () => {
                                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
                                if (leaves.length > 0 && leaves[0]?.view instanceof ChatView) {
                                    const chatView = leaves[0].view as ChatView;
                                    const event = new CustomEvent('voyaru-add-context', {
                                        detail: {
                                            file: file.path,
                                            startLine: startLine,
                                            endLine: endLine,
                                            content: selection
                                        }
                                    });
                                    chatView.contentEl.dispatchEvent(event);
                                    new Notice(`已添加 ${file.path} (第${startLine + 1}-${endLine + 1}行) 到上下文`);
                                } else {
                                    new Notice("请先打开 Voyaru Chat 窗口");
                                }
                            });
                    });

                    menu.addItem((item) => {
                        item
                            .setTitle("局部修改")
                            .setIcon("edit")
                            .onClick(() => {
                                new LocalEditModal(this.app, selection, async (query: string) => {
                                    await this.performLocalEdit(file.path, startLine, endLine, selection, query, editor);
                                }).open();
                            });
                    });
                } else if (file) {
                    // 即使没有选中文本，也可以添加整个文件到上下文
                    menu.addItem((item) => {
                        item
                            .setTitle("Add to Voyaru Context")
                            .setIcon("paperclip")
                            .onClick(async () => {
                                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
                                if (leaves.length > 0 && leaves[0]?.view instanceof ChatView) {
                                    const chatView = leaves[0].view as ChatView;
                                    const event = new CustomEvent('voyaru-add-context', {
                                        detail: {
                                            file: file.path,
                                            startLine: 0,
                                            endLine: -1,
                                            content: await this.fsService.readFile(file.path)
                                        }
                                    });
                                    chatView.contentEl.dispatchEvent(event);
                                    new Notice(`已添加 ${file.path} 到上下文`);
                                } else {
                                    new Notice("请先打开 Voyaru Chat 窗口");
                                }
                            });
                    });
                }
            })
        );

		this.addSettingTab(new VoyaruSettingTab(this.app, this));
	}

	async onunload() {
        if (this.localEditStatusModal) {
            this.localEditStatusModal.close();
        }
        if (this.localEditAbortController) {
            this.localEditAbortController.abort();
        }
        
        // 确保在插件卸载前保存所有sessions
        // 尝试从所有打开的chat view中获取sessions并保存
        try {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
            for (const leaf of leaves) {
                if (leaf.view instanceof ChatView) {
                    // 触发保存（通过React组件的清理函数）
                    // 注意：React组件会在unmount时自动调用useEffect的清理函数
                }
            }
        } catch (e) {
            console.error('Error saving sessions on unload:', e);
        }
        
        // 确保设置已保存（虽然每次更改都会保存，但这里再次确认）
        await this.saveSettings();
	}

    async performLocalEdit(
        filePath: string, 
        startLine: number, 
        endLine: number, 
        originalContent: string, 
        query: string,
        editor: Editor
    ) {
        // 显示状态浮窗
        if (!this.localEditStatusModal) {
            this.localEditStatusModal = new LocalEditStatusModal(this.app);
        }
        this.localEditStatusModal.setActive(true);
        this.localEditStatusModal.updateStatus("正在分析上下文...");

        // 创建中止控制器
        this.localEditAbortController = new AbortController();

        try {
            // 读取文件完整内容
            const fullContent = await this.fsService.readFile(filePath);
            const lines = fullContent.split('\n');
            
            // 构建上下文信息
            const contextBefore = lines.slice(Math.max(0, startLine - 5), startLine).join('\n');
            const contextAfter = lines.slice(endLine + 1, Math.min(lines.length, endLine + 6)).join('\n');
            
            // 构建特殊的system prompt
            // 基于已有的 system prompt 增强
            const baseSystemPrompt = this.settings.systemPrompt || "";
            const localEditPrompt = `${baseSystemPrompt}

你是一个文本编辑助手。用户要求你对文档中的特定部分进行修改。

**文件路径**: ${filePath}
**需要修改的行数**: 第${startLine + 1}行到第${endLine + 1}行

**修改前的内容**:
\`\`\`
${originalContent}
\`\`\`

**上下文（修改部分之前5行）**:
\`\`\`
${contextBefore}
\`\`\`

**上下文（修改部分之后5行）**:
\`\`\`
${contextAfter}
\`\`\`

**用户要求**: ${query}

**输出规则**:
1. 只输出修改后的文本内容。
2. 不要包含任何 "好的"、"修改如下" 等对话用语。
3. 不要包含任何 <think> 标签或思考过程。
4. 不要使用 markdown 代码块包裹（除非内容本身包含代码）。
5. 保持与上下文的连贯性。`;

            this.localEditStatusModal.updateStatus("正在生成修改...");

            // 调用AI服务
            const stream = this.aiService.streamChat([], localEditPrompt, []);
            let modifiedContent = "";

            for await (const chunk of stream) {
                if (this.localEditAbortController.signal.aborted) {
                    throw new Error("用户取消了修改");
                }

                if (chunk.type === 'text') {
                    modifiedContent += chunk.content;
                    this.localEditStatusModal.updateStatus("正在生成修改...");
                } else if (chunk.type === 'error') {
                    throw new Error(chunk.content);
                }
            }

            if (!modifiedContent.trim()) {
                throw new Error("AI没有返回修改内容");
            }

            // 清理内容：移除可能的 <think> 标签和 markdown 代码块包裹
            modifiedContent = modifiedContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            
            // 如果 AI 还是包裹了代码块（例如 ``` ... ```），尝试移除外层包裹
            // 但要小心不要破坏原本就是代码的内容。
            // 简单的启发式：如果以 ``` 开头并以 ``` 结尾，且中间没有其他 ```，则移除。
            // 这里为了安全，暂只依靠 Prompt。如果用户反馈还有问题再加代码处理。
            // 仅仅去除首尾空白。
            
            this.localEditStatusModal.updateStatus("正在应用修改...");

            // 应用修改到编辑器
            const from = { line: startLine, ch: 0 };
            const endLineContent = lines[endLine] || '';
            const to = { line: endLine, ch: endLineContent.length };
            
            editor.replaceRange(modifiedContent.trim(), from, to);
            
            this.localEditStatusModal.updateStatus("修改完成！");
            setTimeout(() => {
                this.localEditStatusModal?.setActive(false);
            }, 1000);

            new Notice("局部修改完成");
        } catch (error: any) {
            console.error("Local edit error:", error);
            this.localEditStatusModal?.updateStatus(`错误: ${error.message || "修改失败"}`);
            setTimeout(() => {
                this.localEditStatusModal?.setActive(false);
            }, 2000);
            new Notice(`局部修改失败: ${error.message || "未知错误"}`);
        }
    }

    cancelLocalEdit() {
        if (this.localEditAbortController) {
            this.localEditAbortController.abort();
            this.localEditAbortController = null;
        }
        if (this.localEditStatusModal) {
            this.localEditStatusModal.setActive(false);
        }
        new Notice("已取消局部修改");
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);

        if (leaves.length > 0) {
            leaf = leaves[0]!;
        } else {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf as WorkspaceLeaf;
                await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
            }
        }

        if (leaf) workspace.revealLeaf(leaf);
    }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) || {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
        if (this.aiService) {
            // Only log if API key changed to avoid spamming console during auto-saves
            if (this.settings.apiKey !== this.aiService['settings'].apiKey) {
                 console.log('Updating AI service settings, API Key:', this.settings.apiKey ? '***' + this.settings.apiKey.slice(-4) : 'empty');
            }
            this.aiService.updateSettings(this.settings);
        } else {
            console.warn('AI Service not initialized when saving settings');
        }
	}
}
