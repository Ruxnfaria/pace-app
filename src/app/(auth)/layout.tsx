'use client';

import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] text-white p-4">
      {/* Logo com efeito FadeIn e SlideDown */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-2 mb-8"
      >
        <Zap className="w-8 h-8 text-[#7c3aed] fill-[#7c3aed]" />
        <span className="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
          PACE
        </span>
      </motion.div>

      {/* Card Central com efeito SlideUp */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="w-full max-w-md p-8 rounded-2xl bg-[#111111] border border-[#1f1f1f] shadow-2xl"
      >
        {children}
      </motion.div>
    </div>
  );
}