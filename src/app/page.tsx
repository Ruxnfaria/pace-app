'use client';

import Link from 'next/link';
import { Zap, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] text-white p-6 text-center">
      
      {/* Elemento Visual de Fundo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-[#7c3aed]/10 blur-[120px] rounded-full pointer-events-none" />

          <div className="max-w-md space-y-6 relative z-10">
        {/* Logo */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center gap-2"
        >
          <Zap className="w-8 h-8 text-[#7c3aed] fill-[#7c3aed]" />
          <span className="text-3xl font-black tracking-tight">PACE</span>
        </motion.div>

        {/* Textos Humanizados de Alta Conversão */}
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl uppercase">
            Assessoria Fitness de Elite
          </h1>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
            Treinos de alta performance, planejamentos macronutricionais e acompanhamento exclusivo direto com o nosso time de especialistas.
          </p>
        </div>

        {/* Botão CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="pt-2"
        >
          <Link 
            href="/login" 
            className="group flex items-center justify-center gap-2 w-full sm:w-fit mx-auto py-3.5 px-6 rounded-xl bg-[#7c3aed] text-white text-xs font-black hover:bg-[#6d28d9] transition-all shadow-lg shadow-purple-500/10 uppercase tracking-wider"
          >
            Acessar Plataforma 
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </motion.div>
      </div>

    </div>
  );
}