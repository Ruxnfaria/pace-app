"use client";

import Image from "next/image";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { CORE_THEMES, type CoreTheme } from "./coreThemes";
import type { CoreRankId } from "@/lib/gamification/coreStages";

type CoreSceneProps = {
  rankId: CoreRankId;
  intensity: number;
  absorbing: boolean;
  reducedMotion: boolean;
};

const BEGINNER_SURFACE = "/core3d/beginner-surface.png";

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
}

function CoreFallback({ theme }: { theme: CoreTheme }) {
  return (
    <div className="relative h-full w-full">
      <Image
        src={theme.fallback}
        alt=""
        fill
        priority
        sizes="(max-width: 640px) 340px, 360px"
        className="object-contain"
      />
    </div>
  );
}

function CoreSphere({ rankId, intensity, absorbing, reducedMotion }: CoreSceneProps) {
  const group = useRef<THREE.Group>(null);
  const sphere = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const fissures = useRef<THREE.MeshBasicMaterial>(null);
  const atmosphere = useRef<THREE.MeshBasicMaterial>(null);
  const pointerTarget = useRef({ x: 0, y: 0 });
  const hovered = useRef(false);
  const sourceTexture = useLoader(THREE.TextureLoader, BEGINNER_SURFACE);
  const theme = CORE_THEMES[rankId];
  const surfaceTexture = useMemo(() => {
    const texture = sourceTexture.clone();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  }, [sourceTexture]);

  useEffect(() => () => surfaceTexture.dispose(), [surfaceTexture]);

  useFrame((state, delta) => {
    const visualPower = Math.min(intensity * theme.power, 1.35);

    if (sphere.current && !reducedMotion) {
      sphere.current.rotation.y += delta * (0.085 + visualPower * 0.018);
      sphere.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.18) * 0.025;
    }

    if (material.current) {
      const pulse = reducedMotion ? 1 : 0.92 + Math.sin(state.clock.elapsedTime * 1.35) * 0.08;
      const target = (0.9 + visualPower * 1.35) * pulse * (absorbing ? 1.55 : hovered.current ? 1.12 : 1);
      material.current.emissiveIntensity = THREE.MathUtils.lerp(
        material.current.emissiveIntensity,
        target,
        0.08,
      );
    }

    if (fissures.current) {
      const energyFlow = reducedMotion
        ? 0.12 + visualPower * 0.1
        : 0.13 + visualPower * 0.11 + Math.sin(state.clock.elapsedTime * 2.1) * 0.035;
      fissures.current.opacity = THREE.MathUtils.lerp(
        fissures.current.opacity,
        Math.min(energyFlow * (absorbing ? 2.25 : 1), 0.62),
        absorbing ? 0.18 : 0.055,
      );
    }

    if (atmosphere.current) {
      const atmosphericPulse = reducedMotion
        ? 0.12 + intensity * 0.1
        : 0.12 + intensity * 0.1 + Math.sin(state.clock.elapsedTime * 1.08) * 0.025;
      atmosphere.current.opacity = THREE.MathUtils.lerp(
        atmosphere.current.opacity,
        atmosphericPulse * (absorbing ? 1.85 : 1),
        0.08,
      );
    }

    if (group.current) {
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        reducedMotion ? 0 : pointerTarget.current.x,
        0.045,
      );
      group.current.rotation.y = THREE.MathUtils.lerp(
        group.current.rotation.y,
        reducedMotion ? 0 : pointerTarget.current.y,
        0.045,
      );
      const breath = reducedMotion
        ? 1
        : 1 + Math.sin(state.clock.elapsedTime * 1.2) * (0.006 + visualPower * 0.004);
      group.current.scale.setScalar(absorbing ? breath * 1.03 : breath);
    }
  });

  return (
    <group
      ref={group}
      onPointerMove={(event) => {
        pointerTarget.current.x = THREE.MathUtils.clamp(-event.point.y * 0.022, -0.055, 0.055);
        pointerTarget.current.y = THREE.MathUtils.clamp(event.point.x * 0.025, -0.065, 0.065);
      }}
      onPointerOver={() => {
        hovered.current = true;
      }}
      onPointerOut={() => {
        hovered.current = false;
        pointerTarget.current = { x: 0, y: 0 };
      }}
    >
      <mesh ref={sphere}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshStandardMaterial
          ref={material}
          map={surfaceTexture}
          bumpMap={surfaceTexture}
          bumpScale={0.045}
          roughness={0.78}
          metalness={0.12}
          emissive={theme.primary}
          emissiveMap={surfaceTexture}
          emissiveIntensity={1}
        />
      </mesh>
      <mesh scale={1.003} rotation={[0, 0.012, 0]}>
        <sphereGeometry args={[1, 72, 56]} />
        <meshBasicMaterial
          ref={fissures}
          map={surfaceTexture}
          color={theme.secondary}
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh scale={1.045}>
        <sphereGeometry args={[1, 64, 48]} />
        <meshBasicMaterial
          ref={atmosphere}
          color={theme.primary}
          side={THREE.BackSide}
          transparent
          opacity={0.12 + intensity * 0.09}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function createOrbitCurve(radiusX: number, radiusZ: number, tiltX: number, tiltZ: number) {
  const points = Array.from({ length: 112 }, (_, index) => {
    const angle = (index / 112) * Math.PI * 2;
    const point = new THREE.Vector3(
      Math.cos(angle) * radiusX,
      0,
      Math.sin(angle) * radiusZ,
    );
    point.applyEuler(new THREE.Euler(tiltX, 0, tiltZ));
    return point;
  });
  return new THREE.CatmullRomCurve3(points, true, "centripetal");
}

function CoreOrbits({ rankId, intensity, absorbing, reducedMotion }: CoreSceneProps) {
  const first = useRef<THREE.Group>(null);
  const second = useRef<THREE.Group>(null);
  const third = useRef<THREE.Group>(null);
  const theme = CORE_THEMES[rankId];
  const curves = useMemo(
    () => [
      createOrbitCurve(1.58, 1.18, 0.48, -0.16),
      createOrbitCurve(1.76, 1.29, -0.62, 0.42),
      createOrbitCurve(1.86, 1.36, 0.76, 0.68),
    ],
    [],
  );

  useFrame((_, delta) => {
    if (reducedMotion) return;
    const boost = absorbing ? 2.2 : 1;
    if (first.current) first.current.rotation.y += delta * 0.08 * boost;
    if (second.current) second.current.rotation.y -= delta * 0.047 * boost;
    if (third.current) third.current.rotation.x += delta * 0.03 * boost;
  });

  const orbit = (curve: THREE.CatmullRomCurve3, opacity: number, thickness: number) => (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 144, thickness * 2.7, 8, true]} />
        <meshBasicMaterial
          color={theme.primary}
          transparent
          opacity={Math.min(opacity * 0.18 * (absorbing ? 1.7 : 1), 0.28)}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh>
        <tubeGeometry args={[curve, 144, thickness, 8, true]} />
        <meshBasicMaterial
          color={theme.secondary}
          transparent
          opacity={Math.min(opacity * (absorbing ? 1.5 : 1), 1)}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );

  return (
    <>
      <group ref={first}>{orbit(curves[0], 0.45 + intensity * 0.28, 0.011)}</group>
      <group ref={second}>{orbit(curves[1], 0.18 + intensity * 0.18, 0.006)}</group>
      {theme.orbitCount === 3 && (
        <group ref={third}>{orbit(curves[2], 0.1 + intensity * 0.16, 0.0045)}</group>
      )}
    </>
  );
}

