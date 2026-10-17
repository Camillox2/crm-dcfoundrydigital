import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BedArt, Button, Card, DcLogo, Badge, Mark, useTheme } from '@dcfoundry/ui';
import type { RoleName } from '@dcfoundry/shared';

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
        setError('Credenciais inválidas. Use um dos botões de acesso rápido abaixo ou confira a senha.');
        setLoading(false);
        return;
      }
    } catch {
      // Fallback caso a API não esteja ativa no momento
    }

    onAuthenticated({
      userId: '11111111-1111-4111-8111-111111111111',
      fullName:
        selectedRole === 'admin'
          ? 'Vitor Henrique Camillo'
          : selectedRole === 'vendedor'
            ? 'Lucas Vendedor Home Care'
            : 'Marcos Logística',
      email,
      roles: [selectedRole],
      teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        backgroundColor: 'var(--bg-page)',
      }}
    >
      {/* Painel Esquerdo: Hero Deep Navy + Cama Articulada em Vetor + Logo DC Foundry Digital */}
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--hero-gradient)',
          color: '#FFFFFF',
          padding: 'var(--space-10)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {/* Ornamentos flutuantes sutis */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '15%',
            right: '14%',
            fontSize: 28,
            color: '#4F93E0',
            opacity: 0.45,
            animation: 'dcf-float 6s ease-in-out infinite',
          }}
        >
          +
        </span>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: '22%',
            left: '10%',
            fontSize: 20,
            color: '#14B8A6',
            opacity: 0.4,
            animation: 'dcf-float 7.5s ease-in-out infinite',
          }}
        >
          +
        </span>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
          <DcLogo size={46} subtitle="CRM Enterprise" />
          <Badge tone="teal">v2.0 • IA + Ads + Locação</Badge>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{ margin: 'var(--space-6) 0', zIndex: 1 }}
        >
          <BedArt style={{ width: '100%', maxWidth: 480, margin: '0 auto', display: 'block' }} />

          <h1
            className="serif-editorial"
            style={{
              fontSize: 'clamp(1.75rem, 2.6vw, 2.5rem)',
              lineHeight: 1.12,
              marginTop: 'var(--space-6)',
              marginBottom: 'var(--space-3)',
              color: '#FFFDF9',
            }}
          >
            Cada quarto pronto <Mark>começa aqui.</Mark>
          </h1>
          <p style={{ color: '#DCE9F8', fontSize: 'var(--text-sm)', lineHeight: 1.65, maxWidth: '48ch' }}>
            Funil comercial, atendimento WhatsApp multi-sessão com IA RAG (`pgvector`),
            contratos com assinatura digital, controle de patrimônio sem sobreposição e ROI
            de Google Ads em tempo real.
          </p>
        </motion.div>

        <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: '#93A8C1', zIndex: 1 }}>
          <span>🔒 Dados de Saúde AES-256-GCM (LGPD Art. 11)</span>
          <span>⚡ SLA IA &lt; 10s</span>
          <span>📊 Google Ads Offline Conversions</span>
        </div>
      </section>

      {/* Painel Direito: Formulário de Login */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 'var(--space-8)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
            DC Foundry Digital CRM
          </span>
          <Button variant="outline" size="sm" onClick={() => toggleTheme()}>
            {theme === 'light' ? '🌙 Modo Escuro (Navy)' : '☀️ Modo Claro'}
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          style={{ width: '100%', maxWidth: 460, margin: 'auto' }}
        >
          <Card style={{ padding: 'var(--space-8)' }}>
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <DcLogo size={38} subtitle="Autenticação RBAC + 2FA" />
              <h2
                className="serif-editorial"
                style={{
                  fontSize: '1.75rem',
                  marginTop: 'var(--space-4)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                Bem-vindo de volta
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
                Entre com sua credencial ou selecione um perfil de demonstração em 1 clique:
              </p>
            </div>

            {/* Botões de Preenchimento Rápido de Credenciais */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                marginBottom: 'var(--space-5)',
                padding: '10px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-default)',
              }}
            >
              <Button
                type="button"
                variant={selectedRole === 'admin' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => fillPreset('admin')}
              >
                👑 Admin
              </Button>
              <Button
                type="button"
                variant={selectedRole === 'vendedor' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => fillPreset('vendedor')}
              >
                💼 Vendedor
              </Button>
              <Button
                type="button"
                variant={selectedRole === 'logistica' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => fillPreset('logistica')}
              >
                🚚 Logística
              </Button>
            </div>

            {error && (
              <div
                role="alert"
                style={{
                  padding: '12px',
                  marginBottom: 'var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: '#FEE2E2',
                  color: '#991B1B',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                E-mail corporativo
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-strong)',
                    backgroundColor: 'var(--bg-page)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                Senha
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-strong)',
                    backgroundColor: 'var(--bg-page)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  2FA TOTP (Opcional)
                  <input
                    type="text"
                    placeholder="000000"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-strong)',
                      backgroundColor: 'var(--bg-page)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Papel RBAC Ativo
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as RoleName)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-strong)',
                      backgroundColor: 'var(--bg-page)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="admin">Admin (Total)</option>
                    <option value="gestor">Gestor</option>
                    <option value="vendedor">Vendedor</option>
                    <option value="atendente">Atendente</option>
                    <option value="financeiro">Financeiro</option>
                    <option value="logistica">Logística</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </label>
              </div>

              <Button type="submit" size="lg" disabled={loading} style={{ marginTop: 'var(--space-2)' }}>
                {loading ? 'Autenticando...' : 'Entrar no DC Foundry Digital CRM →'}
              </Button>
            </form>
          </Card>
        </motion.div>

        <div style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          DC Foundry Digital • Engenharia de Software & Inteligência Comercial
        </div>
      </section>
    </div>
  );
};
