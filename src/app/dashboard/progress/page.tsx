"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildProgressSummary,
  currentWeightUpdateTarget,
  ProfileProgressError,
  runWithFreshFitnessSource,
  type FitnessDataSource,
  type HealthProfile,
  type LegacyFitnessProfile,
  type MeasurementRecord,
} from "@/lib/profile-progress/model";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { TrendingUp, Plus, Scale, Ruler, Activity, Camera, X } from "lucide-react";

export default function ProgressPage() {
  const supabase = useMemo(() => createClient(), []);
  const [history, setHistory] = useState<MeasurementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [source, setSource] = useState<FitnessDataSource | null>(null);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [weightChange, setWeightChange] = useState(0);
  const [progressError, setProgressError] = useState<string | null>(null);

  // Campos do formulário
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [hip, setHip] = useState('');
  const [chest, setChest] = useState('');

  const loadProgressLogs = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setProgressError("Não foi possível confirmar sua sessão.");
      setLoading(false);
      return;
    }

    const [profileResponse, measurementsResponse] = await Promise.all([
      supabase
        .from("profiles")
        .select("onboarding_version,peso,altura,objetivo")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("body_measurements")
        .select("id,weight,waist,hip,chest,measured_at")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true }),
    ]);

    if (profileResponse.error || !profileResponse.data) {
      console.error("Erro ao carregar perfil:", profileResponse.error);
      setProgressError("Não foi possível carregar seu perfil agora.");
      setLoading(false);
      return;
    }

    if (measurementsResponse.error) {
      console.error(
        "Erro ao carregar histórico de medidas:",
        measurementsResponse.error
      );
      setProgressError("Não foi possível carregar seu histórico de medidas.");
      setLoading(false);
      return;
    }

    const profile = profileResponse.data as LegacyFitnessProfile;
    let health: HealthProfile | null = null;

    if (profile.onboarding_version === 2) {
      const healthResponse = await supabase
        .from("user_health_profiles")
        .select("weight_kg,height_cm,target_weight_kg,primary_goal")
        .eq("user_id", user.id)
        .maybeSingle();

      if (healthResponse.error) {
        console.error("Erro ao carregar perfil de saúde:", healthResponse.error);
        setProgressError("Não foi possível carregar seu peso atual agora.");
        setLoading(false);
        return;
      }

      health = healthResponse.data as HealthProfile | null;
    }

    const measurements = (measurementsResponse.data ?? []).map(
      (measurement) => ({
        id: measurement.id,
        weight: Number(measurement.weight) || 0,
        waist: Number(measurement.waist) || 0,
        hip: Number(measurement.hip) || 0,
        chest: Number(measurement.chest) || 0,
        measuredAt: new Date(measurement.measured_at).toLocaleDateString(
          "pt-BR",
          { day: "2-digit", month: "2-digit" }
        ),
      })
    );

    try {
      const summary = buildProgressSummary(profile, health, measurements);
      setSource(summary.source);
      setHistory(summary.history);
      setCurrentWeight(summary.currentWeight);
      setWeightChange(summary.weightChange);
      setProgressError(null);
    } catch (error) {
      if (error instanceof ProfileProgressError) {
        setSource("v2");
        setHistory([]);
        setCurrentWeight(null);
        setWeightChange(0);
        setProgressError(
          "Seu perfil de saúde precisa ser revisado antes de registrar novas medidas."
        );
      } else {
        throw error;
      }
    }

    setLoading(false);
  }, [supabase]);
  
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProgressLogs();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadProgressLogs]);
  
  async function handleSaveMeasurements(e: React.FormEvent) {
    e.preventDefault();
    if (!source || progressError) return;

    const parsedWeight = Number.parseFloat(weight);
    if (!Number.isFinite(parsedWeight)) {
      alert("Informe um peso válido.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    try {
      await runWithFreshFitnessSource({
        loadedSource: source,
        readCurrent: async () => {
          const currentProfileResponse = await supabase
            .from("profiles")
            .select("onboarding_version,peso,altura,objetivo")
            .eq("user_id", user.id)
            .maybeSingle();

          if (currentProfileResponse.error || !currentProfileResponse.data) {
            throw new ProfileProgressError(
              "Não foi possível confirmar a versão atual do seu perfil. Nenhuma medição foi salva.",
              "READ_FAILED"
            );
          }

          const currentProfile =
            currentProfileResponse.data as LegacyFitnessProfile;
          let currentHealth: HealthProfile | null = null;

          if (currentProfile.onboarding_version === 2) {
            const currentHealthResponse = await supabase
              .from("user_health_profiles")
              .select("weight_kg,height_cm,target_weight_kg,primary_goal")
              .eq("user_id", user.id)
              .maybeSingle();

            if (currentHealthResponse.error) {
              throw new ProfileProgressError(
                "Não foi possível confirmar seu perfil de saúde. Nenhuma medição foi salva.",
                "READ_FAILED"
              );
            }

            currentHealth = currentHealthResponse.data as HealthProfile | null;
          }

          return { profile: currentProfile, health: currentHealth };
        },
        write: async (currentSource) => {
          if (
            currentSource === "v2" &&
            (parsedWeight <= 0 || parsedWeight > 500)
          ) {
            throw new ProfileProgressError("Informe um peso válido.");
          }

          // The first mutation occurs only after the fresh source is validated.
          const { error: measurementError } = await supabase
            .from("body_measurements")
            .insert({
              user_id: user.id,
              weight: parsedWeight,
              waist: Number.parseFloat(waist) || null,
              hip: Number.parseFloat(hip) || null,
              chest: Number.parseFloat(chest) || null,
            });

          if (measurementError) {
            throw new Error("Não foi possível salvar suas métricas.");
          }

          const target = currentWeightUpdateTarget(currentSource);
          let profileUpdate = supabase
            .from(target.table)
            .update({ [target.column]: parsedWeight })
            .eq("user_id", user.id);

          if (target.table === "profiles") {
            // Even if V1→V2 happens after the fresh read, legacy data is not written.
            profileUpdate = profileUpdate.or(
              "onboarding_version.is.null,onboarding_version.eq.1"
            );
          }

          const profileResponse = await profileUpdate
            .select("user_id")
            .maybeSingle();

          if (profileResponse.error || !profileResponse.data) {
            throw new Error(
              target.table === "profiles"
                ? "A versão do perfil mudou antes da escrita. A medição entrou no histórico, mas o peso legado não foi alterado."
                : "A medição entrou no histórico, mas o peso atual não pôde ser atualizado."
            );
          }
        },
      });

      setWeight("");
      setWaist("");
      setHip("");
      setChest("");
      setModalOpen(false);
      setSaving(false);
      await loadProgressLogs();
    } catch (error) {
      setSaving(false);
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar suas métricas.";
      console.error("Erro ao salvar medidas:", error);
      alert(message);
      await loadProgressLogs();
    }
  }

  // Pega o último registro para exibir nos cards de destaque
  const ultimoRegistro =
  history.length > 0
    ? history[history.length - 1]
    : { weight: 0, waist: 0, hip: 0, chest: 0, measuredAt: "--" };
  return (
    <div className="p-6 lg:p-10 space-y-8">
      {progressError && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          {progressError}
        </div>
      )}
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">EVOLUÇÃO CORPORAL</h1>
          <p className="text-xs lg:text-sm text-zinc-500">Acompanhe seus gráficos de peso, histórico de composição e fotos de progresso.</p>
        </div>
        
        <button
          onClick={() => setModalOpen(true)}
          disabled={Boolean(progressError) || loading}
          className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#7c3aed] text-white text-xs font-black hover:bg-[#6d28d9] transition-all shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Registrar Métricas
        </button>
      </div>
{/* RESUMO DA EVOLUÇÃO */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">

  <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f]">
    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
      Peso Atual
    </p>

    <h3 className="text-3xl font-black text-white mt-2">
      {currentWeight ?? "--"}
      <span className="text-sm text-zinc-500 ml-1">kg</span>
    </h3>
  </div>

  <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f]">
  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
  Evolução Total
