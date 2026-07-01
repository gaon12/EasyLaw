"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/app/page.module.css";
import { LocalTime } from "@/components/local-time";

type BoardRow = {
  href: string;
  id: string;
  label: string;
  meta: string;
  searchText: string;
  title: string;
};

type CardRow = {
  badgeClassName?: string;
  badgeLabel: string;
  body: string;
  id: string;
  meta: string[];
  searchText: string;
  title: string;
};

type TableCell =
  | number
  | string
  | {
      dateOnly?: boolean;
      kind: "datetime";
      value: string;
    }
  | {
      kind: "lines";
      lines: string[];
    }
  | null;

type TableRow = {
  cells: TableCell[];
  id: string;
  searchText: string;
};

export function SearchableBoardList({
  emptyMessage,
  pageSize = 10,
  rows,
  searchLabel,
}: {
  emptyMessage: string;
  pageSize?: number;
  rows: BoardRow[];
  searchLabel: string;
}) {
  const { page, pageCount, pagedRows, query, setPage, setQuery, totalCount } =
    usePagedRows(rows, pageSize);

  return (
    <div className={styles.listExplorer}>
      <ListToolbar
        countLabel={`${totalCount.toLocaleString("ko-KR")}건`}
        page={page}
        pageCount={pageCount}
        query={query}
        searchLabel={searchLabel}
        setPage={setPage}
        setQuery={setQuery}
      />
      {pagedRows.length > 0 ? (
        <div className={styles.boardList}>
          {pagedRows.map((row) => (
            <a href={row.href} key={row.id}>
              <span>{row.label}</span>
              <strong>{row.title}</strong>
              <time>{row.meta}</time>
            </a>
          ))}
        </div>
      ) : (
        <p className={styles.emptyState}>{emptyMessage}</p>
      )}
    </div>
  );
}

export function SearchableCardList({
  emptyMessage,
  pageSize = 6,
  rows,
  searchLabel,
}: {
  emptyMessage: string;
  pageSize?: number;
  rows: CardRow[];
  searchLabel: string;
}) {
  const { page, pageCount, pagedRows, query, setPage, setQuery, totalCount } =
    usePagedRows(rows, pageSize);

  return (
    <div className={styles.listExplorer}>
      <ListToolbar
        countLabel={`${totalCount.toLocaleString("ko-KR")}건`}
        page={page}
        pageCount={pageCount}
        query={query}
        searchLabel={searchLabel}
        setPage={setPage}
        setQuery={setQuery}
      />
      {pagedRows.length > 0 ? (
        <div className={styles.catalog}>
          {pagedRows.map((row) => (
            <article className={styles.judgmentCard} key={row.id}>
              <div>
                <span className={row.badgeClassName ?? styles.statusPending}>
                  {row.badgeLabel}
                </span>
                <h3>{row.title}</h3>
                <div className={styles.meta}>
                  {row.meta.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
              <p className={styles.notice}>{row.body}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.emptyState}>{emptyMessage}</p>
      )}
    </div>
  );
}

export function SearchableTable({
  columns,
  emptyMessage,
  pageSize = 10,
  rows,
  searchLabel,
}: {
  columns: string[];
  emptyMessage: string;
  pageSize?: number;
  rows: TableRow[];
  searchLabel: string;
}) {
  const { page, pageCount, pagedRows, query, setPage, setQuery, totalCount } =
    usePagedRows(rows, pageSize);

  return (
    <div className={styles.listExplorer}>
      <ListToolbar
        countLabel={`${totalCount.toLocaleString("ko-KR")}건`}
        page={page}
        pageCount={pageCount}
        query={query}
        searchLabel={searchLabel}
        setPage={setPage}
        setQuery={setQuery}
      />
      {pagedRows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.id}>
                  {row.cells.map((cell, index) => (
                    <td key={`${row.id}-${columns[index] ?? index}`}>
                      {renderTableCell(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.emptyState}>{emptyMessage}</p>
      )}
    </div>
  );
}

function ListToolbar({
  countLabel,
  page,
  pageCount,
  query,
  searchLabel,
  setPage,
  setQuery,
}: {
  countLabel: string;
  page: number;
  pageCount: number;
  query: string;
  searchLabel: string;
  setPage: (page: number) => void;
  setQuery: (query: string) => void;
}) {
  return (
    <div className={styles.listToolbar}>
      <label className={styles.listSearchField}>
        <span>{searchLabel}</span>
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="검색"
          type="search"
          value={query}
        />
      </label>
      <div className={styles.listPager}>
        <span>{countLabel}</span>
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          type="button"
        >
          이전
        </button>
        <span>
          {page} / {pageCount}
        </span>
        <button
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
          type="button"
        >
          다음
        </button>
      </div>
    </div>
  );
}

function usePagedRows<Row extends { searchText: string }>(
  rows: Row[],
  pageSize: number,
) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const normalizedQuery = normalizeSearch(query);
  const filteredRows = useMemo(() => {
    if (!normalizedQuery) {
      return rows;
    }
    return rows.filter((row) =>
      normalizeSearch(row.searchText).includes(normalizedQuery),
    );
  }, [normalizedQuery, rows]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    setPage(1);
  }

  return {
    page,
    pageCount,
    pagedRows: filteredRows.slice((page - 1) * pageSize, page * pageSize),
    query,
    setPage,
    setQuery: updateQuery,
    totalCount: filteredRows.length,
  };
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function renderTableCell(cell: TableCell) {
  if (cell === null) {
    return "-";
  }
  if (typeof cell === "string" || typeof cell === "number") {
    return cell;
  }
  if (cell.kind === "datetime") {
    return <LocalTime dateOnly={cell.dateOnly} dateTime={cell.value} />;
  }
  return (
    <>
      {cell.lines.map((line) => (
        <span className={styles.tableCellLine} key={line}>
          {line}
        </span>
      ))}
    </>
  );
}
