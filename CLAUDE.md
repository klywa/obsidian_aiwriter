# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Voyaru AI Writer** is an Obsidian community plugin that provides AI-powered writing assistance specifically designed for fiction writers. It integrates Google's Gemini AI models to help authors create, manage, and refine creative works within their Obsidian vault.

- **Plugin ID**: `voyaru-plugin`
- **Type**: Obsidian Community Plugin (TypeScript → bundled JavaScript)
- **Mobile Support**: Yes (`isDesktopOnly: false`)
- **AI Provider**: Google Gemini API (`@google/genai` SDK)
- **UI Framework**: React 19 (mounted within Obsidian's API)

## Development Commands

```bash
# Install dependencies
npm install

# Development mode (watch + auto-rebuild)
npm run dev

# Production build (TypeScript check + minification)
npm run build

# Run ESLint
npm run lint

# Version bump (updates manifest.json, package.json, versions.json)
npm run version
```

## Build System

- **Bundler**: esbuild (configured in `esbuild.config.mjs`)
- **Entry Point**: `src/main.ts`
- **Output**: `main.js` (single bundled file at project root)
- **Target**: ES2018, CommonJS format
- **External Dependencies**: `obsidian`, `@codemirror/*`, `electron`
- **Watch Mode**: Automatically rebuilds on file changes in dev mode

## Architecture Overview

### Layered Architecture

The codebase follows a clear separation of concerns across four layers:

1. **Core Plugin Layer** (`src/main.ts`)
   - Plugin lifecycle management (onload/onunload)
   - Command registration and event handling
   - Service initialization and coordination
   - View registration and activation
   - Minimal business logic (399 lines)

2. **Service Layer** (`src/services/`)
   - **AIService** (`ai_service.ts`, ~1100+ lines): Core AI integration
     - Gemini API client management and session handling
     - Streaming chat with context management (3 modes)
     - Function calling for file operations (readFile, writeFile, deleteFile, listFiles)
     - Post-check validation and refinement pipeline
     - Style guide auto-loading and integration
     - Project file tree context generation
   - **FSService** (`fs_service.ts`, 124 lines): File system abstraction
     - CRUD operations on vault files
     - Folder traversal and file listing
     - Path normalization for vault-relative operations
   - **PromptService** (`prompt_service.ts`, ~300 lines): Centralized prompt management
     - Loads and parses prompts.json configuration
     - Provides type-safe getter methods for all prompts
     - Handles template variable substitution (e.g., `${filePath}`)
     - Supports i18n structure (zh/en) with fallback
     - Manages system prompts, tool definitions, post-check, and local edit prompts

3. **UI Layer** (`src/views/`, `src/components/`)
   - **ChatView** (`chat_view.ts`): Obsidian ItemView wrapper
   - **ChatComponent** (`ChatComponent.tsx`, 2832 lines): Main React interface
     - Session management with persistence
     - Message rendering (markdown, thinking blocks, tool results)
     - File reference system with `@` mention autocomplete
     - Real-time streaming response display
     - Tool execution visualization
     - Query history browser integration
   - **Reusable Components**:
     - FileSuggest/FolderSuggest: Autocomplete for file/folder paths
     - Icons: SVG icon library (173 lines)

4. **Modal Layer** (`src/modals/`)
   - Configuration and utility dialogs
   - LocalEditModal: Inline text editing with AI
   - HistoryPromptModal: Query history browser
   - SystemPromptModal: System prompt editor
   - ToolsManagerModal: Agent tool configuration
   - PostCheckManagerModal: Quality check rule management
   - FolderConfigModal: Folder structure setup
   - LogModal: Debug log viewer

### Key Architectural Patterns

- **Service Pattern**: Business logic encapsulated in service classes
- **Observer Pattern**: CustomEvents for cross-component communication (e.g., `voyaru-add-context`)
- **Strategy Pattern**: Three context modes (wysiwyg/server/single) for different use cases
- **Command Pattern**: Tool system for AI agent file operations
- **Singleton Pattern**: Service instances shared across plugin lifecycle

## Core Features and Implementation

### 1. Context Management Modes

The plugin supports three distinct context management strategies (`contextMode` in settings):

- **WYSIWYG** (What You See Is What You Get)
  - Full message history sent with every request
  - Complete transparency but higher token usage
  - Implementation: `streamChat()` always includes full history

- **Server Mode** (Default)
  - Leverages Gemini's built-in session management
  - Maintains chat context server-side
  - Significantly reduced token usage
  - Implementation: Reuses `activeChats` map keyed by sessionId

- **Single Mode**
  - No conversation history retained
  - Each message is independent
  - Minimal token usage for one-off queries
  - Implementation: Creates new chat for each request

### 2. File Reference System

Users can reference files using `@` mentions in the chat interface:

- **Autocomplete**: Shows files from all configured folders (chapters, characters, outlines, notes, knowledge)
- **Two Reference Modes** (`referenceMode` setting):
  - **Content Mode**: Full file content embedded directly in user message
  - **Path Mode**: Only file path sent; AI must use `readFile` tool to access content
- **Implementation**: ChatComponent.tsx parses `@` mentions, extracts referenced files, and formats them in message

### 3. AI Function Calling Tools

The AI agent has four file operation tools (defined in `AIService.getTools()`):

```typescript
1. readFile(path: string) -> string
   - Reads and returns file content from vault

2. writeFile(path: string, content: string, type?: FileType) -> void
   - Creates/updates files with automatic folder detection based on type
   - Triggers post-check validation on chapter files

3. deleteFile(path: string) -> void
   - Moves file to system trash (recoverable)

4. listFiles(folder: string, type?: FileType) -> string[]
   - Lists files in specified folder
   - Optional filtering by type (chapter/character/outline/note/knowledge)
```

**Important**: When AI calls `writeFile` on a chapter file and `enablePostCheck` is true, `performPostCheckAndRefine()` automatically runs validation and refinement.

### 4. Post-Check Validation Pipeline

Automatic quality assurance for chapter files:

1. Detects `writeFile` calls to files in the chapters folder
2. Creates temporary chat session with validation prompt
3. Runs configurable check items (defined in `postCheckItems` setting)
4. AI generates validation feedback and refined content
5. Validates no significant content loss (>50% threshold)
6. Auto-updates file with refined version if checks pass

**Implementation**: See `AIService.performPostCheckAndRefine()` in `ai_service.ts`

### 5. Local Edit Feature

Inline text editing with AI (Command: "局部修改"):

1. User selects text in editor and triggers command or context menu
2. LocalEditModal opens for user to enter edit instructions
3. Plugin reads full file content and extracts context (5 lines before/after)
4. Creates special system prompt for focused editing
5. Streams modified content from AI
6. Applies changes via `editor.replaceRange()`
7. LocalEditStatusModal shows progress and status

**Implementation**: See `VoyaruPlugin.performLocalEdit()` in `main.ts`

### 6. Style Guide Auto-Loading

Automatic integration of project style guidelines:

1. Searches for "风格指南.md" in knowledge or notes folders
2. If found, adds mandatory instruction to system prompt
3. AI is forced to call `readFile` to load style guide before any creative work
4. Style guide path injected into prompt: see `AIService.getFullSystemPrompt()`

### 7. Project File Tree Context

Every AI chat request includes a visual file tree:

- Generated by `AIService.getProjectFileTree()`
- Lists all files in configured folders (chapters, characters, outlines, notes, knowledge)
- Organized by folder type
- Helps AI understand project structure and available resources

## Prompt Management System

### Overview

所有核心 AI 提示词都**硬编码在代码中**（`src/services/default_prompts.ts`），确保用户更新插件后立即使用最新指令。

- **硬编码策略**: 核心系统指令直接嵌入代码，不从外部文件读取
- **版本同步**: 用户只需更新 `main.js` 即可获得最新提示词
- **Internationalization ready**: Supports zh/en structure (currently zh only)
- **Template support**: Variable substitution for dynamic prompts
- **Type safety**: Validated structure via PromptService

### 核心提示词结构 (default_prompts.ts)

```typescript
// src/services/default_prompts.ts
export const DEFAULT_PROMPTS = {
  version: "1.0.0",
  system: {
    base: { zh: "...", en: null },           // 核心系统指令
    jailbreak: { zh: "...", optional: true }, // 可选的扩展内容
    styleGuideInstruction: { zh: "...", template: true },
    referenceModeInstruction: { zh: "..." }
  },
  tools: {
    default: [...],                           // 默认 Agent 工具
    functionDefinitions: { ... }              // AI 工具定义
  },
  postCheck: { ... },                         // 后置检查提示词
  localEdit: { ... }                          // 局部编辑提示词
}
```

> **注意**: `prompts.json` 文件仅用于开发参考，运行时不会被读取。

### PromptService API

The `PromptService` class provides type-safe access to all prompts:

```typescript
// System prompts
promptService.getSystemPrompt(includeJailbreak?: boolean): string
promptService.getStyleGuideInstruction(styleGuidePath: string): string
promptService.getReferenceModeInstruction(): string

// Tools
promptService.getDefaultTools(): AgentTool[]
promptService.getToolDefinition(toolName: string): FunctionDeclaration
promptService.getAllToolDefinitions(): FunctionDeclaration[]

// Post-check
promptService.getPostCheckSystemPrompt(basePrompt, fileTree, checkItems): string
promptService.getPostCheckUserMessage(filePath, originalContent): string
promptService.getDefaultPostCheckItems(): PostCheckItem[]

// Local edit
promptService.getLocalEditSystemInstruction(basePrompt): string
promptService.getLocalEditUserMessage(params: LocalEditParams): string
```

### Customizing Prompts (开发者)

1. **修改核心提示词**: 编辑 `src/services/default_prompts.ts`，然后重新构建
2. **Templates**: Use `${variableName}` syntax for dynamic content
3. **Optional content**: Set `"optional": true` to make prompts togglable

### Important Notes

- **硬编码策略**: 核心系统指令存储在 `default_prompts.ts` 中，随代码一起打包。用户更新 `main.js` 后立即生效。
- **用户自定义**: 用户可以通过设置界面的"自定义提示词"添加个性化指令，这部分保存在 `data.json` 中。
- **Jailbreak content**: The `system.jailbreak` section contains content designed to bypass safety guidelines. It's marked as optional and should be reviewed carefully.
- **Language fallback**: Currently uses Chinese (zh) with null English placeholders. Falls back to zh if en is not available.

## Important Settings and Configuration

### VoyaruSettings Interface

Key settings to understand when modifying the plugin:

```typescript
{
  apiKey: string                    // Gemini API key
  model: string                     // Selected Gemini model ID
  systemPrompt: string              // Base AI instructions (supports {folder} placeholders)
  folders: {                        // Organized file structure
    chapters: string                // Fiction chapters folder path
    characters: string              // Character profiles folder path
    outlines: string                // Plot outlines folder path
    notes: string                   // General notes folder path
    knowledge: string               // Reference materials folder path
  }
  tools: AgentTool[]                // Custom agent tools (name + prompt)
  postCheckItems: PostCheckItem[]   // Validation rules (id + checkPrompt)
  enablePostCheck: boolean          // Enable automatic quality checks
  sessions: Session[]               // Chat history with messages
  lastSessionId: string | null      // Active session ID
  fontSize: number                  // UI font size
  contextMode: 'wysiwyg' | 'server' | 'single'  // Context strategy
  referenceMode: 'content' | 'path'             // File reference method
  maxFilesInPopup: number           // Limit for @ mention autocomplete
  queryHistory: QueryHistoryItem[]  // Search history tracking
  sendWithShiftEnter: boolean       // Keyboard shortcut preference
}
```

**Persistence**: Settings are automatically saved to `data.json` using Obsidian's `loadData()`/`saveData()` API with 200ms debounce (see `VoyaruPlugin.saveSettings()`).

### Supported Gemini Models

- `gemini-3-pro-preview` - Thinking mode (default)
- `gemini-3-flash-preview` - Fast with thinking
- `gemini-2.5-flash` - Standard fast model

Models are defined in `MODELS` constant in `settings.ts`.

## Requirement Management Rules

1. **需求汇总到 TASK 文件**: 用户提出的所有需求，必须将详细的需求描述汇总到项目根目录下的 `TASK.md` 文件中。每个需求作为独立的条目，使用 `- [ ]` 格式记录，包含需求描述、涉及的功能模块等关键信息。
2. **完成标记**: 在逐步开发过程中，每完成一个 feature 的开发**且测试通过**后，必须将 `TASK.md` 中对应的需求条目从 `- [ ]` 改为 `- [x]`，以标记完成。这样可以清楚区分：尚未实现的需求、已实现但未测试的需求、已完成（开发+测试）的需求。

## Code Modification Guidelines

### When Modifying AI Service (`ai_service.ts`)

- **Client Initialization**: Only re-initialize `genAI` client when API key or model changes (see `updateSettings()`)
- **Session Management**: `activeChats` map stores active Gemini chat sessions by sessionId
- **Context Modes**: Respect `contextMode` setting when building request history
- **Tool Handling**: Tool results must be fed back to AI via `sendMessageStream()` for multi-turn tool execution
- **Error Handling**: Always wrap Gemini API calls in try-catch and display user-friendly notices

### When Modifying Chat UI (`ChatComponent.tsx`)

- **React 19**: Uses modern React APIs (createRoot, concurrent features)
- **State Management**: Session state, messages, and file references managed via React hooks
- **Streaming**: Uses async generator patterns to handle streaming responses
- **File References**: Parse `@` mentions with `extractFileReferences()` before sending to AI
- **Abort Controllers**: Always provide AbortController to allow cancellation of streaming operations

### When Adding New Commands

1. Register in `VoyaruPlugin.onload()` via `this.addCommand()`
2. Use stable, unique command IDs (never change after release)
3. For editor commands, use `editorCallback` to access active editor
4. Add context menu items via `editor-menu` event if applicable

### When Adding New Settings

1. Update `VoyaruSettings` interface in `settings.ts`
2. Add default value to `DEFAULT_SETTINGS` constant
3. Add UI control in `VoyaruSettingTab.display()` method
4. Update `AIService.updateSettings()` if setting affects AI behavior
5. Consider adding migration logic if changing existing settings structure

### When Modifying Prompts

1. **修改核心提示词**: 编辑 `src/services/default_prompts.ts`
2. **For new prompt types**:
   - Add to `DEFAULT_PROMPTS` structure in `default_prompts.ts`
   - Update `PromptsConfig` interface in `prompt_service.ts`
   - Add getter method in `PromptService` class
   - Update calling code to use new prompt
3. **For template variables**: Use `${variableName}` syntax in prompt text
4. **Testing**: 运行 `npm run build` 重新构建，然后在 Obsidian 中重新加载插件

## Key File Paths Reference

- **Plugin Entry**: [src/main.ts](src/main.ts) - Plugin lifecycle and command registration
- **AI Service**: [src/services/ai_service.ts](src/services/ai_service.ts) - Gemini API integration (~1100 lines)
- **Prompt Service**: [src/services/prompt_service.ts](src/services/prompt_service.ts) - Centralized prompt management (~300 lines)
- **Default Prompts**: [src/services/default_prompts.ts](src/services/default_prompts.ts) - 核心系统指令（硬编码）
- **Chat UI**: [src/views/ChatComponent.tsx](src/views/ChatComponent.tsx) - Main React interface (2832 lines)
- **Settings**: [src/settings.ts](src/settings.ts) - Settings interface and UI
- **File System**: [src/services/fs_service.ts](src/services/fs_service.ts) - Vault file operations
- **Build Config**: [esbuild.config.mjs](esbuild.config.mjs) - Build configuration
- **Manifest**: [manifest.json](manifest.json) - Plugin metadata
- **Styles**: [styles.css](styles.css) - Custom CSS styling

## Testing and Debugging

### Manual Testing

1. Run `npm run dev` to start watch mode
2. Copy or symlink plugin folder to test vault: `<Vault>/.obsidian/plugins/obsidian_aiwriter/`
3. Ensure `main.js`, `manifest.json`, and `styles.css` are present
4. Reload Obsidian (Ctrl/Cmd+R)
5. Enable plugin in **Settings → Community plugins**

### Debugging

- **Console Logs**: Check Developer Tools (Ctrl/Cmd+Shift+I)
- **Log Modal**: Use built-in LogModal for debugging AI interactions
- **AI Service**: Console logs show API calls, tool executions, and context mode behavior
- **Common Issues**:
  - API errors: Check API key validity and network connectivity
  - Streaming stops: Check AbortController state and error handlers
  - Settings not persisting: Verify `saveData()` is called after modifications

## Obsidian API Compatibility

- **Minimum Version**: 1.0.0
- **Mobile Support**: Full mobile compatibility (no desktop-only APIs used)
- **Key APIs Used**:
  - `Plugin` base class for lifecycle
  - `WorkspaceLeaf` and custom views for UI
  - `Editor` API for inline editing
  - `TFile` and `TFolder` for file operations
  - `Menu` for context menu integration
  - `Notice` for user notifications
  - `loadData()`/`saveData()` for settings persistence

## Security and Privacy

- **Local-First**: All file operations restricted to vault using `normalizePath()`
- **API Key Storage**: Stored in Obsidian's `data.json` (vault-specific, not synced by default)
- **External Service**: Requires Google Gemini API (documented in settings)
- **No Telemetry**: No analytics or tracking
- **Data Transmission**: Only sends data when user explicitly triggers AI features
- **File Safety**: Delete operations use system trash (recoverable)

## Release Process

1. Update `version` in `manifest.json` (follow SemVer)
2. Run `npm run version` to update version files
3. Run `npm run build` to generate production build
4. Create GitHub release with tag matching version (no `v` prefix)
5. **Attach the following files to release**:
   - ✅ `manifest.json` - Plugin metadata
   - ✅ `main.js` - Bundled plugin code (包含所有核心系统指令)
   - ✅ `styles.css` - Custom styling
6. Update `versions.json` to map plugin version → minimum Obsidian version

**注意**: 核心系统指令已硬编码在 `main.js` 中，用户只需更新 `main.js` 即可获得最新指令，无需额外下载 `prompts.json`。

## External Dependencies

**Runtime Dependencies**:
- `@google/genai` (^1.34.0) - Google Gemini AI SDK
- `react` (^19.2.3) + `react-dom` - UI framework
- `sortablejs` (^1.15.6) - Drag-and-drop for lists
- `obsidian` (latest) - Obsidian plugin API

**Important**: All dependencies except `obsidian`, `@codemirror/*`, and `electron` are bundled into `main.js` by esbuild. Keep bundle size reasonable by avoiding large dependencies.
