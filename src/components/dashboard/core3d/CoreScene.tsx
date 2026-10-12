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
const BASELINE_INTENSITY = 0.58;
const FISSURE_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FISSURE_FRAGMENT_SHADER = `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec3 surface = texture2D(uMap, vUv).rgb;
    float luminance = dot(surface, vec3(0.2126, 0.7152, 0.0722));
    float warmth = max(surface.r - surface.b * 0.9, 0.0);
    float fissure = smoothstep(0.24, 0.68, luminance) * smoothstep(0.08, 0.42, warmth);
    float flow = 0.86 + sin(vUv.y * 21.0 - vUv.x * 9.0 + uTime * 1.7) * 0.14;
    float alpha = fissure * flow * uOpacity;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor * (0.8 + fissure * 0.65), alpha);
  }
`;

function getVisualPower(intensity: number, theme: CoreTheme) {
  return Math.min(BASELINE_INTENSITY + THREE.MathUtils.clamp(intensity, 0, 1) * 0.72 * theme.power, 1.42);
}

function getEnergyGainEnvelope(progress: number) {
  if (progress <= 0.22) return progress / 0.22;
  if (progress <= 0.48) return 1;
  return Math.max(0, 1 - (progress - 0.48) / 0.52);
}

function createGlowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const alpha = Math.pow(Math.max(0, 1 - distance), 2.4);
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

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
  const surface = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const fissures = useRef<THREE.ShaderMaterial>(null);
  const pointerTarget = useRef({ x: 0, y: 0 });
  const hovered = useRef(false);
  const gainStartedAt = useRef<number | null>(null);
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
  const fissureUniforms = useMemo(
    () => ({
      uMap: { value: surfaceTexture },
      uColor: { value: new THREE.Color(theme.secondary) },
      uOpacity: { value: 0.34 },
      uTime: { value: 0 },
    }),
    [surfaceTexture, theme.secondary],
  );

  useEffect(() => () => surfaceTexture.dispose(), [surfaceTexture]);

  useFrame((state, delta) => {
    const visualPower = getVisualPower(intensity, theme);
    if (absorbing && gainStartedAt.current === null) gainStartedAt.current = state.clock.elapsedTime;
    if (!absorbing) gainStartedAt.current = null;
    const gainProgress = gainStartedAt.current === null
      ? 0
      : Math.min((state.clock.elapsedTime - gainStartedAt.current) / 1.1, 1);
    const gainEnvelope = absorbing ? getEnergyGainEnvelope(gainProgress) : 0;

    if (surface.current && !reducedMotion) {
      surface.current.rotation.y += delta * (0.13 + visualPower * 0.025);
      surface.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.18) * 0.025;
    }

    if (material.current) {
      const pulse = reducedMotion ? 1 : 0.9 + Math.sin(state.clock.elapsedTime * 1.55) * 0.1;
      const target = (0.42 + visualPower * 0.42) * pulse * (1 + gainEnvelope * 0.6) * (hovered.current ? 1.08 : 1);
      material.current.emissiveIntensity = THREE.MathUtils.lerp(
        material.current.emissiveIntensity,
        target,
        0.08,
      );
    }

    if (fissures.current) {
      const energyFlow = reducedMotion
        ? 0.2 + visualPower * 0.12
        : 0.22 + visualPower * 0.14 + Math.sin(state.clock.elapsedTime * 1.65) * 0.055;
      fissures.current.uniforms.uOpacity.value = THREE.MathUtils.lerp(
        fissures.current.uniforms.uOpacity.value,
        Math.min(energyFlow * (1 + gainEnvelope * 0.82), 0.72),
        absorbing ? 0.18 : 0.055,
      );
      fissures.current.uniforms.uTime.value = reducedMotion ? 0 : state.clock.elapsedTime;
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
        : 1 + Math.sin(state.clock.elapsedTime * 1.45) * (0.007 + visualPower * 0.004);
      const impactScale = reducedMotion ? 1 : 1 + gainEnvelope * 0.03;
      group.current.scale.setScalar(1.24 * breath * impactScale);
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
      <group ref={surface}>
        <mesh renderOrder={1}>
          <sphereGeometry args={[1, 96, 64]} />
          <meshStandardMaterial
            ref={material}
            map={surfaceTexture}
            bumpMap={surfaceTexture}
            bumpScale={0.065}
            color="#d8d2cb"
            roughness={0.88}
            metalness={0.04}
            emissive={theme.primary}
            emissiveMap={surfaceTexture}
            emissiveIntensity={0.7}
            transparent={false}
            opacity={1}
            alphaTest={0}
            blending={THREE.NormalBlending}
            depthWrite
            depthTest
          />
        </mesh>
        <mesh scale={1.002} renderOrder={2}>
          <sphereGeometry args={[1, 72, 56]} />
          <shaderMaterial
            ref={fissures}
            uniforms={fissureUniforms}
            vertexShader={FISSURE_VERTEX_SHADER}
            fragmentShader={FISSURE_FRAGMENT_SHADER}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            depthTest
            toneMapped={false}
          />
        </mesh>
      </group>
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
  const firstEnergy = useRef<THREE.Mesh>(null);
  const secondEnergy = useRef<THREE.Mesh>(null);
  const theme = CORE_THEMES[rankId];
  const visualPower = getVisualPower(intensity, theme);
  const curves = useMemo(
    () => [
      createOrbitCurve(1.68, 1.3, 0.48, -0.16),
      createOrbitCurve(1.84, 1.42, -0.62, 0.42),
      createOrbitCurve(1.96, 1.5, 0.76, 0.68),
    ],
    [],
  );

  useFrame((state, delta) => {
    const boost = absorbing ? 2.2 : 1;
    if (!reducedMotion) {
      if (first.current) first.current.rotation.y += delta * 0.095 * boost;
      if (second.current) second.current.rotation.y -= delta * 0.055 * boost;
      if (third.current) third.current.rotation.x += delta * 0.034 * boost;
    }
    if (firstEnergy.current && !reducedMotion) {
      firstEnergy.current.position.copy(curves[0].getPointAt((state.clock.elapsedTime * 0.075) % 1));
    }
    if (secondEnergy.current && !reducedMotion) {
      const orbitProgress = ((0.55 - state.clock.elapsedTime * 0.048) % 1 + 1) % 1;
      secondEnergy.current.position.copy(curves[1].getPointAt(orbitProgress));
    }
  });

  const orbit = (curve: THREE.CatmullRomCurve3, opacity: number, thickness: number) => (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 144, thickness * 1.9, 8, true]} />
        <meshBasicMaterial
          color={theme.primary}
          transparent
          opacity={Math.min(opacity * 0.11 * (absorbing ? 1.7 : 1), 0.18)}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest
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
          depthTest
          toneMapped={false}
        />
      </mesh>
    </group>
  );

  return (
    <>
      <group ref={first}>
        {orbit(curves[0], 0.58 + visualPower * 0.22, 0.0085)}
        <mesh ref={firstEnergy}>
          <sphereGeometry args={[0.028, 10, 8]} />
          <meshBasicMaterial color={theme.secondary} toneMapped={false} />
        </mesh>
      </group>
      <group ref={second}>
        {orbit(curves[1], 0.3 + visualPower * 0.15, 0.005)}
        <mesh ref={secondEnergy}>
          <sphereGeometry args={[0.018, 8, 6]} />
          <meshBasicMaterial color={theme.secondary} toneMapped={false} />
        </mesh>
      </group>
      {theme.orbitCount === 3 && (
        <group ref={third}>{orbit(curves[2], 0.14 + visualPower * 0.1, 0.0035)}</group>
      )}
    </>
  );
}

