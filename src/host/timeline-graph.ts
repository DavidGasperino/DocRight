import { type DocRightIterationMetadata } from '../storage/docright-iterations';

export type TimelineGraphNode = {
  id: string;
  prefix: string;
  createdAt?: string | null;
  parentId?: string | null;
  reason?: string | null;
  summaryBullets: string[];
  timestamp: number;
  isHead: boolean;
};

export function buildTimelineGraph(
  metadata: DocRightIterationMetadata[],
  headId: string | null
): TimelineGraphNode[] {
  const nodes = metadata
    .map((entry) => ({
      ...entry,
      timestamp: Number.isFinite(Date.parse(entry.createdAt)) ? Date.parse(entry.createdAt) : 0,
      summaryBullets: entry.summaryBullets ?? []
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const parentMap = new Map<string, string | null>();
  const childrenMap = new Map<string, string[]>();
  for (const node of nodes) {
    const parentId = node.parentId ?? null;
    parentMap.set(node.id, parentId);
    if (parentId) {
      const list = childrenMap.get(parentId) ?? [];
      list.push(node.id);
      childrenMap.set(parentId, list);
    }
  }

  for (const [parentId, children] of childrenMap.entries()) {
    children.sort((a, b) => {
      const aNode = nodes.find((node) => node.id === a);
      const bNode = nodes.find((node) => node.id === b);
      const aTime = aNode?.timestamp ?? 0;
      const bTime = bNode?.timestamp ?? 0;
      return aTime - bTime;
    });
    childrenMap.set(parentId, children);
  }

  return nodes.map((node) => ({
    id: node.id,
    prefix: buildPrefix(node.id, parentMap, childrenMap),
    createdAt: node.createdAt ?? null,
    parentId: node.parentId ?? null,
    reason: node.reason ?? null,
    summaryBullets: node.summaryBullets ?? [],
    timestamp: node.timestamp,
    isHead: node.id === headId
  }));
}

function buildPrefix(
  nodeId: string,
  parentMap: Map<string, string | null>,
  childrenMap: Map<string, string[]>
): string {
  const parts: boolean[] = [];
  let current = nodeId;
  while (true) {
    const parentId = parentMap.get(current);
    if (!parentId) {
      break;
    }
    const siblings = childrenMap.get(parentId) ?? [];
    const isLast = siblings[siblings.length - 1] === current;
    parts.push(isLast);
    current = parentId;
  }

  if (parts.length === 0) {
    return '';
  }

  let prefix = '';
  for (let i = parts.length - 1; i > 0; i -= 1) {
    prefix += parts[i] ? '   ' : '│  ';
  }
  prefix += parts[0] ? '└─ ' : '├─ ';
  return prefix;
}
