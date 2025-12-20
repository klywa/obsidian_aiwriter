import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { AIService } from '../services/ai_service';
import { FSService } from '../services/fs_service';
import { SendIcon, StopIcon, PlusIcon, CloseIcon, CopyIcon, FileIcon, EditIcon, RefreshIcon, SaveIcon, UserIcon, BotIcon, ThinkingIcon, ToolIcon } from '../components/Icons';
import { Message, Session } from '../settings';

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
    
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const sessionsRef = useRef<Session[]>([]);
    const prevSessionIdRef = useRef<string | null>(null);

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
            }
            // 如果是模型消息正在生成，不自动滚动到底部，保持用户消息在顶部
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

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isLoading) return;

        const messageContent = inputValue.trim();
        const newUserMsg: Message = { 
            role: 'user', 
            content: messageContent,
            id: `msg-${Date.now()}`,
            referencedFiles: [...referencedFiles]
        };
        
        console.log('Sending message:', messageContent);
        setMessages(prev => [...prev, newUserMsg]);
        setInputValue('');
        setReferencedFiles([]);
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

        try {
            // 检查 aiService 是否存在
            if (!plugin.aiService) {
                throw new Error("AI Service 未初始化。请检查插件设置。");
            }

            console.log('Calling streamChat with history length:', chatHistory.length);
            const stream = plugin.aiService.streamChat(chatHistory, messageContent, referencedFiles);

            let currentResponse = "";
            let responseId = `msg-${Date.now()}-response`;
            let hasReceivedAnyChunk = false;
            let updateTimer: NodeJS.Timeout | null = null;
            let pendingUpdate: string | null = null;

            // 批量更新函数，减少渲染次数
            const scheduleUpdate = (content: string) => {
                pendingUpdate = content;
                if (updateTimer) {
                    clearTimeout(updateTimer);
                }
                updateTimer = setTimeout(() => {
                    if (pendingUpdate !== null) {
                        const contentToUpdate = pendingUpdate; // Capture the current value locally
                        setMessages(prev => {
                            const existingIndex = prev.findIndex(m => m.id === responseId);
                            if (existingIndex !== -1) {
                                const newMessages = [...prev];
                                newMessages[existingIndex] = { ...newMessages[existingIndex], content: contentToUpdate } as Message;
                                return newMessages;
                            } else {
                                // Message doesn't exist yet, create it
                                return [...prev, { 
                                    role: 'model', 
                                    content: contentToUpdate, 
                                    type: 'text',
                                    id: responseId
                                }];
                            }
                        });
                        pendingUpdate = null;
                    }
                }, 50); // 每50ms更新一次，平衡流畅度和性能
            };

            for await (const chunk of stream) {
                hasReceivedAnyChunk = true;
                console.log('Received chunk:', chunk.type, chunk);
                
                if (chunk.type === 'text') {
                    currentResponse += chunk.content;
                    scheduleUpdate(currentResponse);
                } else if (chunk.type === 'thinking') {
                    // 立即更新thinking消息，不需要批量处理
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
                        id: `msg-${Date.now()}-tool`
                    }]);
                } else if (chunk.type === 'error') {
                    // 清除待处理的更新
                    if (updateTimer) {
                        clearTimeout(updateTimer);
                        updateTimer = null;
                    }
                    console.error('Error chunk received:', chunk.content);
                    setMessages(prev => [...prev, { 
                        role: 'error', 
                        content: chunk.content,
                        id: `msg-${Date.now()}-error`
                    }]);
                    setIsLoading(false);
                    return; // 遇到错误时提前返回
                } else if (chunk.type === 'history_update') {
                    const updatedHistory = chunk.history;
                    setChatHistory(updatedHistory);
                    // 注意：session的更新会通过useEffect自动同步，这里不需要手动更新
                }
            }

            // 确保最终内容被更新（清除定时器并立即更新）
            if (updateTimer) {
                clearTimeout(updateTimer);
            }
            if (pendingUpdate !== null || currentResponse) {
                const finalContent = pendingUpdate || currentResponse; // Capture final content
                setMessages(prev => {
                    if (!finalContent) return prev; // 如果内容为空，不操作
                    
                    const existingIndex = prev.findIndex(m => m.id === responseId);
                    if (existingIndex !== -1) {
                        const newMessages = [...prev];
                        newMessages[existingIndex] = { ...newMessages[existingIndex], content: finalContent } as Message;
                        return newMessages;
                    } else {
                         return [...prev, { 
                            role: 'model', 
                            content: finalContent, 
                            type: 'text',
                            id: responseId
                        }];
                    }
                });
            }

            // 如果没有收到任何响应，显示提示
            if (!hasReceivedAnyChunk) {
                console.warn('No chunks received from stream');
                setMessages(prev => [...prev, { 
                    role: 'error', 
                    content: "未收到模型响应。请检查 API Key 设置和网络连接。",
                    id: `msg-${Date.now()}-error`
                }]);
            }

            // 更新session的chatHistory和消息（在finally中更新，确保所有消息都已添加）
            // 注意：这里使用setMessages的回调来获取最新状态
        } catch (e: any) {
            console.error('Error in handleSendMessage:', e);
            const errorMessage = e?.message || e?.toString() || "发生未知错误。";
            setMessages(prev => [...prev, { 
                role: 'error', 
                content: `错误: ${errorMessage}`,
                id: `msg-${Date.now()}-error`
            }]);
        } finally {
            setIsLoading(false);
            // 确保最终状态被保存（通过 useEffect 自动触发保存）
        }
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
        setSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(newSession.id);
        setMessages([]);
        setChatHistory([]);
        setReferencedFiles([]);
    };

    const deleteSession = (sessionId: string) => {
        if (sessions.length <= 1) {
            // 如果只有一个session，创建一个新的
            createNewSession();
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

    const currentSession = sessions.find(s => s.id === currentSessionId);

    return (
        <div className="voyaru-chat-container" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%',
            backgroundColor: 'var(--background-primary)'
        }}>
            {/* Session Tabs */}
            <div className="voyaru-session-tabs" style={{ 
                display: 'flex', 
                gap: '6px', 
                padding: '10px 12px', 
                borderBottom: '1px solid var(--background-modifier-border)',
                overflowX: 'auto',
                flexShrink: 0,
                backgroundColor: 'var(--background-secondary-alt)'
            }}>
                {sessions.map(session => (
                    <div
                        key={session.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            backgroundColor: currentSessionId === session.id 
                                ? 'var(--interactive-accent)' 
                                : 'var(--background-primary)',
                            color: currentSessionId === session.id 
                                ? 'var(--text-on-accent)' 
                                : 'var(--text-normal)',
                            cursor: 'pointer',
                            fontSize: '13px',
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
                        onMouseEnter={(e) => {
                            if (currentSessionId !== session.id) {
                                e.currentTarget.style.backgroundColor = 'var(--background-modifier-hover)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (currentSessionId !== session.id) {
                                e.currentTarget.style.backgroundColor = 'var(--background-primary)';
                            }
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
                                    fontSize: '13px',
                                    width: '120px',
                                    backgroundColor: 'var(--background-primary)',
                                    color: 'var(--text-normal)'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.name}</span>
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteSession(session.id);
                                    }}
                                    style={{
                                        cursor: 'pointer',
                                        padding: '2px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: 0.7,
                                        transition: 'opacity 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.opacity = '1';
                                        e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.opacity = '0.7';
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                >
                                    <CloseIcon size={14} />
                                </div>
                            </>
                        )}
                    </div>
                ))}
                <button
                    onClick={createNewSession}
                    style={{
                        padding: '6px',
                        borderRadius: '8px',
                        border: '1px solid var(--background-modifier-border)',
                        backgroundColor: 'var(--background-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        color: 'var(--text-normal)'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--background-modifier-hover)';
                        e.currentTarget.style.borderColor = 'var(--interactive-accent)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--background-primary)';
                        e.currentTarget.style.borderColor = 'var(--background-modifier-border)';
                    }}
                >
                    <PlusIcon size={16} />
                </button>
            </div>

            {/* Messages */}
            <div className="voyaru-messages" style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '16px',
                backgroundColor: 'var(--background-primary)'
            }}>
                {messages.map((m, i) => (
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
                            borderRadius: '8px',
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
                        
                        {/* Message Content */}
                        <div style={{
                            flex: 1,
                            minWidth: 0
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginBottom: '6px'
                            }}>
                                <span style={{
                                    fontWeight: 600,
                                    fontSize: '14px',
                                    color: m.role === 'error' ? 'var(--text-error)' : 'var(--text-normal)'
                                }}>
                                    {m.role === 'user' ? '你' : m.role === 'error' ? '错误' : 'Voyaru'}
                                </span>
                                {m.type === 'thinking' && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        color: 'var(--text-muted)',
                                        fontSize: '12px'
                                    }}>
                                        <ThinkingIcon size={14} />
                                        <span>思考中</span>
                                    </div>
                                )}
                                {m.type === 'tool_result' && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        color: 'var(--text-muted)',
                                        fontSize: '12px'
                                    }}>
                                        <ToolIcon size={14} />
                                        <span>工具执行</span>
                                    </div>
                                )}
                            </div>
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
                                fontSize: '14px',
                                lineHeight: '1.6'
                            }}>
                                {m.content}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Referenced Files */}
            {referencedFiles.length > 0 && (
                <div className="voyaru-context-files" style={{ 
                    padding: '10px 16px', 
                    borderTop: '1px solid var(--background-modifier-border)',
                    backgroundColor: 'var(--background-secondary-alt)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    alignItems: 'center'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        marginRight: '4px'
                    }}>
                        <FileIcon size={14} />
                        <span>引用文件:</span>
                    </div>
                    {referencedFiles.map(f => {
                        const filePath = f.split(':')[0];
                        const lineInfo = f.includes(':') ? f.split(':')[1] : null;
                        return (
                            <div
                                key={f}
                                style={{ 
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'var(--background-primary)', 
                                    padding: '4px 10px', 
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    border: '1px solid var(--background-modifier-border)',
                                    fontSize: '12px',
                                    transition: 'all 0.2s ease'
                                }}
                                onClick={async () => {
                                    const file = plugin.app.vault.getAbstractFileByPath(filePath);
                                    if (file) {
                                        await plugin.app.workspace.openLinkText(filePath, '', true);
                                    }
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'var(--background-modifier-hover)';
                                    e.currentTarget.style.borderColor = 'var(--interactive-accent)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'var(--background-primary)';
                                    e.currentTarget.style.borderColor = 'var(--background-modifier-border)';
                                }}
                            >
                                <FileIcon size={12} />
                                <span>{filePath}</span>
                                {lineInfo && <span style={{ color: 'var(--text-muted)' }}>({lineInfo})</span>}
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setReferencedFiles(prev => prev.filter(x => x !== f));
                                    }}
                                    style={{
                                        padding: '2px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        opacity: 0.6,
                                        transition: 'opacity 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.opacity = '1';
                                        e.currentTarget.style.backgroundColor = 'var(--background-modifier-border)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.opacity = '0.6';
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                >
                                    <CloseIcon size={12} />
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
                {/* Tools Popup */}
                {showTools && filteredTools.length > 0 && (
                    <div 
                        ref={popupRef}
                        className="voyaru-popup" 
                        style={{ 
                            position: 'absolute', 
                            bottom: '100%', 
                            left: 0, 
                            background: 'var(--background-primary)', 
                            border: '1px solid var(--background-modifier-border)',
                            borderRadius: '12px',
                            maxHeight: '240px', 
                            overflowY: 'auto', 
                            width: '100%', 
                            zIndex: 1000,
                            marginBottom: '8px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
                        }}
                    >
                        {filteredTools.map((t, idx) => (
                            <div 
                                key={t.name} 
                                onClick={() => insertTool(t)} 
                                style={{ 
                                    padding: '10px 14px', 
                                    cursor: 'pointer', 
                                    borderBottom: idx < filteredTools.length - 1 ? '1px solid var(--background-modifier-border)' : 'none',
                                    backgroundColor: selectedIndex === idx ? 'var(--background-modifier-hover)' : 'transparent',
                                    borderRadius: idx === 0 ? '12px 12px 0 0' : idx === filteredTools.length - 1 ? '0 0 12px 12px' : '0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'background-color 0.15s ease'
                                }}
                            >
                                <ToolIcon size={16} />
                                <span style={{ fontWeight: 500 }}>{t.name}</span>
                            </div>
                        ))}
                    </div>
                )}
                
                {/* Files Popup */}
                {showFiles && filteredFiles.length > 0 && (
                    <div 
                        ref={popupRef}
                        className="voyaru-popup" 
                        style={{ 
                            position: 'absolute', 
                            bottom: '100%', 
                            left: 0, 
                            background: 'var(--background-primary)', 
                            border: '1px solid var(--background-modifier-border)',
                            borderRadius: '12px',
                            maxHeight: '240px', 
                            overflowY: 'auto', 
                            width: '100%', 
                            zIndex: 1000,
                            marginBottom: '8px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
                        }}
                    >
                        {filteredFiles.map((f, idx) => (
                            <div 
                                key={f} 
                                onClick={() => insertFile(f)} 
                                style={{ 
                                    padding: '10px 14px', 
                                    cursor: 'pointer', 
                                    borderBottom: idx < filteredFiles.length - 1 ? '1px solid var(--background-modifier-border)' : 'none',
                                    backgroundColor: selectedIndex === idx ? 'var(--background-modifier-hover)' : 'transparent',
                                    borderRadius: idx === 0 ? '12px 12px 0 0' : idx === filteredFiles.length - 1 ? '0 0 12px 12px' : '0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'background-color 0.15s ease'
                                }}
                            >
                                <FileIcon size={16} />
                                <span>{f}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-end'
                }}>
                    <textarea 
                        ref={inputRef}
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="向 Voyaru 提问... (#工具, @文件)"
                        style={{ 
                            flex: 1,
                            minHeight: '60px', 
                            maxHeight: '200px',
                            resize: 'vertical',
                            padding: '12px 16px',
                            borderRadius: '12px',
                            border: '1px solid var(--background-modifier-border)',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                            backgroundColor: 'var(--background-primary)',
                            color: 'var(--text-normal)',
                            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                            lineHeight: '1.5'
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = 'var(--interactive-accent)';
                            e.target.style.boxShadow = '0 0 0 2px rgba(var(--interactive-accent-rgb), 0.1)';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = 'var(--background-modifier-border)';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                    <button 
                        onClick={handleSendMessage} 
                        disabled={isLoading} 
                        style={{ 
                            padding: '12px 20px',
                            borderRadius: '12px',
                            border: 'none',
                            backgroundColor: isLoading 
                                ? 'var(--background-modifier-border)' 
                                : 'var(--interactive-accent)',
                            color: isLoading 
                                ? 'var(--text-muted)' 
                                : 'var(--text-on-accent)',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            minWidth: '48px',
                            height: '48px'
                        }}
                        onMouseEnter={(e) => {
                            if (!isLoading) {
                                e.currentTarget.style.transform = 'scale(1.05)';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(var(--interactive-accent-rgb), 0.3)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    >
                        {isLoading ? <StopIcon size={20} /> : <SendIcon size={20} />}
                    </button>
                </div>
                <div style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textAlign: 'center'
                }}>
                    Enter 发送, Shift+Enter 换行, Ctrl+Enter 强制发送
                </div>
            </div>
        </div>
    );
};
