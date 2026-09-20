import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { dayPartFor, fillGreeting, pickGreetingKey } from "../lib/greetings";

// El saludo se elige una sola vez al montarse (cada vez que se entra a la app), así no
// cambia de frase con cada render; la clave no depende del idioma, solo su traducción.
export function Greeting() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [key] = useState(() => pickGreetingKey(dayPartFor(new Date())));

  return (
    <h1 className="greeting-enter text-center text-3xl font-bold tracking-tight text-primary sm:text-4xl">
      {fillGreeting(t(key), user?.name)}
    </h1>
  );
}
