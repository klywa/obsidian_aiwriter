import * as React from 'react';

/**
 * TypewriterText Component
 *
 * Displays text with a typewriter effect during streaming.
 * Features:
 * - Smooth character-by-character animation using requestAnimationFrame
 * - Blinking cursor indicator during streaming
 * - Configurable typing speed
 * - Preserves complete text when streaming stops
 *
 * @example
 * ```tsx
 * <TypewriterText
 *   text="Hello, world!"
 *   isStreaming={true}
 *   speed={50}
 * />
 * ```
 */

export interface TypewriterTextProps {
	/** The complete text to display */
	text: string;
	/** Whether the text is currently being streamed (controls cursor visibility) */
	isStreaming: boolean;
	/** Whether to continue animating (defaults to isStreaming if not provided) */
	shouldAnimate?: boolean;
	/** Characters per second (default: 50) */
	speed?: number;
	/** Callback when typing animation completes */
	onComplete?: () => void;
	/** Callback on each display text update (for scroll triggers) */
	onUpdate?: () => void;
	/** Optional CSS class name */
	className?: string;
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({
	text,
	isStreaming,
	shouldAnimate,
	speed = 50,
	onComplete,
	onUpdate,
	className = '',
}) => {
	// Use shouldAnimate if explicitly provided, otherwise fall back to isStreaming
	const animationActive = shouldAnimate ?? isStreaming;
	const [displayText, setDisplayText] = React.useState('');
	const [currentIndex, setCurrentIndex] = React.useState(0);
	const prevTextRef = React.useRef(text);
	const prevStreamingRef = React.useRef(isStreaming);
	const animationFrameRef = React.useRef<number>(0);
	const lastUpdateTimeRef = React.useRef<number>(0);

	// Reset when text changes significantly (new message)
	React.useEffect(() => {
		if (text !== prevTextRef.current) {
			const isNewMessage = !text.startsWith(prevTextRef.current);

			if (isNewMessage) {
				// Completely new message - start from beginning
				setDisplayText('');
				setCurrentIndex(0);
			}

			prevTextRef.current = text;
		}
	}, [text]);

	// Track streaming state changes (for cursor visibility logic)
	React.useEffect(() => {
		prevStreamingRef.current = isStreaming;
	}, [isStreaming]);

	// 当 shouldAnimate 变为 false 且动画未完成时，确保显示完整文本
	React.useEffect(() => {
		if (!animationActive && currentIndex < text.length) {
			setDisplayText(text);
			setCurrentIndex(text.length);
			if (onComplete) {
				onComplete();
			}
		}
	}, [animationActive, text, currentIndex, onComplete]);

	// Typewriter animation
	React.useEffect(() => {
		if (!animationActive || currentIndex >= text.length) {
			if (currentIndex >= text.length && onComplete) {
				onComplete();
			}
			return undefined;
		}

		const msPerChar = 1000 / speed;

		const animate = (timestamp: number) => {
			if (lastUpdateTimeRef.current === 0) {
				lastUpdateTimeRef.current = timestamp;
			}

			const elapsed = timestamp - lastUpdateTimeRef.current;
			const charsToAdd = Math.floor(elapsed / msPerChar);

			if (charsToAdd > 0) {
				const nextIndex = Math.min(currentIndex + charsToAdd, text.length);
				setDisplayText(text.slice(0, nextIndex));
				setCurrentIndex(nextIndex);
				lastUpdateTimeRef.current = timestamp;

				// Trigger scroll check on each update
				if (onUpdate) {
					onUpdate();
				}

				if (nextIndex >= text.length && onComplete) {
					onComplete();
					return;
				}
			}

			animationFrameRef.current = requestAnimationFrame(animate);
		};

		animationFrameRef.current = requestAnimationFrame(animate);

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [currentIndex, text, animationActive, speed, onComplete, onUpdate]);

	return (
		<span className={`voyaru-typewriter-text ${className}`}>
			{displayText}
			{isStreaming && <span className="voyaru-cursor" />}
		</span>
	);
};

export default TypewriterText;
