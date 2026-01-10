/**
 * Chat Component Style Constants
 *
 * Centralized style definitions for ChatComponent inline styles.
 * Uses CSS custom properties from design-tokens.css for consistency.
 *
 * Import example:
 * import { chatStyles, animationStyles } from '../styles/chatStyles';
 */

export const chatStyles = {
	// ===== Container Styles =====
	container: {
		display: 'flex',
		flexDirection: 'column' as const,
		height: '100%',
		backgroundColor: 'var(--voyaru-bg-primary)',
		fontSize: 'var(--voyaru-text-base)',
		overflow: 'hidden',
	},

	// ===== Header / Session Tabs =====
	header: {
		display: 'flex',
		alignItems: 'center',
		gap: 'var(--voyaru-space-3)',
		padding: 'var(--voyaru-space-3) var(--voyaru-space-4)',
		backgroundColor: 'var(--voyaru-bg-primary)',
		borderBottom: '1px solid var(--voyaru-border)',
		flexShrink: 0,
	},

	sessionTabs: {
		display: 'flex',
		gap: 'var(--voyaru-space-2)',
		overflowX: 'auto' as const,
		flex: 1,
		scrollbarWidth: 'none', // Firefox
	},

	sessionTab: {
		display: 'flex',
		alignItems: 'center',
		gap: 'var(--voyaru-space-2)',
		padding: 'var(--voyaru-space-2) var(--voyaru-space-3)',
		borderRadius: 'var(--voyaru-radius-lg)',
		background: 'var(--voyaru-bg-primary)',
		border: '1px solid var(--voyaru-border)',
		cursor: 'pointer',
		fontSize: 'var(--voyaru-text-sm)',
		color: 'var(--voyaru-text-secondary)',
		whiteSpace: 'nowrap' as const,
		transition: 'all var(--voyaru-duration-fast) var(--voyaru-ease-out)',
	},

	sessionTabActive: {
		background: 'var(--voyaru-primary)',
		borderColor: 'var(--voyaru-primary)',
		color: 'white',
		fontWeight: 'var(--voyaru-font-semibold)',
	},

	// ===== Messages Container =====
	messagesContainer: {
		flex: 1,
		overflowY: 'auto' as const,
		padding: 'var(--voyaru-space-4)',
		scrollBehavior: 'smooth',
	},

	// ===== Message Card =====
	messageCard: {
		padding: 'var(--voyaru-space-4)',
		marginBottom: 'var(--voyaru-space-4)',
		background: 'var(--voyaru-bg-secondary)',
		border: '1px solid var(--voyaru-border)',
		borderRadius: 'var(--voyaru-radius-lg)',
		transition: 'all var(--voyaru-duration-fast) var(--voyaru-ease-out)',
		position: 'relative' as const,
		overflow: 'hidden',
	},

	messageCardUser: {
		background: 'var(--voyaru-primary-light)',
		borderColor: 'var(--voyaru-primary)',
	},

	messageCardHover: {
		borderColor: 'var(--voyaru-border-light)',
		boxShadow: 'var(--voyaru-shadow-md)',
		transform: 'translateY(-1px)',
	},

	messageHeader: {
		display: 'flex',
		alignItems: 'center',
		gap: 'var(--voyaru-space-2)',
		marginBottom: 'var(--voyaru-space-3)',
		paddingBottom: 'var(--voyaru-space-2)',
		borderBottom: '1px solid var(--voyaru-border)',
	},

	messageAvatar: {
		width: '24px',
		height: '24px',
		borderRadius: 'var(--voyaru-radius-full)',
		background: 'var(--voyaru-primary)',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		color: 'white',
		fontWeight: 'var(--voyaru-font-semibold)',
		fontSize: 'var(--voyaru-text-xs)',
	},

	messageContent: {
		color: 'var(--voyaru-text-primary)',
		lineHeight: 'var(--voyaru-leading-relaxed)',
		fontSize: 'var(--voyaru-text-base)',
	},

	// ===== Message Actions =====
	messageActions: {
		display: 'flex',
		gap: 'var(--voyaru-space-2)',
		marginTop: 'var(--voyaru-space-3)',
		opacity: 0,
		transition: 'opacity var(--voyaru-duration-fast) var(--voyaru-ease-out)',
	},

	actionButton: {
		padding: 'var(--voyaru-space-1) var(--voyaru-space-2)',
		border: '1px solid var(--voyaru-border)',
		borderRadius: 'var(--voyaru-radius-sm)',
		background: 'var(--voyaru-bg-primary)',
		color: 'var(--voyaru-text-secondary)',
		cursor: 'pointer',
		fontSize: 'var(--voyaru-text-xs)',
		transition: 'all var(--voyaru-duration-fast) var(--voyaru-ease-out)',
		display: 'flex',
		alignItems: 'center',
		gap: 'var(--voyaru-space-1)',
	},

	// ===== Input Area =====
	inputArea: {
		position: 'relative' as const,
		padding: 'var(--voyaru-space-4)',
		background: 'var(--voyaru-bg-primary)',
		borderTop: '1px solid var(--voyaru-border)',
		flexShrink: 0,
	},

	textareaWrapper: {
		position: 'relative' as const,
		background: 'var(--voyaru-bg-secondary)',
		border: '2px solid var(--voyaru-border)',
		borderRadius: 'var(--voyaru-radius-xl)',
		transition: 'all var(--voyaru-duration-fast) var(--voyaru-ease-out)',
	},

	textareaWrapperFocus: {
		borderColor: 'var(--voyaru-primary)',
		boxShadow: '0 0 0 3px var(--voyaru-primary-light)',
	},

	textarea: {
		width: '100%',
		minHeight: '80px',
		maxHeight: '200px',
		padding: 'var(--voyaru-space-3)',
		background: 'transparent',
		border: 'none',
		outline: 'none',
		resize: 'none' as const,
		fontFamily: 'inherit',
		fontSize: 'var(--voyaru-text-base)',
		lineHeight: 'var(--voyaru-leading-normal)',
		color: 'var(--voyaru-text-primary)',
	},

	// ===== Buttons =====
	sendButton: {
		width: '32px',
		height: '32px',
		borderRadius: 'var(--voyaru-radius-full)',
		border: 'none',
		background: 'var(--voyaru-primary)',
		color: 'white',
		cursor: 'pointer',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		transition: 'all var(--voyaru-duration-fast) var(--voyaru-ease-out)',
		boxShadow: 'var(--voyaru-shadow-sm)',
	},

	sendButtonHover: {
		transform: 'scale(1.05)',
		boxShadow: 'var(--voyaru-shadow-md)',
		background: 'var(--voyaru-primary-hover)',
	},

	sendButtonDisabled: {
		opacity: 0.5,
		cursor: 'not-allowed',
		transform: 'none',
	},

	// ===== Tool Call Items =====
	toolCallItem: {
		marginBottom: 'var(--voyaru-space-3)',
		borderRadius: 'var(--voyaru-radius-md)',
		border: '1px solid var(--voyaru-border)',
		background: 'var(--voyaru-bg-secondary)',
		overflow: 'hidden',
		transition: 'all var(--voyaru-duration-fast) var(--voyaru-ease-out)',
		boxShadow: 'var(--voyaru-shadow-sm)',
	},

	toolCallItemRunning: {
		borderLeftColor: 'var(--voyaru-info)',
		background: 'linear-gradient(90deg, var(--voyaru-info-light) 0%, var(--voyaru-bg-secondary) 100%)',
	},

	toolCallItemCompleted: {
		borderLeftColor: 'var(--voyaru-success)',
	},

	toolCallItemFailed: {
		borderLeftColor: 'var(--voyaru-error)',
	},
} as const;

