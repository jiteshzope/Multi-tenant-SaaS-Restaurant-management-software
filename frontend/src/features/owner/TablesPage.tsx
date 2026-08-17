import { zodResolver } from '@hookform/resolvers/zod';
import { LayoutGrid, Plus, Rows3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Field } from '@/components/common/Field';
import { EmptyState, ErrorState, LoadingGrid } from '@/components/common/States';
import { PageHeader } from '@/components/layout/AppShell';
import { useAssignmentHistory, useTables, useWaiters } from '@/hooks/queries';
import {
  useAssignWaiter,
  useBulkCreateTables,
  useCreateTable,
  useUpdateTable,
} from '@/hooks/mutations';
import { useTimezone } from '@/hooks/useAuth';
import { formatDateTime } from '@/lib/datetime';
import {
  assignWaiterSchema,
  bulkTablesSchema,
  createTableSchema,
  type AssignWaiterInput,
} from '@/schemas';
import { ApiError } from '@/types/api';
import type { TableCard as TableCardData } from '@/types/domain';
import { TableCard } from '../tables/TableCard';

type StatusFilter = 'ALL' | 'VACANT' | 'OCCUPIED';

export function OwnerTablesPage() {
  const tables = useTables();
  const waiters = useWaiters();

  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [waiterFilter, setWaiterFilter] = useState('ALL');
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [assigning, setAssigning] = useState<TableCardData | null>(null);
  const [editing, setEditing] = useState<TableCardData | null>(null);
  const [historyFor, setHistoryFor] = useState<TableCardData | null>(null);

  const filtered = useMemo(() => {
    const rows = tables.data ?? [];
    return rows.filter(
      (t) =>
        (status === 'ALL' || t.status === status) &&
        (waiterFilter === 'ALL' ||
          (waiterFilter === 'NONE' ? !t.waiterId : t.waiterId === waiterFilter)),
    );
  }, [tables.data, status, waiterFilter]);

  const occupied = (tables.data ?? []).filter((t) => t.status === 'OCCUPIED').length;

  return (
    <>
      <PageHeader
        title="Tables"
        description={
          tables.data
            ? `${tables.data.length} active · ${occupied} occupied right now`
            : 'Floor plan and waiter assignments'
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Rows3 className="size-4" />
              Bulk add
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Add table
            </Button>
          </>
        }
      />

      {/* Two filters side by side on a phone rather than stacked — they are
          short, and stacking cost a whole row of vertical space above the fold. */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="VACANT">Vacant</SelectItem>
            <SelectItem value="OCCUPIED">Occupied</SelectItem>
          </SelectContent>
        </Select>

        <Select value={waiterFilter} onValueChange={setWaiterFilter}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by waiter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All waiters</SelectItem>
            <SelectItem value="NONE">Unassigned</SelectItem>
            {(waiters.data ?? []).map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tables.isLoading ? (
        <LoadingGrid />
      ) : tables.isError ? (
        <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="size-6" />}
          title={tables.data?.length ? 'No tables match these filters' : 'No tables yet'}
          description={
            tables.data?.length
              ? 'Clear the filters to see the rest of the floor.'
              : 'Add your floor plan — bulk add creates a numbered range in one go.'
          }
          action={
            <Button onClick={() => setBulkOpen(true)}>
              <Plus className="size-4" />
              Add tables
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              basePath="/owner"
              onAssign={setAssigning}
              onEdit={setEditing}
            />
          ))}
        </div>
      )}

      <AddTableDialog open={addOpen} onOpenChange={setAddOpen} />
      <BulkAddDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <AssignDialog
        table={assigning}
        onOpenChange={(open) => !open && setAssigning(null)}
        onShowHistory={(t) => {
          setAssigning(null);
          setHistoryFor(t);
        }}
      />
      <EditTableDialog table={editing} onOpenChange={(open) => !open && setEditing(null)} />
      <AssignmentHistorySheet
        table={historyFor}
        onOpenChange={(open) => !open && setHistoryFor(null)}
      />
    </>
  );
}

function AddTableDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateTable();
  const form = useForm({
    resolver: zodResolver(createTableSchema),
    defaultValues: { tableNumber: 1, label: '', capacity: 4 },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync({
        tableNumber: values.tableNumber,
        label: values.label || undefined,
        capacity: values.capacity,
      });
      toast.success(`Table ${values.tableNumber} added`);
      form.reset({ tableNumber: values.tableNumber + 1, label: '', capacity: values.capacity });
      onOpenChange(false);
    } catch (e) {
      if (ApiError.isApiError(e) && e.code === 'DUPLICATE') {
        form.setError('tableNumber', { message: 'That table number already exists' });
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Could not add the table');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a table</DialogTitle>
          <DialogDescription>
            Numbers are unique per restaurant — every restaurant may have its own Table 1.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Table number"
              htmlFor="tableNumber"
              error={form.formState.errors.tableNumber?.message}
              required
            >
              <Input id="tableNumber" inputMode="numeric" {...form.register('tableNumber')} />
            </Field>
            <Field
              label="Capacity"
              htmlFor="capacity"
              error={form.formState.errors.capacity?.message}
              hint="1–50 seats"
              required
            >
              <Input id="capacity" inputMode="numeric" {...form.register('capacity')} />
            </Field>
          </div>
          <Field label="Label" htmlFor="label" error={form.formState.errors.label?.message}>
            <Input id="label" placeholder="Terrace 2 (optional)" {...form.register('label')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Add table
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkAddDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const bulk = useBulkCreateTables();
  const form = useForm({
    resolver: zodResolver(bulkTablesSchema),
    defaultValues: { from: 1, to: 8, capacity: 4 },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await bulk.mutateAsync(values);
      toast.success(
        `${res.created} table${res.created === 1 ? '' : 's'} created` +
          (res.skipped > 0 ? ` · ${res.skipped} already existed` : ''),
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the tables');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk add tables</DialogTitle>
          <DialogDescription>
            Creates a numbered range. Numbers that already exist are skipped, not duplicated.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="From" htmlFor="from" error={form.formState.errors.from?.message} required>
              <Input id="from" inputMode="numeric" {...form.register('from')} />
            </Field>
            <Field label="To" htmlFor="to" error={form.formState.errors.to?.message} required>
              <Input id="to" inputMode="numeric" {...form.register('to')} />
            </Field>
            <Field
              label="Capacity"
              htmlFor="bulkCapacity"
              error={form.formState.errors.capacity?.message}
              required
            >
              <Input id="bulkCapacity" inputMode="numeric" {...form.register('capacity')} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Create tables
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditTableDialog({
  table,
  onOpenChange,
}: {
  table: TableCardData | null;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateTable();
  const form = useForm({
    resolver: zodResolver(createTableSchema),
    values: table
      ? { tableNumber: table.tableNumber, label: table.label ?? '', capacity: table.capacity }
      : undefined,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (!table) return;
    try {
      await update.mutateAsync({
        id: table.id,
        tableNumber: values.tableNumber,
        label: values.label || undefined,
        capacity: values.capacity,
      });
      toast.success('Table updated');
      onOpenChange(false);
    } catch (e) {
      if (ApiError.isApiError(e) && e.code === 'DUPLICATE') {
        form.setError('tableNumber', { message: 'That table number already exists' });
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Could not update the table');
    }
  });

  return (
    <Dialog open={!!table} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit table {table?.tableNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Table number"
              htmlFor="editNumber"
              error={form.formState.errors.tableNumber?.message}
              required
            >
              <Input id="editNumber" inputMode="numeric" {...form.register('tableNumber')} />
            </Field>
            <Field
              label="Capacity"
              htmlFor="editCapacity"
              error={form.formState.errors.capacity?.message}
              required
            >
              <Input id="editCapacity" inputMode="numeric" {...form.register('capacity')} />
            </Field>
          </div>
          <Field label="Label" htmlFor="editLabel" error={form.formState.errors.label?.message}>
            <Input id="editLabel" {...form.register('label')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  table,
  onOpenChange,
  onShowHistory,
}: {
  table: TableCardData | null;
  onOpenChange: (open: boolean) => void;
  onShowHistory: (table: TableCardData) => void;
}) {
  const waiters = useWaiters();
  const assign = useAssignWaiter();
  const form = useForm<AssignWaiterInput>({ resolver: zodResolver(assignWaiterSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    if (!table) return;
    try {
      const res = await assign.mutateAsync({
        tableId: table.id,
        waiterUserId: values.waiterUserId,
      });
      toast.success(`Table ${table.tableNumber} assigned to ${res.waiterName}`);
      form.reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not assign the table');
    }
  });

  return (
    <Dialog open={!!table} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign table {table?.tableNumber}</DialogTitle>
          <DialogDescription>
            {table?.waiterName
              ? `Currently ${table.waiterName}. Reassigning closes their assignment and opens a new one.`
              : 'Pick the waiter responsible for this table.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Waiter" error={form.formState.errors.waiterUserId?.message} required>
            <Controller
              control={form.control}
              name="waiterUserId"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                    <SelectValue placeholder="Choose a waiter" />
                  </SelectTrigger>
                  <SelectContent>
                    {(waiters.data ?? []).map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => table && onShowHistory(table)}
              className="sm:mr-auto"
            >
              View history
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Assign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentHistorySheet({
  table,
  onOpenChange,
}: {
  table: TableCardData | null;
  onOpenChange: (open: boolean) => void;
}) {
  const tz = useTimezone();
  const history = useAssignmentHistory(table?.id, !!table);

  return (
    <Sheet open={!!table} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Table {table?.tableNumber} — assignment history</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {history.isLoading ? (
            <p className="py-6 text-sm text-muted-foreground">Loading…</p>
          ) : (history.data ?? []).length === 0 ? (
            <EmptyState title="No assignments yet" className="mt-4" />
          ) : (
            <ol className="space-y-3 py-4">
              {(history.data ?? []).map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-border/60 bg-card/40 px-4 py-3 text-sm"
                >
                  <p className="font-medium">{row.waiterName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(row.assignedAt, tz)} →{' '}
                    {row.unassignedAt ? formatDateTime(row.unassignedAt, tz) : 'now'}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
