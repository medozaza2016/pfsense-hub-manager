import { useMemo, useState, type ReactNode } from "react";

export type SortDirection = "asc" | "desc";
export type DataColumn<T> = {
  id: string;
  header: string;
  accessor: (row: T) => ReactNode;
  value?: (row: T) => string | number | Date | null | undefined;
  sortable?: boolean;
  className?: string;
};
export type DataTableProps<T> = {
  rows: T[];
  columns: DataColumn<T>[];
  getRowId: (row: T) => string | number;
  searchableText?: (row: T) => string;
  search?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  loadingLabel?: string;
  error?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  actions?: (row: T) => ReactNode;
  caption?: string;
  className?: string;
  mobileCard?: (row: T) => ReactNode;
  selection?: (row: T) => ReactNode;
  selectionHeader?: ReactNode;
};

function compareValues(a: unknown, b: unknown): number {
  if (a instanceof Date || b instanceof Date) { const left = a instanceof Date ? a.getTime() : new Date(a as string | number).getTime(); const right = b instanceof Date ? b.getTime() : new Date(b as string | number).getTime(); return left - right; }
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

export function DataTable<T>({
  rows, columns, getRowId, searchableText, search = "", emptyTitle = "No records found",
  emptyDescription = "Try changing your search or filters.", loading = false,
  loadingLabel = "Loading records…", error, pageSize = 25, pageSizeOptions = [10, 25, 50, 100],
  actions, caption, className, mobileCard, selection, selectionHeader
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ id: string; direction: SortDirection } | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const matches = term && searchableText
      ? rows.filter(row => searchableText(row).toLocaleLowerCase().includes(term))
      : rows;
    if (!sort) return matches;
    const column = columns.find(item => item.id === sort.id);
    if (!column?.value) return matches;
    return [...matches].sort((a, b) => compareValues(column.value?.(a), column.value?.(b)) * (sort.direction === "asc" ? 1 : -1));
  }, [rows, search, searchableText, sort, columns]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * size, (currentPage + 1) * size);
  const first = filtered.length ? currentPage * size + 1 : 0;
  const last = Math.min((currentPage + 1) * size, filtered.length);

  function changeSort(id: string) {
    setSort(current => current?.id === id
      ? { id, direction: current.direction === "asc" ? "desc" : "asc" }
      : { id, direction: "asc" });
    setPage(0);
  }

  return <section className={"ui-table-shell"+(mobileCard?" has-mobile-cards":"")} aria-busy={loading}>
    {error && <div className="ui-feedback ui-feedback-error" role="alert">{error}</div>}
    {loading ? <div className="ui-state" role="status"><span className="ui-spinner" />{loadingLabel}</div>
      : filtered.length === 0 ? <div className="ui-state"><strong>{emptyTitle}</strong><span>{emptyDescription}</span></div>
      : <>
        <div className={"ui-table-scroll " + (className ? className + "-scroll" : "")}><table className={"ui-data-table " + (className ?? "")}>
          {caption && <caption>{caption}</caption>}
          <thead><tr>{selection && <th className="ui-selection-cell" scope="col">{selectionHeader}</th>}{columns.map(column => <th key={column.id} scope="col" className={column.className}>
            {column.sortable && column.value
              ? <button type="button" className="ui-sort-button" onClick={() => changeSort(column.id)} aria-label={`Sort by ${column.header}`}>
                  {column.header}<span aria-hidden="true">{sort?.id === column.id ? sort.direction === "asc" ? " ↑" : " ↓" : " ↕"}</span>
                </button>
              : column.header}
          </th>)}{actions && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody>{visible.map(row => <tr key={getRowId(row)}>
            {selection && <td className="ui-selection-cell">{selection(row)}</td>}
            {columns.map(column => <td key={column.id} className={column.className}>{column.accessor(row)}</td>)}
            {actions && <td className="ui-row-actions">{actions(row)}</td>}
          </tr>)}</tbody>
        </table></div>
        {mobileCard && <div className={"ui-mobile-record-list " + (className ? className + "-mobile" : "")}>{visible.map(row=><article className="ui-mobile-record" key={getRowId(row)}>{mobileCard(row)}</article>)}</div>}
        <div className="ui-table-footer">
          <span>Showing {first}–{last} of {filtered.length}</span>
          <div className="ui-pagination">
            <label>Rows per page <select value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>
              {pageSizeOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select></label>
            <button type="button" className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Previous</button>
            <span>Page {currentPage + 1} of {pageCount}</span>
            <button type="button" className="secondary-button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))}>Next</button>
          </div>
        </div>
      </>}
  </section>;
}

export function ListToolbar({ search, onSearch, placeholder, filters, activeCount = 0, onClear, children, actions, chips = [] }: {
  search: string; onSearch: (value: string) => void; placeholder?: string;
  filters?: boolean; activeCount?: number; onClear?: () => void; children?: ReactNode; actions?: ReactNode; chips?: Array<{ label: string; onRemove: () => void }>;
}) {
  const [expanded, setExpanded] = useState(false);
  return <section className="ui-list-toolbar">
    <div className="ui-list-toolbar-main">
      <SearchField value={search} onChange={onSearch} placeholder={placeholder ?? "Search records"} />
      <div className="ui-list-toolbar-actions">
        {filters && <button type="button" className={"ui-filter-toggle " + (expanded ? "is-open" : "")} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
          <span aria-hidden="true">☷</span> Filters {activeCount > 0 && <b>{activeCount}</b>} <span className="ui-filter-toggle-mark" aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>}
        {actions}
      </div>
    </div>
    {(chips.length > 0 || (activeCount > 0 && onClear)) && <div className="ui-active-filters-row">
      <div className="ui-active-chips">{chips.map((chip,index)=><button type="button" key={index} onClick={chip.onRemove}>{chip.label}<span aria-hidden="true"> ×</span></button>)}</div>
      {activeCount > 0 && onClear && <button type="button" className="ui-clear-filters" onClick={onClear}>Clear all</button>}
    </div>}
    {filters && expanded && <div className="ui-filter-panel">
      <div className="ui-filter-panel-heading"><div><strong>Filter records</strong><span>Combine filters to narrow this list</span></div></div>
      <div className="ui-filter-fields">{children}</div>
    </div>}
  </section>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="ui-page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="ui-page-actions">{actions}</div>}</header>;
}

export function SearchField({ value, onChange, placeholder = "Search records", label = "Search" }: {
  value: string; onChange: (value: string) => void; placeholder?: string; label?: string;
}) {
  return <label className="ui-search-field"><span className="sr-only">{label}</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.3"/><path d="m16.2 16.2 5 5"/></svg><input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}/>{value && <button type="button" aria-label="Clear search" onClick={() => onChange("")}>×</button>}</label>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="ui-state"><strong>{title}</strong>{description && <span>{description}</span>}{action}</div>;
}

export function Feedback({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "error" | "warning" }) {
  return <div className={`ui-feedback ui-feedback-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export type IconName = "grid" | "sites" | "network" | "bell" | "settings" | "monitor" | "layers" | "shield" | "list" | "route" | "server" | "globe" | "key" | "file" | "plus" | "search" | "refresh" | "chevron" | "menu" | "close" | "clock" | "cpu" | "database" | "harddrive" | "check" | "alert" | "wifi" | "building" | "activity" | "more" | "external";

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
    sites: "M3 21V7l9-4 9 4v14 M8 21v-7h8v7 M7 9h.01 M12 9h.01 M17 9h.01",
    network: "M12 5v6m0 0-6 5m6-5 6 5 M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 3.1-.2-.1a1.7 1.7 0 0 0-1.8.1l-.2.1h-3.6l-.1-.2a1.7 1.7 0 0 0-1.6-1l-.2.1-3.1-1.8.1-.2a1.7 1.7 0 0 0-.1-1.8l-.1-.2v-3.6l.2-.1a1.7 1.7 0 0 0 1-1.6l-.1-.2 1.8-3.1.2.1a1.7 1.7 0 0 0 1.8-.1l.2-.1h3.6l.1.2a1.7 1.7 0 0 0 1.6 1l.2-.1 3.1 1.8-.1.2a1.7 1.7 0 0 0 .1 1.8l.1.2v3.6Z",
    monitor: "M3 4h18v13H3z M8 21h8 M12 17v4",
    layers: "M12 3 2 8l10 5 10-5-10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
    shield: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z M9 12l2 2 4-4",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    route: "M4 6h.01M20 18h.01M4 6c0 8 16 2 16 12",
    server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01M12 7h4M12 17h4",
    globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",
    key: "M21 2l-2 2m-7.6 7.6a5 5 0 1 1-7.1-7.1 5 5 0 0 1 7.1 7.1ZM14 10l7 7-3 3-2-2-2 2-3-3",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8M8 17h8",
    plus: "M12 5v14M5 12h14",
    search: "m21 21-4.3-4.3M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z",
    refresh: "M20 7v5h-5M4 17v-5h5 M5.6 9a7 7 0 0 1 12-2L20 12M4 12l2.4 5a7 7 0 0 0 12-2",
    chevron: "m9 18 6-6-6-6",
    menu: "M3 6h18M3 12h18M3 18h18",
    close: "M18 6 6 18M6 6l12 12",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2",
    cpu: "M6 6h12v12H6zM9 9h6v6H9zM9 1v5m6-5v5M9 18v5m6-5v5M1 9h5m-5 6h5m12-6h5m-5 6h5",
    database: "M4 5c0-2 16-2 16 0v14c0 2-16 2-16 0zM4 5c0 2 16 2 16 0M4 12c0 2 16 2 16 0",
    harddrive: "M3 6h18v12H3zM7 14h.01M11 14h.01M7 10h10",
    check: "m5 12 4 4L19 6",
    alert: "M12 3 2 21h20L12 3ZM12 9v5m0 3h.01",
    wifi: "M2 8a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01",
    building: "M3 21V3h18v18M7 7h3m4 0h3M7 11h3m4 0h3M7 15h3m4 0h3M10 21v-3h4v3",
    activity: "M3 12h4l3-8 4 16 3-8h4",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    external: "M14 3h7v7m0-7L10 14 M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}

export function Status({ state, label }: { state: "online" | "offline" | "warning" | "unknown"; label?: string }) {
  const tone = state === "unknown" ? "warning" : state;
  return <span className={"status-pill " + tone}><i/>{label ?? (state === "online" ? "Online" : state === "offline" ? "Offline" : state === "unknown" ? "Unknown" : "Attention")}</span>;
}

export function Metric({ icon, label, value, detail, tone }: { icon: IconName; label: string; value: string; detail: string; tone: string }) {
  return <article className="metric-card"><div className={"metric-icon " + tone}><Icon name={icon} size={23}/></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

export function Panel({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={"panel " + className}><div className="panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