export const animationStyles = {
	// ===== Message Animations =====
	messageFadeInRight: 'voyaru-message-fade-in-right var(--voyaru-duration-normal) var(--voyaru-ease-out)',
	messageFadeInUp: 'voyaru-message-fade-in-up var(--voyaru-duration-normal) var(--voyaru-ease-out)',

	// ===== Button Animations =====
	buttonHover: 'all var(--voyaru-duration-fast) var(--voyaru-ease-out)',

	// ===== Expand/Collapse =====
	expandCollapse: 'height var(--voyaru-duration-normal) var(--voyaru-ease-in-out)',
	arrowRotate: 'transform var(--voyaru-duration-fast) var(--voyaru-ease-out)',

	// ===== Opacity Transitions =====
	opacityFast: 'opacity var(--voyaru-duration-fast) var(--voyaru-ease-out)',
	opacityNormal: 'opacity var(--voyaru-duration-normal) var(--voyaru-ease-out)',
} as const;

// Responsive breakpoints for JS usage
export const breakpoints = {
	sm: 640,
	md: 768,
	lg: 1024,
} as const;

// Media query helpers
export const mediaQueries = {
	sm: '(max-width: 640px)',
	md: '(min-width: 641px) and (max-width: 1024px)',
	touch: '(hover: none) and (pointer: coarse)',
	reducedMotion: '(prefers-reduced-motion: reduce)',
} as const;
