"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    async function registerServiceWorker() {
      try {
        const registration =
          await navigator.serviceWorker.register("/sw.js");

        console.log(
          "PRAXE Service Worker registrado:",
          registration.scope
        );
      } catch (error) {
        console.error(
          "Erro ao registrar Service Worker:",
          error
        );
      }
    }

    registerServiceWorker();
  }, []);

  return null;
}