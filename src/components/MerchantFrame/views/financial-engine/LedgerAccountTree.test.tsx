import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LedgerAccountTree, buildTree, getDescendantIds } from './LedgerAccountTree';
import type { LedgerAccount } from '../../../../types/accounting';

afterEach(() => {
  cleanup();
});

const ROOT: LedgerAccount = {
  id: 1,
  code: '1000',
  name: 'Assets',
  type: 'ASSET',
  is_active: true,
  parent_account_id: null,
};

const CHILD: LedgerAccount = {
  id: 2,
  code: '1010',
  name: 'Cash',
  type: 'ASSET',
  is_active: true,
  parent_account_id: 1,
};

const GRANDCHILD: LedgerAccount = {
  id: 3,
  code: '1011',
  name: 'Petty Cash',
  type: 'ASSET',
  is_active: true,
  parent_account_id: 2,
};

describe('buildTree', () => {
  it('nests children under their parent', () => {
    const tree = buildTree([ROOT, CHILD, GRANDCHILD]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe(2);
    expect(tree[0].children[0].children[0].id).toBe(3);
  });

  it('treats a null parent_account_id as a root', () => {
    expect(buildTree([ROOT])).toHaveLength(1);
  });

  it('falls back to root when parent_account_id points to a non-existent account', () => {
    const orphan: LedgerAccount = { ...CHILD, id: 4, parent_account_id: 999 };
    const tree = buildTree([ROOT, orphan]);
    expect(tree.map((n) => n.id).sort()).toEqual([1, 4]);
  });

  it("falls back to root when parent_account_id equals the account's own id", () => {
    const selfParent: LedgerAccount = { ...CHILD, id: 5, parent_account_id: 5 };
    const tree = buildTree([selfParent]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(5);
  });

  it('surfaces one side of a two-node cycle as a root instead of dropping the component', () => {
    const a: LedgerAccount = { id: 10, code: 'A', name: 'A', type: 'ASSET', is_active: true, parent_account_id: 11 };
    const b: LedgerAccount = { id: 11, code: 'B', name: 'B', type: 'ASSET', is_active: true, parent_account_id: 10 };
    const tree = buildTree([a, b]);
    // Only the first-encountered node of the cyclic component becomes a root;
    // its cyclic partner is reachable through the (still-cyclic) children
    // link, so it must not be pushed as a second, redundant root.
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(10);
    expect(tree[0].children[0].id).toBe(11);
  });
});

describe('getDescendantIds', () => {
  it('collects all descendant ids of a node', () => {
    const tree = buildTree([ROOT, CHILD, GRANDCHILD]);
    expect(getDescendantIds(tree, 1)).toEqual(new Set([2, 3]));
  });

  it('returns an empty set for a leaf node', () => {
    const tree = buildTree([ROOT, CHILD, GRANDCHILD]);
    expect(getDescendantIds(tree, 3)).toEqual(new Set());
  });

  it('returns an empty set when the id is not found in the tree', () => {
    const tree = buildTree([ROOT]);
    expect(getDescendantIds(tree, 999)).toEqual(new Set());
  });
});

function renderTree(accounts: LedgerAccount[], matches: (a: LedgerAccount) => boolean = () => true) {
  return render(
    <table>
      <tbody>
        <LedgerAccountTree
          accounts={accounts}
          matches={matches}
          onEdit={vi.fn()}
          onViewDetails={vi.fn()}
          onToggleStatus={vi.fn()}
        />
      </tbody>
    </table>,
  );
}

describe('LedgerAccountTree — rendering', () => {
  it('indents child rows further than their parent', () => {
    renderTree([ROOT, CHILD]);
    const rootCell = screen.getByText('1000').closest('td') as HTMLElement;
    const childCell = screen.getByText('1010').closest('td') as HTMLElement;
    expect(childCell.style.paddingLeft).not.toBe(rootCell.style.paddingLeft);
  });

  it('shows a circular-reference marker instead of looping forever', () => {
    const a: LedgerAccount = { id: 10, code: 'A100', name: 'A', type: 'ASSET', is_active: true, parent_account_id: 11 };
    const b: LedgerAccount = { id: 11, code: 'B100', name: 'B', type: 'ASSET', is_active: true, parent_account_id: 10 };
    renderTree([a, b]);
    expect(screen.getAllByText(/circular reference detected/i).length).toBeGreaterThan(0);
  });

  it('does not crash evaluating filter visibility on a two-node cycle when nothing matches', () => {
    const a: LedgerAccount = { id: 10, code: 'A100', name: 'A', type: 'ASSET', is_active: true, parent_account_id: 11 };
    const b: LedgerAccount = { id: 11, code: 'B100', name: 'B', type: 'ASSET', is_active: true, parent_account_id: 10 };
    expect(() => renderTree([a, b], () => false)).not.toThrow();
  });

  it('renders each account in a two-node cycle exactly once, with exactly one circular marker', () => {
    const a: LedgerAccount = { id: 10, code: 'A100', name: 'A', type: 'ASSET', is_active: true, parent_account_id: 11 };
    const b: LedgerAccount = { id: 11, code: 'B100', name: 'B', type: 'ASSET', is_active: true, parent_account_id: 10 };
    renderTree([a, b], () => true);
    expect(screen.getAllByText('A100')).toHaveLength(1);
    expect(screen.getAllByText('B100')).toHaveLength(1);
    expect(screen.getAllByText(/circular reference detected/i)).toHaveLength(1);
  });

  it('keeps the full ancestor chain visible when only a descendant matches the filter', () => {
    renderTree([ROOT, CHILD, GRANDCHILD], (a) => a.id === 3);
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('1010')).toBeInTheDocument();
    expect(screen.getByText('1011')).toBeInTheDocument();
  });

  it('hides branches with no matching node at all', () => {
    const unrelated: LedgerAccount = {
      id: 20,
      code: '2000',
      name: 'Liabilities',
      type: 'LIABILITY',
      is_active: true,
      parent_account_id: null,
    };
    renderTree([ROOT, CHILD, unrelated], (a) => a.id === 2);
    expect(screen.queryByText('2000')).not.toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
  });

  it('calls onEdit when the edit icon is clicked', async () => {
    const onEdit = vi.fn();
    render(
      <table>
        <tbody>
          <LedgerAccountTree
            accounts={[ROOT]}
            matches={() => true}
            onEdit={onEdit}
            onViewDetails={vi.fn()}
            onToggleStatus={vi.fn()}
          />
        </tbody>
      </table>,
    );
    screen.getByLabelText('Edit 1000').click();
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('calls onToggleStatus when the status icon is clicked', () => {
    const onToggleStatus = vi.fn();
    render(
      <table>
        <tbody>
          <LedgerAccountTree
            accounts={[ROOT]}
            matches={() => true}
            onEdit={vi.fn()}
            onViewDetails={vi.fn()}
            onToggleStatus={onToggleStatus}
          />
        </tbody>
      </table>,
    );
    screen.getByLabelText('Deactivate 1000').click();
    expect(onToggleStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });
});
