import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Plus, Search, Users } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type ColumnMeta } from '@/components/common/DataTable';
import { Field } from '@/components/common/Field';
import { RoleBadge } from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingRows } from '@/components/common/States';
import { PageHeader } from '@/components/layout/AppShell';
import { useStaff } from '@/hooks/queries';
import { useCreateStaff, useResetStaffPassword, useSetStaffStatus } from '@/hooks/mutations';
import { useTimezone } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/datetime';
import {
  createStaffSchema,
  resetPasswordSchema,
  type CreateStaffInput,
  type ResetPasswordInput,
} from '@/schemas';
import { ApiError } from '@/types/api';
import type { StaffMember } from '@/types/domain';

export function OwnerStaffPage() {
  const staff = useStaff();
  const tz = useTimezone();
  const setStatus = useSetStaffStatus();

  const [filter, setFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [toggling, setToggling] = useState<StaffMember | null>(null);

  const rows = staff.data ?? [];
  const hasActiveKitchen = rows.some((s) => s.role === 'KITCHEN' && s.isActive);

  const doToggle = async () => {
    if (!toggling) return;
    try {
      await setStatus.mutateAsync({ userId: toggling.userId, isActive: !toggling.isActive });
      toast.success(
        toggling.isActive
          ? `${toggling.name} deactivated — their tables are now unassigned`
          : `${toggling.name} reactivated`,
      );
      setToggling(null);
    } catch (e) {
      if (ApiError.isApiError(e) && e.code === 'KITCHEN_EXISTS') {
        toast.error('There is already an active kitchen handler');
        setToggling(null);
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Could not update the staff member');
    }
  };

  const columns = useMemo<ColumnDef<StaffMember, never>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/18 text-xs font-semibold text-primary ring-1 ring-primary/25">
              {row.original.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
              {/* The Last login column drops out below lg — it reappears here so
                  the small layout hides a *column*, never the information. */}
              <p className="truncate text-xs text-muted-foreground lg:hidden">
                Last login:{' '}
                {row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt, tz) : 'Never'}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => <RoleBadge role={row.original.role} />,
      },
      {
        accessorKey: 'lastLoginAt',
        header: 'Last login',
        meta: { className: 'hidden lg:table-cell' } satisfies ColumnMeta,
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt, tz) : 'Never'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Active',
        cell: ({ row }) => {
          const isOwner = row.original.role === 'OWNER';
          const control = (
            <span className="inline-flex items-center gap-2">
              <Switch
                checked={row.original.isActive}
                disabled={isOwner}
                onCheckedChange={() => setToggling(row.original)}
                aria-label={`Toggle ${row.original.name}`}
              />
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  row.original.isActive ? 'text-status-completed' : 'text-muted-foreground',
                )}
              >
                {row.original.isActive ? 'Active' : 'Inactive'}
              </span>
            </span>
          );
          if (!isOwner) return control;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>{control}</span>
              </TooltipTrigger>
              <TooltipContent>The owner account cannot be deactivated.</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.role === 'OWNER' ? null : (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="whitespace-nowrap"
                onClick={() => setResetting(row.original)}
                aria-label={`Reset password for ${row.original.name}`}
              >
                <KeyRound className="size-3.5" />
                <span className="hidden sm:inline">Reset password</span>
                <span className="sm:hidden">Reset</span>
              </Button>
            </div>
          ),
      },
    ],
    [tz],
  );

  return (
    <>
      <PageHeader
        title="Staff"
        description="Waiters take orders; the kitchen handler runs the board. Exactly one kitchen handler per restaurant."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Add staff
          </Button>
        }
      />

      <div className="relative mb-4 w-full sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by name or email…"
          className="pl-9"
          aria-label="Search staff"
        />
      </div>

      {staff.isLoading ? (
        <LoadingRows count={4} />
      ) : staff.isError ? (
        <ErrorState error={staff.error} onRetry={() => void staff.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" />}
          title="No staff yet"
          description="Add waiters so you can assign them tables, and one kitchen handler for the board."
          action={<Button onClick={() => setAddOpen(true)}>Add the first waiter</Button>}
        />
      ) : (
        <DataTable columns={columns} data={rows} globalFilter={filter} minWidth={560} />
      )}

      <AddStaffDialog open={addOpen} onOpenChange={setAddOpen} kitchenTaken={hasActiveKitchen} />

      <ResetPasswordDialog
        member={resetting}
        onOpenChange={(open) => !open && setResetting(null)}
      />

      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(open) => !open && setToggling(null)}
        title={
          toggling?.isActive ? `Deactivate ${toggling.name}?` : `Reactivate ${toggling?.name}?`
        }
        description={
          toggling?.isActive
            ? 'They are signed out everywhere and their tables become unassigned. History is kept — staff are never deleted.'
            : 'They will be able to sign in again.'
        }
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Reactivate'}
        destructive={toggling?.isActive}
        loading={setStatus.isPending}
        onConfirm={() => void doToggle()}
      />
    </>
  );
}

