"use client";

import Image from "next/image";
import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { CORE_VISUAL_THEMES } from "./coreVisualThemes";
import type { CoreRankId } from "@/lib/gamification/coreStages";

type CoreSceneProps = { rankId: CoreRankId; intensity: number; absorbing: boolean; reducedMotion: boolean };

const noiseFunctions = `
float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.05;a*=.5;}return v;}`;

const vertexShader = `
uniform float uTime;uniform float uComplexity;varying vec3 vNormalWorld;varying vec3 vWorldPosition;varying vec3 vObjectPosition;
${noiseFunctions}
void main(){vObjectPosition=position;float terrain=fbm(normalize(position)*4.2+uTime*.015);vec3 displaced=position+normal*((terrain-.48)*.105*uComplexity);vec4 world=modelMatrix*vec4(displaced,1.);vWorldPosition=world.xyz;vNormalWorld=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*world;}`;

const fragmentShader = `
uniform float uTime;uniform float uIntensity;uniform vec3 uPrimary;uniform vec3 uSecondary;uniform vec3 uRock;varying vec3 vNormalWorld;varying vec3 vWorldPosition;varying vec3 vObjectPosition;
${noiseFunctions}
void main(){vec3 p=normalize(vObjectPosition);float large=fbm(p*3.8),fine=fbm(p*12.+4.),field=fbm(p*5.4+vec3(1.7,4.1,2.3)),detail=fbm(p*11.5-vec3(2.6,1.2,3.7));float cracks=1.-smoothstep(.025,.105,abs(field-.515));cracks*=smoothstep(.38,.72,detail+large*.28);cracks=pow(cracks,1.35);vec3 n=normalize(vNormalWorld),viewDir=normalize(cameraPosition-vWorldPosition),lightDir=normalize(vec3(-.6,.75,.8));float diffuse=max(dot(n,lightDir),0.),rim=pow(1.-max(dot(n,viewDir),0.),2.35),pulse=.86+.14*sin(uTime*1.45+large*5.);vec3 stone=uRock*(.55+diffuse*.72+large*.32+fine*.12);vec3 lava=mix(uPrimary,uSecondary,detail)*cracks*(1.4+uIntensity*2.8)*pulse;vec3 atmosphere=uPrimary*rim*(.32+uIntensity*.82);gl_FragColor=vec4(stone+lava+atmosphere,1.);}`;

