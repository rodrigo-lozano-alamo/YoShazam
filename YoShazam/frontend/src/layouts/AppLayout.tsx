import { Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-8rem] h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute right-[-6rem] top-[30%] h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute bottom-[-7rem] left-[20%] h-72 w-72 rounded-full bg-amber-300/10 blur-3xl" />
      </div>
      <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 md:px-6 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
