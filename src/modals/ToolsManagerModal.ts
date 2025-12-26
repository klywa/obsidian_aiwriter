import { App, Modal, Notice, Platform } from "obsidian";
import { AgentTool } from "../settings";
import Sortable from "sortablejs";

export class ToolsManagerModal extends Modal {
    private tools: AgentTool[];
    private onSave: (tools: AgentTool[]) => void;
    private leftPanel: HTMLElement;
    private rightPanel: HTMLElement;
    private selectedIndex: number = -1; // 初始化为 -1，表示未选中任何工具
    private draggedIndex: number | null = null;
    private sortableInstance: any = null; // 保存 Sortable 实例

    constructor(app: App, tools: AgentTool[], onSave: (tools: AgentTool[]) => void) {
        super(app);
        this.tools = JSON.parse(JSON.stringify(tools)); // Deep copy
        this.onSave = onSave;
        // 如果有工具，桌面端默认选中第一个，移动端不选中
        if (this.tools.length > 0 && !Platform.isMobile) {
            this.selectedIndex = 0;
        }
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.empty();
        contentEl.addClass('tools-manager-modal');
        
        // Title
        const header = contentEl.createDiv('tools-manager-header');
        header.createEl('h2', { text: '管理工具' });
        
        // Two-column layout container
        const mainContainer = contentEl.createDiv('tools-manager-main');
        
        // Left Panel - Tool Tags List
        this.leftPanel = mainContainer.createDiv('tools-manager-left-panel');
        
        // Right Panel - Edit Area
        this.rightPanel = mainContainer.createDiv('tools-manager-right-panel');
        
        // Render initial state
        this.renderLeftPanel();
        this.renderRightPanel();
        
        // Bottom buttons
        const buttonContainer = contentEl.createDiv('tools-manager-buttons');
        
        // Add Tool Button
        const addBtn = buttonContainer.createEl('button', {
            text: '+ 添加工具',
            cls: 'mod-cta'
        });
        addBtn.addEventListener('click', () => {
            // Check for default name conflicts
            let newName = '新工具';
            let counter = 1;
            while (this.tools.some(t => t.name === newName)) {
                newName = `新工具 ${counter}`;
                counter++;
            }
            
            this.tools.push({ name: newName, prompt: '' });
            this.selectedIndex = this.tools.length - 1;
            this.renderLeftPanel();
            this.renderRightPanel();
        });
        
        // 导入导出按钮组
        const importExportContainer = buttonContainer.createDiv('tools-import-export-buttons');
        
        // Export Button
        const exportBtn = importExportContainer.createEl('button', {
            text: '导出工具'
        });
        exportBtn.addEventListener('click', () => {
            this.exportTools();
        });
        
        // Import Button
        const importBtn = importExportContainer.createEl('button', {
            text: '导入工具'
        });
        importBtn.addEventListener('click', () => {
            this.importTools();
        });
        
        // Save All Button
        const saveBtn = buttonContainer.createEl('button', {
            text: '保存',
            cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', () => {
            // Validate no empty names
            if (this.tools.some(t => !t.name.trim())) {
                new Notice('工具名称不能为空');
                return;
            }
            
            console.log('Saving tools:', this.tools);
            this.onSave(this.tools);
            
            // 移动端：保存后返回列表，桌面端：关闭弹窗
            if (Platform.isMobile) {
                new Notice('保存成功');
                this.selectedIndex = -1; // 取消选中
                this.renderLeftPanel();
                this.renderRightPanel();
            } else {
                this.close();
            }
        });
        
        // Cancel Button
        const cancelBtn = buttonContainer.createEl('button', {
            text: '取消'
        });
        cancelBtn.addEventListener('click', () => {
            this.close();
        });
    }

