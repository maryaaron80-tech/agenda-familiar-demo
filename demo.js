// =====================================================
//  demo.js — MODO DEMOSTRACIÓN
//  Si en app.js no se ha puesto una URL real de Supabase,
//  este archivo simula la base de datos en memoria con una
//  familia ficticia. Los cambios no se guardan al recargar.
//  Con una URL real (https://...) se usa Supabase de verdad.
// =====================================================
(function () {
  const clienteReal = window.supabase && window.supabase.createClient;
  let haySesion = !location.search.includes("login");

  const miembros = [
    { id: "javier", nombre: "Javier", rol: "Papá", admin: true, color: "#3b6ea5", orden: 1, usuario_id: "u-javier" },
    { id: "lucia", nombre: "Lucía", rol: "Mamá", admin: true, color: "#c2185b", orden: 2, usuario_id: "u-lucia" },
    { id: "rosa", nombre: "Rosa", rol: "Abuela", admin: false, color: "#8e6cc4", orden: 3, usuario_id: "u-rosa" },
    { id: "sofia", nombre: "Sofía", rol: "Hija", admin: false, color: "#e08a3c", orden: 4, usuario_id: "u-sofia" },
    { id: "daniel", nombre: "Daniel", rol: "Hijo", admin: false, color: "#2e9e6a", orden: 5, usuario_id: "u-daniel" },
    { id: "pablo", nombre: "Pablo", rol: "Sobrino", admin: false, color: "#d4a017", orden: 6, usuario_id: "u-pablo" }
  ];

  const T = "{0,1,2,3,4,5,6}";
  function t(id, titulo, frecuencia, reparto, responsables, extra) {
    return Object.assign({
      id, titulo, frecuencia, reparto, responsables,
      cada_dias: null, desfase: 0,
      dias_semana: [0, 1, 2, 3, 4, 5, 6], dias_opcionales: [], depende_de: null
    }, extra || {});
  }
  const LV = [1, 2, 3, 4, 5];
  const tareasBD = [
    t(1, "Cocinar", "diaria", "rotar", ["javier", "lucia"], { dias_opcionales: [0] }),
    t(2, "Lavandería", "diaria", "rotar", ["rosa"], { dias_semana: [1, 2, 3, 4, 5, 6] }),
    t(3, "Lavar platos (mañana, tarde y noche)", "diaria", "rotar", ["sofia", "daniel", "pablo", "lucia"], { dias_opcionales: [0], depende_de: 1 }),
    t(4, "Barrer sala, cocina y pasillos", "diaria", "rotar", ["daniel", "pablo"], { dias_semana: LV, desfase: 1 }),
    t(5, "Barrer baño principal", "diaria", "rotar", ["daniel", "pablo"], { dias_semana: LV }),
    t(6, "Barrer baño pequeño", "diaria", "rotar", ["lucia", "rosa"], { dias_semana: LV }),
    t(7, "Barrer su dormitorio", "diaria", "todos", ["javier", "lucia", "rosa", "sofia", "daniel", "pablo"], { dias_semana: LV }),
    t(8, "Tirar la basura", "cadaNDias", "rotar", ["javier", "sofia", "daniel", "pablo"], { cada_dias: 2 }),
    t(9, "Baño principal a fondo", "semanal", "rotar", ["sofia", "lucia"]),
    t(10, "Baño pequeño y cocina a fondo", "semanal", "rotar", ["pablo", "daniel"]),
    t(11, "Sala, balcones y pasillos a fondo", "semanal", "rotar", ["daniel", "pablo"]),
    t(12, "Su dormitorio a fondo", "semanal", "todos", ["javier", "lucia", "rosa", "sofia", "daniel", "pablo"]),
    t(13, "Regar las plantas", "semanal", "rotar", ["javier"]),
    t(14, "Puertas y ventanas", "mensual", "rotar", ["javier", "daniel", "pablo"])
  ];

  let hechasBD = null;
  let obsBD = null;

  function f(fecha) {
    return fecha.getFullYear() + "-" + String(fecha.getMonth() + 1).padStart(2, "0") + "-" + String(fecha.getDate()).padStart(2, "0");
  }
  function azar(texto) {
    let h = 7;
    for (const c of texto) h = (h * 31 + c.charCodeAt(0)) % 1000003;
    return (h % 1000) / 1000;
  }
  function hace(minutos) {
    return new Date(Date.now() - minutos * 60000).toISOString().replace("Z", "+00:00");
  }

  // Se generan cuando la app ya ha cargado las tareas, usando su propia lógica de reparto
  function generar() {
    if (hechasBD) return;
    hechasBD = [];
    const hoyReal = new Date();
    const inicio = new Date(hoyReal.getFullYear(), hoyReal.getMonth(), hoyReal.getDate() - 21);
    const fallos = [];
    for (let d = new Date(inicio); d <= hoyReal; d.setDate(d.getDate() + 1)) {
      const esHoy = f(d) === f(hoyReal);
      // eslint-disable-next-line no-undef
      tareasDelDia(new Date(d)).forEach(function (tarea) {
        tarea.responsables.forEach(function (m) {
          const p = azar(f(d) + tarea.id + m);
          const limite = esHoy ? 0.45 : (m === "pablo" ? 0.7 : 0.9);
          if (tarea.opcional && tarea.id !== 1) return;
          if (p < limite) {
            hechasBD.push({ fecha: f(d), tarea_id: tarea.id, miembro_id: m });
          } else if (!esHoy && !tarea.opcional) {
            fallos.push({ fecha: f(d), tarea_id: tarea.id, miembro_id: m });
          }
        });
      });
    }

    const fallo = function (id) { return fallos.find(function (x) { return x.miembro_id === id; }); };
    obsBD = [];
    let n = 1;
    const fp = fallo("pablo"), fd = fallo("daniel"), fs = fallo("sofia");
    if (fp) obsBD.push({ id: n++, tipo: "tarea", fecha: fp.fecha, tarea_id: fp.tarea_id, miembro_id: "pablo", autor_id: "pablo", texto: "Tenía examen al día siguiente, lo hago el sábado sin falta.", resuelta: false, creada_el: hace(60 * 30) });
    if (fp) obsBD.push({ id: n++, tipo: "tarea", fecha: fp.fecha, tarea_id: fp.tarea_id, miembro_id: "pablo", autor_id: "lucia", texto: "De acuerdo, pero el sábado sin excusas.", resuelta: false, creada_el: hace(60 * 29) });
    if (fd) obsBD.push({ id: n++, tipo: "tarea", fecha: fd.fecha, tarea_id: fd.tarea_id, miembro_id: "daniel", autor_id: "daniel", texto: "Entrenamiento hasta tarde.", resuelta: false, creada_el: hace(60 * 50) });
    if (fs) obsBD.push({ id: n++, tipo: "tarea", fecha: fs.fecha, tarea_id: fs.tarea_id, miembro_id: "sofia", autor_id: "sofia", texto: "Estaba enferma ese día.", resuelta: false, creada_el: hace(60 * 70) });
    obsBD.push({ id: n++, tipo: "compra", fecha: f(hoyReal), tarea_id: null, miembro_id: null, autor_id: "rosa", texto: "Detergente para la lavadora", resuelta: false, creada_el: hace(35) });
    obsBD.push({ id: n++, tipo: "compra", fecha: f(hoyReal), tarea_id: null, miembro_id: null, autor_id: "sofia", texto: "Leche (2 bricks)", resuelta: false, creada_el: hace(20) });
    obsBD.push({ id: n++, tipo: "compra", fecha: f(hoyReal), tarea_id: null, miembro_id: null, autor_id: "javier", texto: "Pan", resuelta: true, creada_el: hace(60 * 26) });
    obsBD.push({ id: n++, tipo: "aviso", fecha: f(hoyReal), tarea_id: null, miembro_id: null, autor_id: "lucia", texto: "El martes viene el técnico de la caldera, que alguien esté en casa por la mañana.", resuelta: false, creada_el: hace(90) });
    obsBD.push({ id: n++, tipo: "aviso", fecha: f(hoyReal), tarea_id: null, miembro_id: null, autor_id: "daniel", texto: "El viernes ceno fuera.", resuelta: false, creada_el: hace(15) });
  }

  function tabla(nombre) {
    if (nombre === "miembros") return miembros;
    if (nombre === "tareas") return tareasBD;
    generar();
    if (nombre === "hechas") return hechasBD;
    if (nombre === "observaciones") return obsBD;
    return [];
  }

  function consulta(nombre) {
    const filtros = [];
    let orden = null, limite = null, uno = false, accion = "select", valor = null;
    const q = {
      select: function () { return q; },
      eq: function (c, v) { filtros.push(function (r) { return String(r[c]) === String(v); }); return q; },
      gte: function (c, v) { filtros.push(function (r) { return r[c] >= v; }); return q; },
      lte: function (c, v) { filtros.push(function (r) { return r[c] <= v; }); return q; },
      neq: function (c, v) { filtros.push(function (r) { return String(r[c]) !== String(v); }); return q; },
      in: function (c, lista) { filtros.push(function (r) { return lista.map(String).includes(String(r[c])); }); return q; },
      upsert: function () { accion = "nada"; return q; },
      match: function (o) { filtros.push(function (r) { return Object.keys(o).every(function (k) { return String(r[k]) === String(o[k]); }); }); return q; },
      order: function (c, op) { orden = { c: c, asc: !op || op.ascending !== false }; return q; },
      limit: function (n) { limite = n; return q; },
      single: function () { uno = true; return q; },
      insert: function (v) { accion = "insert"; valor = v; return q; },
      update: function (v) { accion = "update"; valor = v; return q; },
      delete: function () { accion = "delete"; return q; },
      then: function (ok, ko) {
        let datos = tabla(nombre);
        if (accion === "insert") {
          let fila;
          if (nombre === "tareas") {
            fila = Object.assign({ id: Date.now(), cada_dias: null, desfase: 0, dias_semana: [0, 1, 2, 3, 4, 5, 6], dias_opcionales: [], depende_de: null }, valor);
          } else if (nombre === "observaciones") {
            fila = Object.assign({ id: Date.now(), autor_id: "javier", tipo: "tarea", fecha: f(new Date()), tarea_id: null, miembro_id: null, resuelta: false, creada_el: new Date().toISOString() }, valor);
          } else {
            fila = Object.assign({}, valor);
          }
          datos.push(fila);
          return Promise.resolve({ data: uno ? fila : [fila], error: null }).then(ok, ko);
        }
        if (accion === "nada") return Promise.resolve({ data: null, error: null }).then(ok, ko);
        let filas = datos.filter(function (r) { return filtros.every(function (fn) { return fn(r); }); });
        if (accion === "delete") {
          filas.forEach(function (r) { datos.splice(datos.indexOf(r), 1); });
          return Promise.resolve({ data: null, error: null }).then(ok, ko);
        }
        if (accion === "update") {
          filas.forEach(function (r) { Object.assign(r, valor); });
          return Promise.resolve({ data: null, error: null }).then(ok, ko);
        }
        filas = filas.slice();
        if (orden) {
          filas.sort(function (a, b) {
            const x = a[orden.c], y = b[orden.c];
            return (x > y ? 1 : x < y ? -1 : 0) * (orden.asc ? 1 : -1);
          });
        }
        if (limite) filas = filas.slice(0, limite);
        return Promise.resolve({ data: JSON.parse(JSON.stringify(filas)), error: null }).then(ok, ko);
      }
    };
    return q;
  }

  const canal = { on: function () { return canal; }, subscribe: function () { return canal; } };

  function clienteDemo() {
    return {
      from: consulta,
      channel: function () { return canal; },
      removeChannel: function () {},
      auth: {
        getSession: async function () {
          return { data: { session: haySesion ? { user: { id: "u-javier" } } : null } };
        },
        signInWithPassword: async function () { haySesion = true; return { data: {}, error: null }; },
        signOut: async function () { haySesion = false; return { error: null }; },
        updateUser: async function () { return { data: {}, error: null }; }
      }
    };
  }

  function avisoDemo() {
    const estilo = document.createElement("style");
    estilo.textContent =
      "#botonActivarAvisos,#pistaAvisos{display:none!important}" +
      ".aviso-demo{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:200;" +
      "background:rgba(30,34,53,.88);color:#fff;font:500 13px/1.3 system-ui,sans-serif;" +
      "padding:8px 14px;border-radius:20px;text-align:center;max-width:92%;pointer-events:none}";
    document.head.appendChild(estilo);
    const aviso = document.createElement("div");
    aviso.className = "aviso-demo";
    aviso.textContent = "Modo demostración · familia ficticia · entra con cualquier email y contraseña · los cambios no se guardan";
    document.body.appendChild(aviso);
  }

  window.supabase = {
    createClient: function (url, clave) {
      if (clienteReal && /^https:\/\//.test(url)) return clienteReal(url, clave);
      if (document.body) avisoDemo(); else document.addEventListener("DOMContentLoaded", avisoDemo);
      return clienteDemo();
    }
  };
})();