function AddStaffDialog({
  open,
  onOpenChange,
  kitchenTaken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kitchenTaken: boolean;
}) {
  const create = useCreateStaff();
  const form = useForm<CreateStaffInput>({
    resolver: zodResolver(createStaffSchema),
    defaultValues: { name: '', email: '', phone: '', password: '', role: 'WAITER' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync({
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        password: values.password,
        role: values.role,
      });
      toast.success(`${values.name} added as ${values.role.toLowerCase()}`);
      form.reset();
      onOpenChange(false);
    } catch (e) {
      if (ApiError.isApiError(e)) {
        if (e.code === 'EMAIL_TAKEN') {
          form.setError('email', { message: 'That email is already registered' });
          return;
        }
        if (e.code === 'KITCHEN_EXISTS') {
          form.setError('role', { message: 'This restaurant already has a kitchen handler' });
          return;
        }
      }
      toast.error(e instanceof Error ? e.message : 'Could not add the staff member');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add staff</DialogTitle>
          <DialogDescription>
            They sign in with this email and password, and can change it later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              htmlFor="staffName"
              error={form.formState.errors.name?.message}
              required
            >
              <Input id="staffName" placeholder="Amit" {...form.register('name')} />
            </Field>
            <Field label="Phone" htmlFor="staffPhone" error={form.formState.errors.phone?.message}>
              <Input id="staffPhone" placeholder="+91-…" {...form.register('phone')} />
            </Field>
          </div>

          <Field
            label="Email"
            htmlFor="staffEmail"
            error={form.formState.errors.email?.message}
            required
          >
            <Input
              id="staffEmail"
              type="email"
              placeholder="amit@spice.com"
              {...form.register('email')}
            />
          </Field>

          <Field
            label="Temporary password"
            htmlFor="staffPassword"
            error={form.formState.errors.password?.message}
            hint="At least 8 characters."
            required
          >
            <Input id="staffPassword" type="text" {...form.register('password')} />
          </Field>

          <Field label="Role" error={form.formState.errors.role?.message} required>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WAITER">Waiter</SelectItem>
                    <SelectItem value="KITCHEN" disabled={kitchenTaken}>
                      Kitchen handler{kitchenTaken ? ' — already taken' : ''}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Add staff
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  member,
  onOpenChange,
}: {
  member: StaffMember | null;
  onOpenChange: (open: boolean) => void;
}) {
  const reset = useResetStaffPassword();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (!member) return;
    try {
      await reset.mutateAsync({ userId: member.userId, password: values.password });
      toast.success(`Password reset — ${member.name} was signed out everywhere`);
      form.reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reset the password');
    }
  });

  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {member?.name}</DialogTitle>
          <DialogDescription>
            Every session they hold is revoked immediately — they will need the new password.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field
            label="New password"
            htmlFor="newPassword"
            error={form.formState.errors.password?.message}
            required
          >
            <Input id="newPassword" type="text" {...form.register('password')} />
          </Field>
          <Field
            label="Confirm"
            htmlFor="confirmNewPassword"
            error={form.formState.errors.confirmPassword?.message}
            required
          >
            <Input id="confirmNewPassword" type="text" {...form.register('confirmPassword')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
