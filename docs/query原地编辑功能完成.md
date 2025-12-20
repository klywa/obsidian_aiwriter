# Query 原地编辑功能实现完成

## 需求说明

在修改query时：
1. 应该原地修改（将query变成一个文本编辑窗，并且有取消、发送按钮，enter键同样可以发送）
2. 点击原query外的地方，取消编辑
3. 只有在确定发送之后，才进行重新生成流程（包括撤销之前的修改）

## 实现细节

### 1. 状态管理

新增了以下状态来跟踪编辑：
- `editingMessageId`: 正在编辑的消息ID
- `editingContent`: 编辑中的内容
- `editingFiles`: 编辑中的引用文件列表
- `editingRef`: 编辑区域的DOM引用（用于检测外部点击）

### 2. 核心功能函数

#### `startEditingMessage(messageId, content, files)`
- 启动编辑模式
- 设置当前编辑的消息ID、内容和文件

#### `cancelEditingMessage()`
- 取消编辑模式
- 清空所有编辑状态

#### `confirmEditMessage(messageId, newContent, newFiles)`
- 撤销该query及其之后所有回复的文件更改
- 删除该query及其之后的所有消息
- 重置聊天历史
- 使用新内容重新发送消息

### 3. UI 实现

#### 编辑状态的渲染
- 当消息处于编辑状态时，显示一个可编辑的textarea
- 显示引用的文件列表（可删除）
- 提供"取消"和"发送"两个按钮

#### 样式特点
- 使用 `2px solid var(--interactive-accent)` 边框高亮编辑区域
- textarea 自动聚焦
- 最小高度 80px，最大高度 200px，可垂直调整大小

#### 交互行为
- **Enter键**（不按Shift）：确认发送
- **Escape键**：取消编辑
- **点击外部区域**：取消编辑（通过 `editingRef` 和 `mousedown` 事件监听实现）
- **点击取消按钮**：取消编辑
- **点击发送按钮**：确认发送

### 4. 编辑按钮显示逻辑

- 只有最后一条用户消息才显示编辑按钮
- 当消息处于编辑状态时，隐藏编辑按钮
- 点击编辑按钮后，原地展开编辑区域

### 5. 撤销机制

在确认发送之前，不会执行任何撤销操作。只有当用户点击"发送"按钮或按Enter键确认后，才会：
1. 遍历该query之后的所有消息
2. 找出所有 `writeFile` 类型的工具调用
3. 根据 `undoData` 恢复文件状态：
   - 如果是新创建的文件（`previousContent === null`），删除文件
   - 如果是修改的文件，恢复到修改前的内容
4. 删除所有相关消息
5. 重置聊天历史
6. 重新发送消息

## 代码位置

### 修改的文件
- `src/views/ChatComponent.tsx`

### 关键代码段

#### 状态声明（第33-35行）
```typescript
const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
const [editingContent, setEditingContent] = useState<string>('');
const [editingFiles, setEditingFiles] = useState<string[]>([]);
```

#### 点击外部关闭（第42-59行）
```typescript
useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (modelSelectorRef.current && !modelSelectorRef.current.contains(event.target as Node)) {
            setShowModelSelector(false);
        }
        if (editingMessageId && editingRef.current && !editingRef.current.contains(event.target as Node)) {
            setEditingMessageId(null);
            setEditingContent('');
            setEditingFiles([]);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
}, [editingMessageId]);
```

#### 核心功能函数（第810-877行）
```typescript
// 启动编辑模式（原地编辑）
const startEditingMessage = (messageId: string, content: string, files: string[]) => {
    setEditingMessageId(messageId);
    setEditingContent(content);
    setEditingFiles(files);
};

// 取消编辑
const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditingContent('');
    setEditingFiles([]);
};

// 确认编辑并重新发送
const confirmEditMessage = async (messageId: string, newContent: string, newFiles: string[]) => {
    // ... 撤销逻辑和重新发送
};
```

#### 渲染逻辑（第1194-1380行）
在 `renderMessageContent` 函数中，根据 `isEditing` 状态决定渲染普通气泡还是编辑界面。

## 测试建议

1. **基本编辑测试**
   - 发送一条消息
   - 点击编辑按钮
   - 修改内容
   - 点击发送/按Enter键
   - 验证消息已更新并重新生成回复

2. **取消编辑测试**
   - 点击编辑按钮进入编辑模式
   - 点击外部区域
   - 验证编辑被取消，恢复原始显示
   - 点击编辑按钮
   - 按Escape键
   - 验证编辑被取消

3. **文件引用编辑测试**
   - 发送一条带文件引用的消息
   - 点击编辑
   - 删除部分文件引用
   - 确认发送
   - 验证新的请求只包含剩余的文件引用

4. **撤销文件更改测试**
   - 发送一条消息，导致AI修改了某些文件
   - 编辑该消息并重新发送
   - 验证之前的文件更改已被撤销
   - 验证重新生成后的文件更改是基于新的query

5. **多行文本测试**
   - 编辑消息时输入多行文本
   - 使用Shift+Enter换行
   - 使用Enter发送
   - 验证内容正确

## 完成状态

✅ 原地编辑功能已完全实现  
✅ 取消和发送按钮已添加  
✅ Enter键发送，Shift+Enter换行  
✅ Escape键取消编辑  
✅ 点击外部取消编辑  
✅ 只在确认发送后才执行撤销和重新生成  
✅ 代码已通过linter检查  
✅ 项目构建成功  

## 用户体验改进

相比之前的实现（将query填入底部输入框），新的原地编辑功能提供了：
- 更直观的编辑体验（在原位置编辑）
- 更清晰的操作流程（明确的取消和发送按钮）
- 更好的视觉反馈（高亮边框、阴影效果）
- 防止误操作（点击外部自动取消）
- 延迟执行撤销（只在确认发送后才撤销）

