import { App, Editor, MarkdownView, Modal, Notice, Plugin, WorkspaceLeaf, Menu, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, VoyaruSettings, VoyaruSettingTab } from "./settings";
import { ChatView, VIEW_TYPE_CHAT } from "./views/chat_view";
import { AIService } from "./services/ai_service";
import { FSService } from "./services/fs_service";
import { PromptService } from "./services/prompt_service";
import { LocalEditModal } from "./modals/LocalEditModal";
import { LocalEditStatusModal } from "./modals/LocalEditStatusModal";
import { getAnnotationExtensions } from "./editor/annotation_decorations";
import { AnnotationView, VIEW_TYPE_ANNOTATION } from "./views/annotation_view";
import { AddAnnotationModal } from "./modals/AddAnnotationModal";
import { addAnnotationToText } from "./editor/annotation_parser";

export default class VoyaruPlugin extends Plugin {
	settings: VoyaruSettings;
    aiService: AIService;
    fsService: FSService;
    promptService: PromptService;
    localEditStatusModal: LocalEditStatusModal | null = null;
    private localEditAbortController: AbortController | null = null;

    // Cached waiting messages from chapters (legacy, kept for compatibility)
    private cachedChapterSentences: string[] = [];
    private lastSentencesRefreshTime: number = 0;
    private readonly SENTENCES_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    // Waiting message queue cache (new mechanism)
    private waitingMessageQueue: string[] = [];  // Sentence queue
    private readonly WAITING_QUEUE_MIN_SENTENCES = 50;  // Minimum sentences per refresh
    private readonly WAITING_QUEUE_REFRESH_THRESHOLD = 10;  // Refresh when below this
    private isWaitingQueueRefreshing: boolean = false;  // Prevent concurrent refreshes

