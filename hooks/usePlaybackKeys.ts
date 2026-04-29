// Design Ref: §2.M5, Plan FR-04 — PowerPoint-compatible keyboard shortcuts.
//
// Key mapping (mirrors MS PowerPoint slideshow mode):
//   Next:        Space, →, ↓, Enter, PageDown, N
//   Prev:        Backspace, ←, ↑, PageUp, P
//   First:       Home
//   Last:        End
//   Play/Pause:  S
//
// Disabled while focus is on a text input, textarea, or contenteditable
// element so it never swallows typing inside the rich-text editor.

import { useEffect } from 'react';
import { usePlaybackStore } from '@/store/usePlaybackStore';
import type { ControlAction } from '@/lib/api/control';

const NEXT_KEYS = new Set([' ', 'ArrowRight', 'ArrowDown', 'Enter', 'PageDown', 'n', 'N']);
const PREV_KEYS = new Set(['Backspace', 'ArrowLeft', 'ArrowUp', 'PageUp', 'p', 'P']);
const FIRST_KEYS = new Set(['Home']);
const LAST_KEYS = new Set(['End']);
const TOGGLE_KEYS = new Set(['s', 'S']);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // TipTap editor wraps its surface in a [contenteditable] div; the check above
  // catches it. Defensive guard for any element flagged as editable via attribute.
  return target.getAttribute('contenteditable') === 'true';
}

export interface UsePlaybackKeysOptions {
  /** When false the hook is mounted but inactive (e.g. on the blocked page). */
  enabled?: boolean;
}

export function usePlaybackKeys(opts: UsePlaybackKeysOptions = {}) {
  const enabled = opts.enabled ?? true;
  const dispatch = usePlaybackStore((s) => s.dispatch);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      let cmd: ControlAction | null = null;
      if (NEXT_KEYS.has(e.key)) cmd = { action: 'next' };
      else if (PREV_KEYS.has(e.key)) cmd = { action: 'prev' };
      else if (FIRST_KEYS.has(e.key)) cmd = { action: 'first' };
      else if (LAST_KEYS.has(e.key)) cmd = { action: 'last' };
      else if (TOGGLE_KEYS.has(e.key)) cmd = { action: isPlaying ? 'pause' : 'play' };

      if (!cmd) return;
      e.preventDefault();
      dispatch(cmd).catch(() => undefined);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, dispatch, isPlaying]);
}
