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

    // 2. Prompt com a metodologia clínica de alta performance do Dr. Gabriel Fontes
    const prompt = `Atue como o sistema de mapeamento metabólico do Dr. Gabriel Fontes, especialista em nutrição esportiva de elite. 
Analise minuciosamente a seguinte refeição/alimento descrita pelo paciente para estimar os macronutrientes com precisão cirúrgica:
"${description}"

Você DEVE retornar estritamente um objeto JSON puro (sem blocos markdown de código, sem textos extras). O formato do objeto deve ser obrigatoriamente este:
{
  "calories": 350,
  "protein": 30,
  "carbs": 45,
  "fat": 8
}

Diretrizes Clínicas:
- Seja extremamente realista e assertivo nas estimativas com base em tabelas oficiais de composição de alimentos (TACO) voltadas para o cenário de performance.
- Considere variações implícitas de preparo físico (como uso moderado de gorduras para grelhados se não especificado).`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2, // Baixado para 0.2 para garantir máxima consistência matemática nos macros
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