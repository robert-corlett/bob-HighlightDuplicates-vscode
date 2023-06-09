import * as vscode from 'vscode';

type Settings = {
	active: boolean;
	borderWidth: string;
	borderStyle: string;
	borderColor: string;
	backgroundColor: string;
	gutterIconSize: string;
	gutterIconSVG: string;
	trimWhiteSpace: boolean;
	ignoreCase: boolean;
	minLineLength: number;
	minDuplicateCount: number;
	ignoreList: Array<string>;
	ignoreCaseForIgnoreList: boolean;
	useSelection: boolean;
	languages: string;
};

type CountedLines = {
	[index: string]: Array<number>;
};

export function activate(context: vscode.ExtensionContext) {
	let settings: Settings = getSettings();
	let activeDecorations = new Map<vscode.Uri, Array<vscode.TextEditorDecorationType>>();
	let firstActive: boolean = true;
	let timeoutHandler: any;

	//Adds commands
	context.subscriptions.push(
		vscode.commands.registerCommand('bob-highlight-duplicates.toggleHighlightDuplicates', () => {
			if (firstActive) {
				firstActive = false;
				vscode.workspace.getConfiguration('bob-highlightDuplicates').update('active', true, true);
			} else {
				vscode.workspace.getConfiguration('bob-highlightDuplicates').update('active', !settings.active, true);
			}
			highlightLines();
		}),
		vscode.commands.registerCommand('bob-highlight-duplicates.selectDuplicates', () => {
			firstActive = false;
			selectLines();
		}),
		vscode.commands.registerCommand('bob-highlight-duplicates.removeDuplicates', () => {
			firstActive = false;
			removeDuplicates();
		})
	);

	//Settings change event listener
	vscode.workspace.onDidChangeConfiguration(() => {
		settings = getSettings();
		highlightLines(true);
	});

	//Document change listener, only listens for changes in active editor
	vscode.workspace.onDidChangeTextDocument((changeEvent) => {
		var currentLanguage: string = vscode.window.activeTextEditor?.document.languageId!;
		var languagesToMatch: string = settings.languages!;
		
		try {
			if (!languagesToMatch.includes(currentLanguage)) {
				return;
			}
			
			if (changeEvent.document !== vscode.window.activeTextEditor?.document) {
				return;
			}

			clearTimeout(timeoutHandler);
			timeoutHandler = setTimeout(() => highlightLines(), 100);
		} catch (error) {
			console.error("Error from 'workspace.onDidChangeTextDocument' -->", error);
		}
	});

	//Active window change listener
	vscode.window.onDidChangeActiveTextEditor(() => {
		var currentLanguage: string = vscode.window.activeTextEditor?.document.languageId!;
		var languagesToMatch: string = settings.languages!;
		try {
			if (!languagesToMatch.includes(currentLanguage)) {
				return;
			} else {
				highlightLines();
			};
			
		} catch (error) {
			console.error("Error from 'window.onDidChangeActiveTextEditor' -->", error);
		}
	});

	//Selection change listener
	//vscode.window.onDidChangeTextEditorSelection((changeEvent) => {
	//	try {
	//		if (!settings.useSelection) {
	//			return;
	//		}

	//		if (changeEvent.textEditor !== vscode.window.activeTextEditor) {
	//			return;
	//		}

	//		clearTimeout(timeoutHandler);
	//		timeoutHandler = setTimeout(() => highlightLines(), 100);
	//	} catch (error) {
	//		console.error("Error from 'window.onDidChangeTextEditorSelection' -->", error);
	//	}
	//});
	/**/

	//Command: toggleHighlightDuplicates
	function highlightLines(updateAllVisibleEditors = false) {
		vscode.window.visibleTextEditors.forEach((editor: vscode.TextEditor) => {
			var currentLanguage: string = vscode.window.activeTextEditor?.document.languageId!;
			var languagesToMatch: string = settings.languages!;
	
			try {
				if (!languagesToMatch.includes(currentLanguage)) {
					return;
				}
				if (!editor) {
					return;
				}
				if (!updateAllVisibleEditors && editor !== vscode.window.activeTextEditor) {
					return;
				}
				
				unHighlightLines(editor.document.uri);

				if (!settings.active) {
					return;
				}

				setDecorations(editor, countLines(editor, false));
			}
			catch (error) {
				console.error("Error from 'highlightLines' -->", error);
			}
		});
	}

	function unHighlightLines(documentUri: vscode.Uri) {
		if (!activeDecorations.has(documentUri)) {
			return;
		}
		activeDecorations.get(documentUri)?.forEach((decoration: vscode.TextEditorDecorationType) => {
			decoration.dispose();
		});
		activeDecorations.delete(documentUri);
	}

	function setDecorations(editor: vscode.TextEditor, countedLines: CountedLines) {
		var newDecorations = [];
		for (var i in countedLines) {
			for (var line in countedLines[i]) {
				var lineRange = editor.document.lineAt(countedLines[i][line]).range;
				var newDecoration = { range: new vscode.Range(lineRange.start, lineRange.end) };
				var decoration = getDecoration();
				editor.setDecorations(decoration, [newDecoration]);
				newDecorations.push(decoration);
			}
		}
		activeDecorations.set(editor.document.uri, newDecorations);
	}

	//Command: selectDuplicates
	function selectLines() {
		try {
			var editor = vscode.window.activeTextEditor;
			var currentLanguage: string = vscode.window.activeTextEditor?.document.languageId!;
			var languagesToMatch: string = settings.languages!;
	
			if (editor?.document && editor?.selections && languagesToMatch.includes(currentLanguage)) {
				var countedLines: CountedLines = countLines(editor);
				var newSelections = [];

				for (var i in countedLines) {
					for (var line in countedLines[i]) {
						var lineRange = editor.document.lineAt(countedLines[i][line]).range;
						newSelections.push(new vscode.Selection(lineRange.start, lineRange.end));
					}
				}
				editor.selections = newSelections;
			}

		} catch (error) {
			console.error("Error from 'selectLines' -->", error);
		}
	}

	//Command: removeDuplicates
	function removeDuplicates() {
		try {
			var editor = vscode.window.activeTextEditor;
			var currentLanguage: string = vscode.window.activeTextEditor?.document.languageId!;
			var languagesToMatch: string = settings.languages!;
	
			if (languagesToMatch.includes(currentLanguage) && editor?.document && editor?.selections) {
				var countedLines: CountedLines = removeFirst(countLines(editor));

				editor.edit(builder => {
					for (var i in countedLines) {
						for (var l in countedLines[i]) {
							if (editor) {
								var lineRange = editor.document.lineAt(countedLines[i][l]).rangeIncludingLineBreak;
								builder.delete(lineRange);
							}
						}
					}
				});
			}
		} catch (error) {
			console.error("Error from 'removeDuplicates' -->", error);
		}
	}

	function removeFirst(countedLines: CountedLines) {
		for (var i in countedLines) {
			countedLines[i].shift();
		}
		return countedLines;
	}

	function range(size: number, startAt: number = 0) {
		return [...Array(size).keys()].map(i => i + startAt);
	}

	function countLines(editor: vscode.TextEditor, useSelection: boolean = settings.useSelection): CountedLines {
		var results: CountedLines = {};
		
// 		if (!String(settings.languages).includes(vscode.window.activeTextEditor.document.languageId)) {
// 			return;
// 		}
		var document = editor.document.getText().split("\n");

		var lines: number[] = [];
		if (useSelection) {
			editor.selections.forEach((selection) => {
				lines = lines.concat(range((selection.end.line - selection.start.line) + 1, selection.start.line));
			});
		}
		if (!useSelection || lines.length < 2) {
			lines = [...Array(document.length).keys()];
		}

		lines.forEach((lineNumber) => {
			var line: string = document[lineNumber];

			if (line.trim().length < settings.minLineLength) {
				return;
			}
			if (settings.ignoreList.indexOf(settings.ignoreCaseForIgnoreList ? line.trim().toLocaleLowerCase() : line.trim()) !== -1) {
				return;
			}

			if (settings.trimWhiteSpace) {
				line = line.trim();
			}
			if (settings.ignoreCase) {
				line = line.toLocaleLowerCase();
			}
			if (line in results) {
				results[line].push(lineNumber);
			} else {
				results[line] = [lineNumber];
			}
		});

		for (var l in results) {
			if (results[l].length <= settings.minDuplicateCount) {
				delete results[l];
			}
		}

		return results;
	}

	function getSettings() {
		const config = vscode.workspace.getConfiguration("bob-highlightDuplicates");

		const active: boolean = config.get("active", true);
		const borderWidth: string = config.get("borderWidth", "1px");
		const borderStyle: string = config.get("borderStyle", "solid");
		const borderColor: string = config.get("borderColor", "yellow");
		const backgroundColor: string = config.get("backgroundColor", "rgba(179,255,174,30)");
		const gutterIconSize: string = config.get("gutterIconSize", "contain");
		const gutterIconSVG: string = config.get("gutterIconSVG", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBkPSJNMTMuMjIgMTkuMDNhLjc1Ljc1IDAgMCAxIDAtMS4wNkwxOC4xOSAxM0gzLjc1YS43NS43NSAwIDAgMSAwLTEuNWgxNC40NGwtNC45Ny00Ljk3YS43NDkuNzQ5IDAgMCAxIC4zMjYtMS4yNzUuNzQ5Ljc0OSAwIDAgMSAuNzM0LjIxNWw2LjI1IDYuMjVhLjc1Ljc1IDAgMCAxIDAgMS4wNmwtNi4yNSA2LjI1YS43NS43NSAwIDAgMS0xLjA2IDBaIiBmaWxsPSIjNzhlOWZmIi8+PC9zdmc+");
		const trimWhiteSpace: boolean = config.get("trimWhiteSpace", true);
		const ignoreCase: boolean = config.get("ignoreCase", true);
		const minLineLength: number = config.get("minLineLength", 5);
		const minDuplicateCount: number = config.get("minDuplicateCount", 1);
		const ignoreList: Array<string> = config.get("ignoreList", []);
		const ignoreCaseForIgnoreList: boolean = config.get("ignoreCaseForIgnoreList", true);
		const useSelection: boolean = config.get("useSelection", false);
		const languages: string = config.get("languages", "plaintext shellscript markdown");
		
		if (ignoreCaseForIgnoreList) {
			for (var i in ignoreList) {
				ignoreList[i] = ignoreList[i].toLocaleLowerCase();
			}
		}

		const settings: Settings = {
			active,
			borderWidth,
			borderStyle,
			borderColor,
			backgroundColor,
			gutterIconSize,
			gutterIconSVG,
			trimWhiteSpace,
			ignoreCase,
			minLineLength,
			minDuplicateCount,
			ignoreList,
			ignoreCaseForIgnoreList,
			useSelection,
			languages
		};

		return settings;
	}

	function getDecoration(): vscode.TextEditorDecorationType {
		const decorationType = vscode.window.createTextEditorDecorationType({
			isWholeLine: false,
			borderWidth: `${settings.borderWidth}`,
			borderStyle: `${settings.borderStyle}`,
			borderColor: `${settings.borderColor}`,
			backgroundColor: `${settings.backgroundColor}`,
			gutterIconPath: vscode.Uri.parse(`${settings.gutterIconSVG}`),
			gutterIconSize: `${settings.gutterIconSize}`
		});

		return decorationType;
	}
}

// this method is called when your extension is deactivated
export function deactivate() { }
