import { Compass, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

function Centered({
  icon,
  code,
  title,
  description,
}: {
  icon: React.ReactNode;
  code: string;
  title: string;
  description: string;
}) {
  const { home, isAuthenticated } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="rounded-full bg-muted p-4 text-muted-foreground">{icon}</div>
      <p className="font-mono text-sm text-muted-foreground">{code}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      <Button asChild>
        <Link to={isAuthenticated ? home : '/login'}>
          {isAuthenticated ? 'Back to your home screen' : 'Go to sign in'}
        </Link>
      </Button>
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <Centered
      icon={<ShieldAlert className="size-7" />}
      code="403"
      title="Not allowed"
      description="Your role does not have access to this screen. The server enforces this too — the UI is only reflecting it."
    />
  );
}

export function NotFoundPage() {
  return (
    <Centered
      icon={<Compass className="size-7" />}
      code="404"
      title="Nothing here"
      description="That page does not exist, or the link is out of date."
    />
  );
}
