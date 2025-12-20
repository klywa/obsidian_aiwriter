# 修复：聊天无回复问题

## 问题描述
用户反馈在聊天窗口发送消息后，没有收到模型回复。可能表现为 loading 状态结束后无内容，或者一直 loading，或者没有任何反应。
用户补充反馈：后台日志显示模型已返回内容，但 UI 未显示。

## 原因分析
1.  **History 格式问题**：传递给 Gemini SDK 的 `history` 可能包含 `role: 'error'` 或其他无效格式的消息，导致 `startChat` 或 `sendMessageStream` 失败。
2.  **消息更新逻辑缺陷**：在 `ChatComponent` 中，如果模型同时返回 `thinking` 和 `text` 消息，且 `thinking` 消息插入在 `text` 消息之后（或并行更新），原有的基于 `prev[prev.length - 1]` 的更新逻辑会导致文本消息无法被定位和更新，从而丢失文本回复。
3.  **闭包陷阱**：在 `scheduleUpdate` 的 `setTimeout` 回调中，直接使用了外部变量 `pendingUpdate`。由于 `setMessages` 是异步的，而 `pendingUpdate = null` 是同步执行的，导致当 React 真正执行状态更新时，`pendingUpdate` 已经被重置为 `null`，从而导致消息内容丢失。这是导致“后台有日志但UI无显示”的主要原因。

## 修复内容
1.  **`src/services/ai_service.ts`**:
    - 在调用 `startChat` 前，过滤 `history`，只保留 `role` 为 `user` 或 `model` 的有效消息。
    - 在 `streamChat` 外层增加 try-catch，捕获所有运行时错误。
    - 增强了 API Key 检查和错误提示。

2.  **`src/views/ChatComponent.tsx`**:
    - 重构 `scheduleUpdate` 和最终更新逻辑，使用 `id` 查找目标消息，而不是依赖数组最后一位。
    - **关键修复**：在 `setTimeout` 回调中，先将 `pendingUpdate` 的值捕获到局部变量 `contentToUpdate` 中，再传递给 `setMessages`，避免因闭包和异步执行时序导致的变量值丢失问题。
    - 修复了类型错误。

## 验证
- 发送消息应能正常收到回复，且内容完整显示。
- 即使网络稍有延迟，流式更新也能正确累积文本。
- 即使历史记录中有错误消息，也能正常开始新对话。
