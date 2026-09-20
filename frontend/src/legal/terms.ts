import type { Language } from "../i18n";

// Debe coincidir con `terms_version` en backend/app/core/config.py. Al cambiar el texto,
// sube esta versión en ambos lados: cada usuario tendrá que volver a aceptar los términos.
export const TERMS_VERSION = "2026-09-19";

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDocument {
  intro: string;
  sections: LegalSection[];
}

// Marcadores: {legalName}, {contactEmail} y {jurisdiction} se rellenan desde las variables
// VITE_LEGAL_NAME, VITE_CONTACT_EMAIL y VITE_LEGAL_JURISDICTION (ver lib/legal.ts).
// Texto de partida: debe revisarlo un abogado antes de usarse con clientes reales.
export const TERMS: Record<Language, LegalDocument> = {
  es: {
    intro:
      "Estos términos y condiciones regulan el uso de Molko. Léelos con calma: al crear una cuenta o usar el servicio, los aceptas.",
    sections: [
      {
        title: "Aceptación de los términos",
        paragraphs: [
          "Al crear una cuenta o usar Molko (el “Servicio”), aceptas estos términos y condiciones. Si no estás de acuerdo, no uses el Servicio.",
          "El Servicio lo ofrece {legalName} (“nosotros”). Debes ser mayor de edad en tu país para contratarlo.",
        ],
      },
      {
        title: "El Servicio",
        paragraphs: [
          "Molko es una herramienta web para crear videos verticales que combinan un clip que tú aportas con un gameplay de fondo de nuestra biblioteca. La edición y la exportación ocurren principalmente en tu navegador.",
          "Algunas funciones usan nuestros servidores de forma temporal, por ejemplo la conversión de formatos que tu navegador no puede leer (como AV1) o, cuando esté habilitado, el descargador de videos.",
          "El Servicio está en desarrollo: puede cambiar, tener errores o no estar disponible en algunos momentos.",
        ],
      },
      {
        title: "Tu cuenta",
        paragraphs: [
          "Debes dar un correo válido y una contraseña segura, y mantener tus credenciales en secreto. Eres responsable de la actividad de tu cuenta. Avísanos si sospechas de un uso no autorizado.",
          "Cada cuenta es para una sola persona: no la compartas ni la vendas. Puedes indicar un nombre para personalizar tu experiencia; no uses nombres que suplanten a otra persona o que sean ofensivos.",
        ],
      },
      {
        title: "Suscripción y pagos",
        paragraphs: [
          "El acceso al editor requiere una suscripción de pago: plan mensual (5 USD al mes) o plan anual (50 USD al año). Los precios pueden mostrarse también en pesos mexicanos de forma aproximada; el cargo se hace en dólares estadounidenses y el monto final en tu moneda depende del tipo de cambio y de tu banco. Los precios pueden no incluir impuestos aplicables.",
          "Los pagos los procesa Stripe. Nosotros no almacenamos los datos de tu tarjeta.",
          "La suscripción se renueva automáticamente al final de cada periodo hasta que la canceles. Puedes cancelar en cualquier momento desde el menú de tu cuenta (“Gestionar suscripción”): conservarás el acceso hasta el fin del periodo ya pagado y no se harán nuevos cargos.",
          "Los precios pueden cambiar. Te avisaremos con anticipación razonable y el nuevo precio aplicará desde tu siguiente renovación.",
          "Salvo que la ley aplicable disponga otra cosa, los pagos realizados no son reembolsables.",
        ],
      },
      {
        title: "Uso aceptable",
        paragraphs: [
          "No puedes usar el Servicio para crear o difundir contenido ilegal, que infrinja derechos de terceros, que acose, difame o incite a la violencia, ni para ningún fin contrario a la ley.",
          "Tampoco puedes intentar vulnerar la seguridad del Servicio, evadir los límites o cuotas de uso, acceder de forma automatizada (bots, scraping) fuera de la interfaz normal, sobrecargar la infraestructura, revender el acceso ni hacer ingeniería inversa salvo lo que la ley permita.",
          "Podemos suspender o cancelar las cuentas que incumplan estas reglas.",
        ],
      },
      {
        title: "Tu contenido y la propiedad intelectual",
        paragraphs: [
          "Conservas todos los derechos sobre los videos y materiales que aportas. Declaras que tienes los derechos o permisos necesarios para usarlos y editarlos con Molko. No reclamamos propiedad sobre los videos que creas y no los guardamos: se procesan en tu navegador. Conserva tus propias copias.",
          "El software, la marca, el diseño y los demás elementos de Molko son nuestros o de nuestros licenciantes. Te damos una licencia limitada, no exclusiva e intransferible para usar el Servicio conforme a estos términos.",
        ],
      },
      {
        title: "Contenido de terceros y descargas",
        paragraphs: [
          "La biblioteca de gameplays puede incluir imágenes de videojuegos y otros materiales de terceros. Eres responsable de cumplir las políticas de las plataformas donde publiques y los derechos de los titulares de ese contenido; no garantizamos que su uso sea adecuado para monetizar o publicar en todas las plataformas.",
          "Descargador de videos (cuando esté habilitado): solo puedes descargar contenido del que seas titular o para el que tengas permiso, y conforme a los términos de la plataforma de origen. Aplican límites de uso (cantidad mensual y duración) y podemos limitar o desactivar la función en cualquier momento, por ejemplo ante una solicitud de un titular de derechos.",
        ],
      },
      {
        title: "Privacidad y datos personales",
        paragraphs: [
          "Guardamos los datos necesarios para operar tu cuenta: tu correo, tu nombre (si lo indicas), tu contraseña (solo como un hash, nunca en texto), el estado de tu suscripción, la versión y la fecha en que aceptaste estos términos, y el número de descargas que haces con el descargador. También registramos datos técnicos (como tu dirección IP) para seguridad y para aplicar los límites de uso. Si te unes a la lista de espera, guardamos tu correo.",
          "Los pagos se procesan con Stripe, que trata los datos de tu tarjeta según sus propias políticas. Tus videos no se guardan en nuestros servidores: se procesan en tu navegador, y cuando una función necesita el servidor (conversión de formatos o descarga), el archivo se procesa de forma temporal y se elimina al terminar.",
          "No vendemos tus datos personales. Puedes solicitar acceso, rectificación, cancelación u oposición sobre tus datos, o la eliminación de tu cuenta, escribiendo a {contactEmail}.",
        ],
      },
      {
        title: "Disponibilidad y cambios en el Servicio",
        paragraphs: [
          "Podemos modificar, suspender o discontinuar funciones del Servicio. Si dejamos de ofrecerlo por completo, cancelaremos tu suscripción y no se harán nuevos cargos.",
        ],
      },
      {
        title: "Terminación",
        paragraphs: [
          "Puedes dejar de usar el Servicio y cancelar tu suscripción cuando quieras. Podemos suspender o terminar tu acceso si incumples estos términos, si lo exige la ley o si tu uso pone en riesgo el Servicio o a otras personas.",
          "Las cláusulas que por su naturaleza deban continuar (propiedad intelectual, limitación de responsabilidad y ley aplicable) seguirán vigentes después de la terminación.",
        ],
      },
      {
        title: "Garantías y limitación de responsabilidad",
        paragraphs: [
          "El Servicio se ofrece “tal cual” y “según disponibilidad”. No garantizamos que sea ininterrumpido o libre de errores, ni que los videos exportados cumplan los requisitos de una plataforma en particular.",
          "En la medida en que la ley lo permita, no somos responsables por daños indirectos, incidentales o consecuentes (como pérdida de ingresos, de audiencia o de datos), ni por decisiones de otras plataformas sobre tu contenido. Nuestra responsabilidad total no excederá el monto que hayas pagado por el Servicio en los 12 meses anteriores al hecho que dé origen a la reclamación.",
          "Nada de esto limita los derechos que la ley te reconozca y no puedan renunciarse.",
        ],
      },
      {
        title: "Cambios a estos términos",
        paragraphs: [
          "Podemos actualizar estos términos. Publicaremos la nueva versión con su fecha y te pediremos aceptarla para seguir usando el Servicio. Si no estás de acuerdo, puedes cancelar tu suscripción.",
        ],
      },
      {
        title: "Ley aplicable y jurisdicción",
        paragraphs: [
          "Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier controversia, las partes se someten a los tribunales competentes de {jurisdiction}, sin perjuicio de los derechos que la ley te otorgue como consumidor.",
        ],
      },
      {
        title: "Contacto",
        paragraphs: ["Para dudas, solicitudes sobre tus datos o avisos legales, escríbenos a {contactEmail}."],
      },
    ],
  },
  en: {
    intro:
      "These terms and conditions govern your use of Molko. Please read them carefully: by creating an account or using the service, you accept them. This English version is provided for convenience; if there is any discrepancy, the Spanish version prevails.",
    sections: [
      {
        title: "Acceptance of the terms",
        paragraphs: [
          "By creating an account or using Molko (the “Service”), you accept these terms and conditions. If you don't agree, don't use the Service.",
          "The Service is offered by {legalName} (“we”). You must be of legal age in your country to sign up.",
        ],
      },
      {
        title: "The Service",
        paragraphs: [
          "Molko is a web tool for creating vertical videos that combine a clip you provide with a background gameplay from our library. Editing and exporting happen mainly in your browser.",
          "Some features use our servers temporarily, for example converting formats your browser can't read (such as AV1) or, when enabled, the video downloader.",
          "The Service is under development: it may change, have errors or be unavailable at times.",
        ],
      },
      {
        title: "Your account",
        paragraphs: [
          "You must provide a valid email and a strong password and keep your credentials secret. You are responsible for activity on your account. Tell us if you suspect unauthorized use.",
          "Each account is for one person: don't share or sell it. You may enter a name to personalize your experience; don't use names that impersonate someone else or are offensive.",
        ],
      },
      {
        title: "Subscription and payments",
        paragraphs: [
          "Access to the editor requires a paid subscription: a monthly plan (USD 5 per month) or an annual plan (USD 50 per year). Prices may also be shown approximately in Mexican pesos; you are charged in US dollars, and the final amount in your currency depends on the exchange rate and your bank. Prices may not include applicable taxes.",
          "Payments are processed by Stripe. We don't store your card details.",
          "The subscription renews automatically at the end of each period until you cancel. You can cancel at any time from your account menu (“Manage subscription”): you keep access until the end of the period you already paid for, and no further charges are made.",
          "Prices may change. We'll give you reasonable notice and the new price will apply from your next renewal.",
          "Unless applicable law says otherwise, payments made are non-refundable.",
        ],
      },
      {
        title: "Acceptable use",
        paragraphs: [
          "You may not use the Service to create or distribute content that is illegal, infringes third-party rights, harasses, defames or incites violence, or for any purpose contrary to the law.",
          "You also may not try to breach the Service's security, evade usage limits or quotas, access it in an automated way (bots, scraping) outside the normal interface, overload the infrastructure, resell access or reverse engineer it except as the law allows.",
          "We may suspend or terminate accounts that break these rules.",
        ],
      },
      {
        title: "Your content and intellectual property",
        paragraphs: [
          "You keep all rights to the videos and materials you provide. You state that you have the rights or permissions needed to use and edit them with Molko. We don't claim ownership of the videos you create and we don't store them: they are processed in your browser. Keep your own copies.",
          "The software, brand, design and other elements of Molko belong to us or our licensors. We grant you a limited, non-exclusive, non-transferable license to use the Service under these terms.",
        ],
      },
      {
        title: "Third-party content and downloads",
        paragraphs: [
          "The gameplay library may include video game footage and other third-party material. You are responsible for following the policies of the platforms where you publish and the rights of the owners of that content; we don't guarantee it is suitable for monetizing or publishing on every platform.",
          "Video downloader (when enabled): you may only download content you own or have permission to use, and in line with the source platform's terms. Usage limits apply (monthly count and length) and we may limit or disable the feature at any time, for example after a request from a rights holder.",
        ],
      },
      {
        title: "Privacy and personal data",
        paragraphs: [
          "We store the data needed to run your account: your email, your name (if you provide one), your password (only as a hash, never in plain text), your subscription status, the version and date on which you accepted these terms, and the number of downloads you make with the downloader. We also log technical data (such as your IP address) for security and to enforce usage limits. If you join the waitlist, we store your email.",
          "Payments are processed by Stripe, which handles your card data under its own policies. Your videos aren't stored on our servers: they're processed in your browser, and when a feature needs the server (format conversion or downloading), the file is processed temporarily and deleted when done.",
          "We don't sell your personal data. You can request access, rectification, deletion or objection regarding your data, or deletion of your account, by writing to {contactEmail}.",
        ],
      },
      {
        title: "Availability and changes to the Service",
        paragraphs: [
          "We may modify, suspend or discontinue features of the Service. If we stop offering it entirely, we'll cancel your subscription and no further charges will be made.",
        ],
      },
      {
        title: "Termination",
        paragraphs: [
          "You can stop using the Service and cancel your subscription at any time. We may suspend or end your access if you break these terms, if the law requires it, or if your use puts the Service or other people at risk.",
          "Provisions that by their nature should continue (intellectual property, limitation of liability and governing law) remain in effect after termination.",
        ],
      },
      {
        title: "Warranties and limitation of liability",
        paragraphs: [
          "The Service is provided “as is” and “as available”. We don't guarantee it will be uninterrupted or error-free, or that exported videos will meet the requirements of any particular platform.",
          "To the extent the law allows, we aren't liable for indirect, incidental or consequential damages (such as loss of income, audience or data), or for other platforms' decisions about your content. Our total liability won't exceed the amount you paid for the Service in the 12 months before the event giving rise to the claim.",
          "Nothing here limits rights the law grants you that cannot be waived.",
        ],
      },
      {
        title: "Changes to these terms",
        paragraphs: [
          "We may update these terms. We'll publish the new version with its date and ask you to accept it to keep using the Service. If you don't agree, you can cancel your subscription.",
        ],
      },
      {
        title: "Governing law and jurisdiction",
        paragraphs: [
          "These terms are governed by the laws of the United Mexican States. For any dispute, the parties submit to the competent courts of {jurisdiction}, without prejudice to the rights the law grants you as a consumer.",
        ],
      },
      {
        title: "Contact",
        paragraphs: ["For questions, requests about your data or legal notices, write to us at {contactEmail}."],
      },
    ],
  },
};
