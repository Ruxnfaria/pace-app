'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, Send, Sparkles, Zap } from 'lucide-react';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function AriaChatPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carrega o histórico de mensagens salvas ao entrar na tela
  useEffect(() => {
    async function loadChatHistory() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('chat_messages')
          .select('role, content, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(20);
        
        if (data) {
          setMessages(data.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          })));
        }
      }
    }
    loadChatHistory();
  }, [supabase]);

  // Scroll automático para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSendMessage(textToSend: string) {
    if (!textToSend.trim() || loading) return;

    const userMessage = textToSend;
    setInput('');
    setLoading(true);
    
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Desculpe, tive um probleminha para processar isso. Pode tentar de novo?' }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] lg:h-screen bg-[#0a0a0a]">
      
      {/* HEADER DO CHAT HUMANIZADO */}
      <div className="p-4 lg:p-6 border-b border-[#1f1f1f] bg-[#111111]/50 backdrop-blur-md flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-[#7c3aed]/10 text-[#7c3aed] border border-[#7c3aed]/20">
          <Zap className="w-5 h-5 text-[#7c3aed] fill-[#7c3aed]" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-black text-white tracking-wide uppercase">MENTORIA PACE</h1>
            <span className="flex h-2 w-2 rounded-full bg-[#22c55e] animate-pulse" />
          </div>
          <p className="text-[10px] text-zinc-500 font-medium">Suporte exclusivo com Coach Lucas Zanetti e Dr. Gabriel Fontes</p>
        </div>
      </div>

      {/* ÁREA DE MENSAGENS */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 custom-scrollbar">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-4">
            <div className="p-4 rounded-2xl bg-[#111111] border border-[#1f1f1f] text-[#7c3aed] shadow-xl">
              <Sparkles className="w-6 h-6 animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold">Sua Mentoria de Elite está ativa</h3>
              <p className="text-xs text-zinc-500">Solicite ajustes no seu treino ao Coach Zanetti, tire dúvidas sobre sua dieta com o Dr. Gabriel Fontes ou alinhe suas estratégias semanais.</p>
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="p-2 rounded-xl bg-[#1f1f1f] border border-[#1f1f1f] text-[#7c3aed] shrink-0">
                <Zap className="w-4 h-4 fill-[#7c3aed]" />
              </div>
            )}
            <div className={`p-4 rounded-2xl text-xs max-w-[85%] lg:max-w-[70%] leading-relaxed shadow-md ${
              msg.role === 'user' 
                ? 'bg-[#7c3aed] text-white rounded-tr-none' 
                : 'bg-[#111111] text-zinc-200 border border-[#1f1f1f] rounded-tl-none whitespace-pre-wrap'
            }`}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="p-2 rounded-xl bg-[#7c3aed]/10 border border-[#7c3aed]/20 text-[#7c3aed] shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-start gap-3 justify-start">
            <div className="p-2 rounded-xl bg-[#1f1f1f] border border-[#1f1f1f] text-[#7c3aed] shrink-0">
              <Zap className="w-4 h-4 fill-[#7c3aed]" />
            </div>
            <div className="p-4 rounded-2xl bg-[#111111] border border-[#1f1f1f] rounded-tl-none flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* CHIPS DE SUGESTÃO RÁPIDA */}
      <div className="px-4 lg:px-6 py-2 overflow-x-auto flex gap-2 border-t border-[#1f1f1f]/30 bg-[#0a0a0a]">
        {[
          "Ajuste meu treino de hoje",
          "Dúvida sobre os macros da dieta",
          "Estratégia para quebra de platô",
          "Como acelerar a recuperação muscular"
        ].map((chip) => (
          <button
            key={chip}
            onClick={() => handleSendMessage(chip)}
            className="px-3.5 py-2 rounded-xl bg-[#111111] border border-[#1f1f1f] hover:border-zinc-700 text-[11px] text-zinc-400 font-medium whitespace-nowrap transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* INPUT FIXO NO RODAPÉ */}
      <div className="p-4 lg:p-6 bg-[#0a0a0a] border-t border-[#1f1f1f]">
        <div className="relative flex items-center max-w-4xl mx-auto w-full">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(input)}
            placeholder="Envie sua mensagem para a mesa de especialistas..."
            className="w-full pl-4 pr-14 py-3.5 rounded-xl bg-[#111111] border border-[#1f1f1f] text-white placeholder-zinc-600 focus:outline-none focus:border-[#7c3aed] text-xs transition-colors shadow-inner"
          />
          <button
            onClick={() => handleSendMessage(input)}
            disabled={!input.trim() || loading}
            className="absolute right-2 p-2.5 rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-30 transition-all"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

    </div>
  );
}