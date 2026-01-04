import { type TimelineGraphNode } from '../host/timeline-graph';

export type TimelinePanelStateMessage = {
  type: 'timelineState';
  items: TimelineGraphNode[];
};

export type TimelinePanelFromWebviewMessage = { type: 'showDetails'; id: string };

const timelinePanelMessageTypes = new Set<TimelinePanelFromWebviewMessage['type']>(['showDetails']);

export function isTimelinePanelFromWebviewMessage(value: unknown): value is TimelinePanelFromWebviewMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && timelinePanelMessageTypes.has(type as TimelinePanelFromWebviewMessage['type']);
}
