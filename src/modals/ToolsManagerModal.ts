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
            onEnd: (evt) => {
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

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
