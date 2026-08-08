"use client";

import { useEffect, useState } from "react";

type EnergyFlight = {
  id: number;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  xp: number;
};

type CoreEnergizeEvent = CustomEvent<{
  xp?: number;
  originX?: number;
  originY?: number;
}>;

export function CoreEnergyAbsorption() {
  const [flight, setFlight] = useState<EnergyFlight | null>(null);

  useEffect(() => {
    let cleanupTimer: number | undefined;

    function handleCoreEnergize(event: Event) {
      const customEvent = event as CoreEnergizeEvent;

      const target = document.querySelector<HTMLElement>(
        "[data-pace-core-target]"
      );

      if (!target) {
        return;
      }

      const targetRect = target.getBoundingClientRect();

      const originX =
        customEvent.detail?.originX ?? window.innerWidth / 2;

      const originY =
        customEvent.detail?.originY ?? window.innerHeight / 2;

      const targetX = targetRect.left + targetRect.width / 2;
      const targetY = targetRect.top + targetRect.height / 2;

      setFlight({
        id: Date.now(),
        originX,
        originY,
        targetX,
        targetY,
        xp: customEvent.detail?.xp ?? 0,
      });

      cleanupTimer = window.setTimeout(() => {
        setFlight(null);
      }, 1050);
    }

    window.addEventListener(
      "pace:core-energize",
      handleCoreEnergize
    );

    return () => {
      window.removeEventListener(
        "pace:core-energize",
        handleCoreEnergize
      );

      if (cleanupTimer) {
        window.clearTimeout(cleanupTimer);
      }
    };
  }, []);

  if (!flight) {
    return null;
  }

  const translateX = flight.targetX - flight.originX;
  const translateY = flight.targetY - flight.originY;

  return (
    <div
      key={flight.id}
      className="pace-energy-flight"
      style={
        {
          left: flight.originX,
          top: flight.originY,
          "--pace-energy-x": `${translateX}px`,
          "--pace-energy-y": `${translateY}px`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="pace-energy-flight__trail" />

      <div className="pace-energy-flight__orb">
        <span className="pace-energy-flight__core" />
      </div>

      {flight.xp > 0 && (
        <span className="pace-energy-flight__label">
          +{flight.xp}
        </span>
      )}
    </div>
  );
}