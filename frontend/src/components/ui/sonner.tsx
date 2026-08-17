import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useUiStore } from '@/store/ui.store';

/** Mounted once, in main.tsx. */
export function Toaster(props: ToasterProps) {
  const theme = useUiStore((s) => s.theme);
  return (
    <Sonner
      theme={theme}
      richColors
      closeButton
      position="top-right"
      toastOptions={{
        classNames: {
          toast: 'surface !rounded-xl !border !shadow-xl !shadow-black/30',
        },
      }}
      {...props}
    />
  );
}
