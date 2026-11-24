// @ts-nocheck — este archivo se ejecuta en Supabase (Deno), no en VS Code
// enviar-aviso: manda una notificación a todos los dispositivos suscritos,
// menos a los de quien escribió la nota.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

// Conexión con permisos de servidor (se salta las reglas RLS)
// SUPABASE_SECRET_KEYS es un diccionario JSON: {"default": "sb_secret_..."}
const clavesSecretas = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const claveServidor = 
  clavesSecretas.default ??
  Object.values(clavesSecretas)[0] ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); // posi acaso la antigua

  const db = createClient(Deno.env.get("SUPABASE_URL")!, claveServidor as string);

// Nuestras claves VAPID, guardadas como secretos
webpush.setVapidDetails(
  Deno.env.get("VAPID_CONTACTO")!,
  Deno.env.get("VAPID_PUBLICA")!,
  Deno.env.get("VAPID_PRIVADA")!
);

const frases: Record<string, string> = {
  compra: "ha añadido a la compra",
  aviso: "ha publicado un aviso",
  tarea: "ha puesto una observación"
};

Deno.serve(async (peticion) => {
  // 1. Solo atendemos a quien conoce la clave
  if (peticion.headers.get("x-clave-webhook") !== Deno.env.get("CLAVE_WEBHOOK")) {
    return new Response("No autorizado", { status: 401 });
  }

  // 2. Leer la nota nueva
  const cuerpo = await peticion.json();
  const nota = cuerpo.record;
  if (cuerpo.type !== "INSERT" || !nota) {
    return new Response("Nada que enviar");
  }

  // 3. Nombre de quien la escribió
  const { data: autor } = await db.from("miembros").select("nombre").eq("id", nota.autor_id).single();
  const nombre = autor ? autor.nombre : "Alguien";

  // 4. Dispositivos de los demás
  const { data: suscripciones } = await db.from("suscripciones").select("*").neq("miembro_id", nota.autor_id);
  const lista = suscripciones ?? [];

  // 5. El mensaje que leerá sw.js
  const mensaje = JSON.stringify({
    titulo: "Agenda familiar",
    cuerpo: nombre + " " + (frases[nota.tipo] ?? "ha escrito") + ": " + nota.texto,
    url: "/"
  });

  // 6. Enviar a todos a la vez
  const resultados = await Promise.allSettled(
    lista.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, mensaje)
    )
  );

  // 7. Borrar las suscripciones que ya no existen (app desinstalada, permiso quitado...)
  const caducadas: number[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "rejected" && [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0)) {
      caducadas.push(lista[i].id);
    }
  });
  if (caducadas.length > 0) {
    await db.from("suscripciones").delete().in("id", caducadas);
  }

  return new Response(
    JSON.stringify({ enviados: lista.length, caducadas: caducadas.length }),
    { headers: { "Content-Type": "application/json" } }
  );
});