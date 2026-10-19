import type { DesignModel, Room, RoomSummary } from '../types';

interface Props {
  model: DesignModel | null;
  summary: RoomSummary[];
  selectedRoomId: string | null;
  onSelect: (roomId: string | null) => void;
  onAction: (instruction: string) => void;
  busy: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  hall: 'Hall',
  living: 'Sala',
  dining: 'Comedor',
  kitchen: 'Cocina',
  bedroom: 'Dormitorio',
  bathroom: 'Baño',
  garage: 'Cochera',
  terrace: 'Terraza',
  laundry: 'Lavandería',
  study: 'Estudio',
  stairs: 'Escalera',
  storage: 'Depósito',
};

const FLOOR_LABEL: Record<string, string> = {
  'floor.ceramic.standard': 'Cerámica estándar',
  'floor.porcelain.matte': 'Porcelanato mate',
  'floor.laminate.oak': 'Laminado roble',
  'floor.vinyl.grey': 'Vinílico gris',
  'floor.concrete.polished': 'Concreto pulido',
  'floor.marble.carrara': 'Mármol Carrara',
  'floor.wood.engineered': 'Madera ingenierizada',
};

function findRoom(model: DesignModel | null, roomId: string | null): Room | null {
  if (!model || !roomId) return null;
  for (const level of model.building.levels) {
    const room = level.rooms.find((candidate) => candidate.id === roomId);
    if (room) return room;
  }
  return null;
}

export default function PropertiesPanel({
  model,
  summary,
  selectedRoomId,
  onSelect,
  onAction,
  busy,
}: Props): JSX.Element {
  const room = findRoom(model, selectedRoomId);
  const roomSummary = summary.find((entry) => entry.id === selectedRoomId);

  return (
    <section className="panel properties">
      <header className="panel-head">
        <h2>Propiedades</h2>
        {room && (
          <button className="ghost small" onClick={() => onSelect(null)}>
            Cerrar
          </button>
        )}
      </header>

      {!room && (
        <>
          <p className="muted small">
            Seleccione un ambiente en el visor o en la lista para ver y modificar sus propiedades.
          </p>
          <div className="room-list">
            {model?.building.levels.map((level) => (
              <div key={level.index}>
                <h3 className="list-title">{level.name}</h3>
                <ul>
                  {level.rooms.map((candidate) => (
                    <li key={candidate.id}>
                      <button className="room-row" onClick={() => onSelect(candidate.id)}>
                        <span className={`swatch ${candidate.type}`} />
                        <span className="room-name">{candidate.name}</span>
                        <span className="room-area">
                          {(candidate.rect.w * candidate.rect.h).toFixed(1)} m²
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {room && (
        <>
          <h3 className="room-title">{room.name}</h3>
          <span className="badge muted">{TYPE_LABEL[room.type] ?? room.type}</span>

          <dl className="specs">
            <div>
              <dt>Superficie</dt>
              <dd>{(room.rect.w * room.rect.h).toFixed(2)} m²</dd>
            </div>
            <div>
              <dt>Dimensiones</dt>
              <dd>
                {room.rect.w.toFixed(2)} × {room.rect.h.toFixed(2)} m
              </dd>
            </div>
            <div>
              <dt>Altura libre</dt>
              <dd>{room.height.toFixed(2)} m</dd>
            </div>
            <div>
              <dt>Piso</dt>
              <dd>{FLOOR_LABEL[room.floorMaterialId] ?? room.floorMaterialId}</dd>
            </div>
            <div>
              <dt>Color de muros</dt>
              <dd>
                <span className="color-dot" style={{ background: room.interiorColor }} />{' '}
                {room.interiorColor}
              </dd>
            </div>
            <div>
              <dt>Puertas / ventanas</dt>
              <dd>
                {roomSummary?.doors ?? 0} / {roomSummary?.windows ?? 0}
              </dd>
            </div>
            <div>
              <dt>Mobiliario</dt>
              <dd>{room.furniture.length} pieza(s)</dd>
            </div>
            <div>
              <dt>Mínimo recomendado</dt>
              <dd>{roomSummary ? `${roomSummary.minArea} m²` : '—'}</dd>
            </div>
          </dl>

          <h4 className="subtitle">Acciones rápidas</h4>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() => onAction(`Amplía la ${room.name.toLowerCase()} 20%`)}
            >
              Ampliar 20%
            </button>
            <button
              disabled={busy}
              onClick={() => onAction(`Reduce la ${room.name.toLowerCase()} 15%`)}
            >
              Reducir 15%
            </button>
            <button disabled={busy} onClick={() => onAction(`Sustituye el piso de ${room.name} por porcelanato`)}>
              Piso de porcelanato
            </button>
            <button disabled={busy} onClick={() => onAction(`Cambia el color de las paredes de ${room.name} a blanco`)}>
              Muros blancos
            </button>
            <button disabled={busy} onClick={() => onAction(`Cambia las ventanas de ${room.name} por ventanales de piso a techo`)}>
              Ventanales
            </button>
            <button disabled={busy} onClick={() => onAction(`Agrega una isla central a la cocina`)}>
              Isla en cocina
            </button>
          </div>
        </>
      )}
    </section>
  );
}
