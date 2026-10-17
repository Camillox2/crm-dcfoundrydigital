import { Component, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, DcLogo } from '@dcfoundry/ui';

/** A tab kept open across a release must always offer a path back into the app. */
export class AppRecovery extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="session-loading app-recovery">
        <DcLogo size={42} subtitle="CRM" />
        <h1>Vamos abrir seu workspace novamente.</h1>
        <p>
          Uma atualização ou falha de conexão impediu a abertura desta tela. Recarregue o aplicativo
          para continuar.
        </p>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw size={17} />
          Recarregar aplicativo
        </Button>
      </main>
    );
  }
}
