import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import type { User } from './types';
import Login from './components/Login';
import ProjectList from './components/ProjectList';
import Designer from './components/Designer';

export default function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(''))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="boot">
        <div className="boot-logo">Domus IA</div>
        <p>Verificando sesión…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Login
        onAuthenticated={(authenticated) => {
          setUser(authenticated);
        }}
      />
    );
  }

  if (projectId) {
    return (
      <Designer
        projectId={projectId}
        user={user}
        onBack={() => setProjectId(null)}
        onLogout={() => {
          setToken('');
          setUser(null);
        }}
      />
    );
  }

  return (
    <ProjectList
      user={user}
      onOpen={setProjectId}
      onLogout={() => {
        setToken('');
        setUser(null);
      }}
    />
  );
}
