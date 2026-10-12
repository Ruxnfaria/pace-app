"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Apple, Check, ChevronRight, Dumbbell, Flame, LockKeyhole, Sparkles, Target, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export type MissionView = { id: string; title: string; description: string | null; category: string | null; completed: boolean; xpReward: number; currentValue: number; targetValue: number };
export type ChestView = { status: "granted" | "opened" | "locked"; progress: number; target: number };
type Rarity = "common" | "rare" | "epic";
type Props = { loading: boolean; streak: number; missions: MissionView[]; common: ChestView; rare: ChestView; epic: ChestView };

const labels: Record<Rarity, string> = { common: "Baú Comum", rare: "Baú Raro", epic: "Baú Épico" };

function MissionCard({ mission }: { mission: MissionView }) {
  const Icon = mission.category === "workout" ? Dumbbell : mission.category === "nutrition" ? Apple : Target;
  const target = Math.max(mission.targetValue, 1);
  const current = mission.completed ? target : Math.min(Math.max(mission.currentValue, 0), target);
  const percent = Math.round((current / target) * 100);
  const state = mission.completed ? "Concluída" : current > 0 ? "Em progresso" : "Pendente";
  return (
    <motion.article layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[22px] border border-white/[0.07] bg-[#111] p-4">
      <div className="flex gap-3.5">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${mission.completed ? "border-orange-400/20 bg-orange-500/15" : "border-white/[0.07] bg-white/[0.035]"} text-[#ff7300]`}>
          {mission.completed ? <Check className="h-5 w-5 stroke-[3]" /> : <Icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-white">{mission.title}</h3><p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{mission.description || "Complete o objetivo diário."}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-zinc-700" /></div>
          <div className="mt-3 flex items-end gap-3">
            <div className="min-w-0 flex-1"><div className="mb-1.5 flex justify-between text-[9px] font-bold uppercase tracking-wider"><span className={mission.completed ? "text-[#ff7a1a]" : "text-zinc-600"}>{state}</span><span className="text-zinc-600">{current}/{target}</span></div><div className="h-1 overflow-hidden rounded-full bg-white/[0.06]"><motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} className="h-full rounded-full bg-[#ff6a00]" /></div></div>
            <span className="rounded-full border border-orange-400/20 bg-orange-500/[0.08] px-2.5 py-1 text-[10px] font-bold text-[#ff8a32]">+{mission.xpReward} <span className="text-orange-200/60">Energia</span></span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function Chest({ rarity, data, demo, reduced }: { rarity: Rarity; data: ChestView; demo: boolean; reduced: boolean }) {
  const available = data.status === "granted";
  const opened = data.status === "opened";
  const size = rarity === "epic" ? "h-28 w-32" : rarity === "rare" ? "h-24 w-28" : "h-20 w-24";
  return (
    <motion.article layout animate={demo && !reduced ? { scale: [1, 1.04, 1.015] } : { scale: 1 }} className={`overflow-hidden rounded-[24px] border p-4 ${available || demo ? "border-orange-400/20 bg-gradient-to-br from-[#18130f] to-[#0c0c0c] shadow-[0_0_30px_rgba(255,106,0,.14)]" : "border-white/[0.07] bg-[#0f0f0f]"}`}>
      <div className="flex items-center gap-4">
        <div className={`relative shrink-0 ${size}`} aria-hidden="true">
          <motion.div animate={demo && !reduced ? { y: -7, rotateX: -35 } : { y: 0, rotateX: 0 }} transition={{ delay: demo ? 0.32 : 0 }} className="absolute inset-x-[12%] top-[20%] h-[24%] origin-bottom rounded-t-xl border border-white/10 bg-gradient-to-b from-[#3a3732] to-[#171614]" style={{ transformPerspective: 280 }} />
          <div className="absolute inset-x-[8%] bottom-[12%] top-[42%] overflow-hidden rounded-b-xl border border-white/10 bg-gradient-to-br from-[#302d29] via-[#171513] to-[#080808]"><div className="absolute inset-y-0 left-[19%] w-[9%] bg-black/35" /><div className="absolute inset-y-0 right-[19%] w-[9%] bg-black/35" /><motion.div animate={{ opacity: available || demo ? [0.35, 1, 0.35] : 0.08 }} transition={{ duration: 2, repeat: available && !reduced ? Infinity : 0 }} className="absolute inset-x-2 top-0 h-px bg-[#ff7300] shadow-[0_0_14px_3px_rgba(255,106,0,.65)]" /></div>
          {!available && !opened && !demo && <LockKeyhole className="absolute left-1/2 top-[53%] h-5 w-5 -translate-x-1/2 text-zinc-600" />}
          {(available || demo) && [0, 1, 2].map((p) => <motion.span key={p} className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-orange-200" animate={reduced ? { opacity: .7 } : { x: [0, (p - 1) * 15], y: [3, -25 - p * 3], opacity: [0, 1, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay: p * .28 }} />)}
        </div>
        <div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#d96818]">{rarity === "epic" ? "Recompensa mensal" : "Milestone diário"}</p><h3 className="mt-1 text-[15px] font-bold text-white">{labels[rarity]}</h3><p className="mt-1 text-[11px] text-zinc-500">{opened ? "Recompensa já aberta." : available ? "Disponível — abertura real em breve." : rarity === "epic" ? "Mantenha sua consistência durante o mês." : `Complete ${data.target} missões hoje.`}</p><div className="mt-3 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.06]"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(data.progress / data.target, 1) * 100}%` }} className="h-full bg-gradient-to-r from-[#c54b00] to-[#ff8a32]" /></div><span className={`text-[10px] font-bold ${available ? "text-[#ff8a32]" : "text-zinc-600"}`}>{opened ? "Aberto" : available ? "Disponível" : `${Math.min(data.progress, data.target)} / ${data.target}`}</span></div></div>
      </div>
    </motion.article>
  );
}

export default function MissionsExperience({ loading, streak, missions, common, rare, epic }: Props) {
  const reduced = Boolean(useReducedMotion());
  const [testMode, setTestMode] = useState(false);
  const [demo, setDemo] = useState<Rarity | null>(null);
  const [reward, setReward] = useState<Rarity | null>(null);
  const completed = missions.filter((m) => m.completed).length;
  const percent = missions.length ? Math.round(completed / missions.length * 100) : 0;

  useEffect(() => { const host = location.hostname; const safe = host === "localhost" || host === "127.0.0.1" || host.includes("-git-codex-phase2-baseline-"); const timer = setTimeout(() => setTestMode(safe && new URLSearchParams(location.search).get("missionVisualTest") === "1"), 0); return () => clearTimeout(timer); }, []);
  function preview(rarity: Rarity) { if (!testMode) return; setReward(null); setDemo(rarity); setTimeout(() => { setDemo(null); setReward(rarity); }, reduced ? 80 : rarity === "epic" ? 1200 : rarity === "rare" ? 1000 : 820); }

  return <main className="mx-auto min-h-screen w-full max-w-[430px] overflow-hidden px-5 pb-28 pt-5 sm:px-6">
    <header className="flex items-center justify-between"><Image src="/brand/praxe-logo.svg" alt="PRAXE" width={520} height={110} preload unoptimized className="h-auto w-[116px]" /><div className="flex items-center gap-1.5"><Flame className="h-5 w-5 fill-[#ff6a00] text-[#ff6a00]" /><span className="font-bold">{streak}</span></div></header>
    <section className="mt-7"><h1 className="text-[1.75rem] font-semibold tracking-[-.045em]">Missões</h1><p className="mt-1 text-[13px] text-zinc-500">Complete desafios, fortaleça seu Núcleo e ganhe Energia.</p></section>
    <section className="relative mt-5 overflow-hidden rounded-[26px] border border-orange-400/10 bg-gradient-to-br from-[#17120e] to-[#0a0a0a] p-5"><div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-orange-500/[.08] blur-3xl" /><div className="relative flex justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.22em] text-[#d96818]">Jornada de hoje</p><h2 className="mt-2 max-w-[270px] text-base font-semibold">Complete suas missões para fortalecer o Núcleo.</h2></div><Trophy className="h-6 w-6 text-[#ff7a1a]" /></div><div className="relative mt-5 flex justify-between text-[11px]"><span className="text-zinc-400">Progresso diário</span><b>{completed} / {missions.length} concluídas</b></div><div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/[.06]"><motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} className="h-full bg-[#ff6a00]" /></div></section>
    <section className="mt-7"><div className="flex items-end justify-between"><div><h2 className="text-lg font-semibold">Missões do dia</h2><p className="text-[11px] text-zinc-600">Complete e ganhe Energia</p></div><Link href="/dashboard/aria" className="text-[10px] text-zinc-600">Solicitar novas</Link></div>
      {loading ? <div className="mt-4 space-y-3 animate-pulse">{[0,1,2].map((n)=><div key={n} className="h-28 rounded-[22px] bg-white/[.04]" />)}</div> : missions.length === 0 ? <div className="mt-4 rounded-[22px] border border-white/[.06] bg-[#101010] p-8 text-center text-sm text-zinc-400">Nenhuma missão disponível hoje.</div> : <div className="relative mt-4 space-y-3.5 pl-5"><div className="absolute bottom-8 left-[7px] top-8 w-px bg-gradient-to-b from-orange-500/35 via-white/10 to-orange-500/20" />{missions.slice(0,2).map(m=><div key={m.id} className="relative"><i className="absolute -left-[22px] top-8 h-4 w-4 rounded-full border-4 border-[#050505] bg-[#ff6a00]" /><MissionCard mission={m} /></div>)}<div className="relative"><i className="absolute -left-[22px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-4 border-[#050505] bg-[#bd4d0a]" /><Chest rarity="common" data={common} demo={demo === "common"} reduced={reduced} /></div>{missions.slice(2).map(m=><div key={m.id} className="relative"><i className="absolute -left-[22px] top-8 h-4 w-4 rounded-full border-4 border-[#050505] bg-[#ff6a00]" /><MissionCard mission={m} /></div>)}<div className="relative"><i className="absolute -left-[22px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-4 border-[#050505] bg-[#ff6a00]" /><Chest rarity="rare" data={rare} demo={demo === "rare"} reduced={reduced} /></div></div>}
      {!loading && missions.length === 0 && <div className="mt-3 space-y-3"><Chest rarity="common" data={common} demo={demo === "common"} reduced={reduced} /><Chest rarity="rare" data={rare} demo={demo === "rare"} reduced={reduced} /></div>}
    </section>
    <section className="mt-9"><p className="text-[9px] font-bold uppercase tracking-[.22em] text-[#d96818]">Jornada do mês</p><h2 className="mt-1 text-lg font-semibold">Consistência que vira recompensa</h2><p className="text-[11px] text-zinc-600">Mantenha sua consistência durante o mês.</p><div className="mt-4"><Chest rarity="epic" data={epic} demo={demo === "epic"} reduced={reduced} /></div></section>
    {testMode && <section className="mt-6 rounded-[20px] border border-dashed border-orange-400/20 p-3"><p className="text-[9px] uppercase tracking-wider text-orange-300/70">Preview visual — sem recompensa</p><div className="mt-3 grid grid-cols-3 gap-2">{(["common","rare","epic"] as const).map(r=><button key={r} onClick={()=>preview(r)} className="rounded-xl border border-white/[.07] p-2 text-[9px] text-zinc-400">Testar {labels[r].replace("Baú ","")}</button>)}</div></section>}
    <AnimatePresence>{reward && <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 px-6"><motion.div initial={reduced ? false : {scale:.9,y:12}} animate={{scale:1,y:0}} className="w-full max-w-[330px] rounded-[28px] border border-orange-400/20 bg-[#10100f] p-7 text-center"><Sparkles className="mx-auto h-8 w-8 text-[#ff7a1a]" /><p className="mt-4 text-[9px] uppercase tracking-[.24em] text-[#d96818]">Recompensa</p><h2 className="mt-2 text-xl font-bold">Prévia visual</h2><p className="mt-2 text-xs text-zinc-500">Demonstração do {labels[reward]}. Nada foi concedido.</p><button onClick={()=>setReward(null)} className="mt-6 w-full rounded-2xl bg-[#ff6a00] py-3 text-xs font-bold">Continuar</button></motion.div></motion.div>}</AnimatePresence>
  </main>;
}
