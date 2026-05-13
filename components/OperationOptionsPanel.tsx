// Design Ref: ui-redesign §3.2.2 — schema-driven panel.
// Iterates OPTION_REGISTRY and renders one OptionField per entry.
// Adding a new option to the registry surfaces it here automatically.

'use client';

import { OPTION_REGISTRY } from '@/lib/options/registry';
import OptionField from './OptionField';
import styles from './OperationOptionsPanel.module.css';

export default function OperationOptionsPanel() {
  return (
    <section className={styles.panel} aria-label="운영 옵션">
      <h3 className={styles.heading}>운영 옵션</h3>
      <div className={styles.fields}>
        {OPTION_REGISTRY.map((schema) => (
          <OptionField key={schema.key} schema={schema} />
        ))}
      </div>
    </section>
  );
}
