// Design Ref: ui-redesign §3.1.1 — operation option schemas.
// Each entry in OPTION_REGISTRY conforms to one of these shapes; the panel
// uses the discriminator `type` to pick an input renderer.

export type OptionType = 'number' | 'select' | 'boolean';

interface BaseSchema {
  /** Settings key — matches SQLite settings.key + SSE event.key. */
  key: string;
  /** Human-readable label shown in OperationOptionsPanel. */
  label: string;
  /** Optional helper text below the field. */
  hint?: string;
}

export interface NumberOptionSchema extends BaseSchema {
  type: 'number';
  default: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export interface SelectOptionSchema<T = unknown> extends BaseSchema {
  type: 'select';
  default: T;
  options: Array<{ label: string; value: T }>;
}

export interface BooleanOptionSchema extends BaseSchema {
  type: 'boolean';
  default: boolean;
}

export type OptionSchema =
  | NumberOptionSchema
  | SelectOptionSchema<unknown>
  | BooleanOptionSchema;
