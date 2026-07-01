import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface ExerciseDbExercise {
  exerciseId: string;
  name: string;
  gifUrl: string;
  equipments?: string[];
}

function matchesEquipment(
  exercises: ExerciseDbExercise[],
  keyword: string
): ExerciseDbExercise | undefined {
  return exercises.find((ex) =>
    ex.equipments?.some((eq) => eq.toLowerCase().includes(keyword))
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');

  if (!name) {
    return NextResponse.json({ gifUrl: '', error: 'Nome não fornecido' });
  }

  const lower = name.toLowerCase();
  const clean = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let targetMuscle = 'biceps';

  if (clean.includes('rosca') || clean.includes('biceps') || clean.includes('braco')) {
    targetMuscle = 'biceps';
  } else if (clean.includes('triceps') || clean.includes('mergulho') || clean.includes('corda') || clean.includes('polia')) {
    targetMuscle = 'triceps';
  } else if (clean.includes('supino') || clean.includes('peito') || clean.includes('flexao')) {
    targetMuscle = 'pectorals';
  } else if (clean.includes('ombro') || clean.includes('elevacao') || clean.includes('desenvolvimento')) {
    targetMuscle = 'delts';
  } else if (clean.includes('agachamento') || clean.includes('perna') || clean.includes('leg')) {
    targetMuscle = 'quads';
  }

  try {
    const response = await fetch(
      `https://oss.exercisedb.dev/api/v1/exercises?targetMuscles=${encodeURIComponent(targetMuscle)}&limit=20`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return NextResponse.json({
        gifUrl: '',
        error: `ExerciseDB: HTTP ${response.status}`,
      });
    }

    const json = await response.json();
    const data: ExerciseDbExercise[] = json?.data;

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ gifUrl: '', error: 'Nenhum exercício localizado.' });
    }

    let chosenExercise = data[0];

    if (clean.includes('barra')) {
      chosenExercise = matchesEquipment(data, 'barbell') || data[0];
    } else if (clean.includes('halter') || clean.includes('alternada')) {
      chosenExercise = matchesEquipment(data, 'dumbbell') || data[0];
    } else if (clean.includes('corda')) {
      chosenExercise = matchesEquipment(data, 'rope') || data[0];
    } else if (clean.includes('polia')) {
      chosenExercise = matchesEquipment(data, 'cable') || data[0];
    }

    if (chosenExercise?.gifUrl) {
      return NextResponse.json({ gifUrl: chosenExercise.gifUrl });
    }

    return NextResponse.json({ gifUrl: '', error: 'GIF não disponível para este exercício.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ gifUrl: '', error: message });
  }
}
