import * as React from 'react';
import { useState, useEffect, useRef } from 'react';

interface WaitingMessageProps {
    /** 预设等待文字列表 */
    messages: string[];
    /** 每条消息显示完后的等待间隔（毫秒） */
    interval: number;
    /** 打字机效果速度（字符/秒），默认 30 */
    typingSpeed?: number;
    /** 是否可见（用于控制淡入淡出） */
    isVisible: boolean;
    /** 淡出动画完成后的回调 */
    onFadeOutComplete?: () => void;
}

/**
 * 等待消息组件
 *
 * 当 AI 响应延迟时显示的临时消息气泡。
 * 特性：
 * - 使用打字机效果逐字显示预设文字
 * - 一条文字显示完后，等待指定间隔后切换到下一条
 * - 循环播放所有预设文字
 * - 支持淡入淡出动画
 */
export const WaitingMessage: React.FC<WaitingMessageProps> = ({
    messages,
    interval,
    isVisible,
    onFadeOutComplete
}) => {
    // 调试日志
    console.log('[WaitingMessage Component] Render called with props:', { messages, interval, isVisible });

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isExiting, setIsExiting] = useState(false);
    const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 确保有有效的消息列表
    const validMessages = messages.length > 0 ? messages : ['思考中...'];
    const currentMessage = validMessages[currentIndex % validMessages.length] ?? '思考中...';

    console.log('[WaitingMessage Component] Current state:', { currentIndex, isExiting, currentMessage });

    // 处理可见性变化（触发淡出）
    useEffect(() => {
        if (!isVisible && !isExiting) {
            console.log('[WaitingMessage Component] Starting exit animation');
            setIsExiting(true);

            // 等待淡出动画完成后回调
            fadeOutTimerRef.current = setTimeout(() => {
                console.log('[WaitingMessage Component] Exit animation complete, calling callback');
                onFadeOutComplete?.();
            }, 300); // 与 CSS 动画时长匹配
        }

        return () => {
            if (fadeOutTimerRef.current) {
                clearTimeout(fadeOutTimerRef.current);
            }
        };
    }, [isVisible, isExiting, onFadeOutComplete]);

    // 简单的消息切换（不使用打字机效果）
    useEffect(() => {
        if (!isExiting) {
            const timer = setTimeout(() => {
                setCurrentIndex(prev => (prev + 1) % validMessages.length);
            }, interval);

            return () => clearTimeout(timer);
        }
        return undefined;
    }, [currentIndex, interval, validMessages.length, isExiting]);

    const containerClass = `voyaru-waiting-message ${isExiting ? 'voyaru-waiting-message--exiting' : ''}`;

    console.log('[WaitingMessage Component] About to render JSX with message:', currentMessage);

    // 简化版本：只显示纯文本，不依赖其他组件
    return (
        <div className={containerClass}>
            <span style={{ display: 'inline-block', width: '18px', height: '18px' }}>
                ⏳
            </span>
            <span className="voyaru-waiting-message-text">
                {currentMessage}
            </span>
        </div>
    );
};

export default WaitingMessage;
