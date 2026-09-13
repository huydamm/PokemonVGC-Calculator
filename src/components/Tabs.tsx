import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { nextTabIndex } from '../services/tabs';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  /** Small count shown next to the label; hidden when empty or 0. */
  badge?: string | number;
}

/**
 * WAI-ARIA tabs: roving tabindex, Arrow/Home/End keys, activation on focus.
 * `keepMounted` renders every panel and hides the inactive ones, so state inside
 * a panel (featured move, sub-tab choice) survives switching; the CSS enter
 * animation replays when a hidden panel is shown. Without it only the active
 * panel mounts (cheaper for heavy panels), keyed so its animation replays too.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  idPrefix,
  ariaLabel,
  size = 'lg',
  keepMounted = false,
  children,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  idPrefix: string;
  ariaLabel: string;
  size?: 'lg' | 'sm';
  keepMounted?: boolean;
  children: (id: T) => ReactNode;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, tabs.findIndex((t) => t.id === active));
  const currentId = tabs[current].id;

  function onKeyDown(e: KeyboardEvent) {
    const next = nextTabIndex(e.key, current, tabs.length);
    if (next == null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  const panel = (id: T, visible: boolean) => (
    <div
      key={id}
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      tabIndex={0}
      hidden={!visible}
      className="tabpanel"
    >
      {children(id)}
    </div>
  );

  return (
    <div className={`tabs tabs-${size}`}>
      <div role="tablist" aria-label={ariaLabel} className="tablist" onKeyDown={onKeyDown}>
        {tabs.map((t, i) => {
          const selected = i === current;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={keepMounted || selected ? `${idPrefix}-panel-${t.id}` : undefined}
              tabIndex={selected ? 0 : -1}
              className="tab"
              onClick={() => onChange(t.id)}
            >
              {t.label}
              {t.badge !== undefined && t.badge !== '' && t.badge !== 0 && <span className="tab-badge">{t.badge}</span>}
            </button>
          );
        })}
      </div>
      {keepMounted ? tabs.map((t) => panel(t.id, t.id === currentId)) : panel(currentId, true)}
    </div>
  );
}
