import { useState } from 'react';

// Generalizes the drag-and-drop already proven on Home.jsx's production
// kanban (native HTML5 draggable API, no library) for reuse — Kanban
// columns, dashboard-widget reordering, anywhere else a drag-to-move
// interaction is needed.
//
// draggableProps(id) spreads onto the dragged element.
// dropZoneProps(zoneKey, onDropId => void) spreads onto a drop target;
//   onDrop receives the dragged item's id.
export function useDragAndDrop() {
  const [draggingId, setDraggingId] = useState(null);
  const [overZone, setOverZone] = useState(null);

  const draggableProps = (id) => ({
    draggable: true,
    onDragStart: (e) => { e.dataTransfer.setData('text/plain', String(id)); e.dataTransfer.effectAllowed = 'move'; setDraggingId(id); },
    onDragEnd: () => { setDraggingId(null); setOverZone(null); },
  });

  const dropZoneProps = (zoneKey, onDrop) => ({
    onDragOver: (e) => { e.preventDefault(); setOverZone(zoneKey); },
    onDragLeave: () => setOverZone(prev => (prev === zoneKey ? null : prev)),
    onDrop: (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      setOverZone(null);
      if (id) onDrop(id);
    },
  });

  return { draggingId, overZone, draggableProps, dropZoneProps };
}
