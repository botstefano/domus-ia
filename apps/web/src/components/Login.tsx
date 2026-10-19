import { useState } from 'react';
import { api, setToken } from '../api';
import type { User } from '../types';

interface Props {
  onAuthenticated: (user: User) => void;
}

const DEMO_ACCOUNTS = [
  { email: 'admin@domus.local', label: 'Administrador' },
  { email: 'arquitecto@domus.local', label: 'Arquitecto' },
  { email: 'cliente@domus.local', label: 'Cliente' },
];

export default function Login({ onAuthenticated }: Props): JSX.Element {
  const [email, setEmail] = useState('cliente@domus.local');
  const [password, setPassword] = useState('Domus2026!');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.login(email, password);
      setToken(result.token);
      onAuthenticated(result.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-hero">
        <span className="pill">Prototipo funcional · MVP</span>
        <h1>Diseñe su vivienda hablando de ella.</h1>
        <p>
          Describa la casa que imagina y el motor paramétrico la convierte en un modelo 3D
          estructurado, editable y verificable: ambientes, muros, puertas, ventanas, materiales y
          mobiliario con dimensiones reales.
        </p>
        <ul>
          <li>Requisitos en lenguaje natural → operaciones geométricas verificables</li>
          <li>Modificación por ambiente sin regenerar toda la vivienda</li>
          <li>Planos preliminares, presupuesto y ficha del proyecto</li>
          <li>Recorrido 3D, VR/AR cuando el dispositivo lo permite</li>
        </ul>
        <p className="login-note">
          Las propuestas son preliminares: requieren revisión de un arquitecto o ingeniero
          habilitado antes de su uso constructivo.
        </p>
      </div>

      <form className="login-card" onSubmit={submit}>
        <h2>Iniciar sesión</h2>
        <label>
          Correo electrónico
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>

        <div className="demo-accounts">
          <span>Cuentas de demostración (clave Domus2026!)</span>
          <div className="chips">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                type="button"
                key={account.email}
                className="chip"
                onClick={() => {
                  setEmail(account.email);
                  setPassword('Domus2026!');
                }}
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
