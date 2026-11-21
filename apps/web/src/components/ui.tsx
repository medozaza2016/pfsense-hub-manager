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
  actions, caption, className, mobileCard
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
          <thead><tr>{columns.map(column => <th key={column.id} scope="col" className={column.className}>
            {column.sortable && column.value
              ? <button type="button" className="ui-sort-button" onClick={() => changeSort(column.id)} aria-label={`Sort by ${column.header}`}>
                  {column.header}<span aria-hidden="true">{sort?.id === column.id ? sort.direction === "asc" ? " ↑" : " ↓" : " ↕"}</span>
                </button>
              : column.header}
          </th>)}{actions && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody>{visible.map(row => <tr key={getRowId(row)}>
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
