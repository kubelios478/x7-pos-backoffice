import React from 'react';
import type { AccountType, LedgerAccount } from '../../../../types/accounting';

export const TYPE_BADGE_CLASSES: Record<AccountType, string> = {
  ASSET: 'bg-blue-500/10 text-blue-600',
  LIABILITY: 'bg-amber-500/10 text-amber-600',
  EQUITY: 'bg-purple-500/10 text-purple-600',
  REVENUE: 'bg-green-500/10 text-green-600',
  EXPENSE: 'bg-orange-500/10 text-orange-600',
};

export function resolveParentLabel(
  account: LedgerAccount,
  accountsById: Map<number, LedgerAccount>,
): { label: string; kind: 'root' | 'resolved' | 'missing' } {
  if (account.parent_account_id == null) {
    return { label: 'Root Account', kind: 'root' };
  }
  const parent = accountsById.get(account.parent_account_id);
  if (!parent) {
    return { label: 'Parent not found', kind: 'missing' };
  }
  return { label: `${parent.code} — ${parent.name}`, kind: 'resolved' };
}

export interface TreeNode extends LedgerAccount {
  children: TreeNode[];
}

export function buildTree(accounts: LedgerAccount[]): TreeNode[] {
  const map = new Map<number, TreeNode>(accounts.map((a) => [a.id, { ...a, children: [] }]));
  const roots: TreeNode[] = [];

  for (const a of accounts) {
    const node = map.get(a.id)!;
    if (a.parent_account_id != null && a.parent_account_id !== a.id && map.has(a.parent_account_id)) {
      map.get(a.parent_account_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Defensive: any node not reachable from a declared root (e.g. a pure
  // parent<->child cycle) is surfaced as its own root instead of being
  // silently dropped from the tree.
  const reachable = new Set<number>();
  const visit = (node: TreeNode) => {
    if (reachable.has(node.id)) return;
    reachable.add(node.id);
    node.children.forEach(visit);
  };
  roots.forEach(visit);

  for (const a of accounts) {
    if (!reachable.has(a.id)) {
      const node = map.get(a.id)!;
      roots.push(node);
      visit(node);
    }
  }

  return roots;
}

export function getDescendantIds(tree: TreeNode[], accountId: number): Set<number> {
  const ids = new Set<number>();

  const findNode = (nodes: TreeNode[]): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === accountId) return node;
      const found = findNode(node.children);
      if (found) return found;
    }
    return null;
  };

  const collect = (node: TreeNode) => {
    for (const child of node.children) {
      ids.add(child.id);
      collect(child);
    }
  };

  const target = findNode(tree);
  if (target) collect(target);

  return ids;
}

function subtreeMatches(
  node: TreeNode,
  matches: (account: LedgerAccount) => boolean,
  visited: Set<number> = new Set(),
): boolean {
  if (visited.has(node.id)) return false;
  visited.add(node.id);
  if (matches(node)) return true;
  return node.children.some((child) => subtreeMatches(child, matches, visited));
}

interface LedgerAccountTreeProps {
  accounts: LedgerAccount[];
  matches: (account: LedgerAccount) => boolean;
  onEdit: (account: LedgerAccount) => void;
  onViewDetails: (account: LedgerAccount) => void;
  onToggleStatus: (account: LedgerAccount) => void;
}

export const LedgerAccountTree: React.FC<LedgerAccountTreeProps> = ({
  accounts,
  matches,
  onEdit,
  onViewDetails,
  onToggleStatus,
}) => {
  const tree = React.useMemo(() => buildTree(accounts), [accounts]);
  const accountsById = React.useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const renderNode = (node: TreeNode, depth: number, ancestorIds: Set<number>): React.ReactNode => {
    if (ancestorIds.has(node.id)) {
      return (
        <tr key={`cycle-${node.id}-${depth}`}>
          <td
            colSpan={6}
            className="px-6 py-2 text-[11px] text-red-600 font-semibold"
            style={{ paddingLeft: depth * 20 + 24 }}
          >
            Circular reference detected ({node.code})
          </td>
        </tr>
      );
    }

    if (!subtreeMatches(node, matches)) return null;

    const nextAncestors = new Set(ancestorIds).add(node.id);
    const parent = resolveParentLabel(node, accountsById);

    return (
      <React.Fragment key={node.id}>
        <tr
          data-testid={`ledger-account-row-${node.id}`}
          onClick={() => onViewDetails(node)}
          className={`hover:bg-[#f8f3eb] transition-colors cursor-pointer ${!node.is_active ? 'opacity-75' : ''}`}
        >
          <td className="px-6 py-4" style={{ paddingLeft: depth * 20 + 24 }}>
            <span className="font-bold text-[#1d1c17]">{node.code}</span>
          </td>
          <td className="px-6 py-4 text-[#1d1c17]">{node.name}</td>
          <td className="px-6 py-4 text-center">
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${TYPE_BADGE_CLASSES[node.type]}`}
            >
              {node.type}
            </span>
          </td>
          <td className="px-6 py-4">
            <span className={parent.kind === 'missing' ? 'text-red-600 text-sm' : 'text-sm text-[#5f5e5e]'}>
              {parent.label}
            </span>
          </td>
          <td className="px-6 py-4 text-center">
            {node.is_active ? (
              <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                Active
              </span>
            ) : (
              <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                Inactive
              </span>
            )}
          </td>
          <td className="px-6 py-4 text-center">
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(node);
                }}
                aria-label={`Edit ${node.code}`}
                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">edit</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStatus(node);
                }}
                aria-label={node.is_active ? `Deactivate ${node.code}` : `Activate ${node.code}`}
                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {node.is_active ? 'block' : 'check_circle'}
                </span>
              </button>
            </div>
          </td>
        </tr>
        {node.children.map((child) => renderNode(child, depth + 1, nextAncestors))}
      </React.Fragment>
    );
  };

  return <>{tree.map((root) => renderNode(root, 0, new Set()))}</>;
};

export default LedgerAccountTree;
