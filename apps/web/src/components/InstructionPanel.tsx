import { useEffect, useRef, useState } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: string;
  tone?: 'normal' | 'warning' | 'error';
}

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
  onCompare: () => void;
}

const SUGGESTIONS = [
  'Amplía la cocina a 16 m2',
  'Agrega una isla central a la cocina',
  'Cambia la fachada a tonos blancos y grises',
  'Cambia las ventanas por ventanales de piso a techo',
  'Quiero una habitación adicional en el segundo piso',
  'Sustituye el piso de la sala por porcelanato',
  'Reduce el presupuesto con materiales económicos',
  'Compara esta propuesta con la anterior',
];

export default function InstructionPanel({ messages, busy, onSend, onCompare }: Props): JSX.Element {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy]);

  const submit = (event?: React.FormEvent): void => {
    event?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    onSend(value);
    setText('');
  };

  return (
    <section className="panel instructions">
      <header className="panel-head">
        <h2>Asistente de diseño</h2>
        <button className="ghost small" onClick={onCompare}>
          Comparar
        </button>
      </header>

      <div className="messages" ref={listRef}>
        {messages.map((message) => (
          <article key={message.id} className={`message ${message.role} ${message.tone ?? 'normal'}`}>
            {message.text.split('\n').map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            {message.meta && <span className="message-meta">{message.meta}</span>}
          </article>
        ))}
        {busy && (
          <article className="message assistant pending">
            <p>
              <span className="dot" /> Interpretando la instrucción y verificando la geometría…
            </p>
          </article>
        )}
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            className="chip"
            disabled={busy}
            onClick={() => onSend(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form className="composer" onSubmit={submit}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Describa la vivienda o el cambio que desea…"
          rows={2}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button className="primary" type="submit" disabled={busy || text.trim().length < 3}>
          Enviar
        </button>
      </form>
    </section>
  );
}
