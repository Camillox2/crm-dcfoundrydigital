export function Tabs<T extends string>({
  value,
  onChange,
  label,
  tabs,
}: {
  value: T;
  onChange: (value: T) => void;
  label: string;
  tabs: { id: T; label: string; count?: number }[];
}) {
  const index = Math.max(0, tabs.findIndex((tab) => tab.id === value));
  return (
    <div
      className="dcf-tabs"
      role="tablist"
      aria-label={label}
      style={{ ['--dcf-tab-index' as string]: String(index), ['--dcf-tab-count' as string]: String(tabs.length) }}
    >
      <span className="dcf-tab-thumb" />
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={tab.id === value} onClick={() => onChange(tab.id)}>
          {tab.label}
          {tab.count !== undefined && <b>{tab.count}</b>}
        </button>
      ))}
    </div>
  );
}
