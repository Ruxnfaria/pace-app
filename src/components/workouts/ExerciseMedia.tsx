"use client";

import { CircleAlert, LoaderCircle, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { resolveExerciseMedia, type ExerciseMedia as MediaState } from "@/lib/workouts/media-provider";

export function ExerciseMedia({ exerciseId, exerciseName }: { exerciseId: string; exerciseName: string }) {
  const [media, setMedia] = useState<MediaState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    resolveExerciseMedia({ exerciseId, exerciseName })
      .then((result) => { if (active) setMedia(result); })
      .catch(() => { if (active) setMedia({ status: "error", message: "Demonstração indisponível" }); });
    return () => { active = false; };
  }, [exerciseId, exerciseName]);

  if (media.status === "available") return (
    <video className="h-full w-full object-cover" src={media.videoUrl} poster={media.posterUrl}
      aria-label={media.alt} autoPlay muted loop playsInline controls={false} />
  );
  return (
    <div className="relative flex h-full min-h-52 w-full items-center justify-center overflow-hidden bg-[#0d0d14] px-6 text-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(124,58,237,0.18),transparent_48%)]" />
      <div className="relative flex flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-violet-400/20 bg-violet-400/[0.08] text-violet-300">
          {media.status === "loading" ? <LoaderCircle className="h-5 w-5 animate-spin" />
            : media.status === "error" ? <CircleAlert className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
        </div>
        <p className="mt-4 text-sm font-bold text-zinc-200">{media.status === "loading" ? "Preparando demonstração" : media.message}</p>
        <p className="mt-1 text-xs text-zinc-600">{exerciseName}</p>
      </div>
    </div>
  );
}
