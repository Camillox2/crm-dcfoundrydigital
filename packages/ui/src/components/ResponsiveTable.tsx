import React from 'react';

export interface ResponsiveColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}

export interface ResponsiveTableProps<T> {
  columns: ResponsiveColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
}

/**
 * Tabela responsiva: renderiza tabela elegante no desktop e vira cards acolhedores no mobile (<860px).
 */
export function ResponsiveTable<T>({ columns, data, rowKey }: ResponsiveTableProps<T>) {
  return (
    <div className="dcf-responsive-table">
      {/* Visão Desktop: Tabela */}
      <div className="dcf-table-desktop" style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            fontSize: 'var(--text-sm)',
          }}
        >
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: 'left',
                    padding: '12px 16px',
                    fontSize: 'var(--text-xs)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    borderBottom: '1px solid var(--border-strong)',
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: '14px 16px',
                      borderBottom: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Visão Mobile: Cards Empilhados */}
      <div className="dcf-cards-mobile">
        {data.map((row) => (
          <div
            key={rowKey(row)}
            style={{
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {columns.map((col) => (
              <div
                key={col.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{col.header}</span>
                <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>
                  {col.render(row)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
