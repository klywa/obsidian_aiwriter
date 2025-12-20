import { App, TFile, AbstractInputSuggest } from "obsidian";

export class FileSuggest extends AbstractInputSuggest<TFile> {
    private inputEl: HTMLInputElement;

    constructor(app: App, textInputEl: HTMLInputElement) {
        super(app, textInputEl);
        this.inputEl = textInputEl;
    }

    getSuggestions(query: string): TFile[] {
        const files = this.app.vault.getMarkdownFiles();
        const lowerCaseQuery = query.toLowerCase();
        return files
            .filter(file => file.path.toLowerCase().includes(lowerCaseQuery))
            .slice(0, 20);
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.setText(file.path);
    }

    selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.inputEl.value = file.path;
        this.inputEl.trigger("input"); // Manually trigger input event to update listeners
        this.close();
    }
}