function CoreSphere({ rankId, intensity, absorbing, reducedMotion }: CoreSceneProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const target = useRef({ x: 0, y: 0 });
  const theme = CORE_VISUAL_THEMES[rankId];
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uComplexity: { value: theme.surfaceComplexity },
      uPrimary: { value: new THREE.Color(theme.primary) },
      uSecondary: { value: new THREE.Color(theme.secondary) },
      uRock: { value: new THREE.Color(theme.rock) },
    }),
    [intensity, theme],
  );

  useFrame((state, delta) => {
    if (material.current) {
      material.current.uniforms.uTime.value = state.clock.elapsedTime;
      material.current.uniforms.uIntensity.value = THREE.MathUtils.lerp(
        material.current.uniforms.uIntensity.value,
        absorbing ? Math.min(intensity + 0.45, 1.5) : intensity,
        0.06,
      );
    }

    if (mesh.current && !reducedMotion) {
      mesh.current.rotation.y += delta * (0.075 + intensity * 0.03);
    }

    if (group.current) {
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        reducedMotion ? 0 : target.current.x,
        0.035,
      );
      group.current.rotation.y = THREE.MathUtils.lerp(
        group.current.rotation.y,
        reducedMotion ? 0 : target.current.y,
        0.035,
      );
      const breath = reducedMotion
        ? 1
        : 1 + Math.sin(state.clock.elapsedTime * 1.35) * (0.008 + intensity * 0.006);
      group.current.scale.setScalar(absorbing ? breath * 1.045 : breath);
    }
  });

  return (
    <group
      ref={group}
      onPointerMove={(event) => {
        target.current.x = THREE.MathUtils.clamp(-event.point.y * 0.025, -0.07, 0.07);
        target.current.y = THREE.MathUtils.clamp(event.point.x * 0.025, -0.09, 0.09);
      }}
      onPointerOut={() => {
        target.current = { x: 0, y: 0 };
      }}
    >
      <mesh ref={mesh}>
        <sphereGeometry args={[1, 64, 48]} />
        <shaderMaterial
          ref={material}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
        />
      </mesh>
      <mesh scale={1.09}>
        <sphereGeometry args={[1, 40, 30]} />
        <meshBasicMaterial
          color={theme.primary}
          transparent
          opacity={0.055 + intensity * 0.05}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function createOrbitCurve(rx: number, ry: number, tiltX: number, tiltZ: number) {
  const points = Array.from({ length: 96 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2;
    const point = new THREE.Vector3(Math.cos(angle) * rx, 0, Math.sin(angle) * ry);
    point.applyEuler(new THREE.Euler(tiltX, 0, tiltZ));
    return point;
  });
  return new THREE.CatmullRomCurve3(points, true, "centripetal");
}

function CoreOrbits({ rankId, intensity, reducedMotion }: Omit<CoreSceneProps, "absorbing">) {
  const first = useRef<THREE.Group>(null);
  const second = useRef<THREE.Group>(null);
  const third = useRef<THREE.Group>(null);
  const theme = CORE_VISUAL_THEMES[rankId];
  const curves = useMemo(
    () => [
      createOrbitCurve(1.62, 1.16, 0.48, -0.18),
      createOrbitCurve(1.78, 1.28, -0.64, 0.42),
      createOrbitCurve(1.88, 1.37, 0.82, 0.76),
    ],
    [],
  );

  useFrame((_, delta) => {
    if (reducedMotion) return;
    if (first.current) first.current.rotation.y += delta * 0.085;
    if (second.current) second.current.rotation.y -= delta * 0.052;
    if (third.current) third.current.rotation.x += delta * 0.034;
  });

  const orbit = (curve: THREE.CatmullRomCurve3, opacity: number, thickness: number) => (
    <mesh>
      <tubeGeometry args={[curve, 128, thickness, 8, true]} />
      <meshBasicMaterial
        color={theme.primary}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );

  return (
    <>
      <group ref={first}>{orbit(curves[0], 0.48 + intensity * 0.34, 0.012)}</group>
      <group ref={second}>{orbit(curves[1], 0.2 + intensity * 0.2, 0.007)}</group>
      {theme.orbitCount === 3 && (
        <group ref={third}>{orbit(curves[2], 0.12 + intensity * 0.18, 0.005)}</group>
      )}
    </>
  );
}

function CoreParticles({ rankId, intensity, reducedMotion }: Omit<CoreSceneProps, "absorbing">) {
  const points = useRef<THREE.Points>(null);
  const theme = CORE_VISUAL_THEMES[rankId];
  const positions = useMemo(() => {
    const values = new Float32Array(theme.particleCount * 3);
    for (let index = 0; index < theme.particleCount; index += 1) {
      const angle = index * 2.399963;
      const radius = 1.38 + (((index * 37) % 100) / 100) * 0.75;
      values[index * 3] = Math.cos(angle) * radius;
      values[index * 3 + 1] = -0.9 + (((index * 53) % 100) / 100) * 1.8;
      values[index * 3 + 2] = Math.sin(angle) * radius;
    }
    return values;
  }, [theme.particleCount]);

  useFrame((state, delta) => {
    if (!points.current || reducedMotion) return;
    points.current.rotation.y += delta * 0.028;
    points.current.position.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.04;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={theme.secondary}
        size={0.025 + intensity * 0.018}
        transparent
        opacity={0.34 + intensity * 0.42}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
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

function CoreScene(props: CoreSceneProps) {
  const webGL = useMemo(() => supportsWebGL(), []);
  if (!webGL) {
    return (
      <div className="relative h-full w-full">
        <Image
          src="/cores/bronze-3.png"
          alt="Núcleo energético"
          fill
          sizes="300px"
          className="object-contain"
        />
      </div>
    );
  }

  const theme = CORE_VISUAL_THEMES[props.rankId];
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 4.6], fov: 42, near: 0.1, far: 20 }}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      frameloop={props.reducedMotion ? "demand" : "always"}
      style={{ background: "transparent", touchAction: "pan-y" }}
    >
      <ambientLight intensity={0.08} />
      <pointLight position={[-2.5, 2.6, 3]} intensity={2.4} color={theme.secondary} />
      <CoreOrbits
        rankId={props.rankId}
        intensity={props.intensity}
        reducedMotion={props.reducedMotion}
      />
      <CoreSphere {...props} />
      <CoreParticles
        rankId={props.rankId}
        intensity={props.intensity}
        reducedMotion={props.reducedMotion}
      />
    </Canvas>
  );
}

export default memo(CoreScene);
