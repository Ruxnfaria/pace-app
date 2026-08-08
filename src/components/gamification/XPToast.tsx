"use client";

import { Zap } from "lucide-react";

interface XPToastProps {
  xp: number;
}

export function XPToast({
  xp,
}: XPToastProps) {
  return (
    <div className="
      fixed
      top-8
      left-1/2
      -translate-x-1/2
      z-[999]
      animate-in
      fade-in
      zoom-in-95
      duration-300
    ">
      <div
        className="
          rounded-3xl
          border
          border-[#7c3aed]/30
          bg-[#111111]/95
          backdrop-blur-xl
          px-7
          py-5
          shadow-2xl
          shadow-purple-900/30
        "
      >
        <div className="flex items-center gap-4">
          <div
            className="
              flex
              h-14
              w-14
              items-center
              justify-center
              rounded-2xl
              bg-[#7c3aed]/15
            "
          >
            <Zap
              className="
                h-7
                w-7
                fill-[#a855f7]
                text-[#a855f7]
              "
            />
          </div>

          <div>
            <p
              className="
                text-[10px]
                uppercase
                tracking-[0.22em]
                font-black
                text-zinc-500
              "
            >
              Energia de evolução
            </p>

            <h2
              className="
                text-3xl
                font-black
                text-white
              "
            >
              +{xp} XP
            </h2>

            <p
              className="
                text-sm
                text-zinc-400
              "
            >
              Seu Núcleo ficou mais forte.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}