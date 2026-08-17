import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type ColumnMeta } from '@/components/common/DataTable';
import { Field } from '@/components/common/Field';
import { Money } from '@/components/common/Money';
import { Scroller } from '@/components/common/Scroller';
import { EmptyState, ErrorState, LoadingRows } from '@/components/common/States';
import { PageHeader } from '@/components/layout/AppShell';
import { useCategories, useCategoryItems } from '@/hooks/queries';
import {
  useCreateCategory,
  useCreateMenuItem,
  useDeleteCategory,
  useDeleteMenuItem,
  useSetItemAvailability,
  useUpdateCategory,
  useUpdateMenuItem,
} from '@/hooks/mutations';
import { cn } from '@/lib/cn';
import { categorySchema, menuItemSchema, type MenuItemInput } from '@/schemas';
import { ApiError } from '@/types/api';
import type { CategorySummary, MenuItem } from '@/types/domain';

export function OwnerMenuPage() {
  const categories = useCategories();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategorySummary | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<CategorySummary | null>(null);
  const [itemDialog, setItemDialog] = useState<{ mode: 'create' | 'edit'; item?: MenuItem } | null>(
    null,
  );
  const [deletingItem, setDeletingItem] = useState<MenuItem | null>(null);

  const list = categories.data ?? [];
  useEffect(() => {
    if (!activeId && list.length > 0) setActiveId(list[0].id);
  }, [list, activeId]);

  const active = list.find((c) => c.id === activeId) ?? null;
  const items = useCategoryItems(activeId ?? undefined);

  const deleteCategory = useDeleteCategory();
  const deleteItem = useDeleteMenuItem();

  const doDeleteCategory = async () => {
    if (!deletingCategory) return;
    try {
      await deleteCategory.mutateAsync(deletingCategory.id);
      toast.success(`“${deletingCategory.name}” removed`);
      if (activeId === deletingCategory.id) setActiveId(null);
      setDeletingCategory(null);
    } catch (e) {
      if (ApiError.isApiError(e) && e.code === 'CATEGORY_NOT_EMPTY') {
        toast.error('Move or delete its items first');
        setDeletingCategory(null);
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Could not delete the category');
    }
  };

  const doDeleteItem = async () => {
    if (!deletingItem) return;
    try {
      await deleteItem.mutateAsync(deletingItem.id);
      toast.success(`“${deletingItem.name}” removed from the menu`);
      setDeletingItem(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the item');
    }
  };

  return (
    <>
      <PageHeader
        title="Menu"
        description="Categories and items. Prices here apply to future orders only — past bills keep their snapshot."
        actions={
          <>
            <Button variant="outline" onClick={() => setAddCategoryOpen(true)}>
              <Plus className="size-4" />
              Category
            </Button>
            <Button onClick={() => setItemDialog({ mode: 'create' })} disabled={list.length === 0}>
              <Plus className="size-4" />
              Item
            </Button>
          </>
        }
      />

      {categories.isLoading ? (
        <LoadingRows count={5} />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="size-6" />}
          title="No categories yet"
          description="Start with Starters, Mains and Drinks — items live inside categories."
          action={<Button onClick={() => setAddCategoryOpen(true)}>Add the first category</Button>}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Category list */}
          <Scroller
            orientation="y"
            className="h-fit max-h-[22rem] rounded-xl border border-border/60 bg-card/40 lg:max-h-[calc(100vh-13rem)]"
            viewportClassName="p-2"
            fadeSize={28}
          >
            {list.map((category, index) => (
              <CategoryRow
                key={category.id}
                category={category}
                active={category.id === activeId}
                canMoveUp={index > 0}
                canMoveDown={index < list.length - 1}
                neighbourAbove={list[index - 1]}
                neighbourBelow={list[index + 1]}
                onSelect={() => setActiveId(category.id)}
                onEdit={() => setEditingCategory(category)}
                onDelete={() => setDeletingCategory(category)}
              />
            ))}
          </Scroller>

          {/*
            `min-w-0` is load-bearing. A grid track defaults to a minimum of its
            content's min-content width, and the item table declares a floor
            width so it scrolls rather than crushes — without this the track
            inherited that floor and pushed the whole page wider than a phone.
          */}
          <section className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{active?.name ?? 'Items'}</h2>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter items…"
                  className="pl-9"
                  aria-label="Filter items in this category"
                />
              </div>
            </div>

            {items.isLoading ? (
              <LoadingRows count={5} />
            ) : items.isError ? (
              <ErrorState error={items.error} onRetry={() => void items.refetch()} />
            ) : (
              <ItemTable
                items={items.data ?? []}
                filter={filter}
                onEdit={(item) => setItemDialog({ mode: 'edit', item })}
                onDelete={setDeletingItem}
              />
            )}
          </section>
        </div>
      )}

      <CategoryDialog
        open={addCategoryOpen || !!editingCategory}
        category={editingCategory}
        nextOrder={list.length + 1}
        onOpenChange={(open) => {
          if (!open) {
            setAddCategoryOpen(false);
            setEditingCategory(null);
          }
        }}
      />

      <ItemDialog
        state={itemDialog}
        categories={list}
        defaultCategoryId={activeId}
        onOpenChange={(open) => !open && setItemDialog(null)}
      />

      <ConfirmDialog
        open={!!deletingCategory}
        onOpenChange={(open) => !open && setDeletingCategory(null)}
        title={`Delete “${deletingCategory?.name}”?`}
        description="A category holding active items cannot be deleted — move or delete its items first."
        confirmLabel="Delete category"
        destructive
        loading={deleteCategory.isPending}
        onConfirm={() => void doDeleteCategory()}
      />

      <ConfirmDialog
        open={!!deletingItem}
        onOpenChange={(open) => !open && setDeletingItem(null)}
        title={`Remove “${deletingItem?.name}”?`}
        description="This is a soft delete — orders that already contain it keep working."
        confirmLabel="Remove item"
        destructive
        loading={deleteItem.isPending}
        onConfirm={() => void doDeleteItem()}
      />
    </>
  );
}

