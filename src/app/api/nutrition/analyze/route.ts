import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { description } = await req.json();
    const supabase = await createClient();

    // 1. Validação de segurança
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (!description) {
      return NextResponse.json({ error: 'Descrição ausente' }, { status: 400 });
    }

    // 2. Prompt forçando o retorno estrito em formato JSON estruturado
    const prompt = `Analise a seguinte refeição/alimento e estime os valores nutricionais (calorias, proteínas, carboidratos e gorduras):
"${description}"

Você DEBE retornar estritamente um objeto JSON puro (sem blocos markdown de código, sem textos extras). O formato do objeto deve ser obrigatoriamente este:
{
  "calories": 350,
  "protein": 30,
  "carbs": 45,
  "fat": 8
}

Seja realista e assertivo nas estimativas com base em tabelas nutricionais padrão de alimentos.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message?.content;
    if (!content) throw new Error("A OpenAI falhou ao retornar dados.");

    const parsedData = JSON.parse(content);

    return NextResponse.json({
      success: true,
      data: {
        calories: parsedData.calories || 0,
        protein: parsedData.protein || 0,
        carbs: parsedData.carbs || 0,
        fat: parsedData.fat || 0,
      }
    });

  } catch (error: any) {
    console.error('Erro na API de Análise Nutricional:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}