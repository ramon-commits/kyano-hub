import { useCallback, useEffect, useRef, useState } from 'react';

// Bulk-select state for a list of {id} items in display order.
// Supports plain toggle, shift+click range, select-all, clear, and keyboard hooks.
export function useSelection(orderedItems = []) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const lastIdRef = useRef(null);

  // Drop ids that no longer exist in the list (e.g. after a refetch removes some)
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const live = new Set(orderedItems.map((m) => m.id));
    let changed = false;
    const next = new Set();
    for (const id of selectedIds) {
      if (live.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedIds(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedItems]);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    lastIdRef.current = null;
  }, []);

  const toggle = useCallback((id, e) => {
    const ids = orderedItems.map((m) => m.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const last = lastIdRef.current;
      if (e?.shiftKey && last && last !== id) {
        const start = ids.indexOf(last);
        const end = ids.indexOf(id);
        if (start >= 0 && end >= 0) {
          const [lo, hi] = start < end ? [start, end] : [end, start];
          // shift+click extends to the clicked row's state — if target was unselected, select range; else deselect
          const shouldSelect = !prev.has(id);
          for (let i = lo; i <= hi; i++) {
            if (shouldSelect) next.add(ids[i]);
            else next.delete(ids[i]);
          }
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastIdRef.current = id;
  }, [orderedItems]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(orderedItems.map((m) => m.id)));
  }, [orderedItems]);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === orderedItems.length && orderedItems.length > 0) return new Set();
      return new Set(orderedItems.map((m) => m.id));
    });
  }, [orderedItems]);

  const allSelected = orderedItems.length > 0 && selectedIds.size === orderedItems.length;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const count = selectedIds.size;

  return { selectedIds, toggle, clear, selectAll, toggleAll, allSelected, someSelected, count };
}

// Wire keyboard shortcuts (Cmd/Ctrl+A, Escape) for a selection.
// Only fires when not typing in an input/textarea.
export function useSelectionShortcuts({ count, onSelectAll, onClear, enabled = true }) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e) {
      const t = e.target;
      const tag = t?.tagName?.toLowerCase();
      const inField = tag === 'input' || tag === 'textarea' || t?.isContentEditable;
      if (inField) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        onSelectAll?.();
        return;
      }
      if (e.key === 'Escape' && count > 0) {
        // Only swallow Escape when we actually have something to clear,
        // so App's modal-close handler still works when nothing is selected.
        e.preventDefault();
        e.stopPropagation();
        onClear?.();
      }
    }
    window.addEventListener('keydown', onKey, true); // capture so we win over App's listener when count > 0
    return () => window.removeEventListener('keydown', onKey, true);
  }, [count, onSelectAll, onClear, enabled]);
}
