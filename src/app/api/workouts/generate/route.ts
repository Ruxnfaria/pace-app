import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST() {
  try {
    const supabase = await createClient();

    // 1. Checa segurança
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // 2. Coleta dados físicos do perfil para montar a rotina perfeita
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    // 3. Prompt de Engenharia Reversa para forçar a IA a responder em JSON puro estruturado
    const prompt = `Crie uma rotina semanal de treinos fitness de alta performance para o seguinte perfil:
- Objetivo: ${profile.goal || 'Hipertrofia'}
- Nível de Experiência: ${profile.fitness_level || 'Intermediário'}
- Dias disponíveis para treinar na semana: ${profile.available_days || 3} dias

Você DEVE retornar OBRIGATORIAMENTE um array no formato JSON puro (sem explicações fora do bloco JSON). Cada objeto do array representa um dia de treino e deve seguir rigidamente essa estrutura:
[
  {
    "name": "Nome do Treino (ex: Superiores A - Foco em Peito)",
    "muscle_group": "Grupo principal (ex: Peito/Tríceps)",
    "exercises": [
      {
        "name": "Nome do Exercício",
        "sets": "Número de séries (ex: 4)",
        "reps": "Número de repetições (ex: 10 a 12)",
        "rest": "Tempo de descanso (ex: 60s)",
        "tip": "Breve dica técnica de execução premium"
      }
    ]
  }
]`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      response_format: { type: "json_object" } // Garante retorno estruturado objeto JSON
    });

    const content = completion.choices[0].message?.content;
    if (!content) throw new Error("OpenAI retornou vazio.");

    // Faz o parse do objeto retornado
    const parsedData = JSON.parse(content);
    
    // Se a IA envelopou dentro de uma propriedade "workouts" ou similar, pegamos o array
    const rawWorkoutsArray = Array.isArray(parsedData) ? parsedData : Object.values(parsedData)[0];

    if (!Array.isArray(rawWorkoutsArray)) {
      throw new Error("Formato inválido retornado pela IA.");
    }

    // 4. Limpa treinos anteriores para não duplicar infinitamente e insere os novos
    await supabase.from('workouts').delete().eq('user_id', user.id);

    for (const workout of rawWorkoutsArray) {
      await supabase.from('workouts').insert({
        user_id: user.id,
        name: workout.name,
        muscle_group: workout.muscle_group,
        exercises: workout.exercises, // Injeta o array diretamente na coluna JSONB
        completed: false
      });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Erro no Workout Generator:', error);
    return NextResponse.json({ error: error.message || 'Erro de servidor' }, { status: 500 });
  }
}