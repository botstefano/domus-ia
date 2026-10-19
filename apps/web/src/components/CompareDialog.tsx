import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Comparison } from '../types';

interface Props {
  projectId: string;
  fromVersion: number;
  toVersion: number;
  onClose: () => void;
}

export default function CompareDialog({ projectId, fromVersion, toVersion, onClose }: Props): JSX.Element {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .compare(projectId, fromVersion, toVersion)
      .then(setComparison)
      .catch((compareError: unknown) =>
        setError(compareError instanceof Error ? compareError.message : 'No se pudo comparar.'),
      );
  }, [projectId, fromVersion, toVersion]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <h2>Comparación de versiones</h2>
          <button className="ghost small" onClick={onClose}>
            Cerrar
          </button>
        </header>

        {error && <div className="alert error">{error}</div>}
        {!comparison && !error && <p className="muted">Calculando diferencias…</p>}

        {comparison && (
          <>
            <div className="compare-grid">
              <div className="compare-card">
                <span>Versión {comparison.from.version}</span>
                <strong>{comparison.from.area.toFixed(1)} m²</strong>
                <small>USD {comparison.from.total.toLocaleString('en-US')}</small>
              </div>
              <div className="compare-arrow">→</div>
              <div className="compare-card">
                <span>Versión {comparison.to.version}</span>
                <strong>{comparison.to.area.toFixed(1)} m²</strong>
                <small>USD {comparison.to.total.toLocaleString('en-US')}</small>
              </div>
              <div className="compare-delta">
                <span className={comparison.areaDelta >= 0 ? 'up' : 'down'}>
                  {comparison.areaDelta >= 0 ? '+' : ''}
                  {comparison.areaDelta.toFixed(1)} m²
                </span>
                <span className={comparison.costDelta <= 0 ? 'up' : 'down'}>
                  {comparison.costDelta >= 0 ? '+' : ''}USD{' '}
                  {Math.round(comparison.costDelta).toLocaleString('en-US')}
                </span>
              </div>
            </div>

            <h3 className="subtitle">Cambios detectados ({comparison.changes.length})</h3>
            <ul className="change-list">
              {comparison.changes.map((change, index) => (
                <li key={`${change.kind}-${index}`}>
                  <span className={`change-kind ${change.kind}`}>{change.kind.replace('_', ' ')}</span>
                  {change.label}
                </li>
              ))}
              {comparison.changes.length === 0 && <li>No se detectaron cambios entre las versiones.</li>}
            </ul>
            <p className="muted small">
              {comparison.sameStructure
                ? 'Solo cambiaron acabados o mobiliario: la estructura se mantiene.'
                : 'La comparación incluye cambios geométricos; revise la coherencia del diseño.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
