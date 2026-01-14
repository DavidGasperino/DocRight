import * as vscode from 'vscode';

import { getWorkspaceRoot } from './host/workspace';
import { ensureSettingsFile } from './settings/settings';
import { createLogger } from './host/logger';
import { LlmController } from './llm/controller';
import { LlmPanelHost } from './host/llm-panel-host';
import { buildPromptPreview } from './host/prompt-preview';
import { initializeDocRightProject } from './project/initialize';
import { docRightConfigExists, loadDocRightConfig } from './storage/docright-config';
import { DocRightEditorHost } from './host/docright-editor-host';
import { DocRightCalloutsHost } from './host/callouts-panel-host';
import { DocRightTimelinePanelHost } from './host/timeline-panel-host';
import { DocRightTimelineProvider } from './host/timeline';
import { DocRightQuickstartViewProvider } from './host/quickstart-view';
import { loadDocRightIterationMetadata } from './storage/docright-iterations';
import {
  appendDiagnosticsLog,
  captureTabGroups,
  getDocRightRootFromResponsePath,
  isRooResponsePath
} from './host/ui-diagnostics';

type RefactorApi = {
  getLlmDiagnostics: () => ReturnType<LlmController['getDiagnostics']>;
};

export function activate(context: vscode.ExtensionContext): RefactorApi {
  const logger = createLogger(true);
  let activeRoot: string | null = null;
  let llmController: LlmController | null = null;
  let llmPanelHost: LlmPanelHost | null = null;
  let editorHost: DocRightEditorHost | null = null;
  let calloutsHost: DocRightCalloutsHost | null = null;
  let timelinePanelHost: DocRightTimelinePanelHost | null = null;
  const timelineProvider = new DocRightTimelineProvider();
  const quickstartProvider = new DocRightQuickstartViewProvider(context.extensionUri);

  const ensureHosts = (settings: Awaited<ReturnType<typeof ensureSettingsFile>>) => {
    if (!llmController) {
      llmController = new LlmController(settings, logger);
      llmPanelHost = new LlmPanelHost(context.extensionUri, llmController, settings, logger);
    } else if (llmPanelHost) {
      llmController.updateSettings(settings);
      llmPanelHost.updateSettings(settings);
    }

    if (!editorHost) {
      editorHost = new DocRightEditorHost(context.extensionUri, settings, logger);
    } else {
      editorHost.updateSettings(settings);
    }
    if (llmPanelHost && editorHost) {
      llmPanelHost.setEditorHost(editorHost);
    }

    if (!timelinePanelHost) {
      timelinePanelHost = new DocRightTimelinePanelHost(context.extensionUri, logger);
    }

    if (editorHost && llmPanelHost && llmController && timelinePanelHost && !calloutsHost) {
      calloutsHost = new DocRightCalloutsHost(
        context.extensionUri,
        editorHost,
        llmPanelHost,
        llmController,
        timelinePanelHost,
        settings,
        logger
      );
      editorHost.setCalloutsChangedHandler(() => {
        void calloutsHost?.refresh();
      });
      llmPanelHost.setCalloutsRefreshHandler(() => {
        void calloutsHost?.refresh();
      });
      llmPanelHost.setTimelineRefreshHandler(() => {
        timelineProvider.refresh();
        void timelinePanelHost?.refresh();
      });
      calloutsHost.setTimelineRefreshHandler(() => {
        timelineProvider.refresh();
        void timelinePanelHost?.refresh();
      });
    } else if (calloutsHost) {
      calloutsHost.updateSettings(settings);
    }
  };

  const toViewColumn = (value: number | undefined, fallback: vscode.ViewColumn): vscode.ViewColumn => {
    const column = Number(value);
    if (Number.isFinite(column) && column > 0) {
      return column as vscode.ViewColumn;
    }
    return fallback;
  };

  const ensureEditorGroup = async (targetIndex: number): Promise<void> => {
    const tabGroups = vscode.window.tabGroups;
    if (!tabGroups) {
      return;
    }
    while (tabGroups.all.length <= targetIndex) {
      try {
        await vscode.commands.executeCommand('workbench.action.focusLastEditorGroup');
        await vscode.commands.executeCommand('workbench.action.newGroupRight');
      } catch (error) {
        break;
      }
    }
  };

  const focusEditorGroup = async (targetColumn: vscode.ViewColumn): Promise<void> => {
    const targetIndex = Math.max(0, Math.min(Number(targetColumn) - 1, 3));
    await ensureEditorGroup(targetIndex);
    const commandMap: Record<number, string> = {
      [vscode.ViewColumn.One]: 'workbench.action.focusFirstEditorGroup',
      [vscode.ViewColumn.Two]: 'workbench.action.focusSecondEditorGroup',
      [vscode.ViewColumn.Three]: 'workbench.action.focusThirdEditorGroup',
      [vscode.ViewColumn.Four]: 'workbench.action.focusFourthEditorGroup'
    };
    const command = commandMap[targetColumn] ?? 'workbench.action.focusLastEditorGroup';
    try {
      await vscode.commands.executeCommand(command);
    } catch (error) {
      // Ignore focus errors.
    }
  };

  const moveActiveEditorToColumn = async (targetColumn: vscode.ViewColumn): Promise<void> => {
    const tabGroups = vscode.window.tabGroups;
    if (!tabGroups || !tabGroups.activeTabGroup) {
      return;
    }
    const targetIndex = Math.max(0, Math.min(Number(targetColumn) - 1, 3));
    await ensureEditorGroup(targetIndex);
    for (let i = 0; i < 6; i += 1) {
      const currentIndex = tabGroups.all.indexOf(tabGroups.activeTabGroup);
      if (currentIndex === -1 || currentIndex === targetIndex) {
        return;
      }
      if (currentIndex < targetIndex) {
        const moved = await tryMoveActiveEditor('right');
        if (!moved) {
          return;
        }
      } else {
        const moved = await tryMoveActiveEditor('left');
        if (!moved) {
          return;
        }
      }
    }
  };

  const tryMoveActiveEditor = async (direction: 'left' | 'right'): Promise<boolean> => {
    const commands =
      direction === 'right'
        ? [
            'workbench.action.moveEditorToRightGroup',
            'workbench.action.moveActiveEditorToRightGroup',
            'workbench.action.moveEditorToNextGroup'
          ]
        : [
            'workbench.action.moveEditorToLeftGroup',
            'workbench.action.moveActiveEditorToLeftGroup',
            'workbench.action.moveEditorToPreviousGroup'
          ];
    for (const command of commands) {
      try {
        await vscode.commands.executeCommand(command);
        return true;
      } catch (error) {
        // Try the next command if this one isn't available.
      }
    }
    return false;
  };

  const getTabViewType = (tab: vscode.Tab): string | null => {
    const input = tab.input as vscode.TabInputWebview | { viewType?: string };
    if (input && typeof input === 'object' && 'viewType' in input && input.viewType) {
      return String(input.viewType);
    }
    return null;
  };

  const findTabByViewType = (predicate: (viewType: string) => boolean): { group: vscode.TabGroup; index: number } | null => {
    for (const group of vscode.window.tabGroups.all) {
      const index = group.tabs.findIndex((tab) => {
        const viewType = getTabViewType(tab);
        return viewType ? predicate(viewType) : false;
      });
      if (index >= 0) {
        return { group, index };
      }
    }
    return null;
  };

  const activateTabAtIndex = async (group: vscode.TabGroup, index: number): Promise<void> => {
    const column = group.viewColumn ?? vscode.ViewColumn.One;
    await vscode.commands.executeCommand(getGroupFocusCommand(column));
    const commandIndex = Math.max(1, Math.min(index + 1, 9));
    await vscode.commands.executeCommand(`workbench.action.openEditorAtIndex${commandIndex}`);
  };

  const moveTabToColumn = async (
    predicate: (viewType: string) => boolean,
    targetColumn: vscode.ViewColumn
  ): Promise<void> => {
    const info = findTabByViewType(predicate);
    if (!info) {
      return;
    }
    await activateTabAtIndex(info.group, info.index);
    const currentColumn = info.group.viewColumn ?? vscode.ViewColumn.One;
    const steps = Number(targetColumn) - Number(currentColumn);
    if (!Number.isFinite(steps) || steps === 0) {
      return;
    }
    for (let i = 0; i < Math.abs(steps); i += 1) {
      const moved = await tryMoveActiveEditor(steps > 0 ? 'right' : 'left');
      if (!moved) {
        return;
      }
    }
  };

  const normalizePanelLayout = async (settings: Awaited<ReturnType<typeof ensureSettingsFile>>): Promise<void> => {
    await ensureEditorGroup(3);
    await moveTabToColumn((viewType) => viewType === 'docRightRefactor.editor', toViewColumn(settings.ui.columns.editor, vscode.ViewColumn.One));
    await moveTabToColumn((viewType) => viewType === 'docRightRefactor.calloutsPanel', toViewColumn(settings.ui.columns.callouts, vscode.ViewColumn.Two));
    await moveTabToColumn((viewType) => viewType === 'docRightRefactor.llmPanel', toViewColumn(settings.ui.columns.llm, vscode.ViewColumn.Three));
    await moveTabToColumn((viewType) => viewType.toLowerCase().includes('roo'), toViewColumn(settings.ui.columns.roo, vscode.ViewColumn.Four));
  };

  const getGroupFocusCommand = (column: vscode.ViewColumn): string => {
    switch (column) {
      case vscode.ViewColumn.One:
        return 'workbench.action.focusFirstEditorGroup';
      case vscode.ViewColumn.Two:
        return 'workbench.action.focusSecondEditorGroup';
      case vscode.ViewColumn.Three:
        return 'workbench.action.focusThirdEditorGroup';
      case vscode.ViewColumn.Four:
        return 'workbench.action.focusFourthEditorGroup';
      default:
        return 'workbench.action.focusLastEditorGroup';
    }
  };

  const delay = async (ms: number): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  };

  const getSessionRoot = (): string | null => activeRoot ?? getWorkspaceRoot();

  const pickDocRightRoot = async (
    modeOverride?: 'new' | 'resume'
  ): Promise<{ root: string; mode: 'new' | 'resume' } | null> => {
    let mode: 'new' | 'resume';
    if (modeOverride) {
      mode = modeOverride;
    } else {
      const choice = await vscode.window.showQuickPick(
        [
          { label: 'Start a new DocRight project', value: 'new' as const },
          { label: 'Resume an existing DocRight project', value: 'resume' as const }
        ],
        { placeHolder: 'Start a new DocRight session or resume an existing one' }
      );
      if (!choice) {
        return null;
      }
      mode = choice.value;
    }

    const workspaceRoot = getWorkspaceRoot();
    const folders = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      defaultUri: workspaceRoot ? vscode.Uri.file(workspaceRoot) : undefined,
      openLabel: 'Select project folder'
    });
    if (!folders || folders.length === 0) {
      return null;
    }
    return { root: folders[0].fsPath, mode };
  };

  const openRooPanel = async (settings: Awaited<ReturnType<typeof ensureSettingsFile>>) => {
    const extensionAvailable = settings.roo.extensionIds.some((id) => vscode.extensions.getExtension(id));
    if (!extensionAvailable) {
      return;
    }
    try {
      const targetColumn = toViewColumn(settings.ui.columns.roo, vscode.ViewColumn.Four);
      await focusEditorGroup(targetColumn);
      await vscode.commands.executeCommand('roo-cline.openInNewTab');
      try {
        await vscode.commands.executeCommand('roo-cline.focusInput');
      } catch (error) {
        // Ignore if focus command is unavailable.
      }
      await delay(150);
      llmPanelHost?.markRooOpened();
    } catch (error) {
      logger.debug('Failed to open Roo panel', error);
    }
  };

  const openLlmPanelForRoot = async (
    root: string,
    settings: Awaited<ReturnType<typeof ensureSettingsFile>>
  ) => {
    ensureHosts(settings);

    let html = '';
    if (editorHost && editorHost.isOpenForRoot(root)) {
      try {
        html = await editorHost.requestHtmlExport({ useActiveScope: true });
      } catch (error) {
        logger.debug('Failed to export editor HTML for LLM prompt', error);
        void vscode.window.showErrorMessage(
          error instanceof Error ? error.message : 'Failed to export the document for prompt generation.'
        );
        return;
      }
    }

    const prompt = await buildPromptPreview(root, settings, { html });
    if (llmPanelHost) {
      llmPanelHost.setRoot(root);
      await llmPanelHost.open(prompt, {
        viewColumn: toViewColumn(settings.ui.columns.llm, vscode.ViewColumn.Three),
        preserveFocus: true
      });
    }
  };

  const runSessionFlow = async (modeOverride?: 'new' | 'resume') => {
    const selection = await pickDocRightRoot(modeOverride);
    if (!selection) {
      return;
    }
    const { root, mode } = selection;
    activeRoot = root;

    if (mode === 'new') {
      if (await docRightConfigExists(root)) {
        void vscode.window.showErrorMessage('DocRight config already exists in this folder.');
        return;
      }
      const confirmed = await vscode.window.showInformationMessage(
        `Create DocRight project in ${root}?`,
        { modal: true },
        'Create'
      );
      if (confirmed !== 'Create') {
        return;
      }
      const settings = await ensureSettingsFile(root);
      try {
        await initializeDocRightProject(root, settings);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Failed to create DocRight project: ${message}`);
        return;
      }
      ensureHosts(settings);
      if (editorHost) {
        await editorHost.open(root);
      }
      if (calloutsHost) {
        await calloutsHost.open(root, {
          viewColumn: toViewColumn(settings.ui.columns.callouts, vscode.ViewColumn.Two),
          preserveFocus: true
        });
      }
      await openLlmPanelForRoot(root, settings);
      await openRooPanel(settings);
      await normalizePanelLayout(settings);
      void vscode.window.showInformationMessage('DocRight project created.');
      return;
    }

    const config = await loadDocRightConfig(root);
    if (!config) {
      void vscode.window.showErrorMessage('No DocRight config found in that folder.');
      return;
    }
    const settings = await ensureSettingsFile(root);
    ensureHosts(settings);
    if (editorHost) {
      await editorHost.open(root);
    }
    if (calloutsHost) {
      await calloutsHost.open(root, {
        viewColumn: toViewColumn(settings.ui.columns.callouts, vscode.ViewColumn.Two),
        preserveFocus: true
      });
    }
    await openLlmPanelForRoot(root, settings);
    await openRooPanel(settings);
    await normalizePanelLayout(settings);
    void vscode.window.showInformationMessage('DocRight project resumed.');
  };

  const startSession = vscode.commands.registerCommand('docRight.startSession', async () => {
    await runSessionFlow();
  });

  const startSessionNew = vscode.commands.registerCommand('docRight.startSessionNew', async () => {
    await runSessionFlow('new');
  });

  const startSessionResume = vscode.commands.registerCommand('docRight.startSessionResume', async () => {
    await runSessionFlow('resume');
  });

  const openLlmPanel = vscode.commands.registerCommand('docRightRefactor.openLlmPanel', async () => {
    const root = getSessionRoot();
    if (!root) {
      void vscode.window.showErrorMessage('Open a workspace folder to open the LLM panel.');
      return;
    }

    const settings = await ensureSettingsFile(root);
    await openLlmPanelForRoot(root, settings);
  });

  const openEditor = vscode.commands.registerCommand('docRightRefactor.openEditor', async () => {
    const root = getSessionRoot();
    if (!root) {
      void vscode.window.showErrorMessage('Open a workspace folder to open the DocRight editor.');
      return;
    }

    const config = await loadDocRightConfig(root);
    if (!config) {
      void vscode.window.showErrorMessage('No DocRight project found in this workspace.');
      return;
    }

    const settings = await ensureSettingsFile(root);
    ensureHosts(settings);
    if (editorHost) {
      await editorHost.open(root);
    }
  });

  const setScopeSelection = vscode.commands.registerCommand('docRightRefactor.setScopeSelection', async () => {
    const root = getSessionRoot();
    if (!root) {
      void vscode.window.showErrorMessage('Open a workspace folder to set scope.');
      return;
    }
    const settings = await ensureSettingsFile(root);
    ensureHosts(settings);
    if (editorHost) {
      await editorHost.setScopeToSelection();
    }
  });

  const setScopeFull = vscode.commands.registerCommand('docRightRefactor.setScopeFull', async () => {
    const root = getSessionRoot();
    if (!root) {
      void vscode.window.showErrorMessage('Open a workspace folder to set scope.');
      return;
    }
    const settings = await ensureSettingsFile(root);
    ensureHosts(settings);
    if (editorHost) {
      await editorHost.setScopeToFull();
    }
  });

  context.subscriptions.push(startSession);
  context.subscriptions.push(startSessionNew);
  context.subscriptions.push(startSessionResume);
  context.subscriptions.push(openLlmPanel);
  context.subscriptions.push(openEditor);
  context.subscriptions.push(setScopeSelection);
  context.subscriptions.push(setScopeFull);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DocRightQuickstartViewProvider.viewType, quickstartProvider)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('docRight.timeline.showDetails', async (root: string, iterationId: string) => {
      if (!root || !iterationId) {
        return;
      }
      const metadata = await loadDocRightIterationMetadata(root, iterationId);
      if (!metadata) {
        void vscode.window.showErrorMessage(`Iteration #${iterationId} not found.`);
        return;
      }
      const lines = [
        `# Iteration #${metadata.id}`,
        metadata.createdAt ? `**Created:** ${metadata.createdAt}` : '',
        metadata.parentId ? `**Parent:** #${metadata.parentId}` : '',
        metadata.reason ? `**Reason:** ${metadata.reason}` : '',
        '',
        '## Summary',
        ...(metadata.summaryBullets && metadata.summaryBullets.length > 0
          ? metadata.summaryBullets.map((bullet) => `- ${bullet}`)
          : ['_No summary recorded._'])
      ].filter((line) => line.length > 0);
      const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: lines.join('\n')
      });
      await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    })
  );

  const registerTimelineProvider = (vscode.workspace as unknown as {
    registerTimelineProvider?: (scheme: string, provider: DocRightTimelineProvider) => vscode.Disposable;
  }).registerTimelineProvider;
  if (typeof registerTimelineProvider === 'function') {
    context.subscriptions.push(registerTimelineProvider('file', timelineProvider));
  }

  const describeEditor = (editor: vscode.TextEditor | undefined | null): string | null => {
    return editor?.document?.uri?.fsPath ?? null;
  };

  const logRooResponseEvent = (
    event: string,
    filePath: string,
    extra?: Record<string, unknown>
  ): void => {
    const root = getDocRightRootFromResponsePath(filePath);
    if (!root) {
      return;
    }
    const payload = {
      filePath,
      activeEditor: describeEditor(vscode.window.activeTextEditor),
      visibleEditors: vscode.window.visibleTextEditors.map((editor) => editor.document.uri.fsPath),
      tabGroups: captureTabGroups(),
      ...(extra ?? {})
    };
    void appendDiagnosticsLog(root, event, payload);
  };

  const rooResponseCleanupTimers = new Map<string, NodeJS.Timeout>();

  const getRooResponsePathsFromTab = (tab: vscode.Tab): string[] => {
    const input = tab.input as unknown;
    if (input instanceof vscode.TabInputText) {
      return [input.uri.fsPath];
    }
    if (input instanceof vscode.TabInputTextDiff) {
      return [input.original.fsPath, input.modified.fsPath];
    }
    if (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputNotebook) {
      return [input.uri.fsPath];
    }
    return [];
  };

  const closeRooResponseTabsForPath = async (filePath: string): Promise<void> => {
    const tabsToClose: vscode.Tab[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (getRooResponsePathsFromTab(tab).some((candidate) => candidate === filePath)) {
          tabsToClose.push(tab);
        }
      }
    }
    for (const tab of tabsToClose) {
      logRooResponseEvent('rooResponse.tabOpened', filePath, { tabLabel: tab.label });
      await vscode.window.tabGroups.close(tab, true);
      logRooResponseEvent('rooResponse.tabClosed', filePath, { tabLabel: tab.label });
    }
  };

  const scheduleRooResponseCleanup = (filePath: string, reason: string): void => {
    if (!isRooResponsePath(filePath)) {
      return;
    }
    const existing = rooResponseCleanupTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }
    const timeout = setTimeout(async () => {
      rooResponseCleanupTimers.delete(filePath);
      const liveDoc = vscode.workspace.textDocuments.find(
        (doc) => doc.uri.scheme === 'file' && doc.uri.fsPath === filePath
      );
      const contentLength = liveDoc ? liveDoc.getText().trim().length : 0;
      if (liveDoc && contentLength > 0) {
        if (liveDoc.isDirty) {
          try {
            await liveDoc.save();
            logRooResponseEvent('rooResponse.autoSaved', filePath, { reason, contentLength });
          } catch (error) {
            logRooResponseEvent('rooResponse.autoSaveFailed', filePath, { reason, contentLength });
          }
        }
        await closeRooResponseTabsForPath(filePath);
      } else {
        logRooResponseEvent('rooResponse.autoSaveSkippedEmpty', filePath, { reason, contentLength });
      }
    }, 300);
    rooResponseCleanupTimers.set(filePath, timeout);
  };

  const closeRooResponseEditor = async (document: vscode.TextDocument): Promise<void> => {
    if (document.uri.scheme !== 'file') {
      return;
    }
    const filePath = document.uri.fsPath;
    if (!isRooResponsePath(filePath)) {
      return;
    }
    logRooResponseEvent('rooResponse.opened', filePath);
    scheduleRooResponseCleanup(filePath, 'opened');
  };

  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => void closeRooResponseEditor(document)));

  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((event) => {
      for (const tab of event.opened) {
        const paths = getRooResponsePathsFromTab(tab).filter((value) => isRooResponsePath(value));
        if (paths.length > 0) {
          scheduleRooResponseCleanup(paths[0], 'tabOpened');
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.scheme !== 'file') {
        return;
      }
      const filePath = event.document.uri.fsPath;
      if (isRooResponsePath(filePath)) {
        scheduleRooResponseCleanup(filePath, 'changed');
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const filePath = editor?.document?.uri?.fsPath;
      if (filePath && isRooResponsePath(filePath)) {
        logRooResponseEvent('rooResponse.activeEditorChanged', filePath);
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      for (const editor of editors) {
        const filePath = editor.document.uri.fsPath;
        if (isRooResponsePath(filePath)) {
          logRooResponseEvent('rooResponse.visibleEditorsChanged', filePath);
          break;
        }
      }
    })
  );

  return {
    getLlmDiagnostics: () => llmController?.getDiagnostics() ?? { lastPromptId: null, lastPromptLength: null }
  };
}

export function deactivate() {
  // No-op
}
