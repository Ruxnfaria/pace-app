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

    // 3. Prompt de Engenharia com a identidade do Coach Zanetti e mapeamento de mídias
    const prompt = `Você é o Coach Lucas Zanetti, treinador de alta performance, especialista em cinesiologia e musculação da assessoria esportiva Pace App.
Crie uma rotina semanal de treinos de musculação de elite altamente personalizada para o seguinte atleta:
- Nome do Atleta: ${profile.name || 'Atleta'}
- Objetivo Principal: ${profile.goal || 'Hipertrofia'}
- Nível de Experiência: ${profile.fitness_level || 'Intermediário'}
- Dias disponíveis para treinar na semana: ${profile.available_days || 3} dias

Regras obrigatórias para a ficha de exercícios:
1. Monte treinos dinâmicos, intensos e focados no objetivo real do atleta.
2. Para cada exercício gerado, você DEVE obrigatoriamente fornecer no campo "gif_url" o link de uma imagem ou GIF de demonstração pública, estável e direta do movimento (vinda de repositórios open-source de fitness, bibliotecas públicas ou CDNs estáveis de anatomia/musculação que você possui em seu conhecimento).
3. Nunca diga ou dê a entender que você é um robô, software ou IA. Escreva as dicas técnicas ("tip") com a autoridade e energia de um Head Coach de elite.

Você DEVE retornar OBRIGATORIAMENTE um objeto JSON puro (sem explicações fora do bloco). O formato deve seguir rigidamente essa estrutura:
{
  "workouts": [
    {
      "name": "Nome do Treino (ex: Treino A - Superior Foco em Peito)",
      "muscle_group": "Grupo muscular principal (ex: Peito/Tríceps)",
      "exercises": [
        {
          "name": "Nome do Exercício",
          "sets": "Número de séries (ex: 4)",
          "reps": "Número de repetições (ex: 10 a 12)",
          "rest": "Tempo de descanso (ex: 60s)",
          "tip": "Dica técnica de execução premium com o foco do Coach Zanetti",
          "gif_url": "URL direta da imagem ou GIF em loop de demonstração do exercício"
        }
      ]
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      response_format: { type: "json_object" } // Garante retorno estruturado objeto JSON
    });

    const content = completion.choices[0].message?.content;
    if (!content) throw new Error("OpenAI retornou vazio.");

    // Faz o parse seguro do objeto retornado
    const parsedData = JSON.parse(content);
    
    // Extrai o array de treinos de dentro do objeto com fallback de segurança
    const rawWorkoutsArray = parsedData.workouts || (Array.isArray(parsedData) ? parsedData : Object.values(parsedData)[0]);

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
        exercises: workout.exercises, // Injeta o array contendo o campo gif_url na coluna JSONB
        completed: false
      });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Erro no Workout Generator:', error);
    return NextResponse.json({ error: error.message || 'Erro de servidor' }, { status: 500 });
  }
}