import { Plugin, createDropdown, View } from 'ckeditor5';

export class CustomVariablesPlugin extends Plugin {
    private searchInputHandler: ((e: Event) => void) | null = null;
    private clearButtonHandler: ((e: Event) => void) | null = null;
    private buttonEventListeners: Map<
        HTMLElement,
        { mouseenter: () => void; mouseleave: () => void; click: (e: Event) => void }
    > = new Map();
    private isInserting: boolean = false;

    static get pluginName() {
        return 'CustomVariables';
    }

    init() {
        const editor = this.editor;



        // Create the main dropdown
        editor.ui.componentFactory.add('customVariables', () => {
            const dropdown = createDropdown(editor.locale);

            // Configure the dropdown button
            dropdown.buttonView.set({
                label: 'Variables',
                tooltip: 'Insertar Variables de Documento',
                withText: true,
            });

            // Create the main container
            const mainView = new View(editor.locale);
            mainView.setTemplate({
                tag: 'div',
                attributes: {
                    class: 'ck ck-reset',
                    style: 'min-width: 300px;',
                },
            });

            // Create the search field
            const searchView = new View(editor.locale);
            searchView.setTemplate({
                tag: 'div',
                attributes: {
                    class: 'ck ck-reset',
                    style: 'padding: 8px; border-bottom: 1px solid var(--ck-color-base-border); background: var(--ck-color-base-background);',
                },
            });

            // Create a view for the variables content
            const contentView = new View(editor.locale);
            contentView.setTemplate({
                tag: 'div',
                attributes: {
                    class: 'ck ck-reset ck-list',
                    style: 'max-height: 250px; overflow-y: auto;',
                },
            });

            // Add views to the panel
            dropdown.panelView.children.add(mainView);
            dropdown.panelView.children.add(searchView);
            dropdown.panelView.children.add(contentView);

            // Use the dropdown 'change:isOpen' event to populate when opened
            dropdown.on('change:isOpen', (evt, name, isOpen) => {
                // Control tooltip based on dropdown state
                if (isOpen) {
                    // Hide tooltip when open
                    dropdown.buttonView.set('tooltip', false);
                } else {
                    // Show tooltip when closed
                    dropdown.buttonView.set(
                        'tooltip',
                        'Insert Document Variables'
                    );

                    // Clean up event listeners when closed
                    this.cleanupEventListeners(searchView);
                }


            });

            return dropdown;
        });
    }

    private setupSearchEventListeners(
        searchInput: HTMLInputElement,
        searchView: View,
        contentView: View,
        variables: any[],
        dropdown: any,
        editor: any
    ) {
        const clearButton = searchView.element?.querySelector(
            '.ck-button-clear'
        ) as HTMLButtonElement;

        // Remove previous event listeners if they exist
        if (this.searchInputHandler) {
            searchInput.removeEventListener('input', this.searchInputHandler);
        }
        if (this.clearButtonHandler && clearButton) {
            clearButton.removeEventListener('click', this.clearButtonHandler);
        }

        // Reset initial state
        searchInput.value = '';
        if (clearButton) {
            clearButton.style.display = 'none';
        }

        // Function to toggle clear button visibility
        const toggleClearButton = (show: boolean) => {
            if (clearButton) {
                clearButton.style.display = show ? 'flex' : 'none';
            }
        };

        // Create new event handlers
        this.searchInputHandler = (e: Event) => {
            const searchTerm = (
                e.target as HTMLInputElement
            ).value.toLowerCase();

            // Show/hide clear button based on input content
            toggleClearButton(searchTerm.length > 0);

            this.filterVariables(
                contentView.element!,
                variables,
                searchTerm,
                (value: string) => {
                    this.insertVariable(value);
                    dropdown.isOpen = false;
                    editor.editing.view.focus();
                }
            );
        };

        this.clearButtonHandler = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();

            // Clear the input
            searchInput.value = '';

            // Hide clear button
            toggleClearButton(false);

            // Show all variables
            this.filterVariables(
                contentView.element!,
                variables,
                '',
                (value: string) => {
                    this.insertVariable(value);
                    dropdown.isOpen = false;
                    editor.editing.view.focus();
                }
            );

            // Focus back to input
            searchInput.focus();
        };

        // Add event listeners
        searchInput.addEventListener('input', this.searchInputHandler);
        if (clearButton) {
            clearButton.addEventListener('click', this.clearButtonHandler);

            // Add hover effects to clear button
            clearButton.addEventListener('mouseenter', () => {
                clearButton.style.backgroundColor =
                    'var(--ck-color-button-default-hover-background)';
            });

            clearButton.addEventListener('mouseleave', () => {
                clearButton.style.backgroundColor = 'transparent';
            });
        }

