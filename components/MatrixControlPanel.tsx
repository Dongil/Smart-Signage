// Design Ref: matrix-control §3.6 — RightPanel 하단 호스트 전용 메트릭스 패널.
// Header (IP/Port/연결버튼/상태/프리셋+) + 4×9 grid + autoConnect footer.
// Auto-Take: 입력 셀 선택 후 출력 셀 클릭 즉시 routeTo() → IPC matrix:route.
// ui-polish §6.3 — SectionHeader collapse (default collapsed, volatile).
// ui-polish §6.4/6.5 — preset bar above grid + preset add modal (host-only).

'use client';

import { useEffect, useState } from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import MatrixAliasCell from './MatrixAliasCell';
import MatrixPresetBar from './MatrixPresetBar';
import MatrixPresetModal from './MatrixPresetModal';
import SectionHeader from './SectionHeader';
import styles from './MatrixControlPanel.module.css';

const PORTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export default function MatrixControlPanel() {
  const state = useMatrixStore((s) => s.state);
  const host = useMatrixStore((s) => s.host);
  const port = useMatrixStore((s) => s.port);
  const autoConnect = useMatrixStore((s) => s.autoConnect);
  const routes = useMatrixStore((s) => s.routes);
  const aliases = useMatrixStore((s) => s.aliases);
  const presets = useMatrixStore((s) => s.presets);
  const selectedInput = useMatrixStore((s) => s.selectedInput);
  const error = useMatrixStore((s) => s.error);
  const setHostDraft = useMatrixStore((s) => s.setHostDraft);
  const connect = useMatrixStore((s) => s.connect);
  const disconnect = useMatrixStore((s) => s.disconnect);
  const routeTo = useMatrixStore((s) => s.routeTo);
  const setAutoConnect = useMatrixStore((s) => s.setAutoConnect);
  const setSelectedInput = useMatrixStore((s) => s.setSelectedInput);
  const clearError = useMatrixStore((s) => s.clearError);

  // Local drafts so the user can edit fields freely before "연결" commits them.
  const [hostInput, setHostInput] = useState(host);
  const [portInput, setPortInput] = useState(port);
  useEffect(() => setHostInput(host), [host]);
  useEffect(() => setPortInput(port), [port]);

  // ui-polish §6.3 — collapse + modal local state (both volatile per Plan FR-1/FR-4).
  const [collapsed, setCollapsed] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const isConnected = state === 'connected';
  const isBusy = state === 'connecting' || state === 'reconnecting';
  const fieldsLocked = isConnected || isBusy;

  const statusLabel =
    state === 'connected' ? '연결됨'
      : state === 'connecting' ? '연결 중'
      : state === 'reconnecting' ? '재연결 중'
      : '끊김';

  const onConnectClick = async () => {
    setHostDraft(hostInput, portInput);
    await connect();
  };

  const onInputClick = (i: number) => {
    if (!isConnected) return;
    setSelectedInput(selectedInput === i ? null : i);
  };

  const onOutputClick = (o: number) => {
    if (!isConnected || !selectedInput) return;
    void routeTo(o);
  };

  return (
    <section className={styles.panel} aria-label="메트릭스 제어">
      <SectionHeader
        title="메트릭스 제어"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        controlsId="matrix-control-body"
      />

      {!collapsed && (
        <div id="matrix-control-body" className={styles.body}>
          <div className={styles.header}>
            <label className={styles.field}>
              <span>IP</span>
              <input
                type="text"
                className={styles.textInput}
                value={hostInput}
                disabled={fieldsLocked}
                onChange={(e) => setHostInput(e.target.value)}
                placeholder="192.168.10.199"
              />
            </label>
            <label className={styles.field}>
              <span>포트</span>
              <input
                type="number"
                className={styles.portInput}
                min={1}
                max={65535}
                value={portInput}
                disabled={fieldsLocked}
                onChange={(e) => setPortInput(Number(e.target.value) || 0)}
              />
            </label>
            {isConnected || isBusy ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={disconnect}
                disabled={isBusy}
              >
                연결 해제
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={onConnectClick}
              >
                연결
              </button>
            )}
            <span className={`${styles.statusDot} ${styles[`dot_${state}`]}`} />
            <span className={styles.statusLabel}>{statusLabel}</span>
            {/* ui-polish §6.3 — "프리셋 +" floats right; disabled when not connected. */}
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPreset}`}
              onClick={() => setModalOpen(true)}
              disabled={!isConnected}
              title={isConnected ? '프리셋 추가' : '메트릭스 미연결'}
            >
              프리셋 +
            </button>
          </div>

          {/* ui-polish FR-9 — bar only when connected AND there is at least one preset. */}
          {isConnected && presets.length > 0 && (
            <MatrixPresetBar presets={presets} />
          )}

          <div className={styles.grid}>
            <div className={styles.rowLabel}>입력</div>
            {PORTS.map((i) => (
              <MatrixAliasCell
                key={`in-${i}`}
                isInput
                index={i}
                value={aliases.input[i - 1] ?? String(i)}
                selected={selectedInput === i}
                disabled={!isConnected}
                onClick={() => onInputClick(i)}
              />
            ))}

            <div className={styles.rowLabel}>No.</div>
            {PORTS.map((i) => (
              <div key={`no-${i}`} className={styles.numberCell}>{i}</div>
            ))}

            <div className={styles.rowLabel}>연결</div>
            {PORTS.map((o) => {
              const inp = routes[o];
              const text =
                inp && inp >= 1
                  ? aliases.input[inp - 1] ?? String(inp)
                  : '';
              return (
                <div key={`conn-${o}`} className={styles.connectCell} title={inp ? `입력 ${inp}` : ''}>
                  {text}
                </div>
              );
            })}

            <div className={styles.rowLabel}>출력</div>
            {PORTS.map((o) => (
              <MatrixAliasCell
                key={`out-${o}`}
                isInput={false}
                index={o}
                value={aliases.output[o - 1] ?? String(o)}
                connected={selectedInput !== null && routes[o] === selectedInput}
                disabled={!isConnected}
                onClick={() => onOutputClick(o)}
              />
            ))}
          </div>

          <div className={styles.footer}>
            <label className={styles.autoConnect}>
              <input
                type="checkbox"
                checked={autoConnect}
                onChange={(e) => setAutoConnect(e.target.checked)}
              />
              앱 시작 시 자동 연결
            </label>
            {selectedInput !== null && isConnected && (
              <span className={styles.hint}>
                입력 {aliases.input[selectedInput - 1] ?? selectedInput} 선택 — 출력 클릭으로 라우팅
              </span>
            )}
          </div>

          {error && (
            <div className={styles.errorBanner}>
              <span>⚠ {error}</span>
              <button type="button" className={styles.errorClose} onClick={clearError}>×</button>
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <MatrixPresetModal
          existingCount={presets.length}
          onClose={() => setModalOpen(false)}
        />
      )}
    </section>
  );
}
