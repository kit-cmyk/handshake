"use client";

import dynamic from "next/dynamic";

// Three.js / WebGL can only run in the browser, so load these client-side only.
const ShaderGradientCanvas = dynamic(
  () => import("@shadergradient/react").then((m) => m.ShaderGradientCanvas),
  { ssr: false }
);
const ShaderGradient = dynamic(
  () => import("@shadergradient/react").then((m) => m.ShaderGradient),
  { ssr: false }
);

export function AuthBackground() {
  return (
    <ShaderGradientCanvas
      style={{ width: "100%", height: "100%" }}
      lazyLoad={undefined}
      fov={100}
      pixelDensity={1}
      pointerEvents="auto"
    >
      <ShaderGradient
        animate="on"
        type="sphere"
        wireframe={false}
        shader="defaults"
        uTime={8}
        uSpeed={0.3}
        uStrength={1.5}
        uDensity={1.5}
        uFrequency={0}
        uAmplitude={0}
        positionX={0.1}
        positionY={0}
        positionZ={0}
        rotationX={50}
        rotationY={0}
        rotationZ={-60}
        color1="#242880"
        color2="#8d7dca"
        color3="#212121"
        reflection={0.1}
        // View (camera) props
        cAzimuthAngle={180}
        cPolarAngle={80}
        cDistance={2.8}
        cameraZoom={9.1}
        // Effect props
        lightType="3d"
        brightness={1}
        envPreset="dawn"
        grain="on"
        // Tool props
        toggleAxis={false}
        zoomOut={false}
        hoverState=""
        // Optional - if using transition features
        enableTransition={false}
      />
    </ShaderGradientCanvas>
  );
}
