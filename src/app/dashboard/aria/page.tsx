'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, Send, Sparkles, Zap, Paperclip, X } from 'lucide-react';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string; // Campo novo para renderizar a imagem no chat
}

export default function AriaChatPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Estados novos para gerenciar o upload de imagem
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carrega o histórico de mensagens salvas ao entrar na tela
  useEffect(() => {
    async function loadChatHistory() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('chat_messages')
          .select('sender, content, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(25);
        
        if (data) {
          // Nota: Por enquanto o histórico puxa o texto puro do banco.
          setMessages(data.map(m => ({
            role: m.sender as 'user' | 'assistant',
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

  // Manipula a seleção da foto
  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  }

  // Remove a foto selecionada antes de enviar
  function handleRemoveImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSendMessage(textToSend: string) {
    if (!textToSend.trim() && !imageFile || loading) return;

    const userMessage = textToSend;
    const currentPreview = imagePreview;
    
    setInput('');
    setLoading(true);
    
    // Mostra imediatamente na tela o balão do usuário (com texto e preview se houver)
    setMessages((prev) => [...prev, { 
      role: 'user', 
      content: userMessage, 
      imageUrl: currentPreview || undefined 
    }]);

    // Reseta o estado do input de imagem
    setImageFile(null);
    setImagePreview(null);

    try {
      let uploadedImageUrl = '';

      // Se houver imagem selecionada, faz o upload para o Bucket do Supabase antes de chamar a API
      if (imageFile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const fileExt = imageFile.name.split('.').pop();
          const fileName = `${user.id}/${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('chat-attachments')
            .upload(fileName, imageFile);

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('chat-attachments')
              .getPublicUrl(fileName);
            uploadedImageUrl = publicUrl;
          } else {
            console.error('Erro ao fazer upload da imagem:', uploadError);
          }
        }
      }

      // Envia os dados para a API do Chat (incluindo a URL da imagem)
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage,
          imageUrl: uploadedImageUrl // Enviando o link da foto para o backend processar multimodamente
        }),
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
              <p className="text-xs text-zinc-500">Solicite ajustes no seu treino ao Coach Zanetti, envie fotos da sua evolução, ou alinhe as calorias com o Dr. Gabriel Fontes.</p>
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
            <div className={`p-4 rounded-2xl text-xs max-w-[85%] lg:max-w-[70%] leading-relaxed shadow-md flex flex-col ${
              msg.role === 'user' 
                ? 'bg-[#7c3aed] text-white rounded-tr-none' 
                : 'bg-[#111111] text-zinc-200 border border-[#1f1f1f] rounded-tl-none whitespace-pre-wrap'
            }`}>
              {/* RENDERIZA A FOTO CASO EXISTA NA MENSAGEM */}
              {msg.imageUrl && (
                <img 
                  src={msg.imageUrl} 
                  alt="Anexo de Evolução" 
                  className="max-w-[200px] h-auto rounded-lg mb-2.5 border border-black/20 shadow-sm"
                />
              )}
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
          "Avalie os pontos fracos do meu shape",
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

      {/* INPUT FIXO NO RODAPÉ COM MINI PREVIEW E BOTÃO DE ANEXO */}
      <div className="p-4 lg:p-6 bg-[#0a0a0a] border-t border-[#1f1f1f] space-y-3">
        
        {/* MINI PREVIEW DA FOTO SELECIONADA ACIMA DO INPUT */}
        {imagePreview && (
          <div className="relative inline-block max-w-4xl mx-auto pl-12">
            <div className="relative rounded-lg overflow-hidden border border-[#1f1f1f] bg-[#111111] p-1">
              <img src={imagePreview} alt="Preview" className="h-14 w-14 object-cover rounded-md" />
              <button 
                onClick={handleRemoveImage}
                className="absolute -top-1 -right-1 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        <div className="relative flex items-center max-w-4xl mx-auto w-full gap-2">
          {/* INPUT FILE OCULTO */}
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleImageChange} 
            className="hidden" 
          />
          
          {/* BOTÃO DE CLIP/ANEXAR IMAGEM */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="p-3.5 rounded-xl bg-[#111111] border border-[#1f1f1f] text-zinc-500 hover:text-[#7c3aed] hover:border-[#7c3aed]/50 transition-all flex items-center justify-center shrink-0 disabled:opacity-30"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <div className="relative flex-1 flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(input)}
              placeholder={imageFile ? "Adicione um comentário ou envie a foto..." : "Envie sua mensagem para a mesa de especialistas..."}
              className="w-full pl-4 pr-14 py-3.5 rounded-xl bg-[#111111] border border-[#1f1f1f] text-white placeholder-zinc-600 focus:outline-none focus:border-[#7c3aed] text-xs transition-colors shadow-inner"
            />
            <button
              onClick={() => handleSendMessage(input)}
              disabled={(!input.trim() && !imageFile) || loading}
              className="absolute right-2 p-2.5 rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-30 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}