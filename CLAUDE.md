# CLAUDE.md - AI Assistant Guide for Voyaru AI Writer

> **Version**: 1.0.0
> **Last Updated**: 2026-01-05
> **Project**: Voyaru AI Writer - Obsidian Plugin for Fiction Writing

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Codebase Structure](#codebase-structure)
4. [Key Components](#key-components)
5. [Development Workflow](#development-workflow)
6. [Coding Conventions](#coding-conventions)
7. [Common Tasks](#common-tasks)
8. [Testing & Debugging](#testing--debugging)
9. [AI Assistant Guidelines](#ai-assistant-guidelines)
10. [References](#references)

---

## Project Overview

**Voyaru AI Writer** is an Obsidian community plugin that provides AI-powered writing assistance specifically designed for fiction authors. It integrates Google's Gemini AI to help users create, edit, and manage their creative writing projects directly within Obsidian.

### Core Features

- **AI Chat Interface**: Interactive chat with Gemini AI for writing assistance
- **Local Edit**: In-place editing of selected text with AI assistance
- **File Management**: Organized storage for chapters, characters, outlines, notes, and knowledge base
- **Custom Tools**: User-defined prompt shortcuts for common writing tasks
- **Post-Check System**: Automated content review and polishing after writing
- **Context Management**: Three modes for managing conversation context (WYSIWYG, Server, Single-turn)
- **Session Persistence**: Save and restore chat sessions across plugin reloads
- **Multi-platform**: Supports both desktop and mobile (isDesktopOnly: false)

### Tech Stack

- **Language**: TypeScript (strict mode enabled)
- **UI Framework**: React 19 with React DOM
- **Bundler**: esbuild (fast, modern bundler)
- **AI Provider**: Google Gemini AI (via `@google/genai` SDK)
- **Platform**: Obsidian Plugin API
- **Build Target**: ES6/ES2018
- **Package Manager**: npm (required)

### Project Metadata

- **Plugin ID**: `voyaru-plugin`
- **Plugin Name**: Voyaru AI Writer
- **Version**: 1.0.0
- **Minimum Obsidian Version**: 1.0.0
- **Author**: Voyaru Team
- **License**: 0-BSD

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Obsidian App                          │
├─────────────────────────────────────────────────────────────┤
│  VoyaruPlugin (main.ts)                                     │
│  ├─ Plugin Lifecycle (onload/onunload)                      │
│  ├─ Settings Management                                      │
│  ├─ Command Registration                                     │
│  └─ View Activation                                          │
├─────────────────────────────────────────────────────────────┤
│  Services Layer                                              │
│  ├─ AIService (ai_service.ts)                               │
│  │  ├─ Gemini AI Integration                                │
│  │  ├─ Chat Management                                       │
│  │  ├─ Tool Calling (readFile, writeFile, etc.)             │
│  │  └─ System Prompt Processing                             │
│  └─ FSService (fs_service.ts)                               │
│     ├─ File Operations (read/write/delete)                  │
│     ├─ Folder Management                                     │
│     └─ Recursive File Listing                               │
├─────────────────────────────────────────────────────────────┤
│  UI Components                                               │
│  ├─ ChatView (chat_view.ts) - Obsidian ItemView             │
│  ├─ ChatComponent (ChatComponent.tsx) - React Component     │
│  ├─ Modals (LocalEditModal, SystemPromptModal, etc.)        │
│  └─ Components (FileSuggest, FolderSuggest, Icons)          │
├─────────────────────────────────────────────────────────────┤
│  Settings & Configuration                                    │
│  └─ VoyaruSettings (settings.ts)                            │
│     ├─ API Configuration                                     │
│     ├─ Folder Structure                                      │
│     ├─ Tools & Post-Check Items                             │
│     └─ Session Storage                                       │
└─────────────────────────────────────────────────────────────┘
```

### Design Patterns

1. **Service Layer Pattern**: Business logic separated into AIService and FSService
2. **Observer Pattern**: Settings changes trigger service updates via `updateSettings()`
3. **Command Pattern**: User actions registered as Obsidian commands
4. **Factory Pattern**: Modal creation for various UI interactions
5. **Singleton Pattern**: Plugin instance serves as central coordinator

### Data Flow

#### Chat Message Flow
```
User Input (ChatComponent)
  ↓
AIService.streamChat()
  ↓
Gemini API (with tools: readFile, writeFile, listFiles, deleteFile, undo)
  ↓
Tool Execution (via FSService)
  ↓
Stream Chunks → ChatComponent State Updates
  ↓
UI Re-render (React)
```

#### Local Edit Flow
```
User Selects Text
  ↓
LocalEditModal (user enters edit instruction)
  ↓
performLocalEdit() in main.ts
  ↓
AIService.streamChat() with context-aware prompt
  ↓
Editor.replaceRange() with AI-generated content
```

---

## Codebase Structure

### Directory Layout

```
obsidian_aiwriter/
├── src/                          # Source code
│   ├── main.ts                   # Plugin entry point
│   ├── settings.ts               # Settings interface & defaults
│   ├── components/               # Reusable UI components
│   │   ├── FileSuggest.ts        # File autocomplete
│   │   ├── FolderSuggest.ts      # Folder autocomplete
│   │   └── Icons.tsx             # Icon components (React)
│   ├── modals/                   # Modal dialogs
│   │   ├── ExportModal.ts        # Export conversations
│   │   ├── FolderConfigModal.ts  # Configure folder paths
│   │   ├── HistoryPromptModal.ts # Query history selection
│   │   ├── LocalEditModal.ts     # Local edit input
│   │   ├── LocalEditStatusModal.ts # Local edit progress
│   │   ├── LogModal.ts           # Debug logs viewer
│   │   ├── PostCheckManagerModal.ts # Manage post-check rules
│   │   ├── SystemPromptModal.ts  # Edit system prompt
│   │   └── ToolsManagerModal.ts  # Manage custom tools
│   ├── services/                 # Business logic services
│   │   ├── ai_service.ts         # AI integration & chat
│   │   └── fs_service.ts         # File system operations
│   └── views/                    # View components
│       ├── chat_view.ts          # Obsidian ItemView wrapper
│       └── ChatComponent.tsx     # Main React chat UI
├── styles.css                    # Plugin styles
├── manifest.json                 # Plugin manifest
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # TypeScript configuration
├── esbuild.config.mjs            # Build configuration
├── eslint.config.mts             # ESLint configuration
├── versions.json                 # Version compatibility mapping
├── version-bump.mjs              # Version bump automation
├── .gitignore                    # Git ignore rules
├── .editorconfig                 # Editor configuration
├── LICENSE                       # License (0-BSD)
├── README.md                     # User-facing documentation
├── AGENTS.md                     # Development guidelines (Obsidian-specific)
└── CLAUDE.md                     # This file (AI assistant guide)
```

### File Categorization

#### Entry Point
- `src/main.ts` - Plugin lifecycle, command registration, view activation

#### Configuration
- `src/settings.ts` - Settings interface, defaults, settings tab UI

#### Services (Business Logic)
- `src/services/ai_service.ts` - Gemini AI integration, chat streaming, tool handling
- `src/services/fs_service.ts` - Vault file operations, folder management

#### Views (UI Layer)
- `src/views/chat_view.ts` - Obsidian ItemView container
- `src/views/ChatComponent.tsx` - React chat interface (main UI)

#### Components (Reusable UI)
- `src/components/FileSuggest.ts` - File path autocomplete
- `src/components/FolderSuggest.ts` - Folder path autocomplete
- `src/components/Icons.tsx` - Icon library (React)

#### Modals (Dialogs)
- 9 modal components for various user interactions

#### Build & Config
- `esbuild.config.mjs` - Bundler configuration
- `tsconfig.json` - TypeScript compiler options
- `eslint.config.mts` - Linting rules
- `manifest.json` - Obsidian plugin metadata

---

## Key Components

### 1. VoyaruPlugin (src/main.ts)

**Responsibility**: Plugin lifecycle management, command registration, coordination

**Key Methods**:
- `onload()` - Initialize services, register commands/views, set up event listeners
- `onunload()` - Clean up resources, save sessions
- `performLocalEdit()` - Execute in-place text editing with AI
- `activateView()` - Open/reveal chat view
- `loadSettings()` / `saveSettings()` - Persist configuration

**Important Patterns**:
```typescript
// Settings are deeply merged with defaults
this.settings = {
    ...DEFAULT_SETTINGS,
    ...loadedData,
    folders: {
        ...DEFAULT_SETTINGS.folders,
        ...(loadedData.folders || {})
    }
};

// Services initialized with settings reference
this.fsService = new FSService(this.app);
this.aiService = new AIService(this.settings, this.fsService);

// Settings changes trigger service updates
async saveSettings() {
    await this.saveData(this.settings);
    if (this.aiService) {
        this.aiService.updateSettings(this.settings);
    }
}
```

### 2. AIService (src/services/ai_service.ts)

**Responsibility**: Gemini AI integration, chat streaming, tool execution

**Key Features**:
- Manages active chat sessions (Map<sessionId, chat>)
- Implements tool calling (readFile, writeFile, listFiles, deleteFile, undo)
- Processes system prompts with folder path replacements
- Handles different context modes (wysiwyg, server, single)
- Supports post-check workflow

**Important Methods**:
```typescript
// Main chat streaming method
async *streamChat(
    sessionId: string,
    chatHistory: Content[],
    message: string,
    referencedFiles: string[],
    options?: ChatOptions,
    systemInstructionOverride?: string
): AsyncGenerator<StreamChunk, void, unknown>

// System prompt processing
getProcessedSystemPrompt(): string {
    // Replaces {chapters}, {characters}, etc. with actual folder paths
    // Adds instructions for reference mode (path vs content)
}
```

**Tool Calling Pattern**:
The AI can call these tools:
- `readFile(path)` - Read file content
- `writeFile(path, content)` - Create/update file
- `listFiles(folder, recursive?)` - List files in folder
- `deleteFile(path)` - Delete file (moves to trash)
- `undo(logIndex)` - Revert a previous file operation

**Context Modes**:
- **wysiwyg**: Send full chat history every request (high token usage)
- **server**: Let Gemini maintain history server-side (efficient)
- **single**: No history, each message independent (fastest)

### 3. FSService (src/services/fs_service.ts)

**Responsibility**: File system operations within Obsidian vault

**Key Methods**:
```typescript
async writeFile(path: string, content: string): Promise<string | null>
  // Returns previous content for undo, null if new file

async readFile(path: string): Promise<string>
  // Throws error if file not found

async deleteFile(path: string): Promise<void>
  // Moves to system trash (safe)

async ensureFolder(path: string): Promise<void>
  // Creates folder hierarchy if needed

async listFilesRecursive(folderPath: string): Promise<string[]>
  // Returns all file paths in folder tree

async listFilesRecursiveWithMtime(folderPath: string): Promise<Array<{path, mtime}>>
  // Includes modification times for sorting
```

**Safety Features**:
- All paths normalized via `normalizePath()`
- Parent folders created automatically
- Delete uses trash (not permanent deletion)
- Previous content returned for undo capability

### 4. ChatComponent (src/views/ChatComponent.tsx)

**Responsibility**: Main React UI for chat interface

**State Management**:
```typescript
const [sessions, setSessions] = useState<Session[]>([]);
const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
const [messages, setMessages] = useState<Message[]>([]);
const [chatHistory, setChatHistory] = useState<Content[]>([]);
const [isLoading, setIsLoading] = useState(false);
const [referencedFiles, setReferencedFiles] = useState<string[]>([]);
const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
```

**Key Features**:
- Session management (create, switch, delete, rename)
- Message rendering (text, thinking, tool results)
- File reference UI (@ mentions, drag-and-drop)
- Query history with auto-complete
- Post-check integration
- Undo capability for file operations
- Export conversations

**Important Patterns**:
```typescript
// Session persistence (auto-save on changes)
useEffect(() => {
    plugin.settings.sessions = sessions;
    plugin.settings.lastSessionId = activeSessionId;
    plugin.saveSettings();
}, [sessions, activeSessionId]);

// Custom event handling for context additions
useEffect(() => {
    const handleAddContext = (e: CustomEvent) => {
        const { file, startLine, endLine, content } = e.detail;
        // Add to referenced files
    };
    contentEl.addEventListener('voyaru-add-context', handleAddContext);
    return () => contentEl.removeEventListener('voyaru-add-context', handleAddContext);
}, []);
```

### 5. Settings System (src/settings.ts)

**Configuration Structure**:
```typescript
interface VoyaruSettings {
    // AI Configuration
    apiKey: string;
    model: string;
    systemPrompt: string;

    // Folder Structure
    folders: {
        chapters: string;
        characters: string;
        outlines: string;
        notes: string;
        knowledge: string;
    };

    // Custom Tools
    tools: AgentTool[];

    // Post-Check Configuration
    postCheckItems: PostCheckItem[];
    enablePostCheck: boolean;

    // Session Management
    sessions: Session[];
    lastSessionId: string | null;

    // UI Preferences
    fontSize: number;
    contextMode: 'wysiwyg' | 'server' | 'single';
    referenceMode: 'content' | 'path';
    maxFilesInPopup: number;
    queryHistory: QueryHistoryItem[];
    sendWithShiftEnter: boolean;
}
```

**Default Values**:
- See `DEFAULT_SETTINGS` in `src/settings.ts`
- Includes 4 default tools (plan chapter, write chapter, update character, update outline)
- 2 default post-check items (style check, plot coherence check)
- Default model: `gemini-3-pro-preview`

---

## Development Workflow

### Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd obsidian_aiwriter

# Install dependencies (npm required)
npm install

# Development mode (watch & rebuild on changes)
npm run dev

# Production build
npm run build

# Lint code
npm run lint
```

### Development Process

1. **Make Code Changes**: Edit TypeScript/React files in `src/`
2. **Auto-Rebuild**: esbuild watches files and rebuilds `main.js` automatically
3. **Reload Plugin**: In Obsidian, disable and re-enable plugin to load new code
4. **Test**: Verify changes in Obsidian
5. **Commit**: Follow conventional commit messages

### File Watching

When running `npm run dev`, esbuild watches for changes and rebuilds automatically. You'll see output like:

```
[watch] build finished, watching for changes...
```

### Manual Installation for Testing

```bash
# Copy build artifacts to Obsidian vault
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/voyaru-plugin/

# Or symlink the entire plugin folder for easier development
ln -s $(pwd) /path/to/vault/.obsidian/plugins/voyaru-plugin
```

### Build Output

- **Development**: `main.js` with inline source maps
- **Production**: Minified `main.js` without source maps
- Entry point: Always `src/main.ts`
- External modules: `obsidian`, `electron`, CodeMirror packages (not bundled)

### Version Management

```bash
# Bump version (updates manifest.json, package.json, versions.json)
npm version patch   # 1.0.0 -> 1.0.1
npm version minor   # 1.0.1 -> 1.1.0
npm version major   # 1.1.0 -> 2.0.0
```

---

## Coding Conventions

### TypeScript

**Strict Mode Enabled**:
```json
{
  "noImplicitAny": true,
  "noImplicitThis": true,
  "noImplicitReturns": true,
  "strictNullChecks": true,
  "strictBindCallApply": true,
  "noUncheckedIndexedAccess": true
}
```

**Style Guidelines**:
- Use `async/await` over promise chains
- Prefer `const` over `let`, never use `var`
- Use type annotations for function parameters and return types
- Use interfaces for object shapes, types for unions/intersections
- Handle errors explicitly with try-catch
- Use optional chaining (`?.`) and nullish coalescing (`??`)

**Example**:
```typescript
// Good
async function readFileContent(path: string): Promise<string | null> {
    try {
        const content = await this.fsService.readFile(path);
        return content;
    } catch (error) {
        console.error(`Failed to read file ${path}:`, error);
        return null;
    }
}

// Bad
function readFileContent(path) {
    return this.fsService.readFile(path).then(content => {
        return content;
    }).catch(error => {
        console.error(error);
        return null;
    });
}
```

### React

**Component Style**:
- Use functional components with hooks
- Destructure props in parameter list
- Use TypeScript interfaces for props
- Keep components focused (single responsibility)
- Extract reusable logic into custom hooks

**Example**:
```tsx
interface MessageProps {
    message: Message;
    onUndo?: (logIndex: number) => void;
}

const MessageComponent: React.FC<MessageProps> = ({ message, onUndo }) => {
    const handleUndo = () => {
        if (message.toolData?.logIndex !== undefined) {
            onUndo?.(message.toolData.logIndex);
        }
    };

    return <div className="message">{/* ... */}</div>;
};
```

### File Organization

**Keep main.ts Minimal**:
The entry point should focus on:
- Plugin lifecycle (onload/onunload)
- Command registration
- View activation
- Settings persistence

Delegate all feature logic to:
- Services (`services/`)
- Modals (`modals/`)
- Components (`components/`)
- Views (`views/`)

**Module Boundaries**:
- `main.ts` ← coordinates everything
- `services/` ← business logic, no UI
- `views/` ← Obsidian view wrappers
- `components/` ← reusable UI (React)
- `modals/` ← dialog interactions
- `settings.ts` ← configuration only

### Naming Conventions

- **Files**: PascalCase for classes/components, camelCase for utilities
  - `ChatComponent.tsx` (React component)
  - `ai_service.ts` (service class)
  - `settings.ts` (configuration)

- **Classes**: PascalCase
  - `VoyaruPlugin`, `AIService`, `FSService`

- **Interfaces**: PascalCase with descriptive names
  - `VoyaruSettings`, `Message`, `Session`

- **Functions/Methods**: camelCase, verb-first
  - `activateView()`, `performLocalEdit()`, `getProcessedSystemPrompt()`

- **Constants**: SCREAMING_SNAKE_CASE
  - `DEFAULT_SETTINGS`, `DEFAULT_TOOLS`, `MODELS`

- **Private fields**: Prefix with underscore (optional)
  - `private _activeChats: Map<string, any>`

### Error Handling

**Always handle errors gracefully**:
```typescript
// Good - User-friendly error handling
try {
    await this.aiService.streamChat(...);
} catch (error) {
    console.error('Chat error:', error);
    new Notice(`Failed to send message: ${error.message}`);
    setIsLoading(false);
}

// Bad - Unhandled promise rejection
this.aiService.streamChat(...); // Can crash plugin silently
```

**Use Obsidian's Notice API for user feedback**:
```typescript
import { Notice } from 'obsidian';

new Notice('File saved successfully');
new Notice('Error: API key not configured', 5000); // 5 second duration
```

### Comments

**When to Comment**:
- Complex algorithms or business logic
- Non-obvious workarounds
- TODOs and FIXMEs
- Public API documentation (JSDoc)

**When NOT to Comment**:
- Obvious code (let the code speak)
- Redundant information
- Commented-out code (use git instead)

**Example**:
```typescript
/**
 * Performs local editing of selected text using AI.
 * Reads surrounding context (5 lines before/after) to maintain coherence.
 *
 * @param filePath - Path to the file being edited
 * @param startLine - Starting line number (0-indexed)
 * @param endLine - Ending line number (0-indexed)
 * @param originalContent - The selected text to modify
 * @param query - User's editing instruction
 * @param editor - Obsidian editor instance
 */
async performLocalEdit(
    filePath: string,
    startLine: number,
    endLine: number,
    originalContent: string,
    query: string,
    editor: Editor
) {
    // Implementation...
}
```

---

## Common Tasks

### Adding a New Command

```typescript
// In main.ts onload()
this.addCommand({
    id: 'unique-command-id',
    name: 'Display Name in Command Palette',
    callback: () => {
        // Command logic here
        this.performSomeAction();
    }
});

// For editor commands (require active editor)
this.addCommand({
    id: 'editor-command-id',
    name: 'Editor Command Name',
    editorCallback: (editor: Editor, view: MarkdownView) => {
        const selection = editor.getSelection();
        // Do something with selection
    }
});
```

### Adding a New Modal

1. Create modal file in `src/modals/`:

```typescript
import { App, Modal, Setting } from 'obsidian';

export class MyModal extends Modal {
    private onSubmit: (value: string) => void;

    constructor(app: App, onSubmit: (value: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'My Modal' });

        new Setting(contentEl)
            .setName('Input Field')
            .addText(text => text
                .onChange(value => {
                    // Handle input
                }));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Submit')
                .setCta()
                .onClick(() => {
                    this.onSubmit('value');
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
```

2. Use in main.ts or component:

```typescript
new MyModal(this.app, (value) => {
    console.log('User submitted:', value);
}).open();
```

### Adding a New Setting

In `src/settings.ts`:

1. Add to interface:
```typescript
export interface VoyaruSettings {
    // ... existing fields
    myNewSetting: boolean;
}
```

2. Add to defaults:
```typescript
export const DEFAULT_SETTINGS: VoyaruSettings = {
    // ... existing defaults
    myNewSetting: false
};
```

3. Add UI in `VoyaruSettingTab.display()`:
```typescript
new Setting(containerEl)
    .setName('My New Setting')
    .setDesc('Description of what this does')
    .addToggle(toggle => toggle
        .setValue(this.plugin.settings.myNewSetting)
        .onChange(async (value) => {
            this.plugin.settings.myNewSetting = value;
            await this.plugin.saveSettings();
        }));
```

### Adding a New Tool to AI

Tools are defined in settings and passed to Gemini AI. To add a new tool:

1. Define tool schema in `AIService.getTools()`:

```typescript
private getTools(): Tool[] {
    return [{
        functionDeclarations: [
            // ... existing tools
            {
                name: "myNewTool",
                description: "Description for AI to understand when to use this",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        arg1: {
                            type: Type.STRING,
                            description: "Description of arg1"
                        }
                    },
                    required: ["arg1"]
                }
            }
        ]
    }];
}
```

2. Handle tool call in `handleToolCalls()`:

```typescript
case 'myNewTool': {
    const arg1 = call.args?.arg1 as string;
    try {
        const result = await this.executeMyNewTool(arg1);
        return {
            name: call.name,
            response: { result }
        };
    } catch (error) {
        return {
            name: call.name,
            response: { error: error.message }
        };
    }
}
```

3. Implement tool logic:

```typescript
private async executeMyNewTool(arg1: string): Promise<any> {
    // Implementation
    return { success: true };
}
```

### Adding a New Context Menu Item

```typescript
// In main.ts onload()
this.registerEvent(
    this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, view: MarkdownView) => {
        const selection = editor.getSelection();

        menu.addItem((item) => {
            item
                .setTitle("My Context Menu Action")
                .setIcon("star")
                .onClick(() => {
                    // Handle action
                    console.log('Selected:', selection);
                });
        });
    })
);
```

### Modifying System Prompt Behavior

The system prompt is processed in `AIService.getProcessedSystemPrompt()`:

```typescript
getProcessedSystemPrompt(): string {
    let prompt = this.settings.systemPrompt;

    // Replace folder placeholders
    prompt = prompt.replace(/\{chapters\}/g, this.settings.folders.chapters);
    // ... other replacements

    // Add conditional instructions based on settings
    if (this.settings.referenceMode === 'path') {
        prompt += `\n\nAlways use readFile tool for referenced files.`;
    }

    return prompt;
}
```

---

## Testing & Debugging

### Manual Testing

1. **Install in Test Vault**:
```bash
# Create symlink for live development
ln -s /path/to/obsidian_aiwriter /path/to/test-vault/.obsidian/plugins/voyaru-plugin

# Or copy build artifacts
npm run build
cp main.js manifest.json styles.css /path/to/test-vault/.obsidian/plugins/voyaru-plugin/
```

2. **Enable Plugin**: Settings → Community plugins → Voyaru AI Writer

3. **Open Developer Tools**: View → Toggle Developer Tools (Ctrl+Shift+I)

4. **Test Features**:
   - Open chat view (ribbon icon or command palette)
   - Try local edit (select text, right-click → "局部修改")
   - Test file operations via AI chat
   - Check session persistence (reload plugin)
   - Test mobile compatibility (if possible)

### Debugging Techniques

**Console Logging**:
```typescript
console.log('Debug info:', variable);
console.error('Error occurred:', error);
console.warn('Warning:', message);

// Structured logging
console.log('📂 Folder operation', { path, files: fileList.length });
console.log('🤖 AI request', { model, tokens: message.length });
```

**React DevTools**:
- Install React DevTools browser extension
- Inspect component state and props in developer tools
- Use React Profiler for performance analysis

**Network Inspection**:
- Open Network tab in developer tools
- Filter by "Fetch/XHR" to see Gemini API calls
- Check request/response payloads for debugging AI interactions

**Breakpoints**:
- Add `debugger;` statement in code
- Use browser DevTools to set breakpoints
- Inspect call stack and variable values

**Error Boundaries** (for React):
```typescript
class ErrorBoundary extends React.Component {
    componentDidCatch(error, errorInfo) {
        console.error('React error:', error, errorInfo);
    }

    render() {
        return this.props.children;
    }
}
```

### Common Issues & Solutions

**Plugin not loading**:
- Check `manifest.json` is valid JSON
- Verify `main.js` exists in plugin folder
- Check console for errors
- Ensure plugin is enabled in settings

**Changes not reflecting**:
- Rebuild with `npm run dev` or `npm run build`
- Disable and re-enable plugin in Obsidian
- Clear Obsidian cache (close and reopen)
- Check for TypeScript compilation errors

**AI not responding**:
- Verify API key is configured in settings
- Check network connectivity
- Inspect console for API errors
- Check Gemini API quota/billing

**File operations failing**:
- Verify folder paths in settings
- Check file permissions
- Ensure vault is initialized properly
- Look for path normalization issues

---

## AI Assistant Guidelines

### Do's ✅

1. **Read Before Editing**:
   - Always use Read tool before editing existing files
   - Understand context before making changes
   - Preserve existing code style and patterns

2. **Follow Architecture**:
   - Respect service layer separation
   - Keep main.ts minimal (lifecycle only)
   - Use appropriate module (service/component/modal)
   - Maintain clear boundaries between UI and logic

3. **Maintain Type Safety**:
   - Add type annotations for new functions
   - Update interfaces when adding properties
   - Use strict TypeScript features
   - Handle null/undefined explicitly

4. **Test Changes**:
   - Describe how to test new features
   - Consider edge cases
   - Think about mobile compatibility
   - Test error scenarios

5. **Preserve User Data**:
   - Never lose user's settings or sessions
   - Implement proper data migration for breaking changes
   - Use safe file operations (writeFile returns previous content for undo)

6. **Document Complex Logic**:
   - Add JSDoc for public APIs
   - Explain non-obvious patterns
   - Document assumptions and constraints

7. **Handle Errors Gracefully**:
   - Use try-catch for async operations
   - Show user-friendly error messages via Notice
   - Log errors to console for debugging
   - Provide fallback behavior when possible

8. **Follow Obsidian Best Practices**:
   - Use `this.register*` for cleanup
   - Respect vault boundaries
   - Avoid blocking operations in onload
   - Clean up resources in onunload

### Don'ts ❌

1. **Never Break Settings**:
   - Don't remove settings fields without migration
   - Don't change default values carelessly
   - Don't assume settings structure

2. **Don't Ignore Mobile**:
   - Avoid desktop-only APIs without fallbacks
   - Test responsive design considerations
   - Don't assume large screen sizes

3. **Don't Hardcode Values**:
   - Use settings for configurable values
   - Use constants for magic numbers
   - Respect user's folder configuration

4. **Don't Leak Resources**:
   - Always clean up event listeners
   - Cancel ongoing operations on unload
   - Close modals and views properly

5. **Don't Skip Error Handling**:
   - Never use unhandled promises
   - Don't assume operations succeed
   - Don't let errors crash the plugin

6. **Don't Violate Privacy**:
   - Never send user data without consent
   - Don't log sensitive information (API keys)
   - Respect Obsidian's privacy model

7. **Don't Over-Engineer**:
   - Keep solutions simple and focused
   - Don't add features beyond requirements
   - Avoid premature abstraction
   - Don't introduce unnecessary dependencies

8. **Don't Commit Build Artifacts**:
   - Never commit `main.js` or `node_modules/`
   - Use .gitignore properly
   - Keep repository clean

### Code Review Checklist

When reviewing or modifying code, check:

- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Settings properly loaded/saved with defaults
- [ ] Error handling implemented for async operations
- [ ] User feedback provided (Notice for important actions)
- [ ] Resources cleaned up in onunload/useEffect cleanup
- [ ] Mobile compatibility considered
- [ ] No console.log spam in production code
- [ ] Documentation updated if behavior changed
- [ ] Backwards compatibility maintained (or migration provided)

### Understanding the AI Workflow

When modifying AI-related features, understand this flow:

1. **User Input** → ChatComponent collects message + referenced files
2. **Context Building** → Based on contextMode:
   - wysiwyg: Full message history sent
   - server: Only new message (Gemini maintains history)
   - single: No history (fresh context each time)
3. **System Prompt** → Processed with folder replacements + reference mode instructions
4. **Tool Availability** → AI can call readFile, writeFile, listFiles, deleteFile, undo
5. **Streaming Response** → Chunks yielded as they arrive
6. **Tool Execution** → FSService handles file operations
7. **UI Update** → React re-renders with new messages
8. **Post-Check** (if enabled) → Additional AI pass for quality check
9. **Session Save** → Auto-saved to settings on changes

### Common Modification Patterns

**Adding a Feature**:
1. Update settings interface (if configurable)
2. Add business logic to appropriate service
3. Update UI component (modal/view)
4. Register command (if user-triggered)
5. Update CLAUDE.md with new pattern
6. Test thoroughly

**Fixing a Bug**:
1. Reproduce the issue
2. Identify root cause (service/UI/settings)
3. Add null checks or error handling
4. Test fix with edge cases
5. Consider if migration needed

**Refactoring**:
1. Ensure tests pass before changes
2. Make small, focused changes
3. Preserve public API compatibility
4. Update documentation if behavior changes
5. Test after each refactor step

---

## References

### Obsidian Resources
- [Obsidian API Documentation](https://docs.obsidian.md)
- [Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Developer Policies](https://docs.obsidian.md/Developer+policies)
- [Sample Plugin Repository](https://github.com/obsidianmd/obsidian-sample-plugin)

### Dependencies
- [Obsidian API Types](https://github.com/obsidianmd/obsidian-api) (obsidian package)
- [Google Gemini AI SDK](https://www.npmjs.com/package/@google/genai)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [esbuild Documentation](https://esbuild.github.io/)

### Project-Specific
- `README.md` - User-facing documentation
- `AGENTS.md` - Obsidian plugin development guidelines
- `manifest.json` - Plugin metadata and configuration
- `package.json` - Dependencies and build scripts

### Community
- [Obsidian Discord](https://discord.gg/obsidianmd) - Developer support
- [Obsidian Forum](https://forum.obsidian.md/) - Plugin discussions
- GitHub Issues - Bug reports and feature requests (if public repo)

---

## Appendix

### Folder Structure Best Practices

Users configure 5 folder types in settings:
- **chapters**: Story chapters/episodes (正文)
- **characters**: Character profiles (角色设定)
- **outlines**: Story outlines (大纲)
- **notes**: General notes (笔记)
- **knowledge**: Reference material (知识库)

AI should respect these when creating files:
```typescript
// Example: Writing a new chapter
const chapterPath = `${plugin.settings.folders.chapters}/第${chapterNum}回 ${title}.md`;
await fsService.writeFile(chapterPath, content);
```

### Session Management

Sessions are auto-saved on every change:
```typescript
// In ChatComponent
useEffect(() => {
    plugin.settings.sessions = sessions;
    plugin.settings.lastSessionId = activeSessionId;
    plugin.saveSettings(); // Async, fire-and-forget
}, [sessions, activeSessionId]);
```

Last active session restored on plugin load:
```typescript
// On mount
const lastSession = plugin.settings.sessions.find(
    s => s.id === plugin.settings.lastSessionId
);
if (lastSession) {
    setActiveSessionId(lastSession.id);
    setMessages(lastSession.messages);
}
```

### Tool Execution Logs

All file operations create logs for undo:
```typescript
interface ToolLog {
    type: 'writeFile' | 'deleteFile';
    path: string;
    previousContent?: string | null; // For undo
    timestamp: number;
}
```

Undo implementation:
```typescript
case 'undo': {
    const log = logs[logIndex];
    if (log.type === 'writeFile') {
        if (log.previousContent === null) {
            // File was created, delete it
            await fsService.deleteFile(log.path);
        } else {
            // File was modified, restore previous content
            await fsService.writeFile(log.path, log.previousContent);
        }
    }
}
```

### Context Modes Explained

**WYSIWYG Mode** (所见即所得):
- Sends full message history every request
- High token usage but guaranteed consistency
- Best for: Critical conversations requiring full context

**Server Mode** (服务器维护):
- Leverages Gemini's server-side chat history
- Efficient token usage
- Best for: Most conversations (recommended default)

**Single Mode** (单轮对话):
- No history sent
- Fastest, lowest token usage
- Best for: Quick one-off queries, tool usage only

### API Key Security

API keys stored in plugin settings (data.json):
- Not committed to git (in .gitignore)
- Stored in vault's .obsidian folder
- Only accessible to plugin code
- Synced via Obsidian Sync (if enabled)

⚠️ **Warning**: Never log full API keys. Use masking:
```typescript
console.log('API Key:', apiKey ? '***' + apiKey.slice(-4) : 'empty');
```

### Performance Considerations

- **Lazy Loading**: Services initialized in onload(), but heavy operations deferred
- **Debounced Saves**: Settings saves debounced (1 second) to avoid excessive disk I/O
- **Streaming**: AI responses streamed for better UX (progressive rendering)
- **Pagination**: File listings limited (maxFilesInPopup setting)
- **Caching**: AI service caches active chats (Map-based)

### Localization

Current state: Mixed Chinese/English
- UI: Primarily Chinese (target audience)
- Code: English (comments and logs)
- System prompt: Chinese
- Settings: Chinese labels, English IDs

For future i18n:
- Extract strings to translation files
- Use Obsidian's i18n utilities
- Support zh-CN and en-US at minimum

---

**Last Updated**: 2026-01-05
**Maintainer**: AI Assistant (Claude)
**For Questions**: Refer to AGENTS.md or Obsidian API docs

---

*This document is maintained for AI assistants working on the Voyaru AI Writer codebase. Keep it updated as the project evolves.*
