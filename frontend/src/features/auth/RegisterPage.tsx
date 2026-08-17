import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Field } from '@/components/common/Field';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_HOME } from '@/lib/constants';
import { registerRestaurantSchema, type RegisterRestaurantInput } from '@/schemas';
import { ApiError } from '@/types/api';
import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
  const { register: registerRestaurant, isAuthenticated, home } = useAuth();
  const navigate = useNavigate();

  const form = useForm<RegisterRestaurantInput>({
    resolver: zodResolver(registerRestaurantSchema),
    defaultValues: {
      restaurantName: '',
      slug: '',
      phone: '',
      ownerName: '',
      ownerEmail: '',
      ownerPassword: '',
      confirmPassword: '',
    },
  });

  if (isAuthenticated) return <Navigate to={home} replace />;

  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const me = await registerRestaurant(values);
      toast.success(`${me.restaurant.name} is ready`);
      navigate(ROLE_HOME[me.role], { replace: true });
    } catch (e) {
      if (ApiError.isApiError(e)) {
        if (e.code === 'EMAIL_TAKEN') {
          form.setError('ownerEmail', { message: 'That email is already registered' });
          return;
        }
        if (e.code === 'DUPLICATE') {
          form.setError('slug', { message: 'That handle is taken — try another' });
          return;
        }
      }
      toast.error(e instanceof Error ? e.message : 'Could not create the restaurant');
    }
  });

  /** Suggest a slug from the name until the owner edits it themselves. */
  const suggestSlug = (name: string) => {
    if (form.getFieldState('slug').isDirty) return;
    form.setValue(
      'slug',
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60),
    );
  };

  return (
    <AuthLayout
      title="Create your restaurant"
      subtitle="You will be the owner: menu, staff, tables and reports."
      wide
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Restaurant name"
            htmlFor="restaurantName"
            error={errors.restaurantName?.message}
            required
            className="sm:col-span-2"
          >
            <Input
              id="restaurantName"
              placeholder="Spice Garden"
              {...form.register('restaurantName', {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => suggestSlug(e.target.value),
              })}
            />
          </Field>

          <Field
            label="Handle"
            htmlFor="slug"
            error={errors.slug?.message}
            hint="Used in URLs — lowercase, dashes."
            required
          >
            <Input id="slug" placeholder="spice-garden" {...form.register('slug')} />
          </Field>

          <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" placeholder="+91-9000000000" {...form.register('phone')} />
          </Field>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="ownerName" error={errors.ownerName?.message} required>
            <Input id="ownerName" placeholder="Raj" {...form.register('ownerName')} />
          </Field>

          <Field
            label="Your email"
            htmlFor="ownerEmail"
            error={errors.ownerEmail?.message}
            required
          >
            <Input
              id="ownerEmail"
              type="email"
              autoComplete="email"
              placeholder="owner@spice.com"
              {...form.register('ownerEmail')}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="ownerPassword"
            error={errors.ownerPassword?.message}
            required
          >
            <Input
              id="ownerPassword"
              type="password"
              autoComplete="new-password"
              {...form.register('ownerPassword')}
            />
          </Field>

          <Field
            label="Confirm password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
            required
          >
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...form.register('confirmPassword')}
            />
          </Field>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Create restaurant
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
