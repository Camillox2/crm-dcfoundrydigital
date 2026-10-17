import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { csvText } from './useModule.js';

export function CsvExport({
  name,
  rows,
  label,
  disabled = false,
}: {
  name: string;
  rows: Record<string, unknown>[];
  label: string;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!rows.length) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [rows]);
  if (disabled || !url || !rows.length)
    return (
      <button className="module-filter" disabled>
        <Download size={16} />
        {label}
      </button>
    );
  return (
    <a className="module-filter" href={url} download={name}>
      <Download size={16} />
      {label}
    </a>
  );
}
