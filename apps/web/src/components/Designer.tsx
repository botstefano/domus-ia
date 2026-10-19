import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, download } from '../api';
import type {
  Comparison,
  CostReport,
  DesignModel,
  InstructionResponse,
  ProjectDetail,
  RoomSummary,
  User,
  ValidationReport,
} from '../types';
import { DEFAULT_VIEW, type HouseScene, type ViewOptions } from '../viewer/HouseScene';
import CompareDialog from './CompareDialog';
import InstructionPanel, { type ChatMessage } from './InstructionPanel';
import PropertiesPanel from './PropertiesPanel';
import Viewer from './Viewer';

interface Props {
  projectId: string;
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  designing: 'En diseño',
  review: 'En revisión',
  approved: 'Aprobado',
  finished: 'Finalizado',
  archived: 'Archivado',
};

let messageSequence = 0;
const nextMessageId = (): string => {
  messageSequence += 1;
  return `msg-${messageSequence}`;
};

function formatMoney(value: number): string {
  return `USD ${Math.round(value).toLocaleString('en-US')}`;
}

export default function Designer({ projectId, user, onBack, onLogout }: Props): JSX.Element {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [model, setModel] = useState<DesignModel | null>(null);
  const [summary, setSummary] = useState<RoomSummary[]>([]);
  const [cost, setCost] = useState<CostReport | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<ViewOptions>(DEFAULT_VIEW);
  const [past, setPast] = useState<number[]>([]);
  const [future, setFuture] = useState<number[]>([]);
  const [compare, setCompare] = useState<{ from: number; to: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sceneRef = useRef<HouseScene | null>(null);

  const pushMessage = useCallback((message: Omit<ChatMessage, 'id'>) => {
    setMessages((current) => [...current, { ...message, id: nextMessageId() }]);
  }, []);

  const applySnapshot = useCallback(
    (data: {
      model: DesignModel;
      summary?: RoomSummary[];
      cost?: CostReport;
      validation?: ValidationReport;
    }) => {
      setModel(data.model);
      if (data.summary) setSummary(data.summary);
      if (data.cost) setCost(data.cost);
      if (data.validation) setValidation(data.validation);
    },
    [],
  );

  const reload = useCallback(async (): Promise<ProjectDetail> => {
    const data = await api.project(projectId);
    setDetail(data);
    if (data.version) {
      applySnapshot({
        model: data.version.model,
        summary: data.version.summary,
        cost: data.version.cost,
        validation: data.version.validation,
      });
    }
    return data;
  }, [applySnapshot, projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    reload()
      .then((data) => {
        if (!active) return;
        const rooms = data.version?.summary.length ?? 0;
        pushMessage({
          role: 'assistant',
          text:
            `He cargado “${data.name}”: ${data.requirements.levels} planta(s), ` +
            `${data.requirements.bedrooms} dormitorio(s), ${data.requirements.bathrooms} baño(s), ` +
            `${rooms} ambientes en total.\n\n` +
            'Puede pedirme cambios en lenguaje natural. Trabajo sobre el modelo existente: solo modifico los elementos afectados y verifico la geometría antes de aceptar el cambio.',
        });
        const history = data.instructions.slice(-3);
        for (const instruction of history) {
          pushMessage({
            role: 'system',
            text: `Instrucción previa (v${instruction.version}): ${instruction.text}`,
          });
        }
      })
      .catch((error: unknown) => {
        pushMessage({
          role: 'assistant',
          tone: 'error',
          text: error instanceof Error ? error.message : 'No se pudo cargar el proyecto.',
        });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [pushMessage, reload]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const describeResult = (result: InstructionResponse): Omit<ChatMessage, 'id'> => {
    const lines: string[] = [result.intent.explanation];
    if (result.changes.length > 0) {
      lines.push('', 'Cambios aplicados:');
      for (const change of result.changes.slice(0, 8)) lines.push(`• ${change.label}`);
      if (result.changes.length > 8) lines.push(`• … y ${result.changes.length - 8} más`);
    }
    if (result.rejected.length > 0) {
      lines.push('', 'No se pudieron aplicar:');
      for (const rejected of result.rejected) lines.push(`• ${rejected.operation.op}: ${rejected.reason}`);
    }
    if (result.warnings.length > 0) {
      lines.push('', 'Avisos del motor:');
      for (const warning of result.warnings.slice(0, 5)) lines.push(`• ${warning}`);
    }
    if (result.clarifications.length > 0) {
      lines.push('', 'Necesito confirmar:');
      for (const question of result.clarifications) lines.push(`• ${question}`);
    }
    return {
      role: 'assistant',
      text: lines.join('\n'),
      tone: result.warnings.length > 0 || result.rejected.length > 0 ? 'warning' : 'normal',
      meta: `Versión ${result.version} · ${result.intent.source === 'llm' ? 'modelo de lenguaje' : 'interpretación por reglas'} · confianza ${Math.round(
        result.intent.confidence * 100,
      )}%`,
    };
  };

  const send = useCallback(
    async (text: string) => {
      if (!model || busy) return;
      setBusy(true);
      pushMessage({ role: 'user', text });
      const previousVersion = model.version;
      try {
        const raw = await api.instruct(projectId, text);
        if ('comparison' in raw && raw.comparison) {
          const comparison = (raw as unknown as { comparison: Comparison }).comparison;
          setCompare({ from: comparison.from.version, to: comparison.to.version });
          pushMessage({
            role: 'assistant',
            text: `Comparación lista: ${comparison.areaDelta >= 0 ? '+' : ''}${comparison.areaDelta.toFixed(
              1,
            )} m² y ${comparison.costDelta >= 0 ? '+' : ''}${formatMoney(comparison.costDelta)} respecto a la versión anterior.`,
          });
          return;
        }
        const result = raw as unknown as InstructionResponse;
        applySnapshot({
          model: result.model,
          cost: result.cost,
          validation: result.validation,
          summary: undefined,
        });
        setPast((current) => [...current, previousVersion]);
        setFuture([]);
        pushMessage(describeResult(result));
        await reload();
      } catch (error) {
        const payload = (error as { payload?: { clarifications?: string[]; rejected?: unknown[] } }).payload;
        const extra = payload?.clarifications?.length
          ? `\n\n${payload.clarifications.map((question) => `• ${question}`).join('\n')}`
          : '';
        pushMessage({
          role: 'assistant',
          tone: 'error',
          text: `${error instanceof Error ? error.message : 'No se pudo aplicar el cambio.'}${extra}`,
        });
      } finally {
        setBusy(false);
      }
    },
    [applySnapshot, busy, model, projectId, pushMessage, reload],
  );

  const restore = useCallback(
    async (version: number) => {
      setBusy(true);
      try {
        const result = (await api.restore(projectId, version)) as unknown as InstructionResponse;
        applySnapshot({
          model: result.model,
          cost: result.cost,
          validation: result.validation,
          summary: undefined,
        });
        await reload();
        pushMessage({
          role: 'assistant',
          text: `Se restauró la versión ${version} como versión ${result.version}.`,
          meta: `Versión ${result.version}`,
        });
      } catch (error) {
        pushMessage({
          role: 'assistant',
          tone: 'error',
          text: error instanceof Error ? error.message : 'No se pudo restaurar la versión.',
        });
      } finally {
        setBusy(false);
      }
    },
    [applySnapshot, projectId, pushMessage, reload],
  );

  const undo = async (): Promise<void> => {
    if (past.length === 0) return;
    const target = past[past.length - 1];
    setPast(past.slice(0, -1));
    if (model) setFuture([...future, model.version]);
    await restore(target);
  };

  const redo = async (): Promise<void> => {
    if (future.length === 0) return;
    const target = future[future.length - 1];
    setFuture(future.slice(0, -1));
    if (model) setPast([...past, model.version]);
    await restore(target);
  };

  const enterXR = async (mode: 'vr' | 'ar'): Promise<void> => {
    const scene = sceneRef.current;
    if (!scene) return;
    try {
      if (mode === 'vr') await scene.enterVR();
      else await scene.enterAR();
      setToast(
        mode === 'vr'
          ? 'Sesión de realidad virtual iniciada.'
          : 'Sesión de realidad aumentada iniciada. Apunte la cámara a una superficie.',
      );
    } catch (error) {
      setToast(
        `${error instanceof Error ? error.message : 'No disponible.'} Se mantiene el modo de exploración 3D.`,
      );
    }
  };

  const levels = model?.building.levels ?? [];
  const area = useMemo(
    () => summary.reduce((acc, room) => acc + room.area, 0),
    [summary],
  );
  const issueCount = validation ? validation.errors.length + validation.warnings.length : 0;

  const toggle = (key: keyof ViewOptions): void => {
    setView((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="designer">
      <header className="topbar">
        <div className="brand">
          <button className="ghost small" onClick={onBack}>
            ← Proyectos
          </button>
          <span className="brand-mark">◈</span>
          <span>{detail?.name ?? 'Cargando…'}</span>
          {detail && <span className={`badge ${detail.status}`}>{STATUS_LABEL[detail.status] ?? detail.status}</span>}
        </div>
        <div className="topbar-right">
          <span className="muted small">Guardado automático · versión {model?.version ?? '—'}</span>
          <span className="user-chip">
            {user.fullName} · {user.role}
          </span>
          <button className="ghost" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar-group">
          {levels.map((level) => (
            <button
              key={level.index}
              className={view.level === level.index && !view.showAllLevels ? 'seg active' : 'seg'}
              onClick={() => setView({ ...view, level: level.index, showAllLevels: false })}
            >
              {level.name}
            </button>
          ))}
          <button className={view.showAllLevels ? 'seg active' : 'seg'} onClick={() => toggle('showAllLevels')}>
            Ver todo
          </button>
        </div>

        <div className="toolbar-group">
          <button className={view.hideWalls ? 'seg active' : 'seg'} onClick={() => toggle('hideWalls')}>
            Ocultar muros
          </button>
          <button className={view.showFurniture ? 'seg active' : 'seg'} onClick={() => toggle('showFurniture')}>
            Mobiliario
          </button>
          <button className={view.showRoof ? 'seg active' : 'seg'} onClick={() => toggle('showRoof')}>
            Cubierta
          </button>
          <button className={view.showLabels ? 'seg active' : 'seg'} onClick={() => toggle('showLabels')}>
            Etiquetas
          </button>
        </div>

        <div className="toolbar-group">
          <button className="seg" onClick={undo} disabled={past.length === 0 || busy}>
            Deshacer
          </button>
          <button className="seg" onClick={redo} disabled={future.length === 0 || busy}>
            Rehacer
          </button>
          <button
            className="seg"
            onClick={() => model && setCompare({ from: Math.max(1, model.version - 1), to: model.version })}
            disabled={!model || model.version < 2}
          >
            Comparar
          </button>
          <button className="seg" onClick={() => enterXR('vr')}>
            VR
          </button>
          <button className="seg" onClick={() => enterXR('ar')}>
            AR
          </button>
          <button
            className="seg"
            onClick={() =>
              download(api.planUrl(projectId, model?.version), `plano-v${model?.version ?? 1}.svg`).catch((error) =>
                setToast(error instanceof Error ? error.message : 'No se pudo descargar el plano.'),
              )
            }
          >
            Plano SVG
          </button>
          <button
            className="seg"
            onClick={() =>
              download(api.reportUrl(projectId, model?.version), `ficha-v${model?.version ?? 1}.pdf`).catch((error) =>
                setToast(error instanceof Error ? error.message : 'No se pudo descargar la ficha.'),
              )
            }
          >
            Ficha PDF
          </button>
        </div>
      </div>

      <main className="workspace">
        <InstructionPanel
          messages={messages}
          busy={busy}
          onSend={send}
          onCompare={() =>
            model && setCompare({ from: Math.max(1, model.version - 1), to: model.version })
          }
        />

        <div className="viewer-wrap">
          {loading && <div className="viewer-loading">Generando vista 3D…</div>}
          <Viewer
            model={model}
            options={view}
            selectedRoomId={selected}
            onSelect={setSelected}
            onReady={(scene) => {
              sceneRef.current = scene;
            }}
          />
          <div className="viewer-hint">
            Arrastre para orbitar · rueda para acercar · clic en un ambiente para seleccionarlo
          </div>
        </div>

        <PropertiesPanel
          model={model}
          summary={summary}
          selectedRoomId={selected}
          onSelect={setSelected}
          onAction={send}
          busy={busy}
        />
      </main>

      <footer className="statusbar">
        <span>{summary.length} ambientes</span>
        <span>{area.toFixed(1)} m² construidos</span>
        <span>{cost ? `Estimación ${formatMoney(cost.total)}` : 'Sin estimación'}</span>
        <span className={validation?.ok ? 'ok' : 'warn'}>
          {validation ? (validation.ok ? 'Geometría válida' : 'Requiere revisión') : 'Sin validar'}
        </span>
        <span>{issueCount} observación(es)</span>
        <span className="muted small">
          La estimación es preliminar; requiere revisión profesional antes de construir.
        </span>
      </footer>

      {compare && (
        <CompareDialog
          projectId={projectId}
          fromVersion={compare.from}
          toVersion={compare.to}
          onClose={() => setCompare(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
