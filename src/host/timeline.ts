import * as path from 'path';
import * as vscode from 'vscode';

import { docRightConfigExists } from '../storage/docright-config';
import { listDocRightIterationMetadata, loadDocRightIterationState } from '../storage/docright-iterations';
import { buildTimelineGraph } from './timeline-graph';

type TimelineItem = {
  id?: string;
  label: string;
  timestamp: number;
  description?: string;
  detail?: string;
  tooltip?: vscode.MarkdownString;
  command?: vscode.Command;
};

type Timeline = {
  items: TimelineItem[];
};

export class DocRightTimelineProvider {
  readonly id = 'docright.timeline';
  readonly label = 'DocRight';

  private readonly emitter = new vscode.EventEmitter<{ uri?: vscode.Uri; reset?: boolean }>();
  readonly onDidChange = this.emitter.event;

  refresh(uri?: vscode.Uri): void {
    this.emitter.fire({ uri });
  }

  async provideTimeline(
    uri: vscode.Uri,
    _options?: unknown,
    _token?: vscode.CancellationToken
  ): Promise<Timeline> {
    if (!this.isDocRightDocument(uri)) {
      return { items: [] };
    }
    const root = path.dirname(uri.fsPath);
    if (!(await docRightConfigExists(root))) {
      return { items: [] };
    }

    const metadata = await listDocRightIterationMetadata(root);
    if (metadata.length === 0) {
      return { items: [] };
    }
    const state = await loadDocRightIterationState(root);
    const headId = state.headId ?? null;
    const items = buildTimelineItems(root, metadata, headId);

    return { items };
  }

  private isDocRightDocument(uri: vscode.Uri): boolean {
    return path.basename(uri.fsPath) === 'document.lexical.json';
  }
}

function buildTimelineItems(
  root: string,
  metadata: Parameters<typeof buildTimelineGraph>[0],
  headId: string | null
): TimelineItem[] {
  const nodes = buildTimelineGraph(metadata, headId);
  return nodes.map((node) => {
    const label = `${node.prefix}#${node.id}`;
    const description = buildDescription(node);
    const tooltip = buildTooltip(node);

    return {
      id: node.id,
      label,
      description,
      tooltip,
      timestamp: node.timestamp,
      command: {
        title: 'Show iteration details',
        command: 'docRight.timeline.showDetails',
        arguments: [root, node.id]
      }
    };
  });
}

function buildDescription(node: ReturnType<typeof buildTimelineGraph>[number]): string | undefined {
  const parts: string[] = [];
  if (node.isHead) {
    parts.push('HEAD');
  }
  if (node.reason) {
    parts.push(node.reason);
  }
  return parts.length ? parts.join(' | ') : undefined;
}

function buildTooltip(node: ReturnType<typeof buildTimelineGraph>[number]): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.appendMarkdown(`**Iteration #${node.id}**\n\n`);
  if (node.isHead) {
    markdown.appendMarkdown('_Current head_\n\n');
  }
  if (node.createdAt) {
    markdown.appendMarkdown(`- Created: ${node.createdAt}\n`);
  }
  if (node.parentId) {
    markdown.appendMarkdown(`- Parent: #${node.parentId}\n`);
  }
  if (node.reason) {
    markdown.appendMarkdown(`- Reason: ${node.reason}\n`);
  }
  markdown.appendMarkdown('\n**Summary**\n');
  if (node.summaryBullets && node.summaryBullets.length > 0) {
    node.summaryBullets.forEach((bullet) => {
      markdown.appendMarkdown(`- ${bullet}\n`);
    });
  } else {
    markdown.appendMarkdown('_No summary recorded._\n');
  }
  return markdown;
}
