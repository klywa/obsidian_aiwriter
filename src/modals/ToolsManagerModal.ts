import { App, Modal, Notice, Platform } from "obsidian";
import { AgentTool } from "../settings";

export class ToolsManagerModal extends Modal {
    private tools: AgentTool[];
    private onSave: (tools: AgentTool[]) => void;
    private leftPanel: HTMLElement;
    private rightPanel: HTMLElement;
    private selectedIndex: number = 0;
    private draggedIndex: number | null = null;

    constructor(app: App, tools: AgentTool[], onSave: (tools: AgentTool[]) => void) {
        super(app);
        this.tools = JSON.parse(JSON.stringify(tools)); // Deep copy
        this.onSave = onSave;
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
            this.close();
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
        
        const header = this.leftPanel.createDiv('tools-list-header');
        header.createEl('span', { text: '工具列表', cls: 'tools-list-title' });
        header.createEl('span', { text: '可拖拽排序', cls: 'tools-list-hint' });
        
        const listContainer = this.leftPanel.createDiv('tools-list-container');
        
        if (this.tools.length === 0) {
            listContainer.createEl('p', {
                text: '暂无工具，点击"添加工具"创建',
                cls: 'tools-empty-message'
            });
            return;
        }
        
        this.tools.forEach((tool, index) => {
            const tagEl = listContainer.createDiv('tool-tag');
            
            // 只在桌面端启用拖拽
            if (!Platform.isMobile) {
                tagEl.setAttribute('draggable', 'true');
            }
            
            if (index === this.selectedIndex) {
                tagEl.addClass('tool-tag-selected');
            }
            
            // Tag content
            const tagContent = tagEl.createDiv('tool-tag-content');
            tagContent.createEl('span', { text: tool.name });
            
            // 移动端排序按钮
            if (Platform.isMobile && this.tools.length > 1) {
                const mobileActions = tagEl.createDiv('tool-tag-mobile-actions');
                
                // 上移按钮
                if (index > 0) {
                    const upBtn = mobileActions.createDiv('tool-tag-move-btn');
                    upBtn.innerHTML = '↑';
                    upBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const current = this.tools[index];
                        const previous = this.tools[index - 1];
                        if (!current || !previous) return;
                        this.tools[index] = previous;
                        this.tools[index - 1] = current;
                        if (this.selectedIndex === index) {
                            this.selectedIndex = index - 1;
                        } else if (this.selectedIndex === index - 1) {
                            this.selectedIndex = index;
                        }
                        this.renderLeftPanel();
                    });
                }
                
                // 下移按钮
                if (index < this.tools.length - 1) {
                    const downBtn = mobileActions.createDiv('tool-tag-move-btn');
                    downBtn.innerHTML = '↓';
                    downBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const current = this.tools[index];
                        const next = this.tools[index + 1];
                        if (!current || !next) return;
                        this.tools[index] = next;
                        this.tools[index + 1] = current;
                        if (this.selectedIndex === index) {
                            this.selectedIndex = index + 1;
                        } else if (this.selectedIndex === index + 1) {
                            this.selectedIndex = index;
                        }
                        this.renderLeftPanel();
                    });
                }
            }
            
            // Click to select
            tagEl.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (!target.closest('.tool-tag-delete') && 
                    !target.closest('.tool-tag-mobile-actions')) {
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
                if (this.selectedIndex >= this.tools.length) {
                    this.selectedIndex = Math.max(0, this.tools.length - 1);
                }
                this.renderLeftPanel();
                this.renderRightPanel();
            });
            
            // Drag events - 只在桌面端启用
            if (!Platform.isMobile) {
                tagEl.addEventListener('dragstart', (e) => {
                    this.draggedIndex = index;
                    tagEl.addClass('tool-tag-dragging');
                    e.dataTransfer!.effectAllowed = 'move';
                });
                
                tagEl.addEventListener('dragend', () => {
                    tagEl.removeClass('tool-tag-dragging');
                    this.draggedIndex = null;
                });
                
                tagEl.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer!.dropEffect = 'move';
                    
                    if (this.draggedIndex !== null && this.draggedIndex !== index) {
                        tagEl.addClass('tool-tag-drag-over');
                    }
                });
                
                tagEl.addEventListener('dragleave', () => {
                    tagEl.removeClass('tool-tag-drag-over');
                });
                
                tagEl.addEventListener('drop', (e) => {
                    e.preventDefault();
                    tagEl.removeClass('tool-tag-drag-over');
                    
                    if (this.draggedIndex !== null && this.draggedIndex !== index) {
                        // Reorder tools
                        const draggedTool = this.tools[this.draggedIndex];
                        if (!draggedTool) return;
                        this.tools.splice(this.draggedIndex, 1);
                        
                        // Adjust target index if needed
                        const targetIndex = this.draggedIndex < index ? index - 1 : index;
                        this.tools.splice(targetIndex, 0, draggedTool);
                        
                        // Update selected index
                        if (this.selectedIndex === this.draggedIndex) {
                            this.selectedIndex = targetIndex;
                        } else if (this.draggedIndex < this.selectedIndex && targetIndex >= this.selectedIndex) {
                            this.selectedIndex--;
                        } else if (this.draggedIndex > this.selectedIndex && targetIndex <= this.selectedIndex) {
                            this.selectedIndex++;
                        }
                        
                        this.renderLeftPanel();
                    }
                });
            }
        });
    }

    private renderRightPanel() {
        this.rightPanel.empty();
        
        if (this.tools.length === 0) {
            this.rightPanel.createEl('p', {
                text: '请先添加工具',
                cls: 'tools-edit-empty'
            });
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
