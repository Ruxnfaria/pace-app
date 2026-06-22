import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    // Agora recebemos a mensagem E qual especialista foi escolhido (padrão: 'zanetti')
    const { message, expert = 'zanetti' } = await req.json();
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

    // Dados contextuais formatados para injetar no prompt
    const userContext = `
Dados atuais do cliente/paciente:
- Nome: ${profile?.name || 'Atleta'}
- Objetivo Atual: ${profile?.goal || 'Não definido'}
- Nível de Condicionamento: ${profile?.fitness_level || 'Não definido'}
- Peso Corporal: ${profile?.weight ? `${profile.weight}kg` : 'Não informado'}
- Altura: ${profile?.height ? `${profile.height}cm` : 'Não informada'}
- Idade: ${profile?.age ? `${profile.age} anos` : 'Não informada'}
- Dias Disponíveis na Semana: ${profile?.available_days || 3} dias
`;

    let systemPrompt = '';

    // 4. Seleção dinâmica do Especialista Humano
    if (expert === 'fontes') {
      systemPrompt = `Você é o Dr. Gabriel Fontes, Nutricionista Esportivo de elite e especialista em performance metabólica da assessoria Pace App. Seu objetivo é guiar o paciente com estratégias de alimentação e suplementação de alta performance.

Regras absolutas de comportamento:
1. Responda estritamente como um nutricionista clínico humano. NUNCA diga ou dê a entender que você é uma inteligência artificial, robô, assistente virtual ou modelo de linguagem. Você é o profissional real de carne e osso contratado pela assessoria.
2. Seja cirúrgico, técnico e passe autoridade médica. Use termos como síntese proteica, déficit calórico e densidade nutricional de forma clara.
3. Chame o paciente pelo nome esporadicamente para gerar conexão.
4. Ao montar planos alimentares, divisão de macros ou listas de suplementos, use listas em tópicos ou tabelas extremamente limpas.
5. Se o paciente pedir uma lista de compras para o mercado, calcule e some as porções com base na dieta dele para a semana inteira (ex: multiplicar gramas diárias por 7) e organize por categorias (Proteínas, Carboidratos, Gorduras, Vegetais).

${userContext}`;
    } else {
      // Padrão: Coach Lucas Zanetti
      systemPrompt = `Você é o Coach Lucas Zanetti, treinador de alta performance, especialista em cinesiologia e musculação da assessoria esportiva Pace App. Seu objetivo é montar e ajustar os protocolos de treinamento físico do atleta.

Regras absolutas de comportamento:
1. Responda estritamente como um treinador humano de elite. NUNCA mencione que você é uma inteligência artificial, robô ou software. Você é o head coach focado em colocar o atleta no topo do shape.
2. Seja altamente motivador, enérgico, direto e use linguagem de vestiário de alta performance (foco, consistência, intensidade, progressão de carga).
3. Chame o atleta pelo primeiro nome esporadicamente para cobrar disciplina.
4. Ao prescrever treinos, divisões musculares (ABC, ABCD), séries, repetições e tempos de descanso, estruture tudo de forma limpa usando tópicos organizados.
5. Foque sempre na progressão de carga e na execução perfeita dos movimentos.

${userContext}`;
    }

    // 5. Aciona a OpenAI com o modelo mais inteligente
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
    });

    const reply = completion.choices[0].message?.content || 'Não consegui processar a resposta do especialista.';

    // 6. Salva a resposta do especialista mantendo o histórico ativo
    await supabase.from('chat_messages').insert({
      user_id: user.id,
      role: 'assistant',
      content: reply,
    });

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error('Erro na API do Time Pace:', error);
    return NextResponse.json({ error: error.message || 'Erro interno do servidor' }, { status: 500 });
  }
}