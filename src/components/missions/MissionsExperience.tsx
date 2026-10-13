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
const chestAssets: Record<Rarity, string> = {
  common: "/rewards/chests/common.png",
  rare: "/rewards/chests/rare.png",
  epic: "/rewards/chests/epic.png",
};
const chestTier: Record<Rarity, string> = { common: "Tier 1", rare: "Tier 2", epic: "Tier 3" };

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
  const isEpic = rarity === "epic";
  const particleCount = rarity === "epic" ? 8 : rarity === "rare" ? 5 : 3;
  const requirement = isEpic ? "20 dias ativos para desbloquear" : `Complete ${data.target} missões`;
  const imageSize = isEpic
    ? "h-[168px] w-full"
    : rarity === "rare"
      ? "h-[116px] w-[46%] min-w-[138px]"
      : "h-[104px] w-[43%] min-w-[126px]";

  return (
    <motion.article
      layout
      whileHover={reduced ? undefined : { y: -2 }}
      animate={demo && !reduced ? { scale: [1, 1.025, 1.04, 1.015], x: [0, -2, 2, -1, 0] } : { scale: 1, x: 0 }}
      transition={{ duration: demo ? (isEpic ? 1.5 : rarity === "rare" ? 1.2 : 0.9) : 0.35 }}
      className={`group relative overflow-hidden rounded-[26px] border ${isEpic ? "p-5" : "p-4"} ${
        available || demo
          ? "border-orange-400/25 bg-gradient-to-br from-[#1a130e] via-[#0f0e0d] to-[#080808] shadow-[0_18px_55px_rgba(255,106,0,.12)]"
          : "border-white/[0.07] bg-gradient-to-br from-[#121212] to-[#090909]"
      }`}
    >
      <motion.div
        aria-hidden="true"
        animate={{ opacity: available || demo ? [0.28, 0.5, 0.28] : 0.08 }}
        transition={{ duration: 2.6, repeat: available && !reduced ? Infinity : 0 }}
        className={`pointer-events-none absolute left-[8%] top-1/2 -translate-y-1/2 rounded-full bg-[#ff6a00] blur-3xl ${isEpic ? "h-44 w-44" : "h-28 w-28"}`}
      />
      {demo && !reduced && <motion.div aria-hidden="true" initial={{ opacity: 0, scale: 0.45 }} animate={{ opacity: [0, 0.65, 0], scale: [0.45, 1.3, 1.75] }} transition={{ duration: isEpic ? 1.5 : 1 }} className="pointer-events-none absolute inset-0 m-auto h-32 w-32 rounded-full border border-orange-300/50" />}
      <div className={`relative flex ${isEpic ? "flex-col" : "items-center gap-3"}`}>
        <motion.div
          className={`relative shrink-0 ${imageSize}`}
          aria-hidden="true"
          animate={available && !reduced ? { y: [0, -2, 0], scale: [1, 1.012, 1] } : { y: 0, scale: 1 }}
          transition={{ duration: rarity === "epic" ? 3.2 : 3.8, repeat: available ? Infinity : 0, ease: "easeInOut" }}
        >
          <div className="absolute inset-x-[15%] bottom-[8%] h-[14%] rounded-full bg-black/80 blur-md" />
          <Image
            src={chestAssets[rarity]}
            alt=""
            fill
            sizes={isEpic ? "(max-width: 460px) 90vw, 390px" : "(max-width: 460px) 42vw, 180px"}
            className={`object-contain transition-[filter,transform] duration-500 ${
              available || demo
                ? "drop-shadow-[0_10px_18px_rgba(255,106,0,.2)] brightness-110"
                : "brightness-[.68] saturate-[.72]"
            }`}
          />
          {demo && !reduced && <motion.div initial={{ y: 0, rotateX: 0 }} animate={{ y: -8, rotateX: -12 }} transition={{ delay: 0.38, duration: 0.42 }} className="absolute inset-0 origin-bottom [clip-path:inset(0_0_48%_0)] [transform-style:preserve-3d]"><Image src={chestAssets[rarity]} alt="" fill sizes="190px" className="object-contain brightness-125 drop-shadow-[0_0_12px_rgba(255,137,45,.55)]" /></motion.div>}
          {!available && !opened && !demo && <span className="absolute bottom-[17%] left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-lg border border-white/10 bg-black/75 shadow-lg"><LockKeyhole className="h-3.5 w-3.5 text-zinc-500" /></span>}
          {(available || demo) && Array.from({ length: particleCount }, (_, p) => (
            <motion.span
              key={p}
              className="absolute left-1/2 top-[62%] h-1 w-1 rounded-full bg-orange-100 shadow-[0_0_7px_2px_rgba(255,125,32,.65)]"
              animate={reduced ? { opacity: 0.65 } : { x: [0, ((p % 4) - 1.5) * 24], y: [4, -34 - (p % 3) * 8], opacity: [0, 0.9, 0] }}
              transition={{ duration: 1.6 + (p % 3) * 0.25, repeat: Infinity, delay: p * 0.19 }}
            />
          ))}
          {(available || demo) && <motion.span aria-hidden="true" className="absolute inset-y-[16%] -left-1/3 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-orange-100/30 to-transparent blur-sm" animate={reduced ? { opacity: 0 } : { left: ["-35%", "125%"] }} transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3.6 }} />}
        </motion.div>
        <div className={`min-w-0 flex-1 ${isEpic ? "-mt-2" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-orange-400/20 bg-orange-400/[.06] px-2 py-1 text-[8px] font-bold uppercase tracking-[.18em] text-[#d96818]">{chestTier[rarity]}</span>
            <span className="text-[8px] font-bold uppercase tracking-[.16em] text-zinc-600">{isEpic ? "Recompensa mensal" : "Milestone diário"}</span>
          </div>
          <h3 className={`${isEpic ? "mt-2 text-xl" : "mt-1.5 text-[15px]"} font-bold text-white`}>{labels[rarity]}</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{opened ? "Recompensa já aberta." : available ? "Disponível — abertura real em breve." : requirement}</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.06]"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(data.progress / data.target, 1) * 100}%` }} className="h-full bg-gradient-to-r from-[#b74400] via-[#ff6a00] to-[#ffa14f] shadow-[0_0_8px_rgba(255,106,0,.35)]" /></div>
            <span className={`text-[10px] font-bold ${available ? "text-[#ff8a32]" : "text-zinc-500"}`}>{opened ? "Aberto" : available ? "Disponível" : `${Math.min(data.progress, data.target)} / ${data.target}`}</span>
          </div>
        </div>
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
  function preview(rarity: Rarity) { if (!testMode) return; setReward(null); setDemo(rarity); setTimeout(() => { setDemo(null); setReward(rarity); }, reduced ? 80 : rarity === "epic" ? 1500 : rarity === "rare" ? 1200 : 900); }

  return <main className="mx-auto min-h-screen w-full max-w-[430px] overflow-hidden px-5 pb-28 pt-5 sm:px-6">
    <header className="flex items-center justify-between"><Image src="/brand/praxe-logo.svg" alt="PRAXE" width={520} height={110} preload unoptimized className="h-auto w-[116px]" /><div className="flex items-center gap-1.5"><Flame className="h-5 w-5 fill-[#ff6a00] text-[#ff6a00]" /><span className="font-bold">{streak}</span></div></header>
    <section className="mt-7"><h1 className="text-[1.75rem] font-semibold tracking-[-.045em]">Missões</h1><p className="mt-1 text-[13px] text-zinc-500">Complete desafios, fortaleça seu Núcleo e ganhe Energia.</p></section>
    <section className="mt-7"><p className="text-[9px] font-bold uppercase tracking-[.22em] text-[#d96818]">Jornada do mês</p><h2 className="mt-1 text-lg font-semibold">Consistência que vira recompensa</h2><p className="text-[11px] text-zinc-600">Mantenha sua consistência durante o mês.</p><div className="mt-4"><Chest rarity="epic" data={epic} demo={demo === "epic"} reduced={reduced} /></div></section>
    <section className="relative mt-5 overflow-hidden rounded-[26px] border border-orange-400/10 bg-gradient-to-br from-[#17120e] to-[#0a0a0a] p-5"><div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-orange-500/[.08] blur-3xl" /><div className="relative flex justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.22em] text-[#d96818]">Jornada de hoje</p><h2 className="mt-2 max-w-[270px] text-base font-semibold">Complete suas missões para fortalecer o Núcleo.</h2></div><Trophy className="h-6 w-6 text-[#ff7a1a]" /></div><div className="relative mt-5 flex justify-between text-[11px]"><span className="text-zinc-400">Progresso diário</span><b>{completed} / {missions.length} concluídas</b></div><div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/[.06]"><motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} className="h-full bg-[#ff6a00]" /></div></section>
    <section className="mt-7"><div className="flex items-end justify-between"><div><h2 className="text-lg font-semibold">Missões do dia</h2><p className="text-[11px] text-zinc-600">Complete e ganhe Energia</p></div><Link href="/dashboard/aria" className="text-[10px] text-zinc-600">Solicitar novas</Link></div>
      {loading ? <div className="mt-4 space-y-3 animate-pulse">{[0,1,2].map((n)=><div key={n} className="h-28 rounded-[22px] bg-white/[.04]" />)}</div> : missions.length === 0 ? <div className="mt-4 rounded-[22px] border border-white/[.06] bg-[#101010] p-8 text-center text-sm text-zinc-400">Nenhuma missão disponível hoje.</div> : <div className="relative mt-4 space-y-3.5 pl-5"><div className="absolute bottom-8 left-[7px] top-8 w-px bg-gradient-to-b from-orange-500/35 via-white/10 to-orange-500/20" />{missions.slice(0,2).map(m=><div key={m.id} className="relative"><i className="absolute -left-[22px] top-8 h-4 w-4 rounded-full border-4 border-[#050505] bg-[#ff6a00]" /><MissionCard mission={m} /></div>)}<div className="relative"><i className="absolute -left-[22px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-4 border-[#050505] bg-[#bd4d0a]" /><Chest rarity="common" data={common} demo={demo === "common"} reduced={reduced} /></div>{missions.slice(2).map(m=><div key={m.id} className="relative"><i className="absolute -left-[22px] top-8 h-4 w-4 rounded-full border-4 border-[#050505] bg-[#ff6a00]" /><MissionCard mission={m} /></div>)}<div className="relative"><i className="absolute -left-[22px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-4 border-[#050505] bg-[#ff6a00]" /><Chest rarity="rare" data={rare} demo={demo === "rare"} reduced={reduced} /></div></div>}
      {!loading && missions.length === 0 && <div className="mt-3 space-y-3"><Chest rarity="common" data={common} demo={demo === "common"} reduced={reduced} /><Chest rarity="rare" data={rare} demo={demo === "rare"} reduced={reduced} /></div>}
    </section>
    {testMode && <section className="mt-6 rounded-[20px] border border-dashed border-orange-400/20 p-3"><p className="text-[9px] uppercase tracking-wider text-orange-300/70">Preview visual — sem recompensa</p><div className="mt-3 grid grid-cols-3 gap-2">{(["common","rare","epic"] as const).map(r=><button key={r} onClick={()=>preview(r)} className="rounded-xl border border-white/[.07] p-2 text-[9px] text-zinc-400">Testar {labels[r].replace("Baú ","")}</button>)}</div></section>}
    <AnimatePresence>{reward && <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 px-6"><motion.div initial={reduced ? false : {scale:.9,y:12}} animate={{scale:1,y:0}} className="w-full max-w-[330px] rounded-[28px] border border-orange-400/20 bg-[#10100f] p-7 text-center"><Sparkles className="mx-auto h-8 w-8 text-[#ff7a1a]" /><p className="mt-4 text-[9px] uppercase tracking-[.24em] text-[#d96818]">Recompensa</p><h2 className="mt-2 text-xl font-bold">Prévia visual</h2><p className="mt-2 text-xs text-zinc-500">Demonstração do {labels[reward]}. Nada foi concedido.</p><button onClick={()=>setReward(null)} className="mt-6 w-full rounded-2xl bg-[#ff6a00] py-3 text-xs font-bold">Continuar</button></motion.div></motion.div>}</AnimatePresence>
  </main>;
}
