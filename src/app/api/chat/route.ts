import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { message, imageUrl } = await req.json();
    const supabase = await createClient();

    // 1. Validação de segurança e autenticação
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (!message && !imageUrl) {
      return NextResponse.json({ error: 'Conteúdo ausente' }, { status: 400 });
    }

    // 2. Busca os dados reais do perfil
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const userContext = profile 
      ? `\n\n[DADOS CADASTRAIS DO ALUNO CONECTADO - USE PARA BALIZAR SUA ESTRATÉGIA]:
- Nome: ${profile.nome || 'Ruan'}
- Peso atual: ${profile.peso ? profile.peso + ' kg' : '66 kg'}
- Altura: ${profile.altura ? profile.altura + ' cm' : '175 cm'}
- Objetivo principal: ${profile.objetivo || 'Hipertrofia'}`
      : '\n\n[DADOS DO ALUNO]: Nome: Ruan, Peso: 66 kg, Objetivo: Hipertrofia';

    // 3. MEMÓRIA: Recupera o histórico recente
    const { data: history } = await supabase
      .from('chat_messages')
      .select('sender, content')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(15);

    // 4. SALVA A MENSAGEM DO USUÁRIO NO BANCO
    const messageToSave = message.trim() || "[Enviou uma imagem de acompanhamento físico]";
    await supabase.from('chat_messages').insert({
      user_id: user.id,
      sender: 'user',
      content: imageUrl ? `${messageToSave} (Mídia anexada: ${imageUrl})` : messageToSave
    });

   // 5. Prompt de Alta Performance Estruturado
const systemPrompt = `Você é a inteligência por trás da Mesa de Elite da Mentoria Pace. 
Você assume a postura de mentores profissionais de altíssimo nível, combinando rigor técnico, sobriedade e assertividade.

${userContext}

DIRETRIZES ABSOLUTAS DE AUTOMAÇÃO:
- Responda de forma direta, madura e elegante, em parágrafos corridos e fluidos no chat. PROIBIDO listas por tópicos no seu texto de resposta convencional.
- Sempre que você (Coach Zanetti) prescrever, montar ou alterar uma rotina ou divisão de treino, você DEVE acionar obrigatoriamente a ferramenta 'salvar_treino' fornecendo a lista exata e desmembrada de exercícios.
- Sempre que você criar um treino, você DEVE criar no mínimo 3 missões diárias usando obrigatoriamente a ferramenta 'salvar_missao_diaria'.
- Sempre que você (Dr. Gabriel Fontes) planejar calorias, macros ou dieta, acione obrigatoriamente 'salvar_nutricao'.
- Sempre que você criar uma dieta, você DEVE criar no mínimo 3 missões diárias usando obrigatoriamente a ferramenta 'salvar_missao_diaria'.
- As missões devem ser objetivas, mensuráveis e práticas.

Exemplos de missões:
Concluir treino de hoje.
Beber 3 litros de água.
Consumir todas as refeições planejadas.
Fazer 20 minutos de cardio.
Dormir 8 horas.

PERSONAS DE ELITE:
1. COACH LUCAS ZANETTI (Treino e Fichas)
2. DR. GABRIEL FONTES (Nutrição e Metabolismo)`;

    // 6. Definição das Ferramentas (Schema atualizado para Array de Exercícios)
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'salvar_treino',
          description: 'Insere uma planilha de treino estruturada item por item para ativação do player de GIFs do aluno.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Título do treino. Ex: Treino de Braços - Foco em Pico de Bíceps' },
              exercises: {
                type: 'array',
                description: 'Lista contendo cada exercício de forma isolada.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Nome do exercício. Ex: Rosca Direta com Barra' },
                    sets: { type: 'string', description: 'Número de séries. Ex: 4' },
                    reps: { type: 'string', description: 'Repetições. Ex: 10-12' },
                    rest: { type: 'string', description: 'Tempo de descanso. Ex: 60s' },
                    tip: { type: 'string', description: 'Dica cirúrgica do Zanetti para execução. Ex: Controle a descida excêntrica.' }
                  },
                  required: ['name', 'sets', 'reps', 'rest', 'tip']
                }
              }
            },
            required: ['title', 'exercises']
          }
        }
      },
{
  type: 'function',
  function: {
    name: 'salvar_nutricao',
    description: 'Salva o plano alimentar completo do aluno na aba de Nutrição.',
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string' },
        calories: { type: 'integer' },
        protein: { type: 'integer' },
        carbs: { type: 'integer' },
        fat: { type: 'integer' },
        meals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              icon: { type: 'string' },
              title: { type: 'string' },
              time: { type: 'string' },
              short: { type: 'string' },
              foods: {
                type: 'array',
                items: { type: 'string' }
              },
              protein: { type: 'string' },
              carbs: { type: 'string' },
              fat: { type: 'string' }
            },
            required: ['icon', 'title', 'time', 'short', 'foods', 'protein', 'carbs', 'fat']
          }
        }
      },
      required: ['goal', 'calories', 'protein', 'carbs', 'fat', 'meals']
    }
  }
},
{
  type: 'function',
  function: {
    name: 'salvar_missao_diaria',
    description: 'Cria uma missão diária individual para o aluno cumprir no dashboard.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        xp_reward: { type: 'integer' },
        category: { type: 'string' }
      },
      required: ['title']
    }
  }
},
    ];

    // 7. Monta a linha do tempo
    const finalMessages: any[] = [{ role: 'system', content: systemPrompt }];
    if (history) {
      history.forEach((msg: any) => {
        finalMessages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }

    if (imageUrl) {
      finalMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: message || "Analise meus dados." },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      });
    } else {
      finalMessages.push({ role: 'user', content: message });
    }

    // 8. Chamada OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: finalMessages,
      tools: tools,
      tool_choice: 'auto',
      temperature: 0.5
    });

    const responseMessage = completion.choices[0].message;
    const toolCalls = responseMessage.tool_calls;

    console.log("TOOL CALLS:", JSON.stringify(toolCalls, null, 2));

    // 9. PROCESSAMENTO DAS FERRAMENTAS (Salvando a lista de exercícios como string JSON no banco)
    if (toolCalls) {
      const processedTools = new Set<string>();
    
      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") {
          continue;
        }
      
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
      
        if (processedTools.has(functionName)) continue;
        processedTools.add(functionName);

        if (functionName === 'salvar_treino') {
          await supabase.from('workouts').insert({
            user_id: user.id,
            title: args.title,
            exercises: JSON.stringify(args.exercises) // Converte a lista em texto estruturado para o banco receber limpamente
          });
        }

        if (functionName === 'salvar_nutricao') {
          await supabase
            .from('nutrition_plans')
            .update({ active: false })
            .eq('user_id', user.id);
            await supabase
            .from('nutrition_plans')
            .update({ active: false })
            .eq('user_id', user.id);
          await supabase.from('nutrition_plans').insert({
            user_id: user.id,
            goal: args.goal,
            calories: args.calories,
            protein: args.protein,
            carbs: args.carbs,
            fat: args.fat,
            meals: args.meals,
            active: true
          });
        }

        if (functionName === 'salvar_missao_diaria') {
          await supabase.from('daily_missions').insert({
            user_id: user.id,
            title: args.title,
            completed: false
          });
        }
      }
    }

    const reply = responseMessage.content || "Ficha técnica de treino montada e injetada com os players visuais de animação no seu painel principal.";

    // 10. SALVA A RESPOSTA DA IA NO BANCO
    await supabase.from('chat_messages').insert({
      user_id: user.id,
      sender: 'assistant',
      content: reply
    });

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error('Erro crítico no ecossistema automatizado:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}