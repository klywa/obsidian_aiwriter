import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { TypewriterText } from './TypewriterText';

interface WaitingMessageProps {
    /** 预设等待文字列表 */
    messages: string[];
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
 * - 使用打字机效果逐字显示预设文字
 * - 一条文字显示完后，等待指定间隔后切换到下一条
 * - 循环播放所有预设文字
 * - 支持淡入淡出动画
 */
export const WaitingMessage: React.FC<WaitingMessageProps> = ({
    messages,
    interval,
    isVisible,
    onFadeOutComplete,
    typingSpeed = 30
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isExiting, setIsExiting] = useState(false);
    const [shouldAnimateTypewriter, setShouldAnimateTypewriter] = useState(false);
    const [typewriterCompleted, setTypewriterCompleted] = useState(false);
    const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messageSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 确保有有效的消息列表
    const validMessages = messages.length > 0 ? messages : ['思考中...'];
    const currentMessage = validMessages[currentIndex % validMessages.length] ?? '思考中...';

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
    }, [isVisible, isExiting, currentIndex]);

    // 处理消息切换（在打字机完成后）
    useEffect(() => {
        if (!isExiting && typewriterCompleted) {
            messageSwitchTimerRef.current = setTimeout(() => {
                setCurrentIndex(prev => (prev + 1) % validMessages.length);
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
    }, [typewriterCompleted, interval, validMessages.length, isExiting]);

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
