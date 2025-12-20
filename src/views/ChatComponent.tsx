import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { AIService } from '../services/ai_service';
import { FSService } from '../services/fs_service';
import { SendIcon, StopIcon, PlusIcon, CloseIcon, CopyIcon, FileIcon, EditIcon, RefreshIcon, SaveIcon, UserIcon, BotIcon, ThinkingIcon, ToolIcon, TrashIcon, CheckIcon, TextSizeIcon, LogIcon, ExportIcon, ArrowUpIcon, MentionIcon, ChevronDownIcon } from '../components/Icons';
import { Message, Session, MODELS } from '../settings';
import { Notice, Menu, TFile, MarkdownView } from 'obsidian';
import { ExportModal } from '../modals/ExportModal';
import { LogModal } from '../modals/LogModal';

export const ChatComponent = ({ plugin, containerEl }: { plugin: any, containerEl?: HTMLElement }) => {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatHistory, setChatHistory] = useState<any[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showTools, setShowTools] = useState(false);
    const [showFiles, setShowFiles] = useState(false);
    const [filteredTools, setFilteredTools] = useState<any[]>([]);
    const [filteredFiles, setFilteredFiles] = useState<string[]>([]);
    const [allFiles, setAllFiles] = useState<string[]>([]);
    const [isFilesLoaded, setIsFilesLoaded] = useState(false);
    const [referencedFiles, setReferencedFiles] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editingSessionName, setEditingSessionName] = useState<string>('');
    const [fontSize, setFontSize] = useState<number>(plugin.settings.fontSize || 14);
    const [showFontSizeControl, setShowFontSizeControl] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>(plugin.settings.model);
    const [showModelSelector, setShowModelSelector] = useState(false);
    
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const modelSelectorRef = useRef<HTMLDivElement>(null);
    const sessionsRef = useRef<Session[]>([]);
    const prevSessionIdRef = useRef<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // 点击外部关闭模型选择器
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modelSelectorRef.current && !modelSelectorRef.current.contains(event.target as Node)) {
                setShowModelSelector(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // 加载保存的sessions和当前选中的session
    useEffect(() => {
        const loadSessions = async () => {
            try {
                // Load sessions from plugin settings
                const saved = plugin.settings.sessions;
                // Load last session ID from plugin settings
                const lastSessionId = plugin.settings.lastSessionId;
                
                if (saved && Array.isArray(saved) && saved.length > 0) {
                    setSessions(saved);
                    
                    // 优先使用保存的session ID，如果不存在或无效，使用第一个
                    let targetSessionId = lastSessionId;
                    if (!targetSessionId || !saved.find(s => s.id === targetSessionId)) {
                        targetSessionId = saved[0].id;
                    }
                    
                    const targetSession = saved.find(s => s.id === targetSessionId) || saved[0];
                    setCurrentSessionId(targetSession.id);
                    setMessages(targetSession.messages || []);
                    setChatHistory(targetSession.chatHistory || []);
                } else {
                    // 创建默认session
                    const newSession: Session = {
                        id: `session-${Date.now()}`,
                        name: '新对话',
                        messages: [],
                        chatHistory: [],
                        timestamp: Date.now()
                    };
                    setSessions([newSession]);
                    setCurrentSessionId(newSession.id);
                }
            } catch (e) {
                console.error('Failed to load sessions:', e);
                const newSession: Session = {
                    id: `session-${Date.now()}`,
                    name: '新对话',
                    messages: [],
                    chatHistory: [],
                    timestamp: Date.now()
                };
                setSessions([newSession]);
                setCurrentSessionId(newSession.id);
            }
        };
        loadSessions();
    }, []);

    // 保存sessions（带防抖）
    const saveSessionsRef = useRef<NodeJS.Timeout | null>(null);
    const saveSessions = async (updatedSessions: Session[]) => {
        try {
            // 清除之前的定时器
            if (saveSessionsRef.current) {
                clearTimeout(saveSessionsRef.current);
            }
            // 防抖：延迟200ms保存，避免频繁写入
            saveSessionsRef.current = setTimeout(async () => {
                try {
                    plugin.settings.sessions = updatedSessions;
                    await plugin.saveSettings();
                } catch (e) {
                    console.error('Failed to save sessions:', e);
                }
            }, 200);
        } catch (e) {
            console.error('Failed to schedule save:', e);
        }
    };

    // 立即保存（用于重要时刻，如组件卸载）
    const saveSessionsImmediate = async (updatedSessions: Session[]) => {
        try {
            if (saveSessionsRef.current) {
                clearTimeout(saveSessionsRef.current);
                saveSessionsRef.current = null;
            }
            plugin.settings.sessions = updatedSessions;
            await plugin.saveSettings();
        } catch (e) {
            console.error('Failed to save sessions:', e);
        }
    };

    // 同步 sessions 到 ref，以便在清理函数中访问最新值
    useEffect(() => {
        sessionsRef.current = sessions;
    }, [sessions]);

    // 当sessions变化时保存（防抖）
    useEffect(() => {
        if (sessions.length > 0) {
            saveSessions(sessions);
        }
    }, [sessions]);

    // 组件卸载前立即保存
    useEffect(() => {
        return () => {
            if (sessionsRef.current.length > 0) {
                saveSessionsImmediate(sessionsRef.current);
            }
        };
    }, []);

    // 保存字体大小
    useEffect(() => {
        const saveFontSize = async () => {
            if (plugin.settings.fontSize !== fontSize) {
                plugin.settings.fontSize = fontSize;
                await plugin.saveSettings();
            }
        };
        saveFontSize();
    }, [fontSize]);

    // 当切换session时更新消息和历史，并保存当前选中的session ID
    useEffect(() => {
        if (currentSessionId && currentSessionId !== prevSessionIdRef.current) {
            // 只有当 Session ID 真正改变时，才从 sessions 中加载消息
            // 避免因 sessions 更新（如自动保存）导致的循环重置
            const session = sessions.find(s => s.id === currentSessionId);
            if (session) {
                setMessages(session.messages || []);
                setChatHistory(session.chatHistory || []);
                setReferencedFiles([]);
                
                // 保存当前选中的session ID
                plugin.settings.lastSessionId = currentSessionId;
                plugin.saveSettings().catch((e: any) => {
                    console.error('Failed to save last session ID:', e);
                });
            }
            prevSessionIdRef.current = currentSessionId;
        }
    }, [currentSessionId, sessions]);

    // 同步messages到session（使用防抖，避免频繁更新导致闪烁）
    const syncMessagesRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        if (currentSessionId && messages.length >= 0) {
            // 清除之前的定时器
            if (syncMessagesRef.current) {
                clearTimeout(syncMessagesRef.current);
            }
            // 防抖：延迟300ms同步，避免在流式响应时频繁更新session导致闪烁
            syncMessagesRef.current = setTimeout(() => {
                setSessions(prev => prev.map(s => {
                    if (s.id === currentSessionId) {
                        return { ...s, messages: messages };
                    }
                    return s;
                }));
            }, 300);
        }
        return () => {
            if (syncMessagesRef.current) {
                clearTimeout(syncMessagesRef.current);
            }
        };
    }, [messages, currentSessionId]);

    // 同步chatHistory到session
    useEffect(() => {
        if (currentSessionId && chatHistory.length >= 0) {
            setSessions(prev => prev.map(s => {
                if (s.id === currentSessionId) {
                    return { ...s, chatHistory: chatHistory };
                }
                return s;
            }));
        }
    }, [chatHistory, currentSessionId]);

    // 监听从编辑器添加上下文的事件
    useEffect(() => {
        if (!containerEl) return;
        
        const handler = (e: CustomEvent) => {
            const data = e.detail;
            // 添加文件引用，包含行数信息
            const fileRef = data.endLine >= 0 
                ? `${data.file}:${data.startLine + 1}-${data.endLine + 1}`
                : data.file;
            
            setReferencedFiles(prev => {
                if (!prev.includes(fileRef)) {
                    return [...prev, fileRef];
                }
                return prev;
            });
        };
        
        containerEl.addEventListener('voyaru-add-context', handler as EventListener);
        return () => {
            containerEl.removeEventListener('voyaru-add-context', handler as EventListener);
        };
    }, [containerEl]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // 智能滚动逻辑
    useEffect(() => {
        if (messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) return;
        
        // 如果正在加载（发送消息过程中）
        if (isLoading) {
            if (lastMsg.role === 'user' && lastMsg.id) {
                // 新的用户消息：滚动到该消息顶部
                // 使用 setTimeout 确保 DOM 已渲染
                const msgId = lastMsg.id;
                setTimeout(() => {
                    const el = document.getElementById(msgId);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 50);
            } else {
                // 生成过程中，实时下拉聊天窗口，显示最新内容
                scrollToBottom();
            }
        } else {
            // 非加载状态（如切换 Session 或加载历史），滚动到底部
            scrollToBottom();
        }
    }, [messages, isLoading]);

    // 检测@和#符号（在任何位置）
    const detectTrigger = (text: string, cursorPos: number): { type: '@' | '#' | null, query: string, startPos: number } => {
        // 从光标位置向前查找最近的@或#
        let foundAt = -1;
        let foundHash = -1;
        
        for (let i = cursorPos - 1; i >= 0; i--) {
            if (text[i] === '@' && foundAt === -1) {
                foundAt = i;
            }
            if (text[i] === '#' && foundHash === -1) {
                foundHash = i;
            }
            // 如果遇到空格或换行，停止查找
            if (text[i] === ' ' || text[i] === '\n') {
                break;
            }
        }

        // 优先使用@（如果两者都存在，选择更近的）
        const atPos = foundAt;
        const hashPos = foundHash;
        
        if (atPos >= 0 && (hashPos < 0 || atPos > hashPos)) {
            const query = text.substring(atPos + 1, cursorPos);
            return { type: '@', query, startPos: atPos };
        } else if (hashPos >= 0) {
            const query = text.substring(hashPos + 1, cursorPos);
            return { type: '#', query, startPos: hashPos };
        }
        
        return { type: null, query: '', startPos: -1 };
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursorPos = e.target.selectionStart;
        setInputValue(val);

        const trigger = detectTrigger(val, cursorPos);
        
        if (trigger.type === '#') {
            const tools = plugin.settings.tools.filter((t: any) => 
                t.name.toLowerCase().includes(trigger.query.toLowerCase())
            );
            setFilteredTools(tools);
            setShowTools(true);
            setShowFiles(false);
            setSelectedIndex(-1);
        } else if (trigger.type === '@') {
            // 异步加载文件列表
            setShowFiles(true);
            setShowTools(false);
            setSelectedIndex(-1);
        } else {
            setShowTools(false);
            setShowFiles(false);
            setSelectedIndex(-1);
        }
    };

    // 加载所有文件（仅在首次显示时加载一次）
    useEffect(() => {
        if (showFiles && !isFilesLoaded) {
            const load = async () => {
                try {
                    const f1 = await plugin.fsService.listFilesRecursive(plugin.settings.folders.chapters);
                    const f2 = await plugin.fsService.listFilesRecursive(plugin.settings.folders.characters);
                    const f3 = await plugin.fsService.listFilesRecursive(plugin.settings.folders.outlines);
                    const f4 = await plugin.fsService.listFilesRecursive(plugin.settings.folders.notes);
                    const f5 = await plugin.fsService.listFilesRecursive(plugin.settings.folders.knowledge);
                    const all = [...f1, ...f2, ...f3, ...f4, ...f5];
                    // 去重
                    const uniqueFiles = Array.from(new Set(all));
                    setAllFiles(uniqueFiles);
                    setIsFilesLoaded(true);
                } catch (e) {
                    console.error('Failed to load files:', e);
                }
            };
            load();
        }
    }, [showFiles, isFilesLoaded]); // 不依赖 inputValue

    // 过滤文件列表（完全在内存中进行，极快）
    useEffect(() => {
        if (showFiles && allFiles.length > 0) {
            const cursorPos = inputRef.current?.selectionStart || inputValue.length;
            const trigger = detectTrigger(inputValue, cursorPos);
            
            if (trigger.type === '@') {
                const matches = allFiles.filter(f => 
                    f.toLowerCase().includes(trigger.query.toLowerCase())
                ).slice(0, 10);
                setFilteredFiles(matches);
            }
        }
    }, [inputValue, showFiles, allFiles]);

    // 键盘导航处理
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Ctrl/Cmd + Enter 发送消息
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            setShowTools(false);
            setShowFiles(false);
            handleSendMessage();
            return;
        }

        // 如果popup显示，处理导航
        if (showTools || showFiles) {
            const items = showTools ? filteredTools : filteredFiles;
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => 
                    prev < items.length - 1 ? prev + 1 : prev
                );
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < items.length) {
                    if (showTools && filteredTools[selectedIndex]) {
                        insertTool(filteredTools[selectedIndex]);
                    } else if (!showTools && filteredFiles[selectedIndex]) {
                        insertFile(filteredFiles[selectedIndex]);
                    }
                } else if (items.length > 0) {
                    // 如果没有选中，选择第一个
                    if (showTools && filteredTools[0]) {
                        insertTool(filteredTools[0]);
                    } else if (!showTools && filteredFiles[0]) {
                        insertFile(filteredFiles[0]);
                    }
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowTools(false);
                setShowFiles(false);
                setSelectedIndex(-1);
            }
            return;
        }

        // 普通Enter键发送（如果没有popup）
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleStopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsLoading(false);
            new Notice("生成已停止");
        }
    };

    const handleSendMessage = async (manualContent?: string, manualFiles?: string[], manualHistory?: any[]) => {
        const contentToSend = manualContent ?? inputValue;
        if (!contentToSend.trim() || isLoading) return;

        const filesToSend = manualFiles ?? referencedFiles;
        const historyToUse = manualHistory ?? chatHistory;

        const messageContent = contentToSend.trim();
        const newUserMsg: Message = { 
            role: 'user', 
            content: messageContent,
            id: `msg-${Date.now()}`,
            referencedFiles: [...filesToSend]
        };
        
        console.log('Sending message:', messageContent);
        setMessages(prev => [...prev, newUserMsg]);
        if (!manualContent) setInputValue(''); // Only clear input if not manual (or handled elsewhere)
        if (!manualFiles) setReferencedFiles([]);
        setIsLoading(true);

        // 更新当前session的消息（在发送时）
        if (currentSessionId) {
            setSessions(prev => prev.map(s => {
                if (s.id === currentSessionId) {
                    const updatedMessages = [...s.messages, newUserMsg];
                    // 自动命名session（如果是第一条消息）
                    let updatedName = s.name;
                    if ((s.name === '新对话' || s.name.startsWith('对话 ')) && s.messages.length === 0) {
                        updatedName = messageContent.slice(0, 20) + (messageContent.length > 20 ? '...' : '');
                    }
                    return { ...s, messages: updatedMessages, name: updatedName };
                }
                return s;
            }));
        }

        abortControllerRef.current = new AbortController();

        try {
            // 检查 aiService 是否存在
            if (!plugin.aiService) {
                throw new Error("AI Service 未初始化。请检查插件设置。");
            }

            // Sync model setting before sending
            plugin.settings.model = selectedModel;
            plugin.aiService.updateSettings(plugin.settings);

            console.log('Calling streamChat with history length:', historyToUse.length);
            const stream = plugin.aiService.streamChat(historyToUse, messageContent, newUserMsg.referencedFiles, abortControllerRef.current.signal);

            let currentResponseId = `msg-${Date.now()}-response`;
            let currentResponseContent = ""; // Accumulate text for the current message ID
            let hasReceivedAnyChunk = false;
            let updateTimer: NodeJS.Timeout | null = null;
            let pendingUpdateContent: string | null = null;
            let pendingUpdateId: string | null = null;
            let fullLog: any[] = []; // Store logs

            // 批量更新函数，减少渲染次数
            // Now accepts ID to target specific messages
            const scheduleUpdate = (id: string, content: string) => {
                pendingUpdateContent = content;
                pendingUpdateId = id;
                
                if (updateTimer) {
                    clearTimeout(updateTimer);
                }
                updateTimer = setTimeout(() => {
                    if (pendingUpdateContent !== null && pendingUpdateId !== null) {
                        const contentToUpdate = pendingUpdateContent; 
                        const idToUpdate = pendingUpdateId;
                        
                        setMessages(prev => {
                            const existingIndex = prev.findIndex(m => m.id === idToUpdate);
                            if (existingIndex !== -1) {
                                const newMessages = [...prev];
                                const msg = newMessages[existingIndex];
                                if (msg) {
                                    newMessages[existingIndex] = { ...msg, content: contentToUpdate, toolData: { ...(msg.toolData || {}), logs: fullLog } } as Message;
                                }
                                return newMessages;
                            } else {
                                // Message doesn't exist yet, create it
                                return [...prev, { 
                                    role: 'model', 
                                    content: contentToUpdate, 
                                    type: 'text',
                                    id: idToUpdate,
                                    toolData: { logs: fullLog }
                                }];
                            }
                        });
                        pendingUpdateContent = null;
                        pendingUpdateId = null;
                    }
                }, 50); 
            };
            
            // Helper to force immediate update if we are switching contexts
            const flushUpdate = () => {
                if (updateTimer) {
                    clearTimeout(updateTimer);
                    updateTimer = null;
                }
                if (pendingUpdateContent !== null && pendingUpdateId !== null) {
                    const contentToUpdate = pendingUpdateContent; 
                    const idToUpdate = pendingUpdateId;
                    setMessages(prev => {
                        const existingIndex = prev.findIndex(m => m.id === idToUpdate);
                         if (existingIndex !== -1) {
                             const newMessages = [...prev];
                             const msg = newMessages[existingIndex];
                             if (msg) {
                                newMessages[existingIndex] = { ...msg, content: contentToUpdate, toolData: { ...(msg.toolData || {}), logs: fullLog } } as Message;
                             }
                             return newMessages;
                         } else {
                             return [...prev, { role: 'model', content: contentToUpdate, type: 'text', id: idToUpdate, toolData: { logs: fullLog } }];
                         }
                    });
                    pendingUpdateContent = null;
                    pendingUpdateId = null;
                }
            };

            for await (const chunk of stream) {
                if (abortControllerRef.current?.signal.aborted) break;
                
                hasReceivedAnyChunk = true;
                // Accumulate logs
                fullLog.push(chunk);
                
                console.log('Received chunk:', chunk.type, chunk);
                
                if (chunk.type === 'text') {
                    // Normal text accumulation
                    currentResponseContent += chunk.content;
                    scheduleUpdate(currentResponseId, currentResponseContent);
                } else {
                    // For ANY non-text chunk (Thinking, Tool Result, Error, etc.)
                    // First, ensure any pending text updates are finalized so the order is preserved
                    flushUpdate();
                    
                    if (chunk.type === 'thinking') {
                        // 立即更新thinking消息
                        setMessages(prev => [...prev, { 
                            role: 'model', 
                            content: chunk.content, 
                            type: 'thinking',
                            id: `msg-${Date.now()}-thinking`
                        }]);
                    } else if (chunk.type === 'tool_result') {
                        // 立即更新tool_result消息
                        setMessages(prev => [...prev, { 
                            role: 'model', 
                            content: `Tool ${chunk.tool} executed: ${chunk.result}`, 
                            type: 'tool_result',
                            tool: chunk.tool,
                            toolData: { 
                                result: chunk.result, 
                                args: chunk.args,
                                undoData: chunk.undoData 
                            },
                            id: `msg-${Date.now()}-tool`
                        }]);
                    } else if (chunk.type === 'error') {
                        console.error('Error chunk received:', chunk.content);
                        setMessages(prev => [...prev, { 
                            role: 'error', 
                            content: chunk.content,
                            id: `msg-${Date.now()}-error`
                        }]);
                        setIsLoading(false);
                        return; 
                    } else if (chunk.type === 'history_update') {
                        const updatedHistory = chunk.history;
                        setChatHistory(updatedHistory);
                    }
                    
                    // If we interrupted a text stream (meaning we had content), or if we just had a tool call,
                    // we want the NEXT text chunk to start a NEW message bubble.
                    // But if currentResponseContent was empty, we can reuse the ID? 
                    // No, safe to just always rotate ID after an interruption to ensure strict ordering.
                    // Exception: history_update shouldn't break text flow? 
                    // Actually history_update usually comes at the end.
                    if (chunk.type !== 'history_update') {
                        currentResponseId = `msg-${Date.now()}-${Math.random()}-response`;
                        currentResponseContent = "";
                    }
                }
            }

            // 确保最终内容被更新
            flushUpdate();

            // 如果没有收到任何响应，显示提示
            if (!hasReceivedAnyChunk && !abortControllerRef.current?.signal.aborted) {
                console.warn('No chunks received from stream');
                setMessages(prev => [...prev, { 
                    role: 'error', 
                    content: "未收到模型响应。请检查 API Key 设置和网络连接。",
                    id: `msg-${Date.now()}-error`
                }]);
            }

        } catch (e: any) {
            if (e.message === "生成已取消") return;
            console.error('Error in handleSendMessage:', e);
            const errorMessage = e?.message || e?.toString() || "发生未知错误。";
            setMessages(prev => [...prev, { 
                role: 'error', 
                content: `错误: ${errorMessage}`,
                id: `msg-${Date.now()}-error`
            }]);
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
            // 确保最终状态被保存（通过 useEffect 自动触发保存）
        }
    };

    const handleRegenerate = async (messageId: string) => {
        // Find the index of the message to regenerate
        const msgIndex = messages.findIndex(m => m.id === messageId);
        if (msgIndex === -1) return;

        // Search backwards for the corresponding user message
        let userMsgIndex = -1;
        for (let i = msgIndex - 1; i >= 0; i--) {
            if (messages[i] && messages[i]!.role === 'user') {
                userMsgIndex = i;
                break;
            }
        }
        
        if (userMsgIndex < 0) {
            new Notice("无法重新生成：找不到对应的用户提问");
            return;
        }

        const userMsg = messages[userMsgIndex];

        // Revert file changes for ALL messages from the user message onwards
        // (including the user message itself, though it usually has no tool calls, 
        // but subsequent model messages do)
        const messagesToRemove = messages.slice(userMsgIndex + 1);
        for (const msg of messagesToRemove) {
            if (msg.role === 'model' && msg.type === 'tool_result' && msg.tool === 'writeFile' && msg.toolData && msg.toolData.undoData) {
                const undo = msg.toolData.undoData;
                try {
                    console.log(`Reverting file change for ${undo.path}`);
                    if (undo.previousContent === null) {
                        // File was created, so delete it
                        await plugin.fsService.deleteFile(undo.path);
                        new Notice(`已撤销创建: ${undo.path}`);
                    } else {
                        // File was modified, restore content
                        if (undo && undo.previousContent !== null) {
                            await plugin.fsService.writeFile(undo.path, undo.previousContent);
                            new Notice(`已撤销修改: ${undo.path}`);
                        }
                    }
                } catch (e) {
                    console.error(`Failed to revert file ${undo.path}:`, e);
                    new Notice(`撤销文件更改失败: ${undo.path}`);
                }
            }
        }

        // Remove the user message and everything after it from UI
        // so it gets re-added by handleSendMessage
        const newMessages = messages.slice(0, userMsgIndex);
        setMessages(newMessages);
        
        // Revert chatHistory: Remove the last User turn and everything after it
        setChatHistory(prev => {
            const newHistory = [...prev];
            let foundUser = false;
            // Pop messages until we remove the User message
            while(newHistory.length > 0) {
                const last = newHistory.pop();
                if (last && last.role === 'user') {
                    foundUser = true;
                    break;
                }
            }
            // If we didn't find a user message, we might have cleared too much or history was empty/desynced.
            // But we proceed with the truncated history.
            return newHistory;
        });

        // Trigger send with the user's content and EXPLICIT history/content
        // This avoids stale closure issues
        // Pass the *truncated* history (via callback or calculated) - wait, setState is async.
        // We need to calculate history locally to pass to handleSendMessage
        const calculatedHistory = [...chatHistory];
        while(calculatedHistory.length > 0) {
            const last = calculatedHistory.pop();
            if (last && last.role === 'user') {
                break;
            }
        }

        if (userMsg) {
            handleSendMessage(userMsg.content, userMsg.referencedFiles || [], calculatedHistory);
        }
    };

    const handleEditUserMessage = async (messageId: string, content: string, files: string[]) => {
        const msgIndex = messages.findIndex(m => m.id === messageId);
        if (msgIndex === -1) return;

        // Revert file changes for ALL messages being removed (from msgIndex to end)
        // User message is at msgIndex, so everything after it are model responses
        const messagesToRemove = messages.slice(msgIndex);
        for (const msg of messagesToRemove) {
            if (msg.role === 'model' && msg.type === 'tool_result' && msg.tool === 'writeFile' && msg.toolData && msg.toolData.undoData) {
                const undo = msg.toolData.undoData;
                try {
                    console.log(`Reverting file change for ${undo.path}`);
                    if (undo.previousContent === null) {
                        await plugin.fsService.deleteFile(undo.path);
                        new Notice(`已撤销创建: ${undo.path}`);
                    } else {
                        await plugin.fsService.writeFile(undo.path, undo.previousContent);
                        new Notice(`已撤销修改: ${undo.path}`);
                    }
                } catch (e) {
                    console.error(`Failed to revert file ${undo.path}:`, e);
                }
            }
        }

        // Remove this message and everything after it
        const newMessages = messages.slice(0, msgIndex);
        setMessages(newMessages);

        // Revert history
        setChatHistory(prev => {
            const newHistory = [...prev];
            // Pop until we remove the corresponding User turn
            while(newHistory.length > 0) {
                const last = newHistory.pop();
                if (last && last.role === 'user') {
                    break;
                }
            }
            return newHistory;
        });

        setInputValue(content);
        setReferencedFiles(files);
        inputRef.current?.focus();
    };

    const handleExport = (content: string) => {
        new ExportModal(plugin.app, content, plugin.fsService).open();
    };

    const handleShowLogs = (logs: any) => {
        new LogModal(plugin.app, logs).open();
    };


    const insertTool = (tool: any) => {
        const cursorPos = inputRef.current?.selectionStart || inputValue.length;
        const trigger = detectTrigger(inputValue, cursorPos);
        
        if (trigger.type === '#' && trigger.startPos >= 0) {
            const before = inputValue.substring(0, trigger.startPos);
            const after = inputValue.substring(cursorPos);
            setInputValue(before + tool.prompt + after);
            // 设置光标位置
            setTimeout(() => {
                const newPos = before.length + tool.prompt.length;
                inputRef.current?.setSelectionRange(newPos, newPos);
                inputRef.current?.focus();
            }, 0);
        }
        setShowTools(false);
        setSelectedIndex(-1);
    };

    const insertFile = (file: string) => {
        const cursorPos = inputRef.current?.selectionStart || inputValue.length;
        const trigger = detectTrigger(inputValue, cursorPos);
        
        if (trigger.type === '@' && trigger.startPos >= 0) {
            const before = inputValue.substring(0, trigger.startPos);
            const after = inputValue.substring(cursorPos);
            // 移除@符号和查询文本，只保留文件名引用
            setInputValue(before + after);
            // 设置光标位置
            setTimeout(() => {
                const newPos = before.length;
                inputRef.current?.setSelectionRange(newPos, newPos);
                inputRef.current?.focus();
            }, 0);
        }
        
        if (!referencedFiles.includes(file)) {
            setReferencedFiles(prev => [...prev, file]);
        }
        setShowFiles(false);
        setSelectedIndex(-1);
    };

    const createNewSession = () => {
        const newSession: Session = {
            id: `session-${Date.now()}`,
            name: '新对话',
            messages: [],
            chatHistory: [],
            timestamp: Date.now()
        };
        setSessions(prev => [...prev, newSession]);
        setCurrentSessionId(newSession.id);
        setMessages([]);
        setChatHistory([]);
        setReferencedFiles([]);
    };

    const deleteSession = (sessionId: string) => {
        if (sessions.length <= 1) {
            // 如果只有一个session，删除它意味着创建一个新的并替换
            const newSession: Session = {
                id: `session-${Date.now()}`,
                name: '新对话',
                messages: [],
                chatHistory: [],
                timestamp: Date.now()
            };
            setSessions([newSession]);
            setCurrentSessionId(newSession.id);
            setMessages([]);
            setChatHistory([]);
            setReferencedFiles([]);
            return;
        }
        setSessions(prev => {
            const filtered = prev.filter(s => s.id !== sessionId);
            if (currentSessionId === sessionId) {
                setCurrentSessionId(filtered[0]?.id || null);
            }
            return filtered;
        });
    };

    const renameSession = (sessionId: string, newName: string) => {
        if (newName.trim()) {
            setSessions(prev => prev.map(s => 
                s.id === sessionId ? { ...s, name: newName.trim() } : s
            ));
        }
        setEditingSessionId(null);
    };

    const handleClearHistory = () => {
        // 清空当前会话的消息和历史
        setMessages([]);
        setChatHistory([]);
        // 同时更新sessions
        setSessions(prev => prev.map(s => {
            if (s.id === currentSessionId) {
                return { ...s, messages: [], chatHistory: [] };
            }
            return s;
        }));
        new Notice('聊天历史已清空');
    };

    const handleCopy = (content: string) => {
        navigator.clipboard.writeText(content);
        new Notice('已复制到剪贴板');
    };

    const handleCopyToNote = (content: string) => {
        // 获取当前活动的 Markdown view
        const activeLeaf = plugin.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view && activeLeaf.view.getViewType() === "markdown") {
             const editor = activeLeaf.view.editor;
             if (editor) {
                 editor.replaceSelection(content);
                 new Notice('已插入到当前笔记');
             }
        } else {
            new Notice('请先打开一个 Markdown 笔记');
        }
    };

    // 预处理消息，合并连续的工具调用
    const processMessages = (msgs: Message[]) => {
        const result: (Message | { type: 'tool_group', messages: Message[], id: string })[] = [];
        let currentGroup: Message[] = [];

        for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            if (!m) continue;

            if ((m.type === 'tool_result' && m.tool !== 'writeFile') || m.type === 'thinking') {
                currentGroup.push(m);
            } else {
                // 如果当前有堆积的group，先push
                if (currentGroup.length > 0) {
                    const firstMsg = currentGroup[0];
                    if (firstMsg && firstMsg.id) {
                        result.push({
                            type: 'tool_group',
                            messages: [...currentGroup],
                            id: `group-${firstMsg.id}`
                        });
                    }
                    currentGroup = [];
                }
                result.push(m);
            }
        }
        // 处理最后的group
        if (currentGroup.length > 0) {
            const firstMsg = currentGroup[0];
            if (firstMsg && firstMsg.id) {
                result.push({
                    type: 'tool_group',
                    messages: [...currentGroup],
                    id: `group-${firstMsg.id}`
                });
            }
        }
        return result;
    };

    const CollapsibleToolGroup = ({ messages }: { messages: Message[] }) => {
        const [isExpanded, setIsExpanded] = useState(false);
        
        return (
            <div style={{ marginBottom: '16px', padding: '0 44px' }}>
                <div 
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        backgroundColor: 'var(--background-primary-alt)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--background-modifier-border)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        userSelect: 'none'
                    }}
                >
                    <div style={{ 
                        transition: 'transform 0.2s', 
                        transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', 
                        display: 'flex', alignItems: 'center'
                    }}>
                        <ChevronDownIcon size={12} />
                    </div>
                    <ToolIcon size={12} />
                    <span>已执行 {messages.length} 项操作...</span>
                </div>
                
                {isExpanded && (
                    <div style={{ 
                        marginTop: '8px', 
                        paddingLeft: '12px', 
                        borderLeft: '2px solid var(--background-modifier-border)',
                        marginLeft: '12px'
                    }}>
                        {messages.map((m, idx) => (
                            <div key={m.id || idx} style={{ marginBottom: '8px' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-normal)' }}>
                                    {m.type === 'thinking' ? (
                                        <span style={{color: 'var(--text-muted)'}}>{m.content}</span>
                                    ) : (
                                        <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', backgroundColor: 'var(--background-secondary)', padding: '4px', borderRadius: '4px' }}>
                                            {m.content}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const displayedMessages = processMessages(messages);
    
    // Calculate index of the LAST user message
    let lastUserMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i] && messages[i]!.role === 'user') {
            lastUserMessageIndex = i;
            break;
        }
    }

    return (
        <div className="voyaru-chat-container" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%',
            backgroundColor: 'var(--background-primary)',
            fontSize: `${fontSize}px`
        }}>
            {/* Header / Session Tabs */}
            <div className="voyaru-header" style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 12px',
                gap: '8px',
                borderBottom: '1px solid var(--background-modifier-border)',
                backgroundColor: 'var(--background-secondary-alt)',
                flexShrink: 0
            }}>
                 <div className="voyaru-session-tabs" style={{ 
                    display: 'flex', 
                    gap: '6px', 
                    overflowX: 'auto',
                    flex: 1,
                    scrollbarWidth: 'none'
                }}>
                    {sessions.map(session => (
                        <div
                            key={session.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '12px', // Rounded
                                backgroundColor: currentSessionId === session.id 
                                    ? 'var(--interactive-accent)' 
                                    : 'var(--background-primary)',
                                color: currentSessionId === session.id 
                                    ? 'var(--text-on-accent)' 
                                    : 'var(--text-normal)',
                                cursor: 'pointer',
                                fontSize: '12px',
                                whiteSpace: 'nowrap',
                                minWidth: '60px',
                                transition: 'all 0.2s ease',
                                border: currentSessionId === session.id 
                                    ? 'none' 
                                    : '1px solid var(--background-modifier-border)'
                            }}
                            onClick={() => setCurrentSessionId(session.id)}
                            onDoubleClick={() => {
                                setEditingSessionId(session.id);
                                setEditingSessionName(session.name);
                            }}
                        >
                            {editingSessionId === session.id ? (
                                <input
                                    type="text"
                                    value={editingSessionName}
                                    onChange={(e) => setEditingSessionName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            renameSession(session.id, editingSessionName);
                                        } else if (e.key === 'Escape') {
                                            setEditingSessionId(null);
                                        }
                                    }}
                                    onBlur={() => renameSession(session.id, editingSessionName)}
                                    autoFocus
                                    style={{
                                        border: '1px solid var(--interactive-accent)',
                                        borderRadius: '6px',
                                        padding: '2px 6px',
                                        fontSize: '12px',
                                        width: '100px',
                                        backgroundColor: 'var(--background-primary)',
                                        color: 'var(--text-normal)'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <>
                                    <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.name}</span>
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteSession(session.id);
                                        }}
                                        style={{ cursor: 'pointer', opacity: 0.7 }}
                                    >
                                        <CloseIcon size={12} />
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                    <button
                        onClick={createNewSession}
                        style={{
                            padding: '6px',
                            border: 'none',
                            background: 'transparent',
                            backgroundColor: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-muted)',
                            transition: 'color 0.2s, opacity 0.2s',
                            opacity: 0.6
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.color = 'var(--text-normal)';
                            e.currentTarget.style.opacity = '1';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.color = 'var(--text-muted)';
                            e.currentTarget.style.opacity = '0.6';
                        }}
                        title="新建对话"
                    >
                        <PlusIcon size={16} />
                    </button>
                </div>

                {/* Toolbar Buttons */}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                     {/* Font Size Control */}
                     <div style={{ position: 'relative' }}>
                        <button 
                            className="clickable-icon"
                            onClick={() => setShowFontSizeControl(!showFontSizeControl)}
                            style={{ 
                                padding: '6px', 
                                background: 'transparent', 
                                border: 'none', 
                                color: 'var(--text-muted)',
                                cursor: 'pointer' 
                            }}
                            title="调整字体大小"
                        >
                            <TextSizeIcon size={16} />
                        </button>
                        {showFontSizeControl && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                backgroundColor: 'var(--background-primary)',
                                border: '1px solid var(--background-modifier-border)',
                                borderRadius: '8px',
                                padding: '8px',
                                zIndex: 1000,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <button onClick={() => setFontSize(s => Math.max(12, s - 1))} style={{ padding: '4px 8px' }}>-</button>
                                <span style={{ fontSize: '12px', minWidth: '24px', textAlign: 'center' }}>{fontSize}</span>
                                <button onClick={() => setFontSize(s => Math.min(24, s + 1))} style={{ padding: '4px 8px' }}>+</button>
                            </div>
                        )}
                    </div>
                    {/* Clear History */}
                    <button 
                        className="clickable-icon"
                        onClick={() => {
                            // Simple confirm logic could be added here, but direct action is faster as per request
                            if (window.confirm("确定要清空当前对话历史吗？此操作无法撤销。")) {
                                handleClearHistory();
                            }
                        }}
                        style={{ 
                            padding: '6px', 
                            background: 'transparent', 
                            border: 'none', 
                            color: 'var(--text-muted)',
                            cursor: 'pointer' 
                        }}
                        title="清空历史"
                    >
                        <TrashIcon size={16} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="voyaru-messages" style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '16px',
                backgroundColor: 'var(--background-primary)'
            }}>
                {displayedMessages.map((item, i) => {
                    if ('messages' in item) { // Tool Group
                        const group = item as { type: 'tool_group', messages: Message[], id: string };
                        return <CollapsibleToolGroup key={group.id} messages={group.messages} />;
                    } else { // Single Message
                        const m = item as Message;
                        if (m.type === 'tool_result' && m.tool === 'writeFile') {
                             // Render WriteFile Card
                             const args = m.toolData?.args || {};
                             const content = args.content || "";
                             const path = args.path || "Untitled";
                             const wordCount = content.length; // Approximate char count
                             const isUpdated = m.toolData && m.toolData.undoData; // If undoData exists, it means write was successful and tracked
                             
                             return (
                                <div key={m.id || i} style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-start', paddingLeft: '44px' }}>
                                    <div style={{
                                        border: '1px solid var(--background-modifier-border)',
                                        borderRadius: '12px',
                                        backgroundColor: 'var(--background-secondary)',
                                        width: '240px',
                                        overflow: 'hidden',
                                        transition: 'transform 0.2s ease',
                                        cursor: 'pointer'
                                    }}
                                    onClick={async () => {
                                        try {
                                            // 尝试解析文件
                                            let file = plugin.app.vault.getAbstractFileByPath(path);
                                            if (!file) {
                                                file = plugin.app.metadataCache.getFirstLinkpathDest(path, '');
                                            }

                                            if (file instanceof TFile) {
                                            // 查找是否已在某个 Leaf 打开
                                            let foundLeaf: any = null;
                                            if (plugin.app && plugin.app.workspace) {
                                                plugin.app.workspace.iterateAllLeaves((leaf: any) => {
                                                    if (leaf.view && leaf.view instanceof MarkdownView && leaf.view.file && leaf.view.file.path === file.path) {
                                                        foundLeaf = leaf;
                                                    }
                                                });
                                            }

                                                if (foundLeaf) {
                                                    plugin.app.workspace.setActiveLeaf(foundLeaf, { focus: true });
                                                } else {
                                                    // 未打开，新建标签页打开
                                                    await plugin.app.workspace.getLeaf(true).openFile(file);
                                                }
                                            } else {
                                                // 降级处理
                                                await plugin.app.workspace.openLinkText(path, '', true);
                                            }
                                        } catch (e) {
                                            console.error("Failed to open file:", e);
                                            await plugin.app.workspace.openLinkText(path, '', true);
                                        }
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                    >
                                        <div style={{
                                            padding: '12px',
                                            borderBottom: '1px solid var(--background-modifier-border)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontWeight: 600
                                        }}>
                                            <FileIcon size={16} />
                                            <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
                                        </div>
                                        <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-success)' }}>
                                                <CheckIcon size={14} />
                                                <span>文件已更新</span>
                                            </div>
                                            <div style={{ marginTop: '4px' }}>{wordCount} 字符</div>
                                        </div>
                                    </div>
                                </div>
                             );
                        }

                        // Normal Message (Text, Thinking, Error)
                        return (
                            <div 
                                key={m.id || i} 
                                id={m.id}
                                className={`voyaru-message voyaru-message-${m.role}`} 
                                style={{ 
                                    marginBottom: '16px',
                                    display: 'flex',
                                    gap: '12px',
                                    alignItems: 'flex-start'
                                }}
                            >
                                {/* Avatar */}
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '10px', // More rounded
                                    backgroundColor: m.role === 'user' 
                                        ? 'var(--interactive-accent)' 
                                        : m.role === 'error'
                                        ? 'var(--text-error)'
                                        : 'var(--background-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    color: m.role === 'user' ? 'var(--text-on-accent)' : m.role === 'error' ? 'var(--text-on-accent)' : 'var(--text-normal)'
                                }}>
                                    {m.role === 'user' ? <UserIcon size={18} /> : m.role === 'error' ? '⚠️' : <BotIcon size={18} />}
                                </div>
                                
                                {/* Message Content & Actions */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {/* Name & Status */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        marginBottom: '6px'
                                    }}>
                                        <span style={{
                                            fontWeight: 600,
                                            fontSize: '0.9em',
                                            color: m.role === 'error' ? 'var(--text-error)' : 'var(--text-normal)'
                                        }}>
                                            {m.role === 'user' ? '你' : m.role === 'error' ? '错误' : 'Voyaru'}
                                        </span>
                                        {m.type === 'thinking' && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.8em' }}>
                                                <ThinkingIcon size={12} />
                                                <span>思考中</span>
                                            </div>
                                        )}
                                        {/* Actions for User Message - only show for the LAST user message */}
                                        {m.role === 'user' && i === lastUserMessageIndex && (
                                            <div 
                                                className="clickable-icon"
                                                onClick={() => handleEditUserMessage(m.id!, m.content, m.referencedFiles || [])}
                                                style={{ marginLeft: 'auto', cursor: 'pointer', opacity: 0.7 }}
                                                title="修改并重新发送"
                                            >
                                                <EditIcon size={14} />
                                            </div>
                                        )}
                                    </div>

                                    {/* Bubble */}
                                    <div style={{
                                        padding: '12px 16px',
                                        borderRadius: '12px',
                                        backgroundColor: m.role === 'user' 
                                            ? 'var(--interactive-accent)' 
                                            : m.role === 'error'
                                            ? 'var(--background-modifier-error)'
                                            : 'var(--background-secondary)',
                                        color: m.role === 'user' 
                                            ? 'var(--text-on-accent)' 
                                            : m.role === 'error'
                                            ? 'var(--text-error)'
                                            : 'var(--text-normal)',
                                        border: m.type === 'thinking' 
                                            ? '1px dashed var(--background-modifier-border)' 
                                            : m.role === 'error'
                                            ? '1px solid var(--text-error)'
                                            : 'none',
                                        userSelect: 'text',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        fontSize: '1em',
                                        lineHeight: '1.6',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                    }}>
                                        {m.content}
                                        {/* Referenced Files Display in Bubble */}
                                        {m.role === 'user' && m.referencedFiles && m.referencedFiles.length > 0 && (
                                            <div style={{ 
                                                marginTop: '8px', 
                                                paddingTop: '8px', 
                                                borderTop: '1px solid rgba(255,255,255,0.2)',
                                                fontSize: '0.85em',
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: '6px'
                                            }}>
                                                {m.referencedFiles.map(rf => (
                                                    <div key={rf} style={{ 
                                                        display: 'inline-flex', 
                                                        alignItems: 'center', 
                                                        gap: '4px',
                                                        backgroundColor: 'rgba(0,0,0,0.1)',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px'
                                                    }}>
                                                        <FileIcon size={10} />
                                                        <span>{rf}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Bar (Only for Model Text messages) - only show when not loading */ }
                                    {m.role === 'model' && m.type === 'text' && !isLoading && (
                                        <div style={{
                                            display: 'flex',
                                            gap: '8px',
                                            marginTop: '6px',
                                            opacity: 0.6,
                                            transition: 'opacity 0.2s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                        onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                                        >
                                            <button className="clickable-icon" onClick={() => handleCopy(m.content)} title="复制" style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                                <CopyIcon size={14} />
                                            </button>
                                            <button className="clickable-icon" onClick={() => handleExport(m.content)} title="导出到笔记" style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                                <ExportIcon size={14} />
                                            </button>
                                            <button className="clickable-icon" onClick={() => m.id && handleRegenerate(m.id)} title="重新生成" style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                                <RefreshIcon size={14} />
                                            </button>
                                            {m.toolData?.logs && (
                                                <button className="clickable-icon" onClick={() => m.toolData?.logs && handleShowLogs(m.toolData.logs)} title="查看日志" style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                                    <LogIcon size={14} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    }
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Referenced Files Area */}
            {referencedFiles.length > 0 && (
                <div className="voyaru-context-files" style={{ 
                    padding: '8px 16px', 
                    borderTop: '1px solid var(--background-modifier-border)',
                    backgroundColor: 'var(--background-secondary-alt)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8em', color: 'var(--text-muted)' }}>
                        <FileIcon size={12} />
                        <span>引用:</span>
                    </div>
                    {referencedFiles.map(f => {
                        const filePath = f.split(':')[0];
                        return (
                            <div
                                key={f}
                                style={{ 
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: 'var(--background-primary)', 
                                    padding: '2px 8px', 
                                    borderRadius: '6px',
                                    border: '1px solid var(--background-modifier-border)',
                                    fontSize: '0.8em',
                                    cursor: 'pointer'
                                }}
                            >
                                <span>{filePath}</span>
                                <div onClick={() => setReferencedFiles(prev => prev.filter(x => x !== f))} style={{ cursor: 'pointer', marginLeft: '4px' }}>
                                    <CloseIcon size={10} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Input Area */}
            <div className="voyaru-input-area" style={{ 
                position: 'relative', 
                padding: '16px', 
                borderTop: '1px solid var(--background-modifier-border)',
                backgroundColor: 'var(--background-secondary-alt)'
            }}>
                 {/* ... Popups ... */}
                 {/* (Keeping existing popup logic but styled nicely) */}
                 {(showTools || showFiles) && (
                     <div 
                        ref={popupRef}
                        className="voyaru-popup" 
                        style={{ 
                            position: 'absolute', 
                            bottom: '100%', 
                            left: 16, right: 16,
                            background: 'var(--background-primary)', 
                            border: '1px solid var(--background-modifier-border)',
                            borderRadius: '12px',
                            maxHeight: '200px', 
                            overflowY: 'auto', 
                            marginBottom: '8px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                            zIndex: 1000
                        }}
                    >
                        {showTools ? filteredTools.map((t, idx) => (
                             <div 
                                key={t.name} 
                                onClick={() => insertTool(t)} 
                                style={{ 
                                    padding: '8px 12px', 
                                    cursor: 'pointer', 
                                    backgroundColor: selectedIndex === idx ? 'var(--background-modifier-hover)' : 'transparent',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                <ToolIcon size={14} />
                                <span style={{ fontSize: '0.9em' }}>{t.name}</span>
                            </div>
                        )) : filteredFiles.map((f, idx) => (
                            <div 
                                key={f} 
                                onClick={() => insertFile(f)} 
                                style={{ 
                                    padding: '8px 12px', 
                                    cursor: 'pointer', 
                                    backgroundColor: selectedIndex === idx ? 'var(--background-modifier-hover)' : 'transparent',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                <FileIcon size={14} />
                                <span style={{ fontSize: '0.9em' }}>{f}</span>
                            </div>
                        ))}
                    </div>
                 )}

                {/* Input Container - Sleek Pill Shape */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'var(--background-primary)',
                    borderRadius: '16px', // Large radius for pill look
                    border: '1px solid var(--background-modifier-border)',
                    padding: '4px 12px',
                    gap: '4px',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.05)'
                }}
                onFocusCapture={(e) => {
                    e.currentTarget.style.borderColor = 'var(--interactive-accent)';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(var(--interactive-accent-rgb), 0.1)';
                }}
                onBlurCapture={(e) => {
                    e.currentTarget.style.borderColor = 'var(--background-modifier-border)';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)';
                }}
                >
                    {/* Referenced Files inside input */}
                    {referencedFiles.length > 0 && (
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '6px',
                            paddingTop: '8px',
                            paddingBottom: '4px'
                        }}>
                            {referencedFiles.map(f => {
                                const filePath = f.split(':')[0];
                                return (
                                    <div
                                        key={f}
                                        style={{ 
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            background: 'var(--background-modifier-hover)', // Slightly darker
                                            padding: '2px 8px', 
                                            borderRadius: '6px',
                                            fontSize: '0.8em',
                                            cursor: 'pointer',
                                            color: 'var(--text-normal)'
                                        }}
                                    >
                                        <FileIcon size={12} />
                                        <span>{filePath}</span>
                                        <div onClick={(e) => {
                                            e.stopPropagation();
                                            setReferencedFiles(prev => prev.filter(x => x !== f));
                                        }} style={{ cursor: 'pointer', marginLeft: '4px', opacity: 0.6 }}>
                                            <CloseIcon size={10} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Text Area */}
                    <textarea 
                        ref={inputRef}
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="向 Voyaru 提问..."
                        style={{ 
                            width: '100%',
                            minHeight: '40px', 
                            maxHeight: '160px',
                            resize: 'none',
                            padding: '8px 0',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                            color: 'var(--text-normal)',
                            lineHeight: '1.5',
                            boxShadow: 'none' // Override default focus
                        }}
                    />

                    {/* Bottom Bar: Model Selector, Actions, Send */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingBottom: '4px',
                        paddingTop: '4px'
                    }}>
                        {/* Left: Model Selector */}
                        <div style={{ position: 'relative' }} ref={modelSelectorRef}>
                            <div 
                                onClick={() => setShowModelSelector(!showModelSelector)}
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.85em',
                                    color: 'var(--text-muted)',
                                    padding: '4px 8px 4px 0',
                                    userSelect: 'none',
                                    borderRadius: '6px',
                                    transition: 'color 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-normal)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                title="选择模型"
                            >
                                <span>{MODELS.find(m => m.id === selectedModel)?.name}</span>
                                <ChevronDownIcon size={12} />
                            </div>

                            {showModelSelector && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    left: 0,
                                    marginBottom: '8px',
                                    minWidth: '200px',
                                    backgroundColor: 'var(--background-primary)',
                                    border: '1px solid var(--background-modifier-border)',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                                    zIndex: 1001,
                                    padding: '4px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px'
                                }}>
                                    {MODELS.map(model => (
                                        <div 
                                            key={model.id}
                                            onClick={() => {
                                                setSelectedModel(model.id);
                                                setShowModelSelector(false);
                                            }}
                                            style={{
                                                padding: '6px 8px',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.9em',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                backgroundColor: selectedModel === model.id ? 'var(--background-modifier-active-hover)' : 'transparent',
                                                color: 'var(--text-normal)',
                                                transition: 'background-color 0.1s'
                                            }}
                                            onMouseEnter={e => {
                                                if (selectedModel !== model.id) e.currentTarget.style.backgroundColor = 'var(--background-modifier-hover)';
                                            }}
                                            onMouseLeave={e => {
                                                if (selectedModel !== model.id) e.currentTarget.style.backgroundColor = 'transparent';
                                            }}
                                        >
                                            <span>{model.name}</span>
                                            {selectedModel === model.id && <CheckIcon size={14} />}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Right: Actions & Send */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {/* Action Icons */}
                            <div style={{ display: 'flex', gap: '10px', color: 'var(--text-muted)' }}>
                                <div 
                                    className="clickable-icon" 
                                    onClick={() => {
                                        setInputValue(prev => prev + "#");
                                        setShowTools(true);
                                        setFilteredTools(plugin.settings.tools); // Load all tools
                                        // Need to focus and update state properly
                                        setTimeout(() => inputRef.current?.focus(), 0);
                                    }} 
                                    title="工具 (#)"
                                    style={{ cursor: 'pointer', opacity: 0.8 }}
                                >
                                    <ToolIcon size={16} />
                                </div>
                                <div 
                                    className="clickable-icon" 
                                    onClick={() => {
                                        // Manually trigger @ menu
                                        setInputValue(prev => prev + "@");
                                        setShowFiles(true);
                                        // Need to focus and update state properly
                                        setTimeout(() => inputRef.current?.focus(), 0);
                                    }} 
                                    title="引用文件 (@)" 
                                    style={{ cursor: 'pointer', opacity: 0.8 }}
                                >
                                    <MentionIcon size={16} />
                                </div>
                            </div>

                            {/* Send Button */}
                            <button 
                                onClick={isLoading ? handleStopGeneration : () => handleSendMessage()} 
                                style={{ 
                                    padding: '0',
                                    borderRadius: '50%',
                                    border: 'none',
                                    backgroundColor: isLoading ? 'var(--background-modifier-border)' : 'var(--text-normal)', // White/Contrast in dark mode usually
                                    color: 'var(--background-primary)', // Inverted color for icon
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    height: '28px', width: '28px',
                                    transition: 'all 0.2s ease',
                                    marginLeft: '4px'
                                }}
                                title={isLoading ? "停止生成" : "发送"}
                            >
                                {isLoading ? <StopIcon size={14} /> : <ArrowUpIcon size={16} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