function CategoryRow({
  category,
  active,
  canMoveUp,
  canMoveDown,
  neighbourAbove,
  neighbourBelow,
  onSelect,
  onEdit,
  onDelete,
}: {
  category: CategorySummary;
  active: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  neighbourAbove?: CategorySummary;
  neighbourBelow?: CategorySummary;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateCategory();

  /** Swap display orders with the neighbour — two writes, both idempotent. */
  const swap = async (other?: CategorySummary) => {
    if (!other) return;
    await update.mutateAsync({ id: category.id, displayOrder: other.displayOrder });
    await update.mutateAsync({ id: other.id, displayOrder: category.displayOrder });
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors',
        active ? 'bg-primary/15 ring-1 ring-primary/25' : 'hover:bg-accent',
      )}
    >
      <button onClick={onSelect} className="min-h-11 min-w-0 flex-1 text-left">
        <span className={cn('block truncate text-sm font-medium', active && 'text-primary')}>
          {category.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {category.itemCount} item{category.itemCount === 1 ? '' : 's'}
        </span>
      </button>

      {/*
        These were hover-only, which on a tablet or phone means "unreachable" —
        there is no hover. They stay visible up to lg and only hide behind hover
        on the pointer-driven desktop layout.
      */}
      <div className="flex shrink-0 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={!canMoveUp}
          onClick={() => void swap(neighbourAbove)}
          aria-label={`Move ${category.name} up`}
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={!canMoveDown}
          onClick={() => void swap(neighbourBelow)}
          aria-label={`Move ${category.name} down`}
        >
          <ChevronDown className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onEdit}
          aria-label={`Rename ${category.name}`}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onDelete}
          aria-label={`Delete ${category.name}`}
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function ItemTable({
  items,
  filter,
  onEdit,
  onDelete,
}: {
  items: MenuItem[];
  filter: string;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
}) {
  const setAvailability = useSetItemAvailability();

  const columns = useMemo<ColumnDef<MenuItem, never>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Item',
        // The widest column gets the leftover space; the rest keep their floor.
        meta: { className: 'w-full min-w-[11rem]' } satisfies ColumnMeta,
        cell: ({ row }) => (
          <div className="flex items-start gap-2">
            <VegDot isVeg={row.original.isVeg} />
            <div className="min-w-0">
              <p className="leading-snug font-medium">{row.original.name}</p>
              {row.original.description && (
                /*
                  This was `line-clamp-1`, which in a squeezed column left
                  nothing but "Char-…". Two lines of wrap read as a description;
                  one clipped word reads as a bug.
                */
                <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {row.original.description}
                </p>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'price',
        header: 'Price',
        meta: { className: 'whitespace-nowrap' } satisfies ColumnMeta,
        cell: ({ row }) => (
          <Money value={row.original.price} className="font-semibold text-primary" />
        ),
      },
      {
        id: 'availability',
        header: 'Available',
        meta: { className: 'whitespace-nowrap' } satisfies ColumnMeta,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Switch
              checked={row.original.isAvailable}
              onCheckedChange={(isAvailable) =>
                setAvailability.mutate({ id: row.original.id, isAvailable })
              }
              aria-label={`Toggle availability for ${row.original.name}`}
            />
            <span
              className={cn(
                'text-xs font-medium',
                row.original.isAvailable ? 'text-status-completed' : 'text-muted-foreground',
              )}
            >
              {row.original.isAvailable ? 'In stock' : 'Out of stock'}
            </span>
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onEdit(row.original)}
              aria-label={`Edit ${row.original.name}`}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onDelete(row.original)}
              aria-label={`Remove ${row.original.name}`}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [onDelete, onEdit, setAvailability],
  );

  return (
    <DataTable
      columns={columns}
      data={items}
      globalFilter={filter}
      minWidth={540}
      empty={<span className="text-sm text-muted-foreground">No items in this category yet</span>}
    />
  );
}

/** Veg / non-veg mark — the Indian menu convention, green square vs red. */
function VegDot({ isVeg }: { isVeg: boolean | null }) {
  if (isVeg === null) return null;
  return (
    <span
      title={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
      className={cn(
        'mt-1 grid size-3.5 shrink-0 place-items-center rounded-sm border-2',
        isVeg ? 'border-status-completed' : 'border-destructive',
      )}
    >
      <span
        className={cn('size-1.5 rounded-full', isVeg ? 'bg-status-completed' : 'bg-destructive')}
      />
    </span>
  );
}

function CategoryDialog({
  open,
  category,
  nextOrder,
  onOpenChange,
}: {
  open: boolean;
  category: CategorySummary | null;
  nextOrder: number;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateCategory();
  const update = useUpdateCategory();

  const form = useForm({
    resolver: zodResolver(categorySchema),
    values: category
      ? { name: category.name, displayOrder: category.displayOrder }
      : { name: '', displayOrder: nextOrder },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (category) {
        await update.mutateAsync({ id: category.id, ...values });
        toast.success('Category updated');
      } else {
        await create.mutateAsync(values);
        toast.success(`“${values.name}” added`);
      }
      onOpenChange(false);
    } catch (e) {
      if (ApiError.isApiError(e) && e.code === 'DUPLICATE') {
        form.setError('name', { message: 'A category with that name already exists' });
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Could not save the category');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Rename category' : 'New category'}</DialogTitle>
          <DialogDescription>
            Category names are case-insensitive and unique within your restaurant.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field
            label="Name"
            htmlFor="categoryName"
            error={form.formState.errors.name?.message}
            required
          >
            <Input id="categoryName" placeholder="Biryani" {...form.register('name')} />
          </Field>
          <Field
            label="Display order"
            htmlFor="displayOrder"
            error={form.formState.errors.displayOrder?.message}
            hint="Lower numbers appear first."
          >
            <Input id="displayOrder" inputMode="numeric" {...form.register('displayOrder')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {category ? 'Save' : 'Add category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemDialog({
  state,
  categories,
  defaultCategoryId,
  onOpenChange,
}: {
  state: { mode: 'create' | 'edit'; item?: MenuItem } | null;
  categories: CategorySummary[];
  defaultCategoryId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateMenuItem();
  const update = useUpdateMenuItem();
  const editing = state?.mode === 'edit' ? state.item : undefined;

  const form = useForm<MenuItemInput>({
    resolver: zodResolver(menuItemSchema),
    values: editing
      ? {
          categoryId: editing.categoryId,
          name: editing.name,
          description: editing.description ?? '',
          price: editing.price,
          isVeg: editing.isVeg === null ? 'unspecified' : editing.isVeg ? 'veg' : 'nonveg',
        }
      : {
          categoryId: defaultCategoryId ?? '',
          name: '',
          description: '',
          price: '',
          isVeg: 'unspecified',
        },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const isVeg = values.isVeg === 'unspecified' ? null : values.isVeg === 'veg';
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          name: values.name,
          description: values.description || undefined,
          price: values.price,
          isVeg,
        });
        toast.success('Item updated');
      } else {
        await create.mutateAsync({
          categoryId: values.categoryId,
          name: values.name,
          description: values.description || undefined,
          price: values.price,
          isVeg,
        });
        toast.success(`“${values.name}” added`);
      }
      onOpenChange(false);
    } catch (e) {
      if (ApiError.isApiError(e) && e.code === 'DUPLICATE') {
        form.setError('name', { message: 'That item already exists in this category' });
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Could not save the item');
    }
  });

  return (
    <Dialog open={!!state} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit item' : 'New menu item'}</DialogTitle>
          <DialogDescription>
            Price is entered as text and stored as an exact decimal — no floating point anywhere.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {!editing && (
            <Field label="Category" error={form.formState.errors.categoryId?.message} required>
              {/* Controller, not watch + setValue — see the note in
                  SettingsPage: an unregistered Select loses its value on reset
                  and writes an empty string back over it. */}
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                      <SelectValue placeholder="Choose a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}

          <Field
            label="Name"
            htmlFor="itemName"
            error={form.formState.errors.name?.message}
            required
          >
            <Input id="itemName" placeholder="Chicken Biryani" {...form.register('name')} />
          </Field>

          <Field
            label="Description"
            htmlFor="itemDescription"
            error={form.formState.errors.description?.message}
          >
            <Textarea
              id="itemDescription"
              placeholder="Dum-cooked, served with raita and salan"
              {...form.register('description')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Price"
              htmlFor="price"
              error={form.formState.errors.price?.message}
              hint="Like 250 or 250.00"
              required
            >
              <Input
                id="price"
                inputMode="decimal"
                placeholder="250.00"
                {...form.register('price')}
              />
            </Field>

            <Field label="Diet" error={form.formState.errors.isVeg?.message}>
              <Controller
                control={form.control}
                name="isVeg"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="veg">Vegetarian</SelectItem>
                      <SelectItem value="nonveg">Non-vegetarian</SelectItem>
                      <SelectItem value="unspecified">Not specified</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Add item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
