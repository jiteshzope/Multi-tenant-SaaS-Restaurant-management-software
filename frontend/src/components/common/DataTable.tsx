import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Scroller } from '@/components/common/Scroller';
import { cn } from '@/lib/cn';

/**
 * Per-column responsive control, read off `ColumnDef.meta`.
 *
 * A table narrower than its content does not politely shrink — it squeezes
 * every cell until the text is unreadable and then hides the last columns off
 * the right edge with nothing to say so. Two things prevent that here: columns
 * declare a breakpoint below which they drop out (`className: 'hidden md:table-cell'`),
 * and whatever is left keeps a floor width so the table scrolls rather than
 * crushes. Anything dropped must appear somewhere else on the small layout —
 * hiding a column is a layout decision, never a way to lose data.
 */
export type ColumnMeta = {
  /** Applied to both the `th` and every `td` — this is where the breakpoint goes. */
  className?: string;
  /** Applied to the `th` only. */
  headClassName?: string;
};

/**
 * One shared table. Feature files only declare `ColumnDef<T>[]`; sorting,
 * filtering and paging are opted into per table.
 */
export function DataTable<TData>({
  columns,
  data,
  globalFilter,
  sortable = true,
  paginate = false,
  pageSize = 10,
  empty,
  className,
  minWidth = 520,
}: {
  columns: ColumnDef<TData, never>[];
  data: TData[];
  globalFilter?: string;
  sortable?: boolean;
  paginate?: boolean;
  pageSize?: number;
  empty?: ReactNode;
  className?: string;
  /** Floor width in px before the table starts scrolling instead of crushing. */
  minWidth?: number;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    ...(sortable ? { getSortedRowModel: getSortedRowModel() } : {}),
    ...(globalFilter !== undefined ? { getFilteredRowModel: getFilteredRowModel() } : {}),
    ...(paginate
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize } },
        }
      : {}),
  });

  const rows = table.getRowModel().rows;

  const metaOf = (column: { columnDef: { meta?: unknown } }) =>
    (column.columnDef.meta ?? {}) as ColumnMeta;

  return (
    <div className={cn('space-y-3', className)}>
      {/*
        `Scroller` rather than the Table primitive's own overflow wrapper: it
        paints a fade on whichever edge still has columns behind it, so a table
        that runs past the right edge of a phone reads as scrollable instead of
        looking like it simply lost its last two columns.
      */}
      <Scroller className="overflow-hidden rounded-xl border border-border/60" fadeSize={32}>
        <table className="w-full caption-bottom text-sm" style={{ minWidth }}>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const canSort = sortable && header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  const meta = metaOf(header.column);
                  return (
                    <TableHead key={header.id} className={cn(meta.className, meta.headClassName)}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex items-center gap-1 rounded px-1 transition-colors hover:text-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {dir === 'asc' ? (
                            <ArrowUp className="size-3 text-primary" />
                          ) : dir === 'desc' ? (
                            <ArrowDown className="size-3 text-primary" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  {empty ?? <span className="text-sm text-muted-foreground">No rows</span>}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={metaOf(cell.column).className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </Scroller>

      {paginate && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
