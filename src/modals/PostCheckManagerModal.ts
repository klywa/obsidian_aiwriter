import { App, Modal, Notice, Platform } from "obsidian";
import { PostCheckItem } from "../settings";
import Sortable from "sortablejs";

export class PostCheckManagerModal extends Modal {
    private items: PostCheckItem[];
    private onSave: (items: PostCheckItem[]) => void;
    private leftPanel: HTMLElement;
    private rightPanel: HTMLElement;
    private selectedIndex: number = -1;
    private sortableInstance: any = null;

    constructor(app: App, items: PostCheckItem[], onSave: (items: PostCheckItem[]) => void) {
        super(app);
        this.items = JSON.parse(JSON.stringify(items)); // Deep copy
        this.onSave = onSave;
        if (this.items.length > 0 && !Platform.isMobile) {
            this.selectedIndex = 0;
        }
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.empty();
        contentEl.addClass('postcheck-manager-modal');
        
        // Title
        const header = contentEl.createDiv('postcheck-manager-header');
        header.createEl('h2', { text: '管理后置检查项' });
        
        // Two-column layout container
        const mainContainer = contentEl.createDiv('postcheck-manager-main');
        
        // Left Panel - Item Tags List
        this.leftPanel = mainContainer.createDiv('postcheck-manager-left-panel');
        
        // Right Panel - Edit Area
        this.rightPanel = mainContainer.createDiv('postcheck-manager-right-panel');
        
        // Render initial state
        this.renderLeftPanel();
        this.renderRightPanel();
        
        // Bottom buttons
        const buttonContainer = contentEl.createDiv('postcheck-manager-buttons');
        
        // Add Item Button
        const addBtn = buttonContainer.createEl('button', {
            text: '+ 添加检查项',
            cls: 'mod-cta'
        });
        addBtn.addEventListener('click', () => {
            const newId = `check-${Date.now()}`;
            this.items.push({ id: newId, checkPrompt: '' });
            this.selectedIndex = this.items.length - 1;
            this.renderLeftPanel();
            this.renderRightPanel();
        });
        
        // Export/Import buttons
        const importExportContainer = buttonContainer.createDiv('postcheck-import-export-buttons');
        
        const exportBtn = importExportContainer.createEl('button', {
            text: '导出检查项'
        });
        exportBtn.addEventListener('click', () => {
            this.exportItems();
        });
        
        const importBtn = importExportContainer.createEl('button', {
            text: '导入检查项'
        });
        importBtn.addEventListener('click', () => {
            this.importItems();
        });
        
        // Save Button
        const saveBtn = buttonContainer.createEl('button', {
            text: '保存',
            cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', () => {
            if (this.items.some(t => !t.checkPrompt.trim())) {
                new Notice('检查项内容不能为空');
                return;
            }
            
            console.log('Saving post-check items:', this.items);
            this.onSave(this.items);
            
            if (Platform.isMobile) {
                new Notice('保存成功');
                this.selectedIndex = -1;
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
        
        // Mobile: control display based on selectedIndex
        if (Platform.isMobile) {
            if (this.selectedIndex !== -1) {
                this.leftPanel.style.display = 'none';
                this.rightPanel.style.display = 'flex';
            } else {
                this.leftPanel.style.display = 'flex';
                this.rightPanel.style.display = 'none';
            }
        }
        
        const header = this.leftPanel.createDiv('postcheck-list-header');
        header.createEl('span', { text: '检查项列表', cls: 'postcheck-list-title' });
        header.createEl('span', { text: '拖拽可排序', cls: 'postcheck-list-hint' });
        
        const listContainer = this.leftPanel.createDiv('postcheck-list-container');
        
        if (this.items.length === 0) {
            listContainer.createEl('p', {
                text: '暂无检查项，点击"添加检查项"创建',
                cls: 'postcheck-empty-message'
            });
            return;
        }

        // Destroy previous Sortable instance
        if (this.sortableInstance) {
            this.sortableInstance.destroy();
            this.sortableInstance = null;
        }

        // Initialize Sortable
        this.sortableInstance = Sortable.create(listContainer, {
            animation: 150,
            ghostClass: 'postcheck-tag-dragging',
            chosenClass: 'postcheck-tag-chosen',
            dragClass: 'postcheck-tag-drag',
            delay: Platform.isMobile ? 200 : 0,
            delayOnTouchOnly: true,
            touchStartThreshold: 5,
            forceFallback: false,
            fallbackTolerance: 3,
            onEnd: (evt: any) => {
                const { oldIndex, newIndex } = evt;
                if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;

                const item = this.items.splice(oldIndex, 1)[0];
                if (!item) return;
                this.items.splice(newIndex, 0, item);

                // Update selectedIndex
                if (this.selectedIndex === oldIndex) {
                    this.selectedIndex = newIndex;
                } else if (this.selectedIndex > oldIndex && this.selectedIndex <= newIndex) {
                    this.selectedIndex--;
                } else if (this.selectedIndex < oldIndex && this.selectedIndex >= newIndex) {
                    this.selectedIndex++;
                }
                
                this.renderLeftPanel();
            }
        });
        
        this.items.forEach((item, index) => {
            const tagEl = listContainer.createDiv('postcheck-tag');
            tagEl.setAttribute('data-id', index.toString());
            
            if (index === this.selectedIndex) {
                tagEl.addClass('postcheck-tag-selected');
            }
            
            // Tag content - show first 20 chars of checkPrompt
            const tagContent = tagEl.createDiv('postcheck-tag-content');
            const displayText = item.checkPrompt.trim() || '（空白检查项）';
            const truncated = displayText.length > 20 ? displayText.substring(0, 20) + '...' : displayText;
            tagContent.createEl('span', { text: truncated });
            
            // Click to select
            tagEl.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (!target.closest('.postcheck-tag-delete')) {
                    this.selectedIndex = index;
                    this.renderLeftPanel();
                    this.renderRightPanel();
                }
            });
            
            // Delete button
            const deleteBtn = tagEl.createDiv('postcheck-tag-delete');
            deleteBtn.innerHTML = '×';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.items.splice(index, 1);
                if (this.items.length === 0) {
                    this.selectedIndex = -1;
                } else if (this.selectedIndex >= this.items.length) {
                    this.selectedIndex = this.items.length - 1;
                } else if (this.selectedIndex === index) {
                    this.selectedIndex = Math.max(0, index - 1);
                    if (Platform.isMobile && this.items.length > 0) {
                        this.selectedIndex = -1;
                    }
                }
                this.renderLeftPanel();
                this.renderRightPanel();
            });
        });
    }

    private renderRightPanel() {
        this.rightPanel.empty();
        
        // Mobile header navigation
        if (Platform.isMobile) {
            const mobileHeader = this.rightPanel.createDiv('postcheck-mobile-header');
            const backBtn = mobileHeader.createEl('button', {
                text: '← 返回列表',
                cls: 'postcheck-mobile-back-btn'
            });
            backBtn.onclick = () => {
                this.selectedIndex = -1;
                this.renderLeftPanel();
                this.renderRightPanel();
            };
            const currentItem = this.items[this.selectedIndex];
            const mobileTitle = currentItem ? 
                (currentItem.checkPrompt.trim().substring(0, 15) + (currentItem.checkPrompt.trim().length > 15 ? '...' : '') || '编辑检查项') : 
                '编辑检查项';
            mobileHeader.createEl('span', { 
                text: mobileTitle,
                cls: 'postcheck-mobile-title'
            });
        }
        
        if (this.items.length === 0) {
            this.rightPanel.createEl('p', {
                text: '请先添加检查项',
                cls: 'postcheck-edit-empty'
            });
            return;
        }
        
        if (this.selectedIndex === -1) {
            if (!Platform.isMobile) {
                this.rightPanel.createEl('p', {
                    text: '请选择一个检查项进行编辑',
                    cls: 'postcheck-edit-empty'
                });
            }
            return;
        }
        
        const item = this.items[this.selectedIndex];
        if (!item) return;
        
        // Check Prompt field (no name field needed)
        const promptContainer = this.rightPanel.createDiv('postcheck-edit-field');
        promptContainer.createEl('label', { text: '检查规则' });
        const promptHint = promptContainer.createEl('p', {
            text: '描述需要检查的内容和规则。AI会根据这个规则来检查和修改内容。',
            cls: 'postcheck-edit-hint'
        });
        const promptTextArea = promptContainer.createEl('textarea', {
            cls: 'postcheck-edit-textarea'
        });
        promptTextArea.value = item.checkPrompt;
        promptTextArea.setAttribute('rows', '15');
        promptTextArea.setAttribute('placeholder', '例如：检查文本是否符合既定的语言风格和文风要求，如有不符，进行调整。');
        
        promptTextArea.addEventListener('input', (e) => {
            item.checkPrompt = (e.target as HTMLTextAreaElement).value;
            // Update left panel to reflect changes
            this.renderLeftPanel();
        });
    }

    private exportItems() {
        try {
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                postCheckItems: this.items
            };
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `voyaru-postchecks-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            new Notice(`已导出 ${this.items.length} 个检查项`);
        } catch (error: any) {
            console.error('Export items error:', error);
            new Notice(`导出失败: ${error.message || '未知错误'}`);
        }
    }
    
    private importItems() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        
        input.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (!data.postCheckItems || !Array.isArray(data.postCheckItems)) {
                    throw new Error('无效的检查项文件格式');
                }
                
                for (const item of data.postCheckItems) {
                    if (!item.id || !item.checkPrompt || typeof item.checkPrompt !== 'string') {
                        throw new Error('检查项数据格式不正确');
                    }
                }
                
                const conflicts: { imported: PostCheckItem, existing: PostCheckItem, index: number }[] = [];
                const newItems: PostCheckItem[] = [];
                
                for (const importedItem of data.postCheckItems) {
                    // Check for duplicate content instead of name
                    const existingIndex = this.items.findIndex(t => 
                        t.checkPrompt.trim() === importedItem.checkPrompt.trim()
                    );
                    if (existingIndex !== -1) {
                        const existingItem = this.items[existingIndex];
                        if (existingItem) {
                            conflicts.push({
                                imported: importedItem,
                                existing: existingItem,
                                index: existingIndex
                            });
                        }
                    } else {
                        newItems.push(importedItem);
                    }
                }
                
                if (conflicts.length > 0) {
                    new ImportConflictModal(
                        this.app,
                        conflicts,
                        newItems,
                        (resolvedItems, shouldOverwrite) => {
                            this.applyImport(resolvedItems, shouldOverwrite);
                        }
                    ).open();
                } else {
                    this.items.push(...newItems);
                    this.renderLeftPanel();
                    this.renderRightPanel();
                    new Notice(`成功导入 ${newItems.length} 个检查项`);
                }
            } catch (error: any) {
                console.error('Import items error:', error);
                new Notice(`导入失败: ${error.message || '未知错误'}`);
            }
        });
        
        input.click();
    }
    
    private applyImport(
        conflicts: { imported: PostCheckItem, existing: PostCheckItem, index: number }[],
        shouldOverwrite: Map<number, boolean>
    ) {
        let overwriteCount = 0;
        
        conflicts.forEach(conflict => {
            if (shouldOverwrite.get(conflict.index)) {
                const item = this.items[conflict.index];
                if (item) {
                    this.items[conflict.index] = conflict.imported;
                    overwriteCount++;
                }
            }
        });
        
        this.renderLeftPanel();
        this.renderRightPanel();
        
        if (overwriteCount > 0) {
            new Notice(`导入完成：覆盖了 ${overwriteCount} 个检查项`);
        } else {
            new Notice(`导入完成`);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Import conflict dialog
class ImportConflictModal extends Modal {
    private conflicts: { imported: PostCheckItem, existing: PostCheckItem, index: number }[];
    private newItems: PostCheckItem[];
    private onResolve: (conflicts: { imported: PostCheckItem, existing: PostCheckItem, index: number }[], shouldOverwrite: Map<number, boolean>) => void;
    private checkboxStates: Map<number, boolean> = new Map();
    
    constructor(
        app: App,
        conflicts: { imported: PostCheckItem, existing: PostCheckItem, index: number }[],
        newItems: PostCheckItem[],
        onResolve: (conflicts: { imported: PostCheckItem, existing: PostCheckItem, index: number }[], shouldOverwrite: Map<number, boolean>) => void
    ) {
        super(app);
        this.conflicts = conflicts;
        this.newItems = newItems;
        this.onResolve = onResolve;
        
        conflicts.forEach(c => {
            this.checkboxStates.set(c.index, false);
        });
    }
    
    onOpen() {
        const { contentEl } = this;
        
        contentEl.empty();
        contentEl.addClass('import-conflict-modal');
        
        contentEl.createEl('h2', { text: '导入检查项 - 冲突确认' });
        
        const infoDiv = contentEl.createDiv('conflict-info');
        infoDiv.createEl('p', { 
            text: `发现 ${this.conflicts.length} 个同名检查项冲突，${this.newItems.length} 个新检查项。` 
        });
        infoDiv.createEl('p', { 
            text: '请选择是否覆盖现有检查项：',
            cls: 'conflict-instruction'
        });
        
        const conflictList = contentEl.createDiv('conflict-list');
        
        this.conflicts.forEach(conflict => {
            const conflictItem = conflictList.createDiv('conflict-item');
            
            const checkboxContainer = conflictItem.createDiv('conflict-checkbox-container');
            const checkbox = checkboxContainer.createEl('input', {
                type: 'checkbox'
            }) as HTMLInputElement;
            checkbox.checked = this.checkboxStates.get(conflict.index) || false;
            checkbox.addEventListener('change', () => {
                this.checkboxStates.set(conflict.index, checkbox.checked);
            });
            
            const infoContainer = conflictItem.createDiv('conflict-info-container');
            const titleText = conflict.imported.checkPrompt.substring(0, 30) + 
                (conflict.imported.checkPrompt.length > 30 ? '...' : '');
            infoContainer.createEl('strong', { text: titleText });
            
            const promptPreview = infoContainer.createDiv('conflict-prompt-preview');
            promptPreview.createEl('div', { 
                text: '现有规则：',
                cls: 'conflict-label'
            });
            promptPreview.createEl('div', { 
                text: conflict.existing.checkPrompt.substring(0, 150) + (conflict.existing.checkPrompt.length > 150 ? '...' : ''),
                cls: 'conflict-prompt-text'
            });
            
            promptPreview.createEl('div', { 
                text: '导入的规则：',
                cls: 'conflict-label'
            });
            promptPreview.createEl('div', { 
                text: conflict.imported.checkPrompt.substring(0, 150) + (conflict.imported.checkPrompt.length > 150 ? '...' : ''),
                cls: 'conflict-prompt-text conflict-imported'
            });
        });
        
        const quickActions = contentEl.createDiv('conflict-quick-actions');
        
        const selectAllBtn = quickActions.createEl('button', {
            text: '全选'
        });
        selectAllBtn.addEventListener('click', () => {
            this.conflicts.forEach(c => {
                this.checkboxStates.set(c.index, true);
            });
            this.onOpen();
        });
        
        const deselectAllBtn = quickActions.createEl('button', {
            text: '全不选'
        });
        deselectAllBtn.addEventListener('click', () => {
            this.conflicts.forEach(c => {
                this.checkboxStates.set(c.index, false);
            });
            this.onOpen();
        });
        
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