    private renderLeftPanel() {
        this.leftPanel.empty();
        
        // 移动端：根据 selectedIndex 控制显示
        if (Platform.isMobile) {
            if (this.selectedIndex !== -1) {
                // 选中了某个工具，显示编辑页面
                this.leftPanel.style.display = 'none';
                this.rightPanel.style.display = 'flex';
            } else {
                // 未选中，显示列表
                this.leftPanel.style.display = 'flex';
                this.rightPanel.style.display = 'none';
            }
        }
        
        const header = this.leftPanel.createDiv('tools-list-header');
        header.createEl('span', { text: '工具列表', cls: 'tools-list-title' });
        header.createEl('span', { text: '拖拽可排序', cls: 'tools-list-hint' });
        
        const listContainer = this.leftPanel.createDiv('tools-list-container');
        
        if (this.tools.length === 0) {
            listContainer.createEl('p', {
                text: '暂无工具，点击"添加工具"创建',
                cls: 'tools-empty-message'
            });
            return;
        }

        // 销毁之前的 Sortable 实例
        if (this.sortableInstance) {
            this.sortableInstance.destroy();
            this.sortableInstance = null;
        }

        // Initialize Sortable
        this.sortableInstance = Sortable.create(listContainer, {
            animation: 150,
            ghostClass: 'tool-tag-dragging',
            chosenClass: 'tool-tag-chosen',
            dragClass: 'tool-tag-drag',
            delay: Platform.isMobile ? 200 : 0, 
            delayOnTouchOnly: true,
            touchStartThreshold: 5,
            forceFallback: false,
            fallbackTolerance: 3,
            onEnd: (evt: any) => {
                const { oldIndex, newIndex } = evt;
                if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;

                const item = this.tools.splice(oldIndex, 1)[0];
                if (!item) return; // 安全检查
                this.tools.splice(newIndex, 0, item);

                // Update selectedIndex
                if (this.selectedIndex === oldIndex) {
                    this.selectedIndex = newIndex;
                } else if (this.selectedIndex > oldIndex && this.selectedIndex <= newIndex) {
                    this.selectedIndex--;
                } else if (this.selectedIndex < oldIndex && this.selectedIndex >= newIndex) {
                    this.selectedIndex++;
                }
                
                // 重新渲染以更新选中状态
                this.renderLeftPanel();
            }
        });
        
        this.tools.forEach((tool, index) => {
            const tagEl = listContainer.createDiv('tool-tag');
            tagEl.setAttribute('data-id', index.toString());
            
            if (index === this.selectedIndex) {
                tagEl.addClass('tool-tag-selected');
            }
            
            // Tag content
            const tagContent = tagEl.createDiv('tool-tag-content');
            tagContent.createEl('span', { text: tool.name });
            
            // Click to select
            tagEl.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (!target.closest('.tool-tag-delete')) {
                    this.selectedIndex = index;
                    this.renderLeftPanel();
                    this.renderRightPanel();
                }
            });
            
            // Delete button
            const deleteBtn = tagEl.createDiv('tool-tag-delete');
            deleteBtn.innerHTML = '×';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.tools.splice(index, 1);
                // 删除后重新设置选中状态
                if (this.tools.length === 0) {
                    this.selectedIndex = -1;
                } else if (this.selectedIndex >= this.tools.length) {
                    this.selectedIndex = this.tools.length - 1;
                } else if (this.selectedIndex === index) {
                    // 如果删除的是当前选中的，选中前一个或第一个
                    this.selectedIndex = Math.max(0, index - 1);
                    if (Platform.isMobile && this.tools.length > 0) {
                        this.selectedIndex = -1; // 移动端删除后返回列表
                    }
                }
                this.renderLeftPanel();
                this.renderRightPanel();
            });
        });
    }

    private renderRightPanel() {
        this.rightPanel.empty();
        
        // 移动端头部导航
        if (Platform.isMobile) {
            const mobileHeader = this.rightPanel.createDiv('tools-mobile-header');
            const backBtn = mobileHeader.createEl('button', {
                text: '← 返回列表',
                cls: 'tools-mobile-back-btn'
            });
            backBtn.onclick = () => {
                // 返回列表
                this.selectedIndex = -1;
                this.renderLeftPanel();
                this.renderRightPanel();
            };
            mobileHeader.createEl('span', { 
                text: this.tools[this.selectedIndex]?.name || '编辑工具',
                cls: 'tools-mobile-title'
            });
        }
        
        if (this.tools.length === 0) {
            this.rightPanel.createEl('p', {
                text: '请先添加工具',
                cls: 'tools-edit-empty'
            });
            return;
        }
        
        // 如果没有选中任何工具（移动端列表视图或桌面端初始状态）
        if (this.selectedIndex === -1) {
            if (!Platform.isMobile) {
                this.rightPanel.createEl('p', {
                    text: '请选择一个工具进行编辑',
                    cls: 'tools-edit-empty'
                });
            }
            return;
        }
        
        const tool = this.tools[this.selectedIndex];
        if (!tool) return;
        
        // Name field
        const nameContainer = this.rightPanel.createDiv('tool-edit-field');
        nameContainer.createEl('label', { text: '工具名称' });
        const nameInput = nameContainer.createEl('input', {
            type: 'text',
            value: tool.name,
            cls: 'tool-edit-input'
        });
        
        nameInput.addEventListener('input', (e) => {
            const newName = (e.target as HTMLInputElement).value;
            
            // Remove existing error
            const existingError = nameContainer.querySelector('.tool-edit-error');
            if (existingError) existingError.remove();
            nameInput.removeClass('tool-edit-input-error');
            
            // Check for empty name
            if (!newName.trim()) {
                nameInput.addClass('tool-edit-input-error');
                nameContainer.createEl('span', {
                    text: '工具名称不能为空',
                    cls: 'tool-edit-error'
                });
                return;
            }
            
            // Check for duplicate names
            const isDuplicate = this.tools.some((t, i) => 
                i !== this.selectedIndex && t.name === newName
            );
            
            if (isDuplicate) {
                nameInput.addClass('tool-edit-input-error');
                nameContainer.createEl('span', {
                    text: '工具名称重复',
                    cls: 'tool-edit-error'
                });
            } else {
                // Update tool name and refresh left panel
                tool.name = newName;
                this.renderLeftPanel();
            }
        });
        
        // Prompt field
        const promptContainer = this.rightPanel.createDiv('tool-edit-field');
        promptContainer.createEl('label', { text: '工具提示词' });
        const promptTextArea = promptContainer.createEl('textarea', {
            cls: 'tool-edit-textarea'
        });
        promptTextArea.value = tool.prompt;
        promptTextArea.setAttribute('rows', '12');
        promptTextArea.setAttribute('placeholder', '输入工具的提示词或指令...');
        
        promptTextArea.addEventListener('input', (e) => {
            tool.prompt = (e.target as HTMLTextAreaElement).value;
        });
    }

    private exportTools() {
        try {
            // 创建 JSON 数据
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                tools: this.tools
            };
            
            // 转换为格式化的 JSON 字符串
            const jsonString = JSON.stringify(exportData, null, 2);
            
            // 创建 Blob 并下载
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `voyaru-tools-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            new Notice(`已导出 ${this.tools.length} 个工具`);
        } catch (error: any) {
            console.error('Export tools error:', error);
            new Notice(`导出失败: ${error.message || '未知错误'}`);
        }
    }
    
    private importTools() {
        // 创建文件输入元素
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        
        input.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            
            try {
                // 读取文件
                const text = await file.text();
                const data = JSON.parse(text);
                
                // 验证数据格式
                if (!data.tools || !Array.isArray(data.tools)) {
                    throw new Error('无效的工具文件格式');
                }
                
                // 检查每个工具的格式
                for (const tool of data.tools) {
                    if (!tool.name || typeof tool.name !== 'string' || !tool.prompt || typeof tool.prompt !== 'string') {
                        throw new Error('工具数据格式不正确');
                    }
                }
                
                // 检查是否有同名工具
                const conflicts: { imported: AgentTool, existing: AgentTool, index: number }[] = [];
                const newTools: AgentTool[] = [];
                
                for (const importedTool of data.tools) {
                    const existingIndex = this.tools.findIndex(t => t.name === importedTool.name);
                    if (existingIndex !== -1) {
                        const existingTool = this.tools[existingIndex];
                        if (existingTool) {
                            conflicts.push({
                                imported: importedTool,
                                existing: existingTool,
                                index: existingIndex
                            });
                        }
                    } else {
                        newTools.push(importedTool);
                    }
                }
                
                // 如果有冲突，显示确认对话框
                if (conflicts.length > 0) {
                    new ImportConflictModal(
                        this.app,
                        conflicts,
                        newTools,
                        (resolvedTools, shouldOverwrite) => {
                            this.applyImport(resolvedTools, shouldOverwrite);
                        }
                    ).open();
                } else {
                    // 没有冲突，直接添加
                    this.tools.push(...newTools);
                    this.renderLeftPanel();
                    this.renderRightPanel();
                    new Notice(`成功导入 ${newTools.length} 个工具`);
                }
            } catch (error: any) {
                console.error('Import tools error:', error);
                new Notice(`导入失败: ${error.message || '未知错误'}`);
            }
        });
        
        input.click();
    }
    
    private applyImport(
        conflicts: { imported: AgentTool, existing: AgentTool, index: number }[],
        shouldOverwrite: Map<number, boolean>
    ) {
        let overwriteCount = 0;
        let addedCount = 0;
        
        // 处理冲突的工具
        conflicts.forEach(conflict => {
            if (shouldOverwrite.get(conflict.index)) {
                const tool = this.tools[conflict.index];
                if (tool) {
                    this.tools[conflict.index] = conflict.imported;
                    overwriteCount++;
                }
            }
        });
        
        this.renderLeftPanel();
        this.renderRightPanel();
        
        if (overwriteCount > 0) {
            new Notice(`导入完成：覆盖了 ${overwriteCount} 个工具`);
        } else {
            new Notice(`导入完成`);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 导入冲突确认对话框
class ImportConflictModal extends Modal {
    private conflicts: { imported: AgentTool, existing: AgentTool, index: number }[];
    private newTools: AgentTool[];
    private onResolve: (conflicts: { imported: AgentTool, existing: AgentTool, index: number }[], shouldOverwrite: Map<number, boolean>) => void;
    private checkboxStates: Map<number, boolean> = new Map();
    
    constructor(
        app: App,
        conflicts: { imported: AgentTool, existing: AgentTool, index: number }[],
        newTools: AgentTool[],
        onResolve: (conflicts: { imported: AgentTool, existing: AgentTool, index: number }[], shouldOverwrite: Map<number, boolean>) => void
    ) {
        super(app);
        this.conflicts = conflicts;
        this.newTools = newTools;
        this.onResolve = onResolve;
        
        // 默认都不覆盖
        conflicts.forEach(c => {
            this.checkboxStates.set(c.index, false);
        });
    }
    
    onOpen() {
        const { contentEl } = this;
        
        contentEl.empty();
        contentEl.addClass('import-conflict-modal');
        
        // Title
        contentEl.createEl('h2', { text: '导入工具 - 冲突确认' });
        
        // 提示信息
        const infoDiv = contentEl.createDiv('conflict-info');
        infoDiv.createEl('p', { 
            text: `发现 ${this.conflicts.length} 个同名工具冲突，${this.newTools.length} 个新工具。` 
        });
        infoDiv.createEl('p', { 
            text: '请选择是否覆盖现有工具：',
            cls: 'conflict-instruction'
        });
        
        // 冲突列表
        const conflictList = contentEl.createDiv('conflict-list');
        
        this.conflicts.forEach(conflict => {
            const conflictItem = conflictList.createDiv('conflict-item');
            
            // 复选框
            const checkboxContainer = conflictItem.createDiv('conflict-checkbox-container');
            const checkbox = checkboxContainer.createEl('input', {
                type: 'checkbox'
            }) as HTMLInputElement;
            checkbox.checked = this.checkboxStates.get(conflict.index) || false;
            checkbox.addEventListener('change', () => {
                this.checkboxStates.set(conflict.index, checkbox.checked);
            });
            
            // 工具信息
            const infoContainer = conflictItem.createDiv('conflict-info-container');
            infoContainer.createEl('strong', { text: conflict.imported.name });
            
            const promptPreview = infoContainer.createDiv('conflict-prompt-preview');
            promptPreview.createEl('div', { 
                text: '现有提示词：',
                cls: 'conflict-label'
            });
            promptPreview.createEl('div', { 
                text: conflict.existing.prompt.substring(0, 100) + (conflict.existing.prompt.length > 100 ? '...' : ''),
                cls: 'conflict-prompt-text'
            });
            
            promptPreview.createEl('div', { 
                text: '导入的提示词：',
                cls: 'conflict-label'
            });
            promptPreview.createEl('div', { 
                text: conflict.imported.prompt.substring(0, 100) + (conflict.imported.prompt.length > 100 ? '...' : ''),
                cls: 'conflict-prompt-text conflict-imported'
            });
        });
        
        // 快捷操作按钮
        const quickActions = contentEl.createDiv('conflict-quick-actions');
        
        const selectAllBtn = quickActions.createEl('button', {
            text: '全选'
        });
        selectAllBtn.addEventListener('click', () => {
            this.conflicts.forEach(c => {
                this.checkboxStates.set(c.index, true);
            });
            this.onOpen(); // 重新渲染
        });
        
        const deselectAllBtn = quickActions.createEl('button', {
            text: '全不选'
        });
        deselectAllBtn.addEventListener('click', () => {
            this.conflicts.forEach(c => {
                this.checkboxStates.set(c.index, false);
            });
            this.onOpen(); // 重新渲染
        });
        
        // 底部按钮
        const buttonContainer = contentEl.createDiv('conflict-buttons');
        
        const confirmBtn = buttonContainer.createEl('button', {
            text: '确认导入',
            cls: 'mod-cta'
        });
        confirmBtn.addEventListener('click', () => {
            this.onResolve(this.conflicts, this.checkboxStates);
            this.close();
        });
        
        const cancelBtn = buttonContainer.createEl('button', {
            text: '取消'
        });
        cancelBtn.addEventListener('click', () => {
            this.close();
        });
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
