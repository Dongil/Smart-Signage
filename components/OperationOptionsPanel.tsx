// Design Ref: ui-redesign §3.2.2 — schema-driven panel.
// ui-polish §6.2 — wrapped with SectionHeader for collapse (default collapsed,
// session-volatile per Plan §2.1 FR-1).

'use client';

import { useState } from 'react';
import { OPTION_REGISTRY } from '@/lib/options/registry';
import OptionField from './OptionField';
import SectionHeader from './SectionHeader';
import styles from './OperationOptionsPanel.module.css';

export default function OperationOptionsPanel() {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section className={styles.panel} aria-label="운영 옵션">
      <SectionHeader
        title="운영 옵션"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        controlsId="operation-options-body"
      />
      {!collapsed && (
        <div id="operation-options-body" className={styles.fields}>
          {OPTION_REGISTRY.map((schema) => (
            <OptionField key={schema.key} schema={schema} />
          ))}
        </div>
      )}
    </section>
  );
}
