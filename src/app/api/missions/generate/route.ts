import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST() {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('goal, fitness_level')
      .eq('user_id', user.id)
      .single();

    const prompt = `Gere exatamente 3 missões diárias de estilo de vida saudável e fitness para um usuário cujo objetivo é: "${profile?.goal || 'Ganhar Massa'}" e nível é "${profile?.fitness_level || 'Intermediário'}".
As missões devem focar em pilares como: hidratação, cardio, consistência alimentar ou sono.

Você DEVE responder obrigatoriamente um objeto JSON com formato rígido (sem explicações externas):
{
  "missions": [
    {
      "title": "Título curto da missão (ex: Hidratação Forte)",
      "description": "Explicação breve da tarefa (ex: Beber 3.5 litros de água ao longo do dia de hoje).",
      "xp_reward": 50
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message?.content;
    if (!content) throw new Error("Retorno vazio da OpenAI.");

    const parsedData = JSON.parse(content);
    const missionsArray = parsedData.missions;

    if (!Array.isArray(missionsArray)) {
      throw new Error("Formato inválido retornado.");
    }

    // Limpa missões do dia anterior e injeta as novas tarefas
    await supabase.from('missions').delete().eq('user_id', user.id);

    for (const m of missionsArray) {
      await supabase.from('missions').insert({
        user_id: user.id,
        title: m.title,
        description: m.description,
        xp_reward: m.xp_reward || 50,
        completed: false,
        type: 'daily'
      });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Erro no Mission Generator:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}