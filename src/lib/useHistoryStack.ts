import { useCallback, useEffect, useRef } from 'react'

export interface HistoryStack {
  /** Snapshot the current value onto the undo stack — call right before
   * whatever state-changing call (setEditVertices, setLinePoints, ...) is
   * about to replace it. */
  record: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /** Drop all history. Call whenever the underlying value's lifecycle ends
   * (a draw session finishes/cancels, an edit session finishes/cancels) so
   * a stray undo/redo can never reach into unrelated, already-saved state. */
  clear: () => void
}

/**
 * A small snapshot-based undo/redo stack for a single piece of state,
 * session-only (in-memory, cleared on refresh — never persisted). Whole-
 * value snapshotting rather than a command pattern: simpler and correct for
 * the small coordinate arrays this drives (editVertices, linePoints), no
 * need to hand-write inverse operations for drag/insert/delete.
 *
 * `record`/`undo`/`redo`/`canUndo`/`canRedo` are referentially stable
 * (useCallback with no deps, reading through a ref), so they're safe to call
 * from handlers bound once per marker/drag-session — not just ones
 * recreated every render — the same guarantee toolRef/draftGeometryRef rely
 * on elsewhere in MapDashboardPage.
 */
export function useHistoryStack<T>(current: T, setCurrent: (value: T) => void): HistoryStack {
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  // Always the latest rendered value — mirrored the same way toolRef/
  // draftGeometryRef are elsewhere in MapDashboardPage. By the time any
  // user-triggered record()/undo()/redo() call happens, a full render+
  // commit+effect cycle has always already run since the last state change,
  // so this is never stale when it matters.
  const currentRef = useRef(current)
  useEffect(() => {
    currentRef.current = current
  }, [current])

  const record = useCallback(() => {
    past.current = [...past.current, currentRef.current]
    future.current = []
  }, [])

  const undo = useCallback(() => {
    if (!past.current.length) return
    const previous = past.current[past.current.length - 1]
    past.current = past.current.slice(0, -1)
    future.current = [currentRef.current, ...future.current]
    setCurrent(previous)
  }, [setCurrent])

  const redo = useCallback(() => {
    if (!future.current.length) return
    const next = future.current[0]
    future.current = future.current.slice(1)
    past.current = [...past.current, currentRef.current]
    setCurrent(next)
  }, [setCurrent])

  const canUndo = useCallback(() => past.current.length > 0, [])
  const canRedo = useCallback(() => future.current.length > 0, [])

  const clear = useCallback(() => {
    past.current = []
    future.current = []
  }, [])

  return { record, undo, redo, canUndo, canRedo, clear }
}
