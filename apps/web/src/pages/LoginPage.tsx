import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Sun, Moon, ArrowRight } from 'lucide-react';
import { Button, DcLogo, Mark, useTheme } from '@dcfoundry/ui';
import type { RoleName } from '@dcfoundry/shared';
import { WorkspaceArt } from '../components/WorkspaceArt.js';

export interface AuthenticatedSession {
  userId: string;
  fullName: string;
  email: string;
  roles: RoleName[];
  teamId: string;
  accessToken?: string;
  preview?: boolean;
  localReview?: boolean;
}

export interface LoginPageProps {
  onAuthenticated: (user: AuthenticatedSession) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated }) => {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          totpCode: totpCode.trim() || undefined,
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 503
            ? 'Configure o banco e o administrador no servidor para entrar.'
            : response.status === 401 || response.status === 400
              ? 'E-mail ou senha inválidos.'
              : 'Não foi possível entrar. Tente novamente.',
        );
        return;
      }
      const data = await response.json();
      if (!data.accessToken || !data.user?.id)
        throw new Error('Resposta de autenticação inválida.');
      onAuthenticated({
        userId: data.user.id,
        fullName: data.user.fullName,
        email: data.user.email,
        roles: data.user.roles,
        teamId: data.user.teamId ?? '',
        accessToken: data.accessToken,
      });
    } catch {
      setError('A API não está disponível. Confira o servidor e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="crm-login">
      <section className="login-story">
        <DcLogo size={34} subtitle="CRM" />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1>
            Boas ideias.
            <br />
            <Mark>Grandes conexões.</Mark>
          </h1>
          <p>Negócios, conversas e projetos. Um lugar para conectar cada próximo passo.</p>
          <WorkspaceArt />
        </motion.div>
        <div className="login-story-footer">
          <ShieldCheck size={15} />
          Seu workspace DC Foundry Digital.
        </div>
      </section>
      <section className="login-panel">
        <div className="login-topbar">
          <span>dcfoundrydigital.com</span>
          <button
            className="icon-button"
            type="button"
            onClick={() => toggleTheme()}
            aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
        <motion.div
          className="login-form-wrap"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <h2>Bom ter você por aqui.</h2>
          <p>Entre para acompanhar as conversas e dar vida aos próximos projetos.</p>
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              E-mail corporativo
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <div className="login-form-secondary">
              <label>
                Código 2FA · opcional
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="000000"
                />
              </label>
            </div>
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar no workspace'}
              <ArrowRight size={17} />
            </Button>
          </form>
          {import.meta.env.DEV && (
            <button
              type="button"
              className="local-preview-button"
              onClick={async () => {
                try {
                  const response = await fetch('/api/v1/dev-review-session');
                  if (response.ok) {
                    const result = await response.json();
                    if (result.accessToken && result.user?.id) {
                      onAuthenticated({
                        userId: result.user.id,
                        fullName: result.user.fullName,
                        email: result.user.email,
                        roles: result.user.roles,
                        teamId: result.user.teamId ?? '',
                        accessToken: result.accessToken,
                        localReview: true,
                      });
                      return;
                    }
                  }
                } catch {
                  /* The optional loopback review runner is not part of production. */
                }
                onAuthenticated({
                  userId: 'local-preview',
                  fullName: 'Prévia local',
                  email: '',
                  roles: [],
                  teamId: '',
                  preview: true,
                });
              }}
            >
              Visualizar interface local <ArrowRight size={15} />
            </button>
          )}
        </motion.div>
        <p className="login-footer">DC Foundry Digital CRM · Acesso ao seu workspace</p>
      </section>
    </div>
  );
};
