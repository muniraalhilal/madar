'use client';
import { WS_NAMESPACE } from '@madar/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { demoSocket } from '@/demo/socket';
import { DEMO } from '@/demo/mode';
import { api, type Project, type User } from '@/lib/api';

interface Session {
  user: User | null;
  projects: Project[];
  project: Project | null;
  setProjectId: (id: string) => void;
  reloadProjects: () => Promise<void>;
  socket: Socket | null;
  canWrite: boolean;
}
const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const reloadProjects = useCallback(async () => {
    const list = await api<Project[]>('/projects');
    setProjects(list);
    setProjectIdState((cur) => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem('madar.project');
      } catch {
        /* storage unavailable */
      }
      const want = cur ?? saved;
      return list.find((p) => p.id === want)?.id ?? list[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    api<User>('/auth/me').then(setUser).catch(() => undefined);
    reloadProjects().catch(() => undefined);
  }, [reloadProjects]);

  useEffect(() => {
    if (!user) return;
    if (DEMO) {
      // The demo's live events come from the in-browser engine, not a socket server.
      setSocket(demoSocket as unknown as Socket);
      return;
    }
    const s = io(`${process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000'}${WS_NAMESPACE}`, { withCredentials: true, transports: ['websocket', 'polling'], reconnectionDelayMax: 8000 });
    setSocket(s);
    return () => {
      s.close();
    };
  }, [user]);

  const setProjectId = (id: string) => {
    setProjectIdState(id);
    try {
      localStorage.setItem('madar.project', id);
    } catch {
      /* ignore */
    }
  };
  const project = projects.find((p) => p.id === projectId) ?? null;
  const value = useMemo(
    () => ({ user, projects, project, setProjectId, reloadProjects, socket, canWrite: !!user && user.role !== 'viewer' && !!project && project.role !== 'viewer' }),
    [user, projects, project, reloadProjects, socket],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