	async onload() {
		await this.loadSettings();

        // Initialize Services
        this.fsService = new FSService(this.app);
        this.promptService = new PromptService(this);

        // Load prompts (will use embedded defaults if prompts.json is not available)
        await this.promptService.loadPrompts();
        console.log('[VoyaruPlugin] Prompts loaded successfully');

        // Migrate settings if needed (populate from prompts.json if empty)
        try {
            await this.migrateSettingsFromPrompts();
        } catch (error) {
            console.error('[VoyaruPlugin] Settings migration failed:', error);
        }

        this.aiService = new AIService(this.settings, this.fsService, this.promptService);

        // Invalidate memory index cache when Memory folder files change
        const invalidateMemoryOnChange = (file: any) => {
            const memoryFolder = this.settings.folders.memory || 'Memory';
            if (file.path && file.path.startsWith(memoryFolder + '/')) {
                this.aiService.invalidateMemoryIndex();
            }
        };
        this.registerEvent(this.app.vault.on('modify', invalidateMemoryOnChange));
        this.registerEvent(this.app.vault.on('create', invalidateMemoryOnChange));
        this.registerEvent(this.app.vault.on('delete', invalidateMemoryOnChange));

        // Initialize chapter sentences if setting is enabled
        if (this.settings.useProjectContentAsWaitingMessages) {
            await this.refreshWaitingMessagesFromChapters();
        }

        // Register View
        this.registerView(
            VIEW_TYPE_CHAT,
            (leaf) => new ChatView(leaf, this)
        );

        // Register Annotation View (sidebar panel)
        this.registerView(
            VIEW_TYPE_ANNOTATION,
            (leaf) => new AnnotationView(leaf, this)
        );

        // Register CM6 editor extension for annotation highlighting
        if (this.settings.enableAnnotationMode) {
            this.registerEditorExtension(getAnnotationExtensions());
        }

		// Ribbon Icon
		this.addRibbonIcon('bot', 'Voyaru Agent', (evt: MouseEvent) => {
			this.activateView();
		});

		// Ribbon Icon - Settings
		this.addRibbonIcon('settings', '插件设置', () => {
			const setting = (this.app as any).setting;
			setting.open();
			setting.openTabById('voyaru-plugin');
		});

		// Ribbon Icon - Annotation Panel
		this.addRibbonIcon('message-square', '打开批注面板', () => {
			this.activateAnnotationView();
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

        // Editor Command: Local Edit (支持手机端)
		this.addCommand({
			id: 'rewrite-selection',
			name: '局部修改',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
                const file = view.file;
                
                if (selection && file) {
                    // 计算选中文本的行数区间
                    const startLine = editor.getCursor("from").line;
                    const endLine = editor.getCursor("to").line;
                    
                    // 打开局部修改对话框
                    new LocalEditModal(this.app, selection, async (query: string) => {
                        await this.performLocalEdit(file.path, startLine, endLine, selection, query, editor);
                    }).open();
                } else {
                    new Notice("请先选中要修改的文本");
                }
			}
		});

        // Command to open annotation panel
        this.addCommand({
            id: 'open-annotation-panel',
            name: '打开批注面板',
            callback: () => this.activateAnnotationView()
        });

        // Editor Command: Add Annotation (支持手机端)
        this.addCommand({
            id: 'add-annotation',
            name: '添加批注',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.openAddAnnotationModal(editor, view);
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

                    menu.addItem((item) => {
                        item
                            .setTitle("添加批注")
                            .setIcon("message-square")
                            .onClick(() => this.openAddAnnotationModal(editor, view));
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

        // 监听配置文件变化（用于多端同步）
        this.registerEvent(this.app.vault.on('modify', async (file) => {
            if (file.path === `${this.manifest.dir}/data.json`) {
                console.log('Detected configuration change from file system (sync), reloading settings...');
                await this.loadSettings();
                
                // 如果AI服务已初始化，更新其配置
                if (this.aiService) {
                    this.aiService.updateSettings(this.settings);
                }
                
                // 通知UI更新（如果有必要）
                // 目前UI主要通过props或自行读取plugin.settings，
                // 对于React组件，可能需要一种机制来通知更新，但主要配置如API Key等会立即生效。
            }
        }));
	}

    /**
     * Refresh waiting messages from chapter files (queue-based mechanism)
     * Called when: plugin loads, setting toggled, or queue needs refilling
     */
    async refreshWaitingMessagesFromChapters(): Promise<void> {
        // Prevent concurrent refreshes
        if (this.isWaitingQueueRefreshing) {
            return;
        }

        // Check if queue needs refilling
        if (this.waitingMessageQueue.length >= this.WAITING_QUEUE_REFRESH_THRESHOLD) {
            console.log('[VoyaruPlugin] Waiting queue has enough sentences, skipping refresh');
            return;
        }

        this.isWaitingQueueRefreshing = true;

        try {
            const chaptersFolder = this.settings.folders?.chapters || 'Chapters';
            const useProjectContent = this.settings.useProjectContentAsWaitingMessages ?? false;

            if (!useProjectContent) {
                this.waitingMessageQueue = [];
                this.isWaitingQueueRefreshing = false;
                return;
            }

            console.log('[VoyaruPlugin] Refreshing waiting message queue from chapters...');

            // Extract more sentences for the queue
            const sentences = await this.fsService.extractRandomSentencesFromChapters(
                chaptersFolder,
                this.WAITING_QUEUE_MIN_SENTENCES,  // max sentences
                5,   // min length
                100  // max length
            );

            if (sentences.length > 0) {
                // Shuffle and add to queue
                const shuffled = sentences.sort(() => Math.random() - 0.5);
                this.waitingMessageQueue.push(...shuffled);
                console.log(`[VoyaruPlugin] Refreshed waiting queue with ${sentences.length} sentences, queue size: ${this.waitingMessageQueue.length}`);
            } else {
                console.warn('[VoyaruPlugin] No sentences extracted from chapters');
            }
        } catch (error) {
            console.error('[VoyaruPlugin] Error refreshing waiting message queue:', error);
        } finally {
            this.isWaitingQueueRefreshing = false;
        }
    }

    /**
     * Get a fresh batch of random waiting messages
     * Force refreshes from chapters if enabled
     */
    async getFreshWaitingMessages(): Promise<string[]> {
        const useProjectContent = this.settings.useProjectContentAsWaitingMessages ?? false;

        if (!useProjectContent) {
            // Preset messages are static, but we can shuffle them
            const messages = [...(this.settings.waitingMessages || ['思考中...'])];
            return messages.sort(() => Math.random() - 0.5);
        }

        // Force refresh from chapters
        try {
            const chaptersFolder = this.settings.folders?.chapters || 'Chapters';
            const sentences = await this.fsService.extractRandomSentencesFromChapters(
                chaptersFolder,
                20,  // max sentences
                5,   // min length
                100  // max length
            );

            if (sentences.length > 0) {
                this.cachedChapterSentences = sentences;
                this.lastSentencesRefreshTime = Date.now();
                return sentences;
            } else {
                console.warn('[VoyaruPlugin] No sentences extracted from chapters, using presets');
            }
        } catch (error) {
            console.error('[VoyaruPlugin] Error refreshing waiting messages:', error);
        }

        // Fallback to presets
        return this.settings.waitingMessages || ['思考中...'];
    }

    /**
     * Get current waiting messages (either from chapters or presets)
     */
    getWaitingMessages(): string[] {
        const useProjectContent = this.settings.useProjectContentAsWaitingMessages ?? false;

        if (useProjectContent && this.cachedChapterSentences.length > 0) {
            console.log('[VoyaruPlugin] Using chapter sentences for waiting messages');
            return this.cachedChapterSentences;
        }

        console.log('[VoyaruPlugin] Using preset waiting messages');
        return this.settings.waitingMessages || ['思考中...'];
    }

    /**
     * Get the next waiting message from the queue
     * Automatically refreshes the queue when running low
     */
    async getNextWaitingMessage(): Promise<string> {
        const useProjectContent = this.settings.useProjectContentAsWaitingMessages ?? false;

        if (useProjectContent) {
            // Check if queue needs refresh
            if (this.waitingMessageQueue.length <= this.WAITING_QUEUE_REFRESH_THRESHOLD && !this.isWaitingQueueRefreshing) {
                // Async refresh, don't block current retrieval
                this.refreshWaitingMessagesFromChapters();
            }

            // Take one from queue
            if (this.waitingMessageQueue.length > 0) {
                const message = this.waitingMessageQueue.shift()!;
                console.log(`[VoyaruPlugin] Retrieved message from queue, remaining: ${this.waitingMessageQueue.length}`);
                return message;
            }

            // Queue is empty, sync refresh and wait
            await this.refreshWaitingMessagesFromChapters();
            if (this.waitingMessageQueue.length > 0) {
                return this.waitingMessageQueue.shift()!;
            }
        }

        // Fallback: random from preset messages
        const presetMessages = this.settings.waitingMessages || ['思考中...'];
        return presetMessages[Math.floor(Math.random() * presetMessages.length)] || '思考中...';
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
            
            // 使用 PromptService 构建 local edit 提示词
            // 使用 getFullSystemPrompt 以包含 WRITER.md / 风格指南 / 记忆索引等强制上下文
            const baseSystemPrompt = await this.aiService.getFullSystemPrompt();
            const localEditSystemInstruction = this.promptService.getLocalEditSystemInstruction(baseSystemPrompt);
            const localEditUserMessage = this.promptService.getLocalEditUserMessage({
                filePath,
                startLine,
                endLine,
                originalContent,
                contextBefore,
                contextAfter,
                query
            });

            this.localEditStatusModal.updateStatus("正在生成修改...");

            // 调用AI服务
            // 使用临时session ID，确保局部修改独立
            const tempSessionId = `localedit-${Date.now()}`;
            // Pass localEditUserMessage as message, and localEditSystemInstruction as override
            const stream = this.aiService.streamChat(tempSessionId, [], localEditUserMessage, [], undefined, localEditSystemInstruction);
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

    async activateAnnotationView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_ANNOTATION)[0];
        if (!leaf) {
            leaf = workspace.getRightLeaf(false) || workspace.getLeaf('split');
            await leaf.setViewState({ type: VIEW_TYPE_ANNOTATION, active: true });
        }
        workspace.revealLeaf(leaf);
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
		const loadedData = (await this.loadData()) || {};

		// ========== 数据迁移：旧版本单一 API Key 到新版本多提供商 ==========
		if (loadedData.apiKey && !loadedData.providers) {
			console.log('[VoyaruPlugin] 检测到旧版本设置，正在迁移到多提供商格式...');

			// 创建默认的 Gemini 提供商
			loadedData.providers = [{
				id: crypto.randomUUID(),
				type: 'gemini',
				name: 'Google Gemini',
				apiKey: loadedData.apiKey,
				selectedModel: loadedData.model || 'gemini-3-pro-preview',
				models: []
			}];
			loadedData.activeProviderId = loadedData.providers[0].id;

			// 删除旧字段
			delete loadedData.apiKey;
			delete loadedData.model;

			// 保存迁移后的设置
			await this.saveData(loadedData);
			console.log('[VoyaruPlugin] 设置迁移完成');
		}

		// 深度合并配置，确保新字段能够正确添加
		this.settings = {
			...DEFAULT_SETTINGS,
			...loadedData,
			// 确保 folders 对象被正确合并
			folders: {
				...DEFAULT_SETTINGS.folders,
				...(loadedData.folders || {})
			},
			// 确保 tools 数组存在
			tools: loadedData.tools || DEFAULT_SETTINGS.tools,
			// 确保 postCheckItems 数组存在
			postCheckItems: loadedData.postCheckItems || DEFAULT_SETTINGS.postCheckItems,
			// 确保所有新添加的字段都有默认值
			maxFilesInPopup: loadedData.maxFilesInPopup ?? DEFAULT_SETTINGS.maxFilesInPopup,
			fontSize: loadedData.fontSize ?? DEFAULT_SETTINGS.fontSize,
			contextMode: loadedData.contextMode || DEFAULT_SETTINGS.contextMode,
			referenceMode: loadedData.referenceMode || DEFAULT_SETTINGS.referenceMode,
			// 确保 providers 和 activeProviderId 存在
			providers: loadedData.providers || DEFAULT_SETTINGS.providers,
			activeProviderId: loadedData.activeProviderId || DEFAULT_SETTINGS.activeProviderId
		};
	}

	/**
	 * Migrate settings from prompts.json if they are empty
	 * This ensures backward compatibility and populates defaults from prompts.json
	 */
	async migrateSettingsFromPrompts() {
		let needsSave = false;

		// 迁移旧的 systemPrompt 到 customPrompt (分层架构)
		if (this.settings.systemPrompt && this.settings.systemPrompt.trim() !== '') {
			console.log('[VoyaruPlugin] Migrating old systemPrompt to customPrompt');

			// 检查是否是默认提示词 (与 prompts.json 一致)
			const defaultPrompt = this.promptService.getSystemPrompt(false);

			if (this.settings.systemPrompt === defaultPrompt) {
				// 如果用户使用的是默认提示词,不需要迁移到 customPrompt
				this.settings.customPrompt = '';
				console.log('[VoyaruPlugin] User was using default prompt, no custom content to migrate');
			} else {
				// 用户有自定义内容,迁移到 customPrompt
				// 尝试提取用户自定义部分 (移除默认核心指令)
				const customPart = this.extractCustomPrompt(this.settings.systemPrompt, defaultPrompt);
				this.settings.customPrompt = customPart;
				console.log('[VoyaruPlugin] Migrated custom prompt content');
			}

			// 清空旧字段 (标记为已迁移)
			this.settings.systemPrompt = '';
			needsSave = true;
		}

		// Migrate tools if empty
		if (!this.settings.tools || this.settings.tools.length === 0) {
			console.log('[VoyaruPlugin] Migrating tools from prompts.json');
			this.settings.tools = this.promptService.getDefaultTools();
			needsSave = true;
		}

		// Migrate post-check items if empty
		if (!this.settings.postCheckItems || this.settings.postCheckItems.length === 0) {
			console.log('[VoyaruPlugin] Migrating post-check items from prompts.json');
			this.settings.postCheckItems = this.promptService.getDefaultPostCheckItems();
			needsSave = true;
		}

		if (needsSave) {
			await this.saveSettings();
			console.log('[VoyaruPlugin] Settings migration complete');
			new Notice('设置已迁移到新的分层提示词架构');
		}
	}

	/**
	 * 从旧的 systemPrompt 中提取用户自定义部分
	 * 简单实现: 如果内容不匹配默认值,则全部视为自定义
	 */
	private extractCustomPrompt(oldPrompt: string, defaultPrompt: string): string {
		// 如果完全匹配默认值,返回空
		if (oldPrompt === defaultPrompt) {
			return '';
		}

		// 简单策略: 如果不匹配,保留整个旧提示词作为自定义部分
		// 未来可以实现更智能的 diff 算法
		return oldPrompt;
	}

	async saveSettings() {
		await this.saveData(this.settings);
        if (this.aiService) {
            // 更新 AI Service 设置（会触发适配器重新初始化）
            await this.aiService.updateSettings(this.settings);
        } else {
            console.warn('AI Service not initialized when saving settings');
        }
	}

    private async openAddAnnotationModal(editor: Editor, view: MarkdownView) {
        const selection = editor.getSelection();
        const file = view.file;
        if (!selection || !file) {
            new Notice('请先选中要批注的文本');
            return;
        }
        new AddAnnotationModal(
            this.app,
            selection,
            async (suggestion: string, type: 'local' | 'global') => {
                try {
                    const vaultFile = this.app.vault.getAbstractFileByPath(file.path);
                    if (!vaultFile || !(vaultFile instanceof TFile)) return;
                    const content = await this.app.vault.read(vaultFile);
                    const updated = addAnnotationToText(content, type, selection, suggestion);
                    await this.app.vault.modify(vaultFile, updated);
                    new Notice('批注已添加');
                    await this.activateAnnotationView();
                } catch (e: any) {
                    new Notice('添加批注失败: ' + e.message);
                }
            }
        ).open();
    }
}