function CoreParticles({ rankId, intensity, absorbing, reducedMotion }: CoreSceneProps) {
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  const theme = CORE_THEMES[rankId];
  const visualPower = getVisualPower(intensity, theme);
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
        (0.38 + visualPower * 0.32) * shimmer * (absorbing ? 1.75 : 1),
        1,
      );
      material.current.opacity = THREE.MathUtils.lerp(
        material.current.opacity,
        targetOpacity,
        absorbing ? 0.18 : 0.07,
      );
      material.current.size = THREE.MathUtils.lerp(
        material.current.size,
        (0.022 + visualPower * 0.014) * (absorbing ? 1.8 : 1),
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
        size={(0.022 + visualPower * 0.014) * (absorbing ? 1.7 : 1)}
        transparent
        opacity={Math.min((0.38 + visualPower * 0.3) * (absorbing ? 1.35 : 1), 1)}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        depthTest
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
  const visualPower = getVisualPower(intensity, theme);
  const arcs = useMemo(
    () => [
      createEnergyArc(1.36, 0.2, 0.82, 0.28, 0.34),
      createEnergyArc(1.39, 2.45, 0.68, -0.36, -0.48),
      createEnergyArc(1.34, 4.45, 0.52, 0.02, 0.68),
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
      const wave = Math.sin(state.clock.elapsedTime * (3.4 + index * 0.73) + index * 2.1);
      const discharge = reducedMotion ? 0.22 : Math.pow(Math.max(0, wave), 18);
      arcMaterial.opacity = Math.max(
        reducedMotion ? 0.045 : 0,
        Math.min((0.28 + visualPower * 0.38) * (absorbing ? 1 : discharge), 0.94),
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
            depthTest
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function EnergyFlash({ rankId, intensity, absorbing, reducedMotion }: CoreSceneProps) {
  const glow = useRef<THREE.Sprite>(null);
  const glowMaterial = useRef<THREE.SpriteMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const theme = CORE_THEMES[rankId];
  const visualPower = getVisualPower(intensity, theme);
  const glowTexture = useMemo(() => createGlowTexture(), []);

  useEffect(() => () => glowTexture.dispose(), [glowTexture]);

  useFrame((state) => {
    const idlePulse = reducedMotion ? 1 : 0.9 + Math.sin(state.clock.elapsedTime * 1.3) * 0.1;
    if (glowMaterial.current) {
      const target = (0.07 + visualPower * 0.035) * idlePulse + (absorbing ? 0.22 : 0);
      glowMaterial.current.opacity = THREE.MathUtils.lerp(
        glowMaterial.current.opacity,
        target,
        absorbing ? 0.22 : 0.07,
      );
    }
    if (glow.current) {
      const targetScale = 3.35 + visualPower * 0.12 + (absorbing && !reducedMotion ? 0.34 : 0);
      const currentScale = glow.current.scale.x;
      const nextScale = THREE.MathUtils.lerp(currentScale, targetScale, absorbing ? 0.16 : 0.055);
      glow.current.scale.set(nextScale, nextScale, 1);
    }
    if (light.current) {
      const target = (2.5 + visualPower * 2.6) * idlePulse + (absorbing ? 8.5 : 0);
      light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, target, absorbing ? 0.2 : 0.065);
    }
  });

  return (
    <>
      <pointLight ref={light} position={[0, 0, 2.05]} color={theme.secondary} intensity={2} distance={7} />
      <sprite ref={glow} position={[0, 0, -0.72]} scale={[3.4, 3.4, 1]} renderOrder={0}>
        <spriteMaterial
          ref={glowMaterial}
          map={glowTexture}
          color={theme.secondary}
          transparent
          opacity={0.04}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest
          toneMapped={false}
        />
      </sprite>
    </>
  );
}

function SceneContent(props: CoreSceneProps) {
  const theme = CORE_THEMES[props.rankId];
  return (
    <>
      <ambientLight intensity={0.12} />
      <hemisphereLight args={["#ffd8b8", "#080403", 0.62]} />
      <directionalLight position={[-3, 3.5, 4]} intensity={3.1} color="#ffe2c8" />
      <pointLight position={[2.4, -1.2, 2.8]} intensity={2.1} color={theme.primary} />
      <pointLight position={[-2.2, -1.5, -1]} intensity={1.1} color={theme.primary} />
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
