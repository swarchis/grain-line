import { useState, useMemo } from 'react';

// Generic checkbox multi-select over a list of items with stable `.id`.
// Pairs with BulkActionBar.jsx — the list page owns which bulk actions
// exist (archive/delete/status-change are usually already single-item
// functions the page has; this just lets you call them over a selection).
export function useMultiSelect(items) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggle = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => setSelectedIds(prev => prev.size === items.length ? new Set() : new Set(items.map(i => i.id)));
  const clear = () => setSelectedIds(new Set());

  const selectedItems = useMemo(() => items.filter(i => selectedIds.has(i.id)), [items, selectedIds]);

  return {
    selectedIds, selectedItems, count: selectedIds.size,
    isSelected: (id) => selectedIds.has(id),
    allSelected: items.length > 0 && selectedIds.size === items.length,
    toggle, toggleAll, clear,
  };
}
