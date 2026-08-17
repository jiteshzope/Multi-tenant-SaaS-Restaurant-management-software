import { zodResolver } from '@hookform/resolvers/zod';
import { ChefHat, Info, LayoutDashboard, UtensilsCrossed } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/common/Field';
import { useAuth } from '@/hooks/useAuth';
import { postLoginPath } from '@/lib/constants';
import { loginSchema, type LoginInput } from '@/schemas';
import { ApiError } from '@/types/api';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { login, isAuthenticated, home } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const expired = params.get('reason') === 'expired';
  const next = params.get('next');

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (isAuthenticated) return <Navigate to={home} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const me = await login(values);
      toast.success(`Welcome back, ${me.user.name}`);
      // `next` is only followed when this role may actually go there —
      // otherwise a waiter signing in after an owner's session dropped lands
      // on /403. See `postLoginPath`.
      navigate(postLoginPath(next, me.role), { replace: true });
    } catch (e) {
      if (ApiError.isApiError(e) && e.code === 'INVALID_CREDENTIALS') {
        form.setError('password', { message: 'Email or password is incorrect' });
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Could not sign in');
    }
  });

  const fill = (email: string) => {
    form.setValue('email', email);
    form.setValue('password', 'password123');
    form.clearErrors();
  };

  return (
    <AuthLayout title="Sign in" subtitle="Front of house, kitchen and back office — one system.">
      {expired && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-status-pending/30 bg-status-pending/10 px-3 py-2 text-sm text-status-pending">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>Your session expired. Please sign in again.</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="owner@spice.com"
            aria-invalid={!!form.formState.errors.email}
            {...form.register('email')}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={form.formState.errors.password?.message}
          required
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={!!form.formState.errors.password}
            {...form.register('password')}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>

      <div className="mt-6 space-y-3 border-t border-border/60 pt-5">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">Demo accounts</p>
        {/* Each role wears the colour it wears everywhere else in the app —
            saffron owner, green waiter, blue kitchen. */}
        <div className="grid gap-2 sm:grid-cols-3">
          <DemoButton
            icon={<LayoutDashboard className="size-3.5" />}
            label="Owner"
            email="owner@spice.com"
            tone="var(--primary)"
            onClick={fill}
          />
          <DemoButton
            icon={<UtensilsCrossed className="size-3.5" />}
            label="Waiter"
            email="amit@spice.com"
            tone="var(--status-completed)"
            onClick={fill}
          />
          <DemoButton
            icon={<ChefHat className="size-3.5" />}
            label="Kitchen"
            email="kitchen@spice.com"
            tone="var(--status-preparing)"
            onClick={fill}
          />
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New restaurant?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}

function DemoButton({
  icon,
  label,
  email,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  email: string;
  tone: string;
  onClick: (email: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(email)}
      style={{ '--tone': tone } as React.CSSProperties}
      className="toned toned-hover flex min-h-11 w-full min-w-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all"
    >
      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: tone }}>
        {icon}
        {label}
      </span>
      <span className="w-full truncate text-xs">{email}</span>
    </button>
  );
}
