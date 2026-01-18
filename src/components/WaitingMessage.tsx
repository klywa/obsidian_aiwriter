import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { TypewriterText } from './TypewriterText';

interface WaitingMessageProps {
    /** 获取下一条消息的回调函数 */
    getNextMessage: () => Promise<string>;
    /** 每条消息显示完后的等待间隔（毫秒） */
    interval: number;
    /** 是否可见（用于控制淡入淡出） */
    isVisible: boolean;
    /** 淡出动画完成后的回调 */
    onFadeOutComplete?: () => void;
    /** 打字机效果速度（字符/秒），默认 30 */
    typingSpeed?: number;
}

/**
 * 等待消息组件
 *
 * 当 AI 响应延迟时显示的临时消息气泡。
 * 特性：
 * - 使用打字机效果逐字显示消息
 * - 一条文字显示完后，等待指定间隔后获取下一条
 * - 每次都通过回调获取新的随机消息
 * - 支持淡入淡出动画
 */
export const WaitingMessage: React.FC<WaitingMessageProps> = ({
    getNextMessage,
    interval,
    isVisible,
    onFadeOutComplete,
    typingSpeed = 30
}) => {
    const [currentMessage, setCurrentMessage] = useState<string>('');
    const [isExiting, setIsExiting] = useState(false);
    const [shouldAnimateTypewriter, setShouldAnimateTypewriter] = useState(false);
    const [typewriterCompleted, setTypewriterCompleted] = useState(false);
    const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messageSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 获取初始消息
    useEffect(() => {
        getNextMessage().then(setCurrentMessage);
    }, [getNextMessage]);

    // 处理可见性变化（触发淡出）
    useEffect(() => {
        if (!isVisible && !isExiting) {
            setIsExiting(true);
            fadeOutTimerRef.current = setTimeout(() => {
                onFadeOutComplete?.();
            }, 300);
        }

        return () => {
            if (fadeOutTimerRef.current) {
                clearTimeout(fadeOutTimerRef.current);
            }
        };
    }, [isVisible, isExiting, onFadeOutComplete]);

    // 启动打字机效果（延迟一小段时间确保组件已渲染）
    useEffect(() => {
        if (isVisible && !isExiting) {
            setTypewriterCompleted(false);
            const startDelay = setTimeout(() => {
                setShouldAnimateTypewriter(true);
            }, 50);

            return () => clearTimeout(startDelay);
        }
        return undefined;
    }, [isVisible, isExiting, currentMessage]);

    // 处理消息切换（在打字机完成后）
    useEffect(() => {
        if (!isExiting && typewriterCompleted) {
            messageSwitchTimerRef.current = setTimeout(async () => {
                // 每次都调用回调获取新的随机消息
                const newMessage = await getNextMessage();
                setCurrentMessage(newMessage);
                setTypewriterCompleted(false);
                setShouldAnimateTypewriter(false);
            }, interval);

            return () => {
                if (messageSwitchTimerRef.current) {
                    clearTimeout(messageSwitchTimerRef.current);
                }
            };
        }
        return undefined;
    }, [typewriterCompleted, interval, isExiting, getNextMessage]);

    const handleTypewriterComplete = useCallback(() => {
        setTypewriterCompleted(true);
    }, []);

    const containerClass = `voyaru-waiting-message ${isExiting ? 'voyaru-waiting-message--exiting' : ''}`;

    return (
        <div className={containerClass}>
            <span className="voyaru-waiting-icon">
                <div className="voyaru-waiting-dot" />
            </span>
            <span className="voyaru-waiting-message-text">
                {shouldAnimateTypewriter ? (
                    <TypewriterText
                        text={currentMessage}
                        isStreaming={true}
                        speed={typingSpeed}
                        onComplete={handleTypewriterComplete}
                    />
                ) : (
                    <span>{currentMessage}</span>
                )}
            </span>
        </div>
    );
};

export default WaitingMessage;