        // Focus the search field when opened
        setTimeout(() => {
            searchInput.focus();
        }, 100);
    }

    private cleanupEventListeners(searchView: View) {
        const searchInput = searchView.element?.querySelector(
            'input'
        ) as HTMLInputElement;
        const clearButton = searchView.element?.querySelector(
            '.ck-button-clear'
        ) as HTMLButtonElement;

        if (searchInput && this.searchInputHandler) {
            searchInput.removeEventListener('input', this.searchInputHandler);
        }

        if (clearButton && this.clearButtonHandler) {
            clearButton.removeEventListener('click', this.clearButtonHandler);
        }

        // Reset the search input value and hide clear button
        if (searchInput) {
            searchInput.value = '';
        }

        if (clearButton) {
            clearButton.style.display = 'none';
        }
    }
    private clearButtonEventListeners() {
        // Remove all button event listeners
        for (const [button, handlers] of this.buttonEventListeners.entries()) {
            button.removeEventListener('mouseenter', handlers.mouseenter);
            button.removeEventListener('mouseleave', handlers.mouseleave);
            button.removeEventListener('click', handlers.click);
        }
        this.buttonEventListeners.clear();
    }

    public override destroy() {
        // Clean up all event listeners
        this.clearButtonEventListeners();
        this.searchInputHandler = null;
        this.clearButtonHandler = null;
        this.isInserting = false;
        super.destroy();
    }

    private filterVariables(
        container: HTMLElement,
        variables: any[],
        searchTerm: string,
        onSelect: (value: string) => void
    ) {
        // Clear current content and associated event listeners
        this.clearButtonEventListeners();
        container.innerHTML = '';

        // Filter variables that match the search term
        const filteredVariables = variables.filter(
            (variable) =>
                variable.label.toLowerCase().includes(searchTerm) ||
                variable.description.toLowerCase().includes(searchTerm)
        );

        // Repopulate with filtered variables
        this.populateDropdownContent(container, filteredVariables, onSelect);
    }

    private populateDropdownContent(
        container: HTMLElement,
        variables: any[],
        onSelect: (value: string) => void
    ) {
        variables.forEach((variable) => {
            const item = document.createElement('button');
            item.className = 'ck ck-button ck-list__button';
            item.type = 'button';
            item.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                width: 100%;
                text-align: left;
                padding: 10px 12px;
                border: none;
                background: transparent;
                cursor: pointer;
                color: var(--ck-color-text);
                position: relative;
                min-height: 42px;
                box-sizing: border-box;
                overflow: visible;
            `;

            // Create button content with label and description
            const labelSpan = document.createElement('div');
            labelSpan.textContent = variable.label;
            labelSpan.style.cssText = `
                font-weight: 500;
                margin-bottom: 3px;
                line-height: 1.2;
                width: 100%;
                flex-shrink: 0;
            `;

            const descriptionSpan = document.createElement('div');
            descriptionSpan.textContent = variable.description;
            descriptionSpan.style.cssText = `
                font-size: 0.85em;
                color: var(--ck-color-text-secondary, #707070);
                opacity: 0.8;
                line-height: 1;
                word-wrap: break-word;
                white-space: normal;
                width: 100%;
                flex-grow: 1;
            `;

            item.appendChild(labelSpan);
            item.appendChild(descriptionSpan);

            // Hover effects
            const mouseenterHandler = () => {
                item.style.backgroundColor =
                    'var(--ck-color-list-button-hover-background)';
            };

            const mouseleaveHandler = () => {
                item.style.backgroundColor = 'transparent';
            };

            const clickHandler = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                // Disable the button temporarily to prevent double clicks
                item.disabled = true;

                // Call the onSelect callback
                onSelect(variable.value);

                // Re-enable after a short delay (dropdown should close by then)
                setTimeout(() => {
                    item.disabled = false;
                }, 300);
            };

            item.addEventListener('mouseenter', mouseenterHandler);
            item.addEventListener('mouseleave', mouseleaveHandler);
            item.addEventListener('click', clickHandler);

            // Store event listeners for cleanup
            this.buttonEventListeners.set(item, {
                mouseenter: mouseenterHandler,
                mouseleave: mouseleaveHandler,
                click: clickHandler,
            });

            container.appendChild(item);
        });
    }

    insertVariable(variableText: string) {
        // Prevent multiple insertions
        if (this.isInserting) {
            return;
        }

        this.isInserting = true;

        this.editor.model.change((writer) => {
            const selection = this.editor.model.document.selection;
            const insertPosition = selection.getFirstPosition();

            if (insertPosition && insertPosition.root.rootName !== '$graveyard') {
                try {
                    // Insert the variable with special formatting
                    const textNode = writer.createText(variableText, {
                        bold: true,
                    });

                    // Insert the text node at the current position
                    writer.insert(textNode, insertPosition);

                    // Create a new position after the inserted text
                    const positionAfterText = writer.createPositionAfter(textNode);

                    // Add space after the variable
                    writer.insertText(' ', positionAfterText);

                    // Move cursor after the space
                    const spacePosition = writer.createPositionAfter(positionAfterText.nodeBefore || textNode);
                    writer.setSelection(spacePosition);
                } catch (error) {
                    // Fallback: just insert the text without formatting if there's an error
                    console.warn('Error inserting variable with formatting, using fallback:', error);
                    writer.insertText(variableText + ' ', insertPosition);
                }
            }
        });

        // Reset the flag after insertion
        setTimeout(() => {
            this.isInserting = false;
        }, 100);
    }
}
