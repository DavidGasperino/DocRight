import { type DocRightScopeState } from '../core/scope';

export type DocRightSelectionPayload = {
  anchorKey: string;
  anchorOffset: number;
  anchorType: string;
  focusKey: string;
  focusOffset: number;
  focusType: string;
  isBackward: boolean;
  isCollapsed: boolean;
  text: string;
  overlapsCallout: boolean;
  inScope: boolean;
};

export type DocRightInlineCalloutPayload = {
  id: string;
  instruction: string;
};

export type DocRightLoadMessage = {
  type: 'docright.load';
  state: string;
};

export type DocRightSavedMessage = {
  type: 'docright.saved';
  at: string;
};

export type DocRightErrorMessage = {
  type: 'docright.error';
  message: string;
};

export type DocRightApplyInlineCalloutMessage = {
  type: 'docright.applyInlineCallout';
  id: string;
  selection: DocRightSelectionPayload;
};

export type DocRightSelectInlineCalloutMessage = {
  type: 'docright.selectInlineCallout';
  id: string | null;
};

export type DocRightRemoveInlineCalloutMessage = {
  type: 'docright.removeInlineCallout';
  id: string;
};

export type DocRightClearInlineCalloutsMessage = {
  type: 'docright.clearInlineCallouts';
};

export type DocRightRequestScopeSelectionMessage = {
  type: 'docright.requestScopeSelection';
};

export type DocRightSetScopeMessage = {
  type: 'docright.setScope';
  scope: DocRightScopeState;
};

export type DocRightApplyScopeUpdateMessage = {
  type: 'docright.applyScopeUpdate';
  requestId: number;
  scope: DocRightScopeState | null;
  html: string;
};

export type DocRightExportMessage = {
  type: 'docright.export';
  requestId: number;
  inlineCallouts: DocRightInlineCalloutPayload[];
};

export type DocRightToWebviewMessage =
  | DocRightLoadMessage
  | DocRightSavedMessage
  | DocRightErrorMessage
  | DocRightApplyInlineCalloutMessage
  | DocRightSelectInlineCalloutMessage
  | DocRightRemoveInlineCalloutMessage
  | DocRightClearInlineCalloutsMessage
  | DocRightRequestScopeSelectionMessage
  | DocRightSetScopeMessage
  | DocRightApplyScopeUpdateMessage
  | DocRightExportMessage;

export type DocRightReadyMessage = {
  type: 'docright.ready';
};

export type DocRightUpdateMessage = {
  type: 'docright.update';
  state: string;
};

export type DocRightFocusMessage = {
  type: 'docright.focus';
};

export type DocRightRequestInlineCalloutMessage = {
  type: 'docright.requestInlineCallout';
  selection: DocRightSelectionPayload;
};

export type DocRightRequestOverallCalloutMessage = {
  type: 'docright.requestOverallCallout';
  selection: DocRightSelectionPayload;
};

export type DocRightScopeSelectionMessage = {
  type: 'docright.scopeSelection';
  selection: DocRightSelectionPayload;
};

export type DocRightScopeInvalidMessage = {
  type: 'docright.scopeInvalid';
};

export type DocRightSelectionMessage = {
  type: 'docright.selection';
  id: string | null;
};

export type DocRightApplyScopeCompleteMessage = {
  type: 'docright.applyScopeComplete';
  requestId: number;
};

export type DocRightExportResultMessage = {
  type: 'docright.exportResult';
  requestId: number;
  html: string;
};

export type DocRightExportErrorMessage = {
  type: 'docright.exportError';
  requestId: number;
  message: string;
};

export type DocRightFromWebviewMessage =
  | DocRightReadyMessage
  | DocRightUpdateMessage
  | DocRightFocusMessage
  | DocRightRequestInlineCalloutMessage
  | DocRightRequestOverallCalloutMessage
  | DocRightScopeSelectionMessage
  | DocRightScopeInvalidMessage
  | DocRightSelectionMessage
  | DocRightApplyScopeCompleteMessage
  | DocRightExportResultMessage
  | DocRightExportErrorMessage;

const docRightMessageTypes = new Set<DocRightFromWebviewMessage['type']>([
  'docright.ready',
  'docright.update',
  'docright.focus',
  'docright.requestInlineCallout',
  'docright.requestOverallCallout',
  'docright.scopeSelection',
  'docright.scopeInvalid',
  'docright.selection',
  'docright.applyScopeComplete',
  'docright.exportResult',
  'docright.exportError'
]);

export function isDocRightFromWebviewMessage(value: unknown): value is DocRightFromWebviewMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && docRightMessageTypes.has(type as DocRightFromWebviewMessage['type']);
}