</p>

<h3 className="text-3xl font-black text-white mt-2">
  {weightChange > 0 ? "+" : ""}
  {weightChange.toFixed(1)}
  <span className="text-sm text-zinc-500 ml-1">kg</span>
</h3>
  </div>

  <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f]">
    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
      Última Atualização
    </p>

    <h3 className="text-lg font-black text-white mt-2">
      {history.length > 0
        ? history[history.length - 1].measuredAt
        : "--"}
    </h3>
  </div>

</div>

      {/* GRÁFICO PRINCIPAL */}
      <div className="p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#7c3aed]" />
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-400">Histórico de Peso (kg)</h2>
        </div>
        <div className="h-64 w-full pt-4">
          {loading ? (
            <div className="h-full w-full bg-[#0a0a0a] animate-pulse rounded-xl" />
          ) : history.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-zinc-500">Nenhum dado registrado para gerar o gráfico.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="measuredAt" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip contentStyle={{ backgroundColor: '#111111', borderColor: '#1f1f1f', borderRadius: '12px', fontSize: '12px' }} />
                <Line type="monotone" dataKey="weight" stroke="#7c3aed" strokeWidth={3} dot={{ fill: '#7c3aed' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* GRID DE MEDIDAS COMPACTAS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-2">
          <Scale className="w-4 h-4 text-purple-400" />
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Peso Atual</p>
          <h3 className="text-xl font-black text-white">{currentWeight ?? "--"} <span className="text-xs font-bold text-zinc-500">kg</span></h3>
        </div>
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-2">
          <Ruler className="w-4 h-4 text-orange-400" />
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Cintura</p>
          <h3 className="text-xl font-black text-white">{ultimoRegistro.waist} <span className="text-xs font-bold text-zinc-500">cm</span></h3>
        </div>
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-2">
          <Ruler className="w-4 h-4 text-blue-400" />
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Quadril</p>
          <h3 className="text-xl font-black text-white">{ultimoRegistro.hip} <span className="text-xs font-bold text-zinc-500">cm</span></h3>
        </div>
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-2">
          <Ruler className="w-4 h-4 text-green-400" />
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Peitoral</p>
          <h3 className="text-xl font-black text-white">{ultimoRegistro.chest} <span className="text-xs font-bold text-zinc-500">cm</span></h3>
        </div>
      </div>

      {/* SEÇÃO INFERIOR: HISTÓRICO DE TREINOS + COMPARTIMENTO FOTOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#7c3aed]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Histórico de Performance</h3>
          </div>
          <p className="text-xs text-zinc-500">Os treinos concluídos com sucesso aparecerão listados aqui automaticamente em breve.</p>
        </div>

        <div className="p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-3">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#7c3aed]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Galeria do Shape</h3>
          </div>
          <div className="border border-dashed border-zinc-800 p-8 rounded-xl text-center text-xs text-zinc-600 hover:border-zinc-700 cursor-pointer transition-colors">
            + Adicionar foto de progresso (Supabase Storage)
          </div>
        </div>
      </div>

      {/* MODAL REGISTRAR MEDIDAS */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveMeasurements} className="bg-[#111111] border border-[#1f1f1f] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            
            <div className="flex justify-between items-center border-b border-[#1f1f1f] pb-3">
              <h2 className="text-sm font-black tracking-wider uppercase text-white">Registrar Métricas</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Peso (kg)</label>
                <input type="number" step="0.1" min={source === "v2" ? 0.1 : undefined} max={source === "v2" ? 500 : undefined} required placeholder="0.0" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Cintura (cm)</label>
                <input type="number" placeholder="0" value={waist} onChange={(e) => setWaist(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Quadril (cm)</label>
                <input type="number" placeholder="0" value={hip} onChange={(e) => setHip(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Peitoral (cm)</label>
                <input type="number" placeholder="0" value={chest} onChange={(e) => setChest(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
            </div>

            <button type="submit" disabled={saving} className="w-full py-3 rounded-xl bg-white text-black font-black text-xs hover:opacity-95 transition-all mt-2 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "Salvando..." : "Salvar Registro"}
            </button>
          </form>
        </div>
      )}

    </div>
  );
}
