import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    const supabase = await createClient();

    // 1. Valida se o usuário está autenticado
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // 2. Busca os dados físicos dele no banco para injetar inteligência contextual
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // 3. Registra o input do usuário no banco
    await supabase.from('chat_messages').insert({
      user_id: user.id,
      role: 'user',
      content: message,
    });

    // 4. Constrói o System Prompt customizado baseado nas métricas reais dele
    const systemPrompt = `Você é a ARIA (Adaptive Running Intelligence Assistant), uma personal trainer e nutricionista de elite do Pace App.
Seu objetivo é dar respostas altamente personalizadas e profissionais.

Dados atuais do usuário:
- Nome: ${profile?.name || 'Atleta'}
- Objetivo: ${profile?.goal || 'Não definido'}
- Nível: ${profile?.fitness_level || 'Não definido'}
- Peso: ${profile?.weight ? `${profile.weight}kg` : 'Não informado'}
- Altura: ${profile?.height ? `${profile.height}cm` : 'Não informada'}
- Idade: ${profile?.age ? `${profile.age} anos` : 'Não informada'}
- Dias disponíveis na semana: ${profile?.available_days || 3} dias

Regras de comportamento:
1. Seja extremamente motivadora, direta ao ponto e use termos de performance de forma simples.
2. Use emojis com bastante moderação.
3. Chame o usuário pelo primeiro nome esporadicamente para criar conexão.
4. Ao passar treinos, dietas ou listas de suplementação, estruture tudo de forma muito limpa usando tópicos organizados.`;

    // 5. Aciona a OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
    });

    const reply = completion.choices[0].message?.content || 'Não consegui processar a resposta.';

    // 6. Salva a resposta da ARIA para manter a memória do chat ativa
    await supabase.from('chat_messages').insert({
      user_id: user.id,
      role: 'assistant',
      content: reply,
    });

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error('Erro na API da ARIA:', error);
    return NextResponse.json({ error: error.message || 'Erro interno do servidor' }, { status: 500 });
  }
}