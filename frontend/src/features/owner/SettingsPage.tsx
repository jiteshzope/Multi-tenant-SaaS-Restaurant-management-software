import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/common/Field';
import { ErrorState, LoadingRows } from '@/components/common/States';
import { PageHeader } from '@/components/layout/AppShell';
import { useRestaurant } from '@/hooks/queries';
import { useUpdateRestaurant } from '@/hooks/mutations';
import { authApi } from '@/api/resources';
import { useAuth } from '@/hooks/useAuth';
import { IANA_TIMEZONES } from '@/lib/constants';
import {
  changePasswordSchema,
  settingsSchema,
  type ChangePasswordInput,
  type SettingsInput,
} from '@/schemas';
import { ApiError } from '@/types/api';
import type { Restaurant } from '@/types/domain';

export function OwnerSettingsPage() {
  const restaurant = useRestaurant();

  return (
    <>
      <PageHeader title="Settings" description="Restaurant profile, tax and timezone." />

      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-6 lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold">Restaurant profile</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            The name, address and phone printed on every bill.
          </p>

          {restaurant.isLoading ? (
            <LoadingRows count={4} />
          ) : restaurant.isError ? (
            <ErrorState error={restaurant.error} onRetry={() => void restaurant.refetch()} />
          ) : restaurant.data ? (
            /*
              The form is a child that only exists once the restaurant is
              loaded, and it seeds `defaultValues` from that data directly.

              The previous shape — one `useForm` in this component with
              `values: data ?? undefined` — looked equivalent and was not. RHF
              applies `values` in an effect, so the first paint of the form ran
              with the field still empty; Radix's Select reads its
              controlled-vs-uncontrolled mode from that first `value`, mounted
              uncontrolled, and immediately emitted `onValueChange('')`. The
              empty string landed back in the form *after* the reset and
              overwrote the real timezone, so the field read "Choose a
              timezone" for a restaurant that had one — and saving would have
              written the blank over it. Mounting with the data already in hand
              removes the empty first render that starts the whole sequence.
            */
            <ProfileForm key={restaurant.data.id} restaurant={restaurant.data} />
          ) : null}
        </Card>

        <ChangePasswordCard />
        <ReadOnlyCard slug={restaurant.data?.slug} currency={restaurant.data?.currency} />
      </div>
    </>
  );
}

function ProfileForm({ restaurant }: { restaurant: Restaurant }) {
  const update = useUpdateRestaurant();

  const form = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: restaurant.name,
      phone: restaurant.phone ?? '',
      address: restaurant.address ?? '',
      taxPercent: restaurant.taxPercent,
      timezone: restaurant.timezone,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        name: values.name,
        phone: values.phone || undefined,
        address: values.address || undefined,
        taxPercent: values.taxPercent,
        timezone: values.timezone,
      });
      toast.success('Settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the settings');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={form.formState.errors.name?.message} required>
          <Input id="name" {...form.register('name')} />
        </Field>

        <Field label="Phone" htmlFor="phone" error={form.formState.errors.phone?.message}>
          <Input id="phone" {...form.register('phone')} />
        </Field>
      </div>

      <Field label="Address" htmlFor="address" error={form.formState.errors.address?.message}>
        <Textarea id="address" rows={2} {...form.register('address')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Tax percent"
          htmlFor="taxPercent"
          error={form.formState.errors.taxPercent?.message}
          hint="Applies to future bills only — closed bills are historical."
          required
        >
          <Input id="taxPercent" inputMode="decimal" {...form.register('taxPercent')} />
        </Field>

        <Field
          label="Timezone"
          error={form.formState.errors.timezone?.message}
          hint="“Today” in reports means today here."
          required
        >
          {/* Controller, so the Select is a registered field rather than a
              `watch` + `setValue` pair the form does not know about. */}
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                  <SelectValue placeholder="Choose a timezone" />
                </SelectTrigger>
                <SelectContent>
                  {IANA_TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={form.formState.isSubmitting}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function ChangePasswordCard() {
  const { logout } = useAuth();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success('Password changed — signing you out everywhere');
      // The backend revokes every refresh family, so a re-login is mandatory.
      setTimeout(() => void logout(), 1200);
    } catch (e) {
      if (ApiError.isApiError(e) && e.code === 'INVALID_CREDENTIALS') {
        form.setError('currentPassword', { message: 'That is not your current password' });
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Could not change the password');
    }
  });

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="mb-1 text-sm font-semibold">Your password</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Changing it revokes every session on every device.
      </p>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field
          label="Current password"
          htmlFor="currentPassword"
          error={form.formState.errors.currentPassword?.message}
          required
        >
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            {...form.register('currentPassword')}
          />
        </Field>
        <Field
          label="New password"
          htmlFor="newPasswordOwner"
          error={form.formState.errors.newPassword?.message}
          required
        >
          <Input
            id="newPasswordOwner"
            type="password"
            autoComplete="new-password"
            {...form.register('newPassword')}
          />
        </Field>
        <Field
          label="Confirm new password"
          htmlFor="confirmPasswordOwner"
          error={form.formState.errors.confirmPassword?.message}
          required
        >
          <Input
            id="confirmPasswordOwner"
            type="password"
            autoComplete="new-password"
            {...form.register('confirmPassword')}
          />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" variant="outline" loading={form.formState.isSubmitting}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ReadOnlyCard({ slug, currency }: { slug?: string; currency?: string }) {
  return (
    <Card className="p-4 sm:p-6">
      <h2 className="mb-1 text-sm font-semibold">Account</h2>
      <p className="mb-5 text-sm text-muted-foreground">Fixed at sign-up.</p>

      <dl className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Handle</dt>
          <dd className="font-mono text-xs">{slug ?? '—'}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Currency</dt>
          <dd>{currency ?? '—'}</dd>
        </div>
      </dl>
    </Card>
  );
}
