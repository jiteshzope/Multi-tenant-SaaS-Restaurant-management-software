import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { qk } from '@/lib/constants';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';

export type ConnectionState = 'connected' | 'reconnecting' | 'offline';

/**
 * Socket events invalidate or patch the Query cache — they never write to
 * Zustand and never become a second source of truth. Reconnects with the new
 * token after every refresh, because `accessToken` is a dependency.
 */
export function useSocket(): ConnectionState {
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.me?.role);
  const queryClient = useQueryClient();

  // Seed from the live socket rather than always starting at 'offline'. The
  // shell and the kitchen board both call this hook; the second caller
  // subscribes *after* 'connect' has already fired, so without this it would
  // sit on 'offline' forever and keep polling while the shell showed "Live".
  const [state, setState] = useState<ConnectionState>(() =>
    getSocket()?.connected ? 'connected' : 'offline',
  );

  useEffect(() => {
    if (!accessToken) {
      disconnectSocket();
      setState('offline');
      return;
    }

    const socket = connectSocket(accessToken);
    setState(socket.connected ? 'connected' : 'reconnecting');

    const onConnect = () => setState('connected');
    const onDisconnect = () => setState('reconnecting');
    const onError = () => setState('reconnecting');

    const invalidateBoard = () => {
      void queryClient.invalidateQueries({ queryKey: qk.board });
      void queryClient.invalidateQueries({ queryKey: qk.counts });
    };

    const onOrderNew = (order: { orderNumber?: number; tableNumber?: number }) => {
      invalidateBoard();
      void queryClient.invalidateQueries({ queryKey: qk.tables });
      void queryClient.invalidateQueries({ queryKey: qk.myTables });
      if (role === 'KITCHEN' || role === 'OWNER') {
        toast.info(`New order #${order.orderNumber ?? '—'}`, {
          description: order.tableNumber ? `Table ${order.tableNumber}` : undefined,
        });
        if (useUiStore.getState().soundEnabled) chime();
      }
    };

    const onOrderStatus = () => {
      invalidateBoard();
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    };

    const onTableChanged = () => {
      void queryClient.invalidateQueries({ queryKey: qk.tables });
      void queryClient.invalidateQueries({ queryKey: qk.myTables });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    };

    const onMenuUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: qk.menu });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    socket.on('order:new', onOrderNew);
    socket.on('order:status', onOrderStatus);
    socket.on('order:cancelled', onOrderStatus);
    socket.on('table:opened', onTableChanged);
    socket.on('table:closed', onTableChanged);
    socket.on('table:assigned', onTableChanged);
    socket.on('menu:updated', onMenuUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      socket.off('order:new', onOrderNew);
      socket.off('order:status', onOrderStatus);
      socket.off('order:cancelled', onOrderStatus);
      socket.off('table:opened', onTableChanged);
      socket.off('table:closed', onTableChanged);
      socket.off('table:assigned', onTableChanged);
      socket.off('menu:updated', onMenuUpdated);
    };
  }, [accessToken, queryClient, role]);

  return state;
}

/** A short two-tone chime, synthesized — no asset to ship or fail to load. */
function chime(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1174].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.22);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* audio is a nicety; never let it break the board */
  }
}
