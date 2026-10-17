import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Briefcase, Terminal, Sun, Moon, ArrowRight } from 'lucide-react';
import { FoundryArchitectureArt, Button, Card, DcLogo, Badge, Mark, useTheme } from '@dcfoundry/ui';
import type { RoleName } from '@dcfoundry/shared';
import { WorkspaceArt } from '../components/WorkspaceArt.js';

export interface AuthenticatedSession {
  userId: string;
  fullName: string;
  email: string;
  roles: RoleName[];
  teamId: string;
  accessToken?: string;
}

export interface LoginPageProps {
  onAuthenticated: (user: AuthenticatedSession) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated }) => {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('vitor@dcfoundrydigital.com');
  const [password, setPassword] = useState('DcFoundry#2026');
  const [totpCode, setTotpCode] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleName>('admin');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fillPreset = (preset: 'admin' | 'vendedor' | 'logistica') => {
    setError(null);
    if (preset === 'admin') {
      setEmail('vitor@dcfoundrydigital.com');
      setPassword('DcFoundry#2026');
      setSelectedRole('admin');
    } else if (preset === 'vendedor') {
      setEmail('vendedor@dcfoundrydigital.com');
      setPassword('Vendedor#2026');
      setSelectedRole('vendedor');
    } else {
      setEmail('logistica@dcfoundrydigital.com');
      setPassword('Logistica#2026');
      setSelectedRole('logistica');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          totpCode: totpCode.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onAuthenticated({
          userId: data.user.id,
          fullName: data.user.fullName,
          email: data.user.email,
          roles: data.user.roles,
          teamId: data.user.teamId ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          accessToken: data.accessToken,
        });
        return;
      }

      if (res.status === 401 || res.status === 400) {
        setError(
          'Credenciais inválidas. Selecione um dos perfis rápidos abaixo ou verifique a senha.',
        );
        setLoading(false);
        return;
      }
    } catch {
      // Fallback local caso a API esteja reiniciando
    }

    onAuthenticated({
      userId: '11111111-1111-4111-8111-111111111111',
      fullName:
        selectedRole === 'admin'
          ? 'Vitor Henrique Camillo'
          : selectedRole === 'vendedor'
            ? 'Lucas Consultor Comercial'
            : 'Marcos Tech Lead & Ops',
      email,
      roles: [selectedRole],
      teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
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
          <div className="login-presets" aria-label="Perfis de demonstração">
            <button
              type="button"
              aria-pressed={selectedRole === 'admin'}
              onClick={() => fillPreset('admin')}
            >
              <ShieldCheck size={14} />
              Admin
            </button>
            <button
              type="button"
              aria-pressed={selectedRole === 'vendedor'}
              onClick={() => fillPreset('vendedor')}
            >
              <Briefcase size={14} />
              Comercial
            </button>
            <button
              type="button"
              aria-pressed={selectedRole === 'logistica'}
              onClick={() => fillPreset('logistica')}
            >
              <Terminal size={14} />
              Operações
            </button>
          </div>
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
              <label>
                Perfil da demonstração
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as RoleName)}
                >
                  <option value="admin">Admin</option>
                  <option value="gestor">Gestor</option>
                  <option value="vendedor">Comercial</option>
                  <option value="atendente">Atendimento</option>
                  <option value="financeiro">Financeiro</option>
                  <option value="logistica">Operações</option>
                  <option value="marketing">Marketing & Ads</option>
                </select>
              </label>
            </div>
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar no workspace'}
              <ArrowRight size={17} />
            </Button>
          </form>
        </motion.div>
        <p className="login-footer">Ambiente de demonstração · DC Foundry Digital CRM</p>
      </section>
    </div>
  );
};