function CoreParticles({ rankId, intensity, absorbing, reducedMotion }: CoreSceneProps) {
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  const theme = CORE_THEMES[rankId];
  const positions = useMemo(() => {
    const values = new Float32Array(theme.particleCount * 3);
    for (let index = 0; index < theme.particleCount; index += 1) {
      const angle = index * 2.399963;
      const radius = 1.3 + (((index * 31) % 100) / 100) * 0.9;
      values[index * 3] = Math.cos(angle) * radius;
      values[index * 3 + 1] = -1 + (((index * 47) % 100) / 100) * 2;
      values[index * 3 + 2] = Math.sin(angle) * radius;
    }
    return values;
  }, [theme.particleCount]);

  useFrame((state, delta) => {
    if (points.current && !reducedMotion) {
      points.current.rotation.y += delta * (absorbing ? 0.16 : 0.035);
      points.current.rotation.z -= delta * 0.008;
      points.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.035;
    }

    if (material.current) {
      const shimmer = reducedMotion ? 0.72 : 0.55 + Math.sin(state.clock.elapsedTime * 2.4) * 0.22;
      const targetOpacity = Math.min(
        (0.2 + intensity * 0.48) * shimmer * (absorbing ? 1.75 : 1),
        1,
      );
      material.current.opacity = THREE.MathUtils.lerp(
        material.current.opacity,
        targetOpacity,
        absorbing ? 0.18 : 0.07,
      );
      material.current.size = THREE.MathUtils.lerp(
        material.current.size,
        (0.018 + intensity * 0.018) * (absorbing ? 1.8 : 1),
        0.12,
      );
    }
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={material}
        color={theme.secondary}
        size={(0.018 + intensity * 0.016) * (absorbing ? 1.7 : 1)}
        transparent
        opacity={Math.min((0.3 + intensity * 0.42) * (absorbing ? 1.35 : 1), 1)}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}

function createEnergyArc(
  radius: number,
  start: number,
  length: number,
  elevation: number,
  tilt: number,
) {
  const points = Array.from({ length: 24 }, (_, index) => {
    const progress = index / 23;
    const angle = start + progress * length;
    const jitter = Math.sin(progress * Math.PI * 7) * 0.018;
    const point = new THREE.Vector3(
      Math.cos(angle) * (radius + jitter),
      elevation + Math.sin(progress * Math.PI) * 0.09,
      Math.sin(angle) * (radius + jitter),
    );
    point.applyEuler(new THREE.Euler(tilt, 0, -tilt * 0.42));
    return point;
  });
  return new THREE.CatmullRomCurve3(points, false, "centripetal");
}

function EnergyArcs({ rankId, intensity, absorbing, reducedMotion }: CoreSceneProps) {
  const group = useRef<THREE.Group>(null);
  const materials = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
  const theme = CORE_THEMES[rankId];
  const arcs = useMemo(
    () => [
      createEnergyArc(1.11, 0.2, 0.82, 0.28, 0.34),
      createEnergyArc(1.14, 2.45, 0.68, -0.36, -0.48),
      createEnergyArc(1.09, 4.45, 0.52, 0.02, 0.68),
    ],
    [],
  );

  useFrame((state, delta) => {
    if (group.current && !reducedMotion) {
      group.current.rotation.y += delta * (absorbing ? 0.22 : 0.035);
      group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.34) * 0.035;
    }

    materials.current.forEach((arcMaterial, index) => {
      if (!arcMaterial) return;
      const flicker = reducedMotion
        ? 0.7
        : 0.58 + Math.sin(state.clock.elapsedTime * (2.8 + index * 0.47) + index * 1.9) * 0.32;
      arcMaterial.opacity = Math.max(
        0.04,
        Math.min((0.1 + intensity * 0.2) * flicker * (absorbing ? 2.35 : 1), 0.88),
      );
    });
  });

  return (
    <group ref={group}>
      {arcs.map((arc, index) => (
        <mesh key={index}>
          <tubeGeometry args={[arc, 56, 0.0065, 5, false]} />
          <meshBasicMaterial
            ref={(value) => {
              materials.current[index] = value;
            }}
            color={theme.secondary}
            transparent
            opacity={0.18}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function EnergyFlash({ rankId, intensity, absorbing, reducedMotion }: CoreSceneProps) {
  const shell = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const theme = CORE_THEMES[rankId];

  useFrame((state) => {
    const idlePulse = reducedMotion ? 1 : 0.9 + Math.sin(state.clock.elapsedTime * 1.3) * 0.1;
    if (shell.current) {
      const target = (0.025 + intensity * 0.025) * idlePulse + (absorbing ? 0.18 : 0);
      shell.current.opacity = THREE.MathUtils.lerp(shell.current.opacity, target, absorbing ? 0.22 : 0.07);
    }
    if (light.current) {
      const target = (1.5 + intensity * 2.2) * idlePulse + (absorbing ? 7.5 : 0);
      light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, target, absorbing ? 0.2 : 0.065);
    }
  });

  return (
    <>
      <pointLight ref={light} position={[0, 0, 2.05]} color={theme.secondary} intensity={2} distance={7} />
      <mesh scale={1.13}>
        <sphereGeometry args={[1, 48, 36]} />
        <meshBasicMaterial
          ref={shell}
          color={theme.secondary}
          side={THREE.BackSide}
          transparent
          opacity={0.04}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

function SceneContent(props: CoreSceneProps) {
  const theme = CORE_THEMES[props.rankId];
  return (
    <>
      <ambientLight intensity={0.16} />
      <directionalLight position={[-3, 3.5, 4]} intensity={2.4} color="#ffd2ad" />
      <pointLight position={[2.4, -1.2, 2.8]} intensity={3.2} color={theme.primary} />
      <pointLight position={[-2.2, -1.5, -1]} intensity={1.7} color={theme.primary} />
      <CoreOrbits {...props} />
      <CoreSphere {...props} />
      <EnergyArcs {...props} />
      <CoreParticles {...props} />
      <EnergyFlash {...props} />
    </>
  );
}

function CoreScene(props: CoreSceneProps) {
  const hasWebGL = useMemo(() => supportsWebGL(), []);
  const theme = CORE_THEMES[props.rankId];

  if (!hasWebGL) return <CoreFallback theme={theme} />;

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 4.15], fov: 38, near: 0.1, far: 20 }}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      frameloop={props.reducedMotion ? "demand" : "always"}
      style={{ background: "transparent", touchAction: "pan-y" }}
    >
      <SceneContent {...props} />
    </Canvas>
  );
}

export default memo(CoreScene);
