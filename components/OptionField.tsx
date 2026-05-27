// Design Ref: ui-redesign §3.2.1 — schema-driven input renderer.
// Dispatches by schema.type to a number/select/boolean field. New types
// can be added here without touching the panel.
//
// Design Ref: monitor-target §3.5 — provider-driven options + showWhen gate.
// A select schema may declare `optionsProvider: 'displays'` to have its
// option list composed at runtime from useDisplays(). A schema may also
// declare `showWhen: { key, equals }` to hide the field unless a sibling
// option matches — used to hide "출력 모니터" outside Individual mode.

'use client';

import { useEffect, useState } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import { useOption } from '@/hooks/useOption';
import { useDisplays, type DisplayInfo } from '@/hooks/useDisplays';
import type { OptionSchema, NumberOptionSchema, SelectOptionSchema } from '@/lib/options/types';
import styles from './OptionField.module.css';

interface Props {
  schema: OptionSchema;
}

export default function OptionField({ schema }: Props) {
  const setOption = useSignageStore((s) => s.setOption);
  const value = useOption<unknown>(schema.key);
  const [busy, setBusy] = useState(false);
  // Design Ref: monitor-target §3.5 — read gate value reactively so the field
  // appears/disappears when its sibling changes (e.g. mode surround↔individual).
  const gate = schema.type === 'select' ? schema.showWhen : undefined;
  const gateValue = useOption<unknown>(gate?.key ?? schema.key);
  if (gate && JSON.stringify(gateValue) !== JSON.stringify(gate.equals)) {
    return null;
  }

  const onChange = async (next: unknown) => {
    if (busy) return;
    setBusy(true);
    try {
      await setOption(schema.key, next);
    } catch {
      // store already captured the error; field reflects rolled-back value
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.row}>
      <div className={styles.labelCol}>
        <label className={styles.label} htmlFor={`opt-${schema.key}`}>
          {schema.label}
        </label>
        {schema.hint && <span className={styles.hint}>{schema.hint}</span>}
      </div>
      <div className={styles.inputCol}>{renderInput(schema, value, onChange, busy)}</div>
    </div>
  );
}

function renderInput(
  schema: OptionSchema,
  value: unknown,
  change: (next: unknown) => void,
  busy: boolean
) {
  const id = `opt-${schema.key}`;
  switch (schema.type) {
    case 'number':
      return <NumberInput id={id} schema={schema} value={value as number} disabled={busy} onChange={change} />;
    case 'select':
      if (schema.optionsProvider === 'displays') {
        return <DisplaySelectInput id={id} schema={schema as SelectOptionSchema<unknown>} value={value} disabled={busy} onChange={change} />;
      }
      return <SelectInput id={id} schema={schema as SelectOptionSchema<unknown>} value={value} disabled={busy} onChange={change} />;
    case 'boolean':
      return (
        <input
          id={id}
          type="checkbox"
          className={styles.checkbox}
          checked={(value as boolean) ?? false}
          disabled={busy}
          onChange={(e) => change(e.target.checked)}
        />
      );
  }
}

function NumberInput({
  id,
  schema,
  value,
  disabled,
  onChange,
}: {
  id: string;
  schema: NumberOptionSchema;
  value: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  // ui-redesign §3.2.1 bugfix — keep a local draft while dragging so the
  // input doesn't get re-disabled mid-drag by an inflight PUT (which would
  // cause the HTML range input to release its pointer capture). Commit on
  // pointerUp/keyUp/blur instead.
  const step = schema.step ?? 1;
  const clamp = (n: number) => Math.max(schema.min, Math.min(schema.max, n));
  const [draft, setDraft] = useState<number>(value ?? schema.default);
  useEffect(() => {
    setDraft(value ?? schema.default);
  }, [value, schema.default]);

  const commit = (n: number) => {
    const clamped = clamp(n);
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className={styles.numberGroup}>
      <input
        type="range"
        className={styles.slider}
        min={schema.min}
        max={schema.max}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => commit(draft)}
        onKeyUp={(e) => {
          if (
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' ||
            e.key === 'ArrowUp' ||
            e.key === 'ArrowDown' ||
            e.key === 'Home' ||
            e.key === 'End' ||
            e.key === 'PageUp' ||
            e.key === 'PageDown'
          ) {
            commit(draft);
          }
        }}
      />
      <input
        id={id}
        type="number"
        className={styles.numberInput}
        min={schema.min}
        max={schema.max}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(Number(e.target.value))}
        onBlur={() => commit(draft)}
        onKeyUp={(e) => {
          if (e.key === 'Enter') commit(draft);
        }}
      />
      {schema.unit && <span className={styles.unit}>{schema.unit}</span>}
    </div>
  );
}

function SelectInput({
  id,
  schema,
  value,
  disabled,
  onChange,
}: {
  id: string;
  schema: SelectOptionSchema<unknown>;
  value: unknown;
  disabled: boolean;
  onChange: (next: unknown) => void;
}) {
  // Compare by JSON because option values may be objects (e.g. resolution).
  const selectedIdx = Math.max(
    0,
    schema.options.findIndex((o) => JSON.stringify(o.value) === JSON.stringify(value))
  );
  return (
    <select
      id={id}
      className={styles.select}
      value={selectedIdx}
      disabled={disabled}
      onChange={(e) => onChange(schema.options[Number(e.target.value)].value)}
    >
      {schema.options.map((o, i) => (
        <option key={i} value={i}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Design Ref: monitor-target §3.5 — provider-driven options.
// Base options (schema.options) typically carry only the "자동" sentinel;
// runtime entries for each non-primary display are appended.
function formatDisplayLabel(d: DisplayInfo): string {
  const label = d.label && d.label.length > 0 ? d.label : `Display ${d.id}`;
  return `${label} (${d.bounds.width}×${d.bounds.height})`;
}

function DisplaySelectInput({
  id,
  schema,
  value,
  disabled,
  onChange,
}: {
  id: string;
  schema: SelectOptionSchema<unknown>;
  value: unknown;
  disabled: boolean;
  onChange: (next: unknown) => void;
}) {
  const { displays, loading } = useDisplays();
  const composed = [
    ...schema.options,
    ...displays
      .filter((d) => !d.isPrimary)
      .map((d) => ({ label: formatDisplayLabel(d), value: d.id as unknown })),
  ];
  const selectedIdx = Math.max(
    0,
    composed.findIndex((o) => JSON.stringify(o.value) === JSON.stringify(value))
  );
  return (
    <select
      id={id}
      className={styles.select}
      value={selectedIdx}
      disabled={disabled || loading}
      onChange={(e) => onChange(composed[Number(e.target.value)].value)}
    >
      {composed.map((o, i) => (
        <option key={i} value={i}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
