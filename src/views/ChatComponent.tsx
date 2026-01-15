import * as React from 'react';
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { AIService } from '../services/ai_service';
import { FSService } from '../services/fs_service';
import { SendIcon, StopIcon, PlusIcon, CloseIcon, CopyIcon, FileIcon, EditIcon, RefreshIcon, SaveIcon, UserIcon, BotIcon, ThinkingIcon, ToolIcon, TrashIcon, CheckIcon, TextSizeIcon, LogIcon, ExportIcon, ArrowUpIcon, MentionIcon, ChevronDownIcon, MoreHorizontalIcon, ClockIcon } from '../components/Icons';
import { Message, Session, MODELS, QueryHistoryItem } from '../settings';
import { Notice, Menu, TFile, MarkdownView, Platform } from 'obsidian';
import { ExportModal } from '../modals/ExportModal';
import { LogModal } from '../modals/LogModal';
import { HistoryPromptModal } from '../modals/HistoryPromptModal';
import { ToolCallItem } from '../components/ToolCallItem';
import { TypewriterText } from '../components/TypewriterText';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { ErrorMessage } from '../components/ErrorMessage';
import { Toast } from '../components/Toast';
import { WaitingMessage } from '../components/WaitingMessage';

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
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>(plugin.settings.model);
    const [showModelSelector, setShowModelSelector] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState<string>('');
    const [editingFiles, setEditingFiles] = useState<string[]>([]);
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [clearHistoryConfirm, setClearHistoryConfirm] = useState(false);
    const [collapsedQueries, setCollapsedQueries] = useState<Set<string>>(new Set());
    const [editingLastQueryId, setEditingLastQueryId] = useState<string | null>(null); // 标记正在编辑最后一条query
    const [textareaHeight, setTextareaHeight] = useState<number>(40); // 控制textarea的动态高度
    const [isComposing, setIsComposing] = useState(false); // 跟踪输入法状态
    const [streamingTextMessageId, setStreamingTextMessageId] = useState<string | null>(null); // 追踪正在流式输出的文本消息ID
    const [showWaitingMessage, setShowWaitingMessage] = useState(false); // 等待消息状态（简化版）
    const waitingMessageClearedRef = useRef(false); // 跟踪等待消息是否已被清除（只在收到 text chunk 时清除）

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const modelSelectorRef = useRef<HTMLDivElement>(null);
    const settingsMenuRef = useRef<HTMLDivElement>(null);
    const editingRef = useRef<HTMLDivElement>(null);
    const lastQaSectionRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const sessionsRef = useRef<Session[]>([]);
    const lastUserMessageIdRef = useRef<string | null>(null);
    const prevSessionIdRef = useRef<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const needScrollToQueryRef = useRef<boolean>(false); // 标记是否需要立即吸顶
    const lastScrollToTopTimestampRef = useRef<number>(0); // 记录最后一次吸顶的时间戳
    // 滚动控制：避免流式输出时强制"尾部贴底"导致视口下坠
    const shouldAutoFollowRef = useRef<boolean>(true); // 用户未主动滚走时才自动跟随
    const isProgrammaticScrollRef = useRef<boolean>(false); // 标记程序滚动，避免误判为用户滚动
    const userMessageRefs = useRef<Map<string, HTMLDivElement>>(new Map()); // 跟踪用户消息的DOM元素
    
    const [bottomSpacerHeight, setBottomSpacerHeight] = useState<string>('50vh');

    // 点击外部关闭模型选择器和编辑框，以及取消删除/清空确认状态
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            
            if (modelSelectorRef.current && !modelSelectorRef.current.contains(target as Node)) {
                setShowModelSelector(false);
            }
            if (settingsMenuRef.current && !settingsMenuRef.current.contains(target as Node)) {
                setShowSettingsMenu(false);
            }
            if (editingMessageId && editingRef.current && !editingRef.current.contains(target as Node)) {
                setEditingMessageId(null);
                setEditingContent('');
                setEditingFiles([]);
            }
            
            // 检查是否点击了删除Session按钮
            if (!target.closest('.voyaru-delete-session-btn')) {
                setDeletingSessionId(null);
            }
            
            // 检查是否点击了清空历史按钮
            if (!target.closest('.voyaru-clear-history-btn')) {
                setClearHistoryConfirm(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [editingMessageId]);

    // 调试：追踪 showWaitingMessage 状态变化
    useEffect(() => {
        console.log('[WaitingMessage] State changed:', showWaitingMessage);
        console.log('[WaitingMessage] Timestamp:', Date.now());
    }, [showWaitingMessage]);

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

    // 自动折叠超过对话窗口一半高度的用户query
    useEffect(() => {
        if (!messagesContainerRef.current) return;
        
        const containerHeight = messagesContainerRef.current.clientHeight;
        const halfHeight = containerHeight / 2;
        
        // 延迟检查，确保DOM已经渲染
        const timer = setTimeout(() => {
            const newCollapsed = new Set(collapsedQueries);
            let hasChanges = false;
            
            messages.forEach((m) => {
                if (m.role === 'user' && m.id) {
                    const element = userMessageRefs.current.get(m.id);
                    if (element) {
                        const messageHeight = element.scrollHeight;
                        // 如果消息高度超过一半，且未被手动展开过，则自动折叠
                        if (messageHeight > halfHeight && !collapsedQueries.has(m.id)) {
                            newCollapsed.add(m.id);
                            hasChanges = true;
                        }
                    }
                }
            });
            
            if (hasChanges) {
                setCollapsedQueries(newCollapsed);
            }
        }, 100);
        
        return () => clearTimeout(timer);
    }, [messages, messagesContainerRef.current?.clientHeight]);

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

    const setScrollTopSafely = (container: HTMLElement, nextTop: number) => {
        isProgrammaticScrollRef.current = true;
        container.scrollTop = nextTop;
        requestAnimationFrame(() => {
            isProgrammaticScrollRef.current = false;
        });
    };

    // 监听用户滚动：流式输出时，如果用户主动离开底部，则停止自动跟随
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        const onScroll = () => {
            if (isProgrammaticScrollRef.current) return;

            const { scrollTop, scrollHeight, clientHeight } = container;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px threshold
            shouldAutoFollowRef.current = isAtBottom;
        };

        container.addEventListener('scroll', onScroll, { passive: true });
        return () => container.removeEventListener('scroll', onScroll as EventListener);
    }, [isLoading]);

    // 发送后"立即吸顶"：用 useLayoutEffect 确保 React 已把新消息渲染进 DOM
    // 需求1：发送query之后，query应该立即被滚动至聊天窗口顶端
    useLayoutEffect(() => {
        console.log('[吸顶调试] useLayoutEffect触发', {
            needScroll: needScrollToQueryRef.current,
            lastUserId: lastUserMessageIdRef.current,
            messagesLength: messages.length,
            timestamp: Date.now()
        });

        if (!needScrollToQueryRef.current) return undefined;

        const container = messagesContainerRef.current;
        const id = lastUserMessageIdRef.current;
        if (!container || !id) {
            console.warn('[吸顶调试] 容器或ID缺失', { container: !!container, id });
            return undefined;
        }

        // 执行滚动到顶部的逻辑
        const performScrollToTop = () => {
            console.log('[吸顶调试] 尝试滚动到顶部');

            const el = document.getElementById(id);
            console.log('[吸顶调试] 查找元素', { found: !!el, id });
            if (!el) return false;

            const section = el.closest('.voyaru-qa-section') as HTMLElement | null;
            console.log('[吸顶调试] 查找section', { found: !!section });
            if (!section) return false;

            // 立即将新消息滚动到容器顶部（不使用动画，确保瞬时响应）
            // 使用 getBoundingClientRect 获取精确位置
            const sectionRect = section.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // 计算section相对于container内部滚动区域的实际偏移
            // section当前相对于viewport的top - container相对于viewport的top + 当前滚动位置
            const targetScrollTop = sectionRect.top - containerRect.top + container.scrollTop;

            console.log('[吸顶调试] 执行滚动', {
                from: container.scrollTop,
                to: targetScrollTop,
                sectionTop: sectionRect.top,
                containerTop: containerRect.top,
                sectionHeight: section.offsetHeight,
                containerHeight: container.clientHeight
            });

            // 计算并设置 spacer：仅用于"内容不足一屏时"的美观填充
            const containerHeight = container.clientHeight;
            const sectionHeight = section.offsetHeight;

            if (sectionHeight < containerHeight) {
                // 需要足够的空白使query可以滚动到顶部
                let neededSpacer = containerHeight - sectionHeight;
                neededSpacer = Math.max(20, neededSpacer);
                console.log('[吸顶调试] 设置spacer', { neededSpacer });
                setBottomSpacerHeight(`${neededSpacer}px`);
            } else {
                // 内容已经超过一屏，只需要少量底部空间
                setBottomSpacerHeight('20px');
            }

            // 使用requestAnimationFrame确保spacer的setState已生效后再滚动
            requestAnimationFrame(() => {
                // 重新获取位置（因为spacer变化可能影响布局）
                const updatedSectionRect = section.getBoundingClientRect();
                const updatedContainerRect = container.getBoundingClientRect();
                const updatedTargetScrollTop = updatedSectionRect.top - updatedContainerRect.top + container.scrollTop;

                console.log('[吸顶调试] spacer更新后重新计算滚动位置', {
                    oldTarget: targetScrollTop,
                    newTarget: updatedTargetScrollTop,
                    delta: updatedTargetScrollTop - targetScrollTop
                });

                // 执行滚动
                isProgrammaticScrollRef.current = true;
                container.scrollTop = updatedTargetScrollTop;

                // 在下一帧重置程序滚动标志
                requestAnimationFrame(() => {
                    isProgrammaticScrollRef.current = false;
                });

                // 添加额外的校准：在200ms后再次检查并校准（应对isLoading变化导致的spacer重算）
                setTimeout(() => {
                    const finalSectionRect = section.getBoundingClientRect();
                    const finalContainerRect = container.getBoundingClientRect();
                    const finalTargetScrollTop = finalSectionRect.top - finalContainerRect.top + container.scrollTop;

                    // 如果偏移超过2px，重新校准
                    if (Math.abs(finalTargetScrollTop) > 2) {
                        console.log('[吸顶调试] 最终校准滚动位置', {
                            currentOffset: finalTargetScrollTop,
                            needAdjust: true
                        });
                        isProgrammaticScrollRef.current = true;
                        container.scrollTop = container.scrollTop + finalTargetScrollTop;
                        requestAnimationFrame(() => {
                            isProgrammaticScrollRef.current = false;
                        });
                    }
                }, 250); // 250ms后校准，确保isLoading变化和spacer重算都已完成
            });

            needScrollToQueryRef.current = false;
            lastScrollToTopTimestampRef.current = Date.now(); // 记录吸顶时间
            console.log('[吸顶调试] ✅ 滚动成功完成（等待spacer生效）');
            return true;
        };

        // 立即尝试滚动
        const success = performScrollToTop();

        // 如果失败（DOM还没渲染），使用 requestAnimationFrame 重试
        if (!success) {
            console.log('[吸顶调试] 首次失败，requestAnimationFrame重试');
            const rafId = requestAnimationFrame(() => {
                const retrySuccess = performScrollToTop();
                if (!retrySuccess) {
                    console.error('[吸顶调试] ❌ 重试后仍然失败！');
                }
            });
            return () => cancelAnimationFrame(rafId);
        }

        // 如果成功，返回空的 cleanup 函数
        return undefined;
    }, [messages]); // 改为监听messages对象本身，而不是length

    // 流式输出的智能滚动：
    // 原则：尽可能多地展示answer
    // 1. 如果answer长度未超出聊天窗口，保持query吸顶，不向上滚动
    // 2. 如果answer长度超出聊天窗口，滚动到足以展示query尾部（四个按钮），不再往上滚动
    // 3. 用户手动滚动后，停止自动跟随
    const maybeAutoScrollDuringStreaming = (section: HTMLElement | null) => {
        if (!isLoading) return;
        const container = messagesContainerRef.current;
        if (!container || !messagesEndRef.current || !section) return;

        // 如果用户手动滚走了，不自动跟随
        if (!shouldAutoFollowRef.current) return;

        // 如果刚完成吸顶（150ms冷却期），暂不自动滚动，避免重复滚动
        const timeSinceLastScrollToTop = Date.now() - lastScrollToTopTimestampRef.current;
        if (timeSinceLastScrollToTop < 150) {
            console.log('[吸顶调试] 冷却期内，跳过流式输出滚动');
            return;
        }

        const containerHeight = container.clientHeight;
        const sectionHeight = section.offsetHeight;
        
        // 获取query header的高度（包含按钮）
        const header = section.querySelector('.voyaru-qa-header') as HTMLElement | null;
        const headerHeight = header?.offsetHeight || 0;

        // 使用 getBoundingClientRect 获取精确位置
        const sectionRect = section.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const sectionTopRelativeToContainer = sectionRect.top - containerRect.top + container.scrollTop;

        // 情况1：answer长度未超出聊天窗口
        // 保持query吸顶，answer完整显示
        if (sectionHeight <= containerHeight) {
            const targetScrollTop = sectionTopRelativeToContainer;
            const delta = Math.abs(container.scrollTop - targetScrollTop);
            if (delta > 2) {
                setScrollTopSafely(container, targetScrollTop);
            }
            return;
        }

        // 情况2：answer长度超出聊天窗口
        // 滚动到能看到最新内容，但不能让query完全滚出视野
        // 确保query的底部（包含四个按钮）始终可见
        const maxScrollTop = sectionTopRelativeToContainer + sectionHeight - containerHeight;
        const minScrollTop = sectionTopRelativeToContainer; // query顶部
        const idealScrollTop = sectionTopRelativeToContainer + headerHeight - 60; // 保留60px显示query底部按钮

        // 计算当前应该滚动到的位置
        // 优先显示最新内容，但不超过idealScrollTop（保证按钮可见）
        let targetScrollTop = Math.min(maxScrollTop, idealScrollTop);
        
        // 确保不会滚动到query顶部之上
        targetScrollTop = Math.max(minScrollTop, targetScrollTop);

        // 只在需要时滚动
        const currentScrollTop = container.scrollTop;
        if (Math.abs(currentScrollTop - targetScrollTop) > 5) {
            isProgrammaticScrollRef.current = true;
            container.scrollTop = targetScrollTop;
            requestAnimationFrame(() => {
                isProgrammaticScrollRef.current = false;
            });
        }
    };

    // 通用的滚动检查触发函数
    const triggerScrollCheck = () => {
        requestAnimationFrame(() => {
            const section = lastQaSectionRef.current;
            const container = messagesContainerRef.current;
            if (section && container) {
                maybeAutoScrollDuringStreaming(section);
            }
        });
    };

    // 动态计算底部空间高度
    // 原则3：如果长度不够填充聊天窗口，则在query尾部和聊天窗口底部之间填入一段空白，
    // 以保证来回滚动时，可以将query滚动到聊天窗口顶部
    useEffect(() => {
        if (messages.length === 0) {
            setBottomSpacerHeight('0px');
            return;
        }

        const calculateSpacer = () => {
            if (lastQaSectionRef.current && messagesContainerRef.current) {
                const sectionHeight = lastQaSectionRef.current.offsetHeight;
                const containerHeight = messagesContainerRef.current.clientHeight;
                const headerHeight = lastQaSectionRef.current.querySelector('.voyaru-qa-header')?.clientHeight || 0;
                
                // 核心逻辑：
                // 1. 如果section高度 < 容器高度：需要添加spacer，使得用户可以将query滚动到顶部
                //    spacer高度 = 容器高度 - section高度，这样滚动到底部时，query刚好在顶部
                // 2. 如果section高度 >= 容器高度：只需要少量spacer作为底部呼吸空间
                
                let spacerHeight;
                if (sectionHeight < containerHeight) {
                    // 内容不足一屏，添加足够的空白使query可以滚动到顶部
                    spacerHeight = containerHeight - sectionHeight;
                    // 确保至少有20px的底部空间
                    spacerHeight = Math.max(20, spacerHeight);
                } else {
                    // 内容超过一屏，只需要少量底部呼吸空间
                    spacerHeight = 20;
                }

                setBottomSpacerHeight(`${spacerHeight}px`);
            }
        };

        // 立即计算一次
        calculateSpacer();

        // 延迟计算，确保DOM更新（处理流式输出时的高度变化）
        const timer = setTimeout(calculateSpacer, 50);
        
        // 再次延迟计算，确保动画和渲染完成
        const timer2 = setTimeout(calculateSpacer, 200);

        return () => {
            clearTimeout(timer);
            clearTimeout(timer2);
        };
    }, [messages, isLoading]);

    // 对话完成后滚动到底部
    useEffect(() => {
        if (messages.length === 0) return;
        
        // 如果正在等待滚动到query顶部，不要滚动到底部
        if (needScrollToQueryRef.current) return;
        
        // 只在非加载状态（对话完成后）滚动到底部
        if (!isLoading) {
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
        const input = e.target;
        
        // 检查是否正在处理占位符
        if ((input as any)._placeholders && (input as any)._placeholders.length > 0) {
            const placeholders = (input as any)._placeholders;
            const lengthDiff = val.length - inputValue.length;
            
            // 更新所有占位符的位置（基于文本长度变化）
            if (lengthDiff !== 0) {
                // 找到受影响的位置（光标位置之前）
                const changePos = cursorPos - (lengthDiff > 0 ? lengthDiff : 0);
                
                const updatedPlaceholders = placeholders.map((ph: any) => {
                    // 如果占位符在变化位置之后，需要更新其位置
                    if (ph.start >= changePos) {
                        return {
                            ...ph,
                            start: ph.start + lengthDiff,
                            end: ph.end + lengthDiff
                        };
                    }
                    return ph;
                });
                
                (input as any)._placeholders = updatedPlaceholders;
            }
        }
        
        setInputValue(val);
        
        // 在React更新DOM后计算并调整高度
        setTimeout(() => {
            if (input) {
                // 临时设置为1px以获取内容的真实高度
                input.style.height = '1px';
                const scrollHeight = input.scrollHeight;

                // 计算最大高度（对话栏的一半）
                const containerHeight = messagesContainerRef.current?.clientHeight || 600;
                const maxHeight = Math.floor(containerHeight / 2);

                // 计算新高度，不超过最大高度，不小于最小高度
                const newHeight = Math.max(40, Math.min(scrollHeight, maxHeight));

                // 直接应用新高度到DOM（避免闪烁）
                input.style.height = `${newHeight}px`;

                // 如果高度发生变化，触发滚动检查
                if (newHeight !== textareaHeight) {
                    setTextareaHeight(newHeight);
                    triggerScrollCheck();
                }
            }
        }, 0);

        const trigger = detectTrigger(val, cursorPos);
        
        if (trigger.type === '#') {
            const tools = plugin.settings.tools.filter((t: any) => 
                t.name.toLowerCase().includes(trigger.query.toLowerCase())
            );
            console.log(`Matching tools: found ${tools.length} from ${plugin.settings.tools.length} total tools`);
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

    // 加载所有文件（每次显示时重新加载，确保能搜索到新创建的文件）
    useEffect(() => {
        if (showFiles) {
            const load = async () => {
                try {
                    const f1 = await plugin.fsService.listFilesRecursiveWithMtime(plugin.settings.folders.chapters);
                    const f2 = await plugin.fsService.listFilesRecursiveWithMtime(plugin.settings.folders.characters);
                    const f3 = await plugin.fsService.listFilesRecursiveWithMtime(plugin.settings.folders.outlines);
                    const f4 = await plugin.fsService.listFilesRecursiveWithMtime(plugin.settings.folders.notes);
                    const f5 = await plugin.fsService.listFilesRecursiveWithMtime(plugin.settings.folders.knowledge);
                    const all = [...f1, ...f2, ...f3, ...f4, ...f5];
                    
                    // 按修改时间排序（最新的在前）
                    all.sort((a, b) => b.mtime - a.mtime);
                    
                    // 提取路径
                    const sortedPaths = all.map(f => f.path);
                    
                    // 去重（保持排序）
                    const uniqueFiles = Array.from(new Set(sortedPaths));
                    setAllFiles(uniqueFiles);
                    setIsFilesLoaded(true);
                    console.log(`📁 Loaded ${uniqueFiles.length} files from 5 folders (sorted by modification time)`);
                } catch (e) {
                    console.error('Failed to load files:', e);
                }
            };
            load();
        }
    }, [showFiles]); // 每次 showFiles 变为 true 时都重新加载

    // 过滤文件列表（完全在内存中进行，极快）
    useEffect(() => {
        if (showFiles && allFiles.length > 0) {
            const cursorPos = inputRef.current?.selectionStart || inputValue.length;
            const trigger = detectTrigger(inputValue, cursorPos);
            
            if (trigger.type === '@') {
                const query = trigger.query.toLowerCase();
                const maxFiles = plugin.settings.maxFilesInPopup || 10;
                // 使用用户配置的最大显示数量，文件已经按修改时间排序
                const matches = allFiles.filter(f => 
                    f.toLowerCase().includes(query)
                ).slice(0, maxFiles);
                
                console.log(`Matching files for query "${query}": found ${matches.length} matches (showing up to ${maxFiles})`);
                
                if (matches.length === 0 && query.length > 0) {
                     // If explicit query matches nothing, show empty
                     setFilteredFiles([]);
                } else {
                     setFilteredFiles(matches);
                }
            }
        }
    }, [inputValue, showFiles, allFiles]);

    // 键盘导航处理
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Tab 键处理：在占位符之间跳转
        if (e.key === 'Tab' && !showTools && !showFiles) {
            const input = inputRef.current;
            if (input && (input as any)._placeholders && (input as any)._placeholders.length > 0) {
                e.preventDefault();
                
                const placeholders = (input as any)._placeholders;
                const currentIndex = (input as any)._currentPlaceholderIndex ?? 0;
                
                // 计算下一个占位符的索引
                let nextIndex: number;
                if (e.shiftKey) {
                    // Shift+Tab: 向前
                    nextIndex = currentIndex - 1;
                    if (nextIndex < 0) {
                        nextIndex = placeholders.length - 1;
                    }
                } else {
                    // Tab: 向后
                    nextIndex = currentIndex + 1;
                    if (nextIndex >= placeholders.length) {
                        nextIndex = 0;
                    }
                }
                
                const nextPlaceholder = placeholders[nextIndex];
                
                // 选中下一个占位符
                if (nextPlaceholder) {
                    input.setSelectionRange(nextPlaceholder.start, nextPlaceholder.end);
                    (input as any)._currentPlaceholderIndex = nextIndex;
                }
                return;
            }
        }
        
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

        // Escape键取消编辑最后一条query（如果正在编辑）
        if (e.key === 'Escape' && editingLastQueryId) {
            e.preventDefault();
            setEditingLastQueryId(null);
            setInputValue('');
            setTextareaHeight(40); // 重置高度
            setReferencedFiles([]);
            new Notice('已取消编辑');
            return;
        }

        // 根据设置决定发送方式
        const sendWithShiftEnter = plugin.settings.sendWithShiftEnter || false;
        
        if (sendWithShiftEnter) {
            // Shift+Enter 发送，Enter 换行
            if (e.key === 'Enter' && e.shiftKey && !isComposing) {
                e.preventDefault();
                handleSendMessage();
            }
            // 普通 Enter 保持默认行为（换行）
        } else {
            // Enter 发送，Shift+Enter 换行（默认模式）
            if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                e.preventDefault();
                handleSendMessage();
            }
            // Shift+Enter 保持默认行为（换行）
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
        console.log('[WaitingMessage DEBUG] ===== handleSendMessage called =====');
        console.log('[WaitingMessage DEBUG] plugin.settings.waitingMessageDelay:', plugin.settings.waitingMessageDelay);
        console.log('[WaitingMessage DEBUG] plugin.settings.waitingMessages:', plugin.settings.waitingMessages);
        const contentToSend = manualContent ?? inputValue;
        if (!contentToSend.trim() || isLoading) {
            console.log('[WaitingMessage DEBUG] Early return: contentToSend=', contentToSend, 'isLoading=', isLoading);
            return;
        }
        console.log('[WaitingMessage DEBUG] Passed early return check, proceeding...');

        const filesToSend = manualFiles ?? referencedFiles;
        let historyToUse = manualHistory ?? chatHistory;

        // 如果正在编辑最后一条query，需要先撤回对应的response和文件修改
        if (editingLastQueryId && !manualContent) {
            const msgIndex = messages.findIndex(m => m.id === editingLastQueryId);
            if (msgIndex !== -1) {
                console.log('Reverting changes from editing last query:', editingLastQueryId);
                
                // 撤回文件修改
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
                
                // 计算截断的历史记录
                const calculatedHistory = [...chatHistory];
                while(calculatedHistory.length > 0) {
                    const last = calculatedHistory.pop();
                    if (last && last.role === 'user') {
                        break;
                    }
                }
                historyToUse = calculatedHistory;
                
                // 移除该消息及其之后的所有消息
                const newMessages = messages.slice(0, msgIndex);
                setMessages(newMessages);
                
                // 更新历史记录
                setChatHistory(calculatedHistory);
            }
            
            // 清除编辑状态
            setEditingLastQueryId(null);
        }

        const messageContent = contentToSend.trim();
        const newUserMsg: Message = { 
            role: 'user', 
            content: messageContent,
            id: `msg-${Date.now()}-${Math.random()}`,
            referencedFiles: [...filesToSend]
        };
        
        // 保存到持久化的queryHistory（独立于session）
        const saveQueryToHistory = async () => {
            const queryHistoryItem: QueryHistoryItem = {
                id: `query-${Date.now()}-${Math.random()}`,
                query: messageContent,
                referencedFiles: [...filesToSend],
                timestamp: Date.now()
            };
            
            // 避免重复添加相同的query
            const existingHistory = plugin.settings.queryHistory || [];
            const isDuplicate = existingHistory.some(
                (item: QueryHistoryItem) => item.query === messageContent
            );
            
            if (!isDuplicate) {
                // 保留最近100条记录
                const updatedHistory = [queryHistoryItem, ...existingHistory].slice(0, 100);
                plugin.settings.queryHistory = updatedHistory;
                await plugin.saveSettings();
            }
        };
        saveQueryToHistory();
        
        lastUserMessageIdRef.current = newUserMsg.id || null;
        needScrollToQueryRef.current = true; // 标记需要立即吸顶
        shouldAutoFollowRef.current = true; // 新一轮对话默认跟随（用户若手动滚动会自动关闭）

        // 在手机端发送后默认折叠query
        if (Platform.isMobile && newUserMsg.id) {
            setCollapsedQueries(prev => new Set(prev).add(newUserMsg.id!));
        }

        console.log('Sending message:', messageContent);
        setMessages(prev => [...prev, newUserMsg]);
        if (!manualContent) {
            setInputValue(''); // Only clear input if not manual (or handled elsewhere)
            setTextareaHeight(40); // 重置高度
        }
        if (!manualFiles) setReferencedFiles([]);
        setIsLoading(true);

        // 重置等待消息清除标志
        waitingMessageClearedRef.current = false;

        // 立即显示等待消息（不使用定时器，避免竞态条件）
        console.log('[WaitingMessage] Showing waiting message immediately');
        console.log('[WaitingMessage] Current timestamp:', Date.now());
        setShowWaitingMessage(true);
        console.log('[WaitingMessage] State update scheduled');

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

            // 单轮对话模式：不发送任何历史记录
            const isSingleTurnMode = plugin.settings.contextMode === 'single';
            const historyForRequest = isSingleTurnMode ? [] : historyToUse;
            
            console.log('Calling streamChat with history length:', historyForRequest.length, isSingleTurnMode ? '(single-turn mode)' : '');
            const stream = plugin.aiService.streamChat(currentSessionId, historyForRequest, messageContent, newUserMsg.referencedFiles, abortControllerRef.current.signal);

            let currentResponseId = `msg-${Date.now()}-response`;
            let currentResponseContent = ""; // Accumulate text for the current message ID
            let hasReceivedAnyChunk = false;
            let waitingMessageStartTime = Date.now(); // 记录等待消息开始显示的时间

            // 设置当前正在流式输出的文本消息ID
            setStreamingTextMessageId(currentResponseId);
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

                        // 流式输出：仅在内容超出视口时才跟随到最新输出（避免“下降”）
                        requestAnimationFrame(() => {
                            const id = lastUserMessageIdRef.current;
                            const el = id ? document.getElementById(id) : null;
                            const section = el?.closest('.voyaru-qa-section') as HTMLElement | null;
                            maybeAutoScrollDuringStreaming(section);
                        });
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

                    // flush 同样遵循“仅溢出才跟随”的规则
                    requestAnimationFrame(() => {
                        const id = lastUserMessageIdRef.current;
                        const el = id ? document.getElementById(id) : null;
                        const section = el?.closest('.voyaru-qa-section') as HTMLElement | null;
                        maybeAutoScrollDuringStreaming(section);
                    });
                }
            };

            for await (const chunk of stream) {
                if (abortControllerRef.current?.signal.aborted) break;

                // Track running tools by their temporary ID
                let runningToolId: string | null = null;
                
                // 第一个 chunk 到达时，确保 query 在顶部
                if (!hasReceivedAnyChunk && lastUserMessageIdRef.current && messagesEndRef.current) {
                    const el = document.getElementById(lastUserMessageIdRef.current);
                    const container = messagesContainerRef.current;
                    if (el && container) {
                        const section = el.closest('.voyaru-qa-section') as HTMLElement;
                        if (section) {
                            // 同样在这里强制计算一次 spacer，防止网络延迟期间 spacer 被重置
                            const containerHeight = container.clientHeight;
                            const sectionHeight = section.offsetHeight;
                            let neededSpacer = containerHeight - sectionHeight - 20; 
                            neededSpacer = Math.max(20, neededSpacer);
                            
                            const spacer = document.getElementById('voyaru-bottom-spacer');
                            if (spacer) {
                                spacer.style.height = `${neededSpacer}px`;
                            }

                            setBottomSpacerHeight(`${neededSpacer}px`);
                            setScrollTopSafely(container, section.offsetTop);
                        }
                    }
                }

                // Accumulate logs
                fullLog.push(chunk);

                console.log('Received chunk:', chunk.type, chunk);

                if (chunk.type === 'text') {
                    // 只在收到第一个 text chunk 时清除等待消息
                    if (!waitingMessageClearedRef.current) {
                        console.log('[WaitingMessage] First text chunk received, clearing waiting message');
                        waitingMessageClearedRef.current = true;

                        // 检查等待消息显示了多久
                        const elapsed = Date.now() - waitingMessageStartTime;
                        const minDisplayTime = 100; // 最小显示时间 100ms

                        if (elapsed < minDisplayTime) {
                            // 如果显示时间太短，延迟清除
                            const remainingTime = minDisplayTime - elapsed;
                            console.log('[WaitingMessage] Delaying clear by', remainingTime, 'ms');
                            setTimeout(() => {
                                console.log('[WaitingMessage] Delayed clear executed');
                                setShowWaitingMessage(false);
                            }, remainingTime);
                        } else {
                            // 显示时间足够长，立即清除
                            setShowWaitingMessage(false);
                        }
                    }

                    // Normal text accumulation
                    currentResponseContent += chunk.content;
                    scheduleUpdate(currentResponseId, currentResponseContent);
                } else {
                    // For ANY non-text chunk (Thinking, Tool Result, Error, etc.)
                    // First, ensure any pending text updates are finalized so the order is preserved
                    flushUpdate();
                    
                    if (chunk.type === 'thinking') {
                        // 过滤掉 "调用工具" 的 thinking 消息，因为工具状态会由 tool_result 展示
                        if (!chunk.content.startsWith('调用工具:')) {
                            const thinkingMsg: Message = {
                                role: 'model',
                                content: chunk.content,
                                type: 'thinking',
                                id: `msg-${Date.now()}-${Math.random()}-thinking`
                            };
                            setMessages(prev => {
                                const newMessages = [...prev, thinkingMsg];
                                // 触发滚动检查
                                triggerScrollCheck();
                                return newMessages;
                            });
                        }
                    } else if (chunk.type === 'tool_call_start') {
                        // 工具调用开始，立即创建 running 状态的消息
                        const toolId = `tool-${chunk.tool}-${Date.now()}-${Math.random()}`;
                        const runningMessage: Message = {
                            role: 'model',
                            type: 'tool_result',
                            tool: chunk.tool,
                            content: '',
                            toolData: {
                                args: chunk.args || {},
                                result: undefined,
                                undoData: undefined
                            },
                            id: toolId,
                            status: 'running',
                            startTime: Date.now(),
                            expanded: false
                        };
                        setMessages(prev => {
                            const newMessages = [...prev, runningMessage];
                            // 触发滚动检查
                            triggerScrollCheck();
                            return newMessages;
                        });
                    } else if (chunk.type === 'tool_result') {
                        // 查找匹配的 running 状态消息
                        setMessages(prev => {
                            const runningMsgIndex = prev.findIndex(m =>
                                m.type === 'tool_result' &&
                                m.tool === chunk.tool &&
                                m.status === 'running'
                            );

                            // AIService 返回的 chunk 可能是扁平结构，需要转换
                            const args = chunk.args || chunk.toolData?.args;
                            const result = chunk.result || chunk.toolData?.result;
                            const undoData = chunk.undoData || chunk.toolData?.undoData;

                            if (runningMsgIndex !== -1) {
                                // 找到对应的 running 消息，直接更新为 completed
                                const runningMsg = prev[runningMsgIndex];
                                if (!runningMsg) return prev;

                                const updated = [...prev];
                                updated[runningMsgIndex] = {
                                    ...runningMsg,
                                    status: 'completed' as const,
                                    endTime: Date.now(),
                                    toolData: {
                                        args: args || runningMsg.toolData?.args || {},
                                        result,
                                        undoData: undoData || runningMsg.toolData?.undoData
                                    }
                                };
                                // 触发滚动检查
                                triggerScrollCheck();
                                return updated;
                            } else {
                                // 没有找到 running 消息（可能 tool_call_start 没有触发），直接创建 completed
                                const toolId = chunk.id || `tool-${chunk.tool}-${Date.now()}`;
                                const completedMessage: Message = {
                                    role: 'model',
                                    type: 'tool_result',
                                    tool: chunk.tool,
                                    content: '',
                                    toolData: {
                                        args: args || {},
                                        result,
                                        undoData
                                    },
                                    id: toolId,
                                    status: 'completed' as const,
                                    startTime: Date.now(),
                                    endTime: Date.now(),
                                    expanded: false
                                };
                                const newMessages = [...prev, completedMessage];
                                // 触发滚动检查
                                triggerScrollCheck();
                                return newMessages;
                            }
                        });
                    } else if (chunk.type === 'error') {
                        console.error('Error chunk received:', chunk.content);
                        setMessages(prev => [...prev, { 
                            role: 'error', 
                            content: chunk.content,
                            id: `msg-${Date.now()}-${Math.random()}-error`
                        }]);
                        setIsLoading(false);
                        return; 
                    } else if (chunk.type === 'history_update') {
                        const updatedHistory = chunk.history;
                        setChatHistory(updatedHistory);
                    } else if (chunk.type === 'debug_info') {
                        // Update the user message with debug info
                        const debugData = chunk.debugData;
                        setMessages(prev => {
                            // Find the user message that triggered this response
                            // It should be the last user message
                            // But since we are inside a response stream, we can iterate backwards?
                            // Or simpler: We know we just sent `newUserMsg`.
                            // But `newUserMsg` is closure variable.
                            // We can use `newUserMsg.id` if we update `newUserMsg` object in state?
                            
                            // Let's iterate and find the user message with matching ID
                            const targetId = newUserMsg.id;
                            return prev.map(m => {
                                if (m.id === targetId) {
                                    return { ...m, debugData: debugData };
                                }
                                return m;
                            });
                        });
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
                        // 更新流式输出的消息ID
                        setStreamingTextMessageId(currentResponseId);
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
                    id: `msg-${Date.now()}-${Math.random()}-error`
                }]);
            }

        } catch (e: any) {
            if (e.message === "生成已取消") return;
            console.error('Error in handleSendMessage:', e);
            const errorMessage = e?.message || e?.toString() || "发生未知错误。";
            setMessages(prev => [...prev, { 
                role: 'error', 
                content: `错误: ${errorMessage}`,
                id: `msg-${Date.now()}-${Math.random()}-error`
            }]);
        } finally {
            setIsLoading(false);
            setStreamingTextMessageId(null); // 清除流式输出状态
            abortControllerRef.current = null;
            // 清除等待消息状态
            setShowWaitingMessage(false);
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

        // Calculate the truncated history BEFORE updating state
        // 使用当前的chatHistory直接计算，避免闭包问题
        const calculatedHistory = [...chatHistory];
        while(calculatedHistory.length > 0) {
            const last = calculatedHistory.pop();
            if (last && last.role === 'user') {
                break;
            }
        }

        // Remove the user message and everything after it from UI
        // so it gets re-added by handleSendMessage
        const newMessages = messages.slice(0, userMsgIndex);
        setMessages(newMessages);
        
        // Revert chatHistory to match the calculated result
        setChatHistory(calculatedHistory);

        if (userMsg) {
            handleSendMessage(userMsg.content, userMsg.referencedFiles || [], calculatedHistory);
        }
    };

    // 启动编辑模式
    // 对于最后一条query：将内容移至输入框
    // 对于其他消息：原地编辑（保留旧逻辑，以防未来需要）
    const startEditingMessage = (messageId: string, content: string, files: string[]) => {
        // 检查是否是最后一条用户消息
        const isLastUserMessage = messageId === lastUserMessageId;
        
        if (isLastUserMessage) {
            // 将内容移至输入框
            setInputValue(content);
            setReferencedFiles(files);
            setEditingLastQueryId(messageId);
            // 聚焦到输入框
            setTimeout(() => {
                inputRef.current?.focus();
                // 将光标移至末尾
                const len = content.length;
                inputRef.current?.setSelectionRange(len, len);
            }, 0);
        } else {
            // 原地编辑（保留旧逻辑）
            setEditingMessageId(messageId);
            setEditingContent(content);
            setEditingFiles(files);
        }
    };

    // 取消编辑
    const cancelEditingMessage = () => {
        setEditingMessageId(null);
        setEditingContent('');
        setEditingFiles([]);
    };

    // 确认编辑并重新发送
    const confirmEditMessage = async (messageId: string, newContent: string, newFiles: string[]) => {
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

        // Calculate the truncated history BEFORE updating state
        // 使用当前的chatHistory直接计算，避免闭包问题
        const calculatedHistory = [...chatHistory];
        while(calculatedHistory.length > 0) {
            const last = calculatedHistory.pop();
            if (last && last.role === 'user') {
                break;
            }
        }

        // Remove this message and everything after it
        const newMessages = messages.slice(0, msgIndex);
        setMessages(newMessages);

        // Revert history to match the calculated result
        setChatHistory(calculatedHistory);

        // 清除编辑状态
        setEditingMessageId(null);
        setEditingContent('');
        setEditingFiles([]);

        // 重新发送 - 使用已计算好的history
        handleSendMessage(newContent, newFiles, calculatedHistory);
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
            const newValue = before + tool.prompt + after;
            setInputValue(newValue);
            
            // 查找工具 prompt 中的 {} 占位符
            const placeholderRegex = /\{[^}]*\}/g;
            const matches = Array.from(tool.prompt.matchAll(placeholderRegex)) as RegExpMatchArray[];
            
            setTimeout(() => {
                if (matches.length > 0 && matches[0]) {
                    // 如果有占位符，选中第一个
                    const firstMatch = matches[0];
                    const startPos = before.length + (firstMatch.index ?? 0);
                    const endPos = startPos + firstMatch[0].length;
                    inputRef.current?.setSelectionRange(startPos, endPos);
                    
                    // 存储所有占位符的位置，用于 Tab 键跳转
                    const placeholders = matches.map((match, idx) => ({
                        start: before.length + (match.index ?? 0),
                        end: before.length + (match.index ?? 0) + match[0].length,
                        index: idx
                    }));
                    
                    // 将占位符信息存储到 input 元素的自定义属性中
                    if (inputRef.current) {
                        (inputRef.current as any)._placeholders = placeholders;
                        (inputRef.current as any)._currentPlaceholderIndex = 0;
                    }
                } else {
                    // 没有占位符，光标放在末尾
                    const newPos = before.length + tool.prompt.length;
                    inputRef.current?.setSelectionRange(newPos, newPos);
                }
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

    const deleteSession = (sessionId: string, confirmed: boolean = false) => {
        // 第一次点击：进入确认状态
        if (!confirmed) {
            setDeletingSessionId(sessionId);
            return;
        }
        
        // 第二次点击：真正删除
        setDeletingSessionId(null);
        
        // Notify Server Mode to clear context
        if (plugin.aiService) {
             plugin.aiService.clearSession(sessionId);
        }
        
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

    const handleClearHistory = (confirmed: boolean = false) => {
        // 第一次点击：进入确认状态
        if (!confirmed) {
            setClearHistoryConfirm(true);
            return;
        }
        
        // 第二次点击：真正清空
        setClearHistoryConfirm(false);
        
        // Notify Server Mode to clear context
        if (currentSessionId && plugin.aiService) {
             plugin.aiService.clearSession(currentSessionId);
        }
        
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

    // Handle toggle expand/collapse for tool call items
    const handleToggleToolExpand = (messageId: string) => {
        setMessages(prev => prev.map(m => {
            if (m.id === messageId) {
                return { ...m, expanded: !m.expanded };
            }
            return m;
        }));
    };

    // Find last user message ID for "Edit" button logic
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const lastUserMessageId = lastUserMessage?.id;

    // Group messages into QA sections (simplified, no tool grouping)
    const qaGroups: {
        id: string;
        userMessage: Message | null;
        messages: Message[]
    }[] = [];

    let currentGroup: {
        id: string;
        userMessage: Message | null;
        messages: Message[]
    } | null = null;

    messages.forEach((item) => {
        if (item.role === 'user') {
            // Start a new group
            currentGroup = {
                id: `qa-group-${item.id}`,
                userMessage: item,
                messages: []
            };
            qaGroups.push(currentGroup);
        } else {
            // If no group exists yet (e.g. initial system messages), create a default one
            if (!currentGroup) {
                currentGroup = {
                    id: `qa-group-start-${Date.now()}-${Math.random()}`,
                    userMessage: null,
                    messages: []
                };
                qaGroups.push(currentGroup);
            }
            // Add to current group
            currentGroup.messages.push(item);
        }
    });

    // Helper to check if a message is currently streaming
    const isCurrentlyStreaming = (m: Message) => {
        return isLoading && messages[messages.length - 1]?.id === m.id;
    };

    // Helper to render a single message (User or Model)
    const renderMessageContent = (m: Message, isHeader: boolean = false, isLastInGroup: boolean = false) => {
        // Render Tool Call Items
        if (m.type === 'tool_result') {
            return <ToolCallItem key={m.id} message={m} onToggleExpand={handleToggleToolExpand} plugin={plugin} />;
        }

        // Normal Message (Text, Thinking, Error)
        const isLastUserMsg = m.role === 'user' && m.id === lastUserMessageId;
        const isEditing = editingMessageId === m.id;

        return (
            <div 
                key={m.id} 
                id={m.id}
                ref={isEditing ? editingRef : null}
                className={`voyaru-message voyaru-message-${m.role}`} 
                style={{ 
                    marginBottom: isHeader ? '0' : '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    backgroundColor: 'transparent',
                    position: 'relative',
                    zIndex: isHeader ? 101 : 1,
                    maxWidth: '100%',
                    marginLeft: '0',
                    marginRight: '0',
                    alignItems: 'flex-start'
                }}
            >
                {/* Message Content & Actions */}
                <div style={{ minWidth: 0, width: '100%' }}>
                    {/* Status for thinking */}
                    {m.type === 'thinking' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.8em', marginBottom: '4px' }}>
                            <ThinkingIcon size={12} />
                            <span>思考中</span>
                        </div>
                    )}
                    
                    {/* Actions for User Message - only show for the LAST user message */}
                    {m.role === 'user' && !isEditing && (
                        <div 
                            style={{ 
                                position: 'absolute',
                                top: '-20px',
                                right: '0',
                                display: 'flex',
                                gap: '4px'
                            }}
                        >
                            {/* Log Button */}
                            {m.debugData && (
                                <div 
                                    className="clickable-icon"
                                    onClick={() => handleShowLogs(m.debugData)}
                                    style={{ 
                                        cursor: 'pointer', 
                                        opacity: 0.7,
                                        padding: '4px'
                                    }}
                                    title="查看完整Prompt日志"
                                >
                                    <LogIcon size={14} />
                                </div>
                            )}

                            {/* Edit Button (Only for last message) */}
                            {isLastUserMsg && (
                                <div 
                                    className="clickable-icon"
                                    onClick={() => startEditingMessage(m.id!, m.content, m.referencedFiles || [])}
                                    style={{ 
                                        cursor: 'pointer', 
                                        opacity: 0.7,
                                        padding: '4px'
                                    }}
                                    title="修改并重新发送"
                                >
                                    <EditIcon size={14} />
                                </div>
                            )}
                        </div>
                    )}

                    {isEditing ? (
                        <div style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            backgroundColor: 'var(--background-primary)',
                            border: '2px solid var(--interactive-accent)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                        }}>
                            {/* Editing Files */}
                            {editingFiles.length > 0 && (
                                <div style={{
                                    marginBottom: '8px',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '6px'
                                }}>
                                    {editingFiles.map(f => (
                                        <div key={f} style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            backgroundColor: 'var(--background-modifier-hover)',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            fontSize: '0.85em'
                                        }}>
                                            <FileIcon size={10} />
                                            <span>{f}</span>
                                            <div
                                                onClick={() => setEditingFiles(prev => prev.filter(x => x !== f))}
                                                style={{ cursor: 'pointer', marginLeft: '4px', opacity: 0.6 }}
                                            >
                                                <CloseIcon size={10} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {/* Textarea */}
                            <textarea
                                value={editingContent}
                                onChange={(e) => setEditingContent(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        confirmEditMessage(m.id!, editingContent, editingFiles);
                                    } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        cancelEditingMessage();
                                    }
                                }}
                                autoFocus
                                style={{
                                    width: '100%',
                                    minHeight: '80px',
                                    maxHeight: '200px',
                                    resize: 'vertical',
                                    padding: '8px',
                                    border: 'none',
                                    outline: 'none',
                                    backgroundColor: 'var(--background-secondary)',
                                    color: 'var(--text-normal)',
                                    borderRadius: '8px',
                                    fontFamily: 'inherit',
                                    fontSize: 'inherit',
                                    lineHeight: '1.6'
                                }}
                            />
                            
                            {/* Buttons */}
                            <div style={{
                                display: 'flex',
                                gap: '8px',
                                marginTop: '8px',
                                justifyContent: 'flex-end'
                            }}>
                                <button
                                    onClick={cancelEditingMessage}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--background-modifier-border)',
                                        backgroundColor: 'var(--background-secondary)',
                                        color: 'var(--text-normal)',
                                        cursor: 'pointer',
                                        fontSize: '0.9em'
                                    }}
                                >
                                    取消
                                </button>
                                <button
                                    onClick={() => confirmEditMessage(m.id!, editingContent, editingFiles)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: 'var(--interactive-accent)',
                                        color: 'var(--text-on-accent)',
                                        cursor: 'pointer',
                                        fontSize: '0.9em',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <SendIcon size={14} />
                                    <span>发送</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Normal User Message (Full Width Box Style with Background) */
                        <div 
                            ref={(el) => {
                                if (el && m.id && m.role === 'user') {
                                    userMessageRefs.current.set(m.id, el);
                                }
                            }}
                            style={{ width: '100%', position: 'relative' }}
                        >
                            {/* 折叠/展开按钮 - 仅对用户消息显示 */}
                            {m.role === 'user' && (
                                <div
                                    className="clickable-icon"
                                    onClick={() => {
                                        if (m.id) {
                                            setCollapsedQueries(prev => {
                                                const next = new Set(prev);
                                                if (next.has(m.id!)) {
                                                    next.delete(m.id!);
                                                } else {
                                                    next.add(m.id!);
                                                }
                                                return next;
                                            });
                                        }
                                    }}
                                    style={{
                                        position: 'absolute',
                                        top: '12px',
                                        right: '12px',
                                        cursor: 'pointer',
                                        opacity: 0.6,
                                        padding: '4px',
                                        zIndex: 10,
                                        backgroundColor: 'var(--background-primary)',
                                        borderRadius: '4px'
                                    }}
                                    title={collapsedQueries.has(m.id!) ? "展开" : "折叠"}
                                >
                                    <ChevronDownIcon 
                                        size={14} 
                                        style={{ 
                                            transform: collapsedQueries.has(m.id!) ? 'rotate(-90deg)' : 'rotate(0deg)',
                                            transition: 'transform 0.2s'
                                        }} 
                                    />
                                </div>
                            )}
                            
                            <div style={{
                                width: '100%',
                                color: 'var(--text-normal)',
                                backgroundColor: 'var(--background-secondary)',
                                border: '1px solid var(--background-modifier-border)',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                paddingRight: m.role === 'user' ? '36px' : '16px', // 为折叠按钮留空间
                                userSelect: 'text',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                fontSize: '1em',
                                lineHeight: '1.6',
                                fontWeight: 500,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: (m.role === 'user' && collapsedQueries.has(m.id!)) ? 'nowrap' : 'pre-wrap',
                                    maxHeight: (m.role === 'user' && collapsedQueries.has(m.id!)) ? '1.6em' : 'none'
                                }}>
                                    {m.role === 'model' && m.type === 'text' ? (
                                        <TypewriterText
                                            text={m.content}
                                            isStreaming={isLoading && m.id === streamingTextMessageId}
                                            speed={50}
                                            onUpdate={triggerScrollCheck}
                                        />
                                    ) : (
                                        m.content
                                    )}
                                </div>
                                
                                {/* Referenced Files Display in Bubble */}
                                {m.role === 'user' && m.referencedFiles && m.referencedFiles.length > 0 && (
                                    <div style={{ 
                                        marginTop: '8px', 
                                        paddingTop: '8px', 
                                        borderTop: '1px solid var(--background-modifier-border)',
                                        fontSize: '0.85em',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '6px',
                                        height: collapsedQueries.has(m.id!) ? '34px' : 'auto',
                                        overflow: 'hidden'
                                    }}>
                                        {m.referencedFiles.map(rf => (
                                            <div key={rf} style={{ 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '4px',
                                                backgroundColor: 'var(--background-secondary)',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                color: 'var(--text-muted)'
                                            }}>
                                                <FileIcon size={10} />
                                                <span>{rf}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Action Bar (Only for Model Text messages) - only show for last message in group and when not streaming */ }
                    {m.role === 'model' && m.type === 'text' && isLastInGroup && !isCurrentlyStreaming(m) && (
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            marginTop: '4px',
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
    };

    // 渲染前记录状态
    console.log('[ChatComponent] Rendering with showWaitingMessage:', showWaitingMessage);

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
                padding: '4px 12px',
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
                                        className="voyaru-delete-session-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteSession(session.id, deletingSessionId === session.id);
                                        }}
                                        style={{ 
                                            cursor: 'pointer', 
                                            opacity: deletingSessionId === session.id ? 1 : 0.7,
                                            color: deletingSessionId === session.id ? 'var(--text-error)' : 'inherit',
                                            transform: deletingSessionId === session.id ? 'scale(1.2)' : 'scale(1)',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '2px'
                                        }}
                                        title={deletingSessionId === session.id ? '再次点击确认删除' : '删除对话'}
                                    >
                                        <CloseIcon size={deletingSessionId === session.id ? 14 : 12} />
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
                    {/* History Prompt Button */}
                    <button 
                        className="clickable-icon"
                        onClick={() => {
                            const modal = new HistoryPromptModal(
                                plugin.app,
                                plugin.settings.queryHistory || [],
                                plugin.settings.tools || [],
                                (query: string, files: string[]) => {
                                    setInputValue(query);
                                    setReferencedFiles(files);
                                    // Focus input after a short delay
                                    setTimeout(() => inputRef.current?.focus(), 100);
                                },
                                async (newTools) => {
                                    plugin.settings.tools = newTools;
                                    await plugin.saveSettings();
                                }
                            );
                            modal.open();
                        }}
                        style={{ 
                            padding: '6px', 
                            background: 'transparent', 
                            border: 'none', 
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        title="历史 Prompt"
                    >
                        <ClockIcon size={16} />
                    </button>
                    
                     <div style={{ position: 'relative' }} ref={settingsMenuRef}>
                        <button 
                            className="clickable-icon"
                            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                            style={{ 
                                padding: '6px', 
                                background: 'transparent', 
                                border: 'none', 
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            title="设置"
                        >
                            <MoreHorizontalIcon size={16} />
                        </button>
                        {showSettingsMenu && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '4px',
                                backgroundColor: 'var(--background-primary)',
                                border: '1px solid var(--background-modifier-border)',
                                borderRadius: '8px',
                                padding: '4px',
                                zIndex: 1000,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                minWidth: '160px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px'
                            }}>
                                {/* Font Size Item */}
                                <div style={{ 
                                    padding: '8px 12px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                        <TextSizeIcon size={14} />
                                        <span>字体大小</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setFontSize(s => Math.max(12, s - 1)); }} 
                                            style={{ 
                                                padding: '2px 6px', 
                                                borderRadius: '4px', 
                                                border: '1px solid var(--background-modifier-border)',
                                                background: 'var(--background-secondary)',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >-</button>
                                        <span style={{ fontSize: '12px', minWidth: '20px', textAlign: 'center' }}>{fontSize}</span>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setFontSize(s => Math.min(24, s + 1)); }} 
                                            style={{ 
                                                padding: '2px 6px', 
                                                borderRadius: '4px', 
                                                border: '1px solid var(--background-modifier-border)',
                                                background: 'var(--background-secondary)',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >+</button>
                                    </div>
                                </div>
                                
                                {/* Divider */}
                                <div style={{ height: '1px', backgroundColor: 'var(--background-modifier-border)', margin: '2px 0' }} />
                                
                                {/* Clear History Item */}
                                <div 
                                    className="voyaru-clear-history-btn"
                                    onClick={() => handleClearHistory(clearHistoryConfirm)}
                                    style={{ 
                                        padding: '8px 12px', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '8px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        borderRadius: '4px',
                                        color: clearHistoryConfirm ? 'var(--text-on-accent)' : 'var(--text-normal)',
                                        backgroundColor: clearHistoryConfirm ? 'var(--text-error)' : 'transparent',
                                        flexShrink: 0,
                                        whiteSpace: 'nowrap'
                                    }}
                                    onMouseEnter={e => {
                                        if (!clearHistoryConfirm) e.currentTarget.style.backgroundColor = 'var(--background-modifier-hover)';
                                    }}
                                    onMouseLeave={e => {
                                        if (!clearHistoryConfirm) e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                >
                                      <TrashIcon size={14} />
                                     <span style={{ whiteSpace: 'nowrap' }}>
                                         {clearHistoryConfirm ? '确认清空？' : '清空历史'}
                                     </span>
                                  </div>
                              </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div 
                ref={messagesContainerRef}
                className="voyaru-messages" 
                style={{ 
                    flex: 1, 
                    overflowY: 'auto', 
                    padding: '0',
                    backgroundColor: 'var(--background-primary)',
                    position: 'relative'
                }}
            >
                {qaGroups.map((group, index) => (
                    <div 
                        key={group.id} 
                        id={group.id} 
                        className="voyaru-qa-section"
                        ref={index === qaGroups.length - 1 ? lastQaSectionRef : null}
                    >
                        {/* Header: User Message (if exists) */}
                        {group.userMessage && (
                            <div className="voyaru-qa-header">
                                {renderMessageContent(group.userMessage, true)}
                            </div>
                        )}

                        {/* Content: Model Messages */}
                        <div className="voyaru-qa-content">
                            {group.messages.map((item, i) => renderMessageContent(item, false, i === group.messages.length - 1))}
                        </div>
                    </div>
                ))}

                {/* 等待消息 - AI 响应延迟时显示 */}
                {showWaitingMessage && (
                    <WaitingMessage
                        messages={plugin.settings.waitingMessages || ['思考中...']}
                        interval={plugin.settings.waitingMessageInterval || 500}
                        isVisible={true}
                        onFadeOutComplete={() => setShowWaitingMessage(false)}
                    />
                )}

                <div ref={messagesEndRef} />
                {/* 底部占位空间，动态计算以防止过度滚动 */}
                <div id="voyaru-bottom-spacer" style={{ 
                    height: bottomSpacerHeight,
                    flexShrink: 0,
                    transition: 'height 0.1s ease-out' // 添加平滑过渡
                }} />
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
                            maxHeight: showFiles ? '400px' : '200px', // 文件列表显示更多
                            overflowY: 'auto', 
                            marginBottom: '8px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                            zIndex: 1000,
                            // If both lists are empty, hide the popup content (or the popup itself)
                            display: (showTools && filteredTools.length === 0) || (showFiles && filteredFiles.length === 0) ? 'none' : 'block'
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

                {/* Editing Last Query Indicator */}
                {editingLastQueryId && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        backgroundColor: 'var(--background-modifier-info)',
                        borderRadius: '8px',
                        marginBottom: '8px',
                        fontSize: '0.85em',
                        color: 'var(--text-muted)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <EditIcon size={12} />
                            <span>正在编辑最后一条query（发送时将撤回之前的回复和文件修改）</span>
                        </div>
                        <div 
                            onClick={() => {
                                setEditingLastQueryId(null);
                                setInputValue('');
                                setTextareaHeight(40); // 重置高度
                                setReferencedFiles([]);
                            }}
                            style={{ 
                                cursor: 'pointer', 
                                opacity: 0.7,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                            title="取消编辑"
                        >
                            <CloseIcon size={14} />
                        </div>
                    </div>
                )}

                {/* Input Container - Sleek Pill Shape */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'var(--background-primary)',
                    borderRadius: '16px', // Large radius for pill look
                    border: editingLastQueryId ? '2px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)',
                    padding: '4px 12px',
                    gap: '4px',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxShadow: editingLastQueryId ? '0 0 0 2px rgba(var(--interactive-accent-rgb), 0.1)' : '0 2px 6px rgba(0,0,0,0.05)'
                }}
                onFocusCapture={(e) => {
                    if (!editingLastQueryId) {
                        e.currentTarget.style.borderColor = 'var(--interactive-accent)';
                        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(var(--interactive-accent-rgb), 0.1)';
                    }
                }}
                onBlurCapture={(e) => {
                    if (!editingLastQueryId) {
                        e.currentTarget.style.borderColor = 'var(--background-modifier-border)';
                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)';
                    }
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
                        onCompositionStart={() => setIsComposing(true)}
                        onCompositionEnd={() => setIsComposing(false)}
                        placeholder="向 Voyaru 提问..."
                        style={{ 
                            width: '100%',
                            height: `${textareaHeight}px`,
                            minHeight: '40px', 
                            maxHeight: messagesContainerRef.current 
                                ? `${Math.floor(messagesContainerRef.current.clientHeight / 2)}px` 
                                : '300px',
                            resize: 'none',
                            padding: '8px 0',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                            color: 'var(--text-normal)',
                            lineHeight: '1.5',
                            boxShadow: 'none', // Override default focus
                            overflow: 'auto'
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
