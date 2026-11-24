// =====================================================
//  AGENDA FAMILIAR — versión con Supabase
// =====================================================

// ===== 0. Conexión con Supabase =====
const SUPABASE_URL = "TU_URL_DE_SUPABASE"; // sin configurar → funciona en modo demostración (demo.js)
const SUPABASE_KEY = "TU_CLAVE_PUBLISHABLE";
const VAPID_PUBLICA = "TU_CLAVE_PUBLICA_VAPID";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// ===== 1. Datos (se cargan desde la base de datos) =====
let familia = [];
let tareas = [];
let hechas = {};
let yo = null; // el miembro que ha iniciado sesión

const FECHA_INICIO = new Date(2026, 10, 9); // lunes 9 de noviembre de 2026 (los meses empiezan en 0)
const hoy = new Date();

function fechaTexto(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return anio + "-" + mes + "-" + dia;
}

function claveTarea(fecha, idTarea, idMiembro) {
  return fechaTexto(fecha) + "|" + idTarea + "|" + idMiembro;
}

async function cargarDatos() {
  // Miembros
  const respuestaMiembros = await db.from("miembros").select("*").order("orden");
  if (respuestaMiembros.error) throw respuestaMiembros.error;
  familia = respuestaMiembros.data;

  // Tareas
  const respuestaTareas = await db.from("tareas").select("*").order("id");
  if (respuestaTareas.error) throw respuestaTareas.error;
  tareas = respuestaTareas.data.map(function (fila) {
    return {
      id: fila.id,
      titulo: fila.titulo,
      frecuencia: fila.frecuencia,
      reparto: fila.reparto,
      responsables: fila.responsables,
      cadaDias: fila.cada_dias,
      desfase: fila.desfase,
      diasSemana: fila.dias_semana,
      diasOpcionales: fila.dias_opcionales,
      dependeDe: fila.depende_de
    };
  });

  // Tareas hechas hoy
  const respuestaHechas = await db.from("hechas").select("*").eq("fecha", fechaTexto(hoy));
  if (respuestaHechas.error) throw respuestaHechas.error;
  hechas = {};
  respuestaHechas.data.forEach(function (fila) {
    hechas[fila.fecha + "|" + fila.tarea_id + "|" + fila.miembro_id] = true;
  });
}

function avisarError(error) {
  console.error(error);
  alert("No se ha podido guardar el cambio: " + error.message);
}


// ===== 2. Lógica del reparto =====
function numeroDeDia(fecha) {
  const utc = Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return Math.floor(utc / 86400000);
}

function diasDesdeInicio(fecha) {
  return numeroDeDia(fecha) - numeroDeDia(FECHA_INICIO);
}

function elegirPorTurno(lista, turno) {
  const posicion = ((turno % lista.length) + lista.length) % lista.length;
  return lista[posicion];
}

function tocaEsteDia(tarea, fecha, dias) {
  if (!tarea.diasSemana.includes(fecha.getDay())) return false

  const esSabado = fecha.getDay() === 6;

  if (tarea.frecuencia === "diaria") return true;
  if (tarea.frecuencia === "semanal") return esSabado;
  if (tarea.frecuencia === "cadaNDias") return dias % tarea.cadaDias === 0;
  if (tarea.frecuencia === "mensual") return esSabado && fecha.getDate() <= 7;
  return false;
}

function quienLaHace(tarea, dias) {
  if (tarea.reparto === "todos") return tarea.responsables;

  let turno;
  if (tarea.frecuencia === "semanal") {
    turno = Math.floor(dias / 7);
  } else if (tarea.frecuencia === "cadaNDias") {
    turno = Math.floor(dias / tarea.cadaDias);
  } else {
    turno = dias + (tarea.desfase || 0);
  }
  return [elegirPorTurno(tarea.responsables, turno)];
}

function alguienLaHizo(fecha, idTarea) {
  const inicio = fechaTexto(fecha) + "|" + idTarea + "|";
  return Object.keys(hechas).some(function (clave) {
    return clave.startsWith(inicio);
  });
}

function tareasDelDia(fecha) {
  const dias = diasDesdeInicio(fecha);
  const diaSemana = fecha.getDay();
  const resultado = [];

  tareas.forEach(function (tarea) {
    if (!tocaEsteDia(tarea, fecha, dias)) return;

    const opcional = tarea.diasOpcionales.includes(diaSemana);

    // Si es opcional y depende de otra, solo aparece cuando alguien hizo la otra
    if (opcional && tarea.dependeDe && !alguienLaHizo(fecha, tarea.dependeDe)) return;

    resultado.push({
      id: tarea.id,
      titulo: tarea.titulo,
      responsables: quienLaHace(tarea, dias),
      opcional: opcional
    });
  });
  return resultado;
}

function buscarMiembro(id) {
  return familia.find(function (miembro) {
    return miembro.id === id;
  });
}

function mismoDia(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}


// ===== 3. Fecha de hoy en la cabecera =====
const opcionesFecha = { weekday: "long", day: "numeric", month: "long", year: "numeric" };

let textoFecha = hoy.toLocaleDateString("es-ES", opcionesFecha);
textoFecha = textoFecha.charAt(0).toUpperCase() + textoFecha.slice(1);
document.getElementById("fechaHoy").textContent = textoFecha;



// ===== 4. Vista Hoy =====
function pintarHoy() {
  const tareasHoy = tareasDelDia(hoy);

  // Yo primero, y después el resto de la familia
  const personas = [yo].concat(familia.filter(function (miembro) {
    return miembro.id !== yo.id;
  }));

  let html = `<div class="lista-hoy">`;

  personas.forEach(function (miembro) {
    const susTareas = tareasHoy.filter(function (tarea) {
      return tarea.responsables.includes(miembro.id);
    });

    const obligatorias = susTareas.filter(function (tarea) {
      return !tarea.opcional;
    });


    const numHechas = obligatorias.filter(function (tarea) {
      return hechas[claveTarea(hoy, tarea.id, miembro.id)] === true;
    }).length;

    const puedeMarcar = yo.admin || miembro.id === yo.id;

    html += `
      <div class="bloque-persona">
        <div class="cabecera-persona">
          <div class="avatar" style="background: ${miembro.color}">${miembro.nombre.charAt(0)}</div>
          <p class="nombre-miembro">${miembro.nombre}</p>
          <span class="contador">${numHechas}/${obligatorias.length}</span>
        </div>
        <ul class="lista-tareas">`;

    if (susTareas.length === 0) {
      html += `<li class="tarea sin-tareas">Sin tareas hoy 🎉</li>`;
    } else {
      susTareas.forEach(function (tarea) {
        const clave = claveTarea(hoy, tarea.id, miembro.id);
        const estaHecha = hechas[clave] === true;
        const atributoClave = puedeMarcar ? `data-clave="${clave}"` : "";

        html += `
          <li class="tarea ${estaHecha ? "hecha" : ""} ${tarea.opcional ? "opcional" : ""}" ${atributoClave} style="border-left-color: ${miembro.color}">
            <span class="check" style="border-color: ${miembro.color}; background: ${estaHecha ? miembro.color : "transparent"}">${estaHecha ? "✓" : ""}</span>
            ${tarea.titulo}
            ${tarea.opcional ? `<span class="etiqueta-opcional">opcional</span>` : ""}
          </li>`;
      });
    }

    html += `</ul></div>`;
  });

  html += `</div>`;
  contenido.innerHTML = html;
}

// ===== 5. Vista Familia =====
function pintarFamilia() {
  let html = `<div class="lista-familia">`;

  familia.forEach(function (miembro) {
    const inicial = miembro.nombre.charAt(0);
    const etiquetaAdmin = miembro.admin ? `<span class="etiqueta-admin">Admin</span>` : "";

    html += `
      <div class="tarjeta-miembro">
        <div class="avatar" style="background: ${miembro.color}">${inicial}</div>
        <div>
          <p class="nombre-miembro">${miembro.nombre} ${etiquetaAdmin}</p>
          <p class="rol-miembro">${miembro.rol}</p>
        </div>
      </div>`;
  });

  html += `</div>`;
  contenido.innerHTML = html;
}


// ===== 5b. Vista Semana =====
let desplazamientoSemana = 0;

const nombresDias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function lunesDeLaSemana(fecha) {
  const lunes = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const diaSemana = (lunes.getDay() + 6) % 7;
  lunes.setDate(lunes.getDate() - diaSemana);
  return lunes;
}

function htmlTareasDeUnDia(fecha) {
  let html = `<ul class="tareas-dia">`;

  tareasDelDia(fecha).forEach(function (tarea) {
    let avatares = "";
    tarea.responsables.forEach(function (id) {
      const miembro = buscarMiembro(id);
      avatares += `<span class="mini-avatar" style="background: ${miembro.color}" title="${miembro.nombre}">${miembro.nombre.charAt(0)}</span>`;
    });
    html += `<li class="tarea-dia"><span>${tarea.titulo}${tarea.opcional ? " <em>(opcional)</em>" : ""}</span><span class="avatares">${avatares}</span></li>`;
  });

  html += `</ul>`;
  return html;
}

function pintarSemana() {
  const lunes = lunesDeLaSemana(hoy);
  lunes.setDate(lunes.getDate() + desplazamientoSemana * 7);

  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);

  const opcionesCorta = { day: "numeric", month: "short" };
  const rango = lunes.toLocaleDateString("es-ES", opcionesCorta) + " – " + domingo.toLocaleDateString("es-ES", opcionesCorta);

  let html = `
    <div class="navegacion-semana">
      <button class="flecha" data-mover="-1">‹</button>
      <span class="rango-semana">${rango}</span>
      <button class="flecha" data-mover="1">›</button>
    </div>
    <div class="lista-semana">`;

  for (let i = 0; i < 7; i++) {
    const dia = new Date(lunes);
    dia.setDate(lunes.getDate() + i);
    const esHoy = mismoDia(dia, hoy);

    html += `
      <div class="dia ${esHoy ? "dia-hoy" : ""}">
        <p class="titulo-dia">${nombresDias[i]} <span>${dia.getDate()}</span></p>
        ${htmlTareasDeUnDia(dia)}
      </div>`;
  }

  html += `</div>`;
  contenido.innerHTML = html;
}


// ===== 5c. Vista Mes =====
let desplazamientoMes = 0;
let diaSeleccionado = null;

const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function personasConTareasEspeciales(fecha) {
  const dias = diasDesdeInicio(fecha);
  const personas = [];

  tareas.forEach(function (tarea) {
    if (tarea.frecuencia !== "diaria" && tocaEsteDia(tarea, fecha, dias)) {
      quienLaHace(tarea, dias).forEach(function (id) {
        if (!personas.includes(id)) {
          personas.push(id);
        }
      });
    }
  });

  return personas;
}

function pintarMes() {
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth() + desplazamientoMes, 1);
  const anio = primerDia.getFullYear();
  const mes = primerDia.getMonth();
  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  const huecosInicio = (primerDia.getDay() + 6) % 7;

  let html = `
    <div class="navegacion-semana">
      <button class="flecha" data-mover-mes="-1">‹</button>
      <span class="rango-semana">${nombresMeses[mes]} ${anio}</span>
      <button class="flecha" data-mover-mes="1">›</button>
    </div>
    <div class="calendario">`;

  ["L", "M", "X", "J", "V", "S", "D"].forEach(function (letra) {
    html += `<div class="cabecera-calendario">${letra}</div>`;
  });

  for (let i = 0; i < huecosInicio; i++) {
    html += `<div></div>`;
  }

  for (let d = 1; d <= diasDelMes; d++) {
    const fecha = new Date(anio, mes, d);
    const esHoy = mismoDia(fecha, hoy);
    const esSeleccionado = d === diaSeleccionado;

    let puntos = "";
    personasConTareasEspeciales(fecha).forEach(function (id) {
      puntos += `<span class="punto" style="background: ${buscarMiembro(id).color}"></span>`;
    });

    html += `
            <div class="celda-dia ${esHoy ? "celda-hoy" : ""} ${esSeleccionado ? "celda-seleccionada" : ""}" data-dia="${d}" data-fecha="${fechaTexto(fecha)}">
        <span class="numero-dia">${d}</span>
        <div class="puntos">${puntos}</div>
      </div>`;
  }

  html += `</div>`;
  html += `<p class="leyenda">Los puntos indican tareas especiales: basura, limpiezas a fondo y puertas y ventanas. Toca un día para ver quién hace qué.</p>`;

  contenido.innerHTML = html;
}

// ==== 5d. Vista Resumen (estadisticas) ====
const FECHA_ESTADISTICAS = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 21); // En la demo: hace 3 semanas. En tu casa: el día en que empezáis a usar la app
let periodoResumen = "semana"; // "semana" o "mes"

function sumarDias(fecha, n) {
  const nueva = new Date(fecha);
  nueva.setDate(nueva.getDate() + n);
  return nueva;
}

function porcentaje(hechas, asignadas) {
  if (asignadas === 0) return 0;
  return Math.min(100, Math.round((hechas / asignadas) * 100));
}

async function pintarResumen() {
  contenido.innerHTML = `<p class="vacio">Calculando...</p>`;


  // --- 1. Rango de fecha del periodo ---
  let desde;
  if (periodoResumen === "semana") {
    desde = lunesDeLaSemana(hoy);
  } else {
    desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  }
  if (desde < FECHA_ESTADISTICAS) {
    desde = new Date(FECHA_ESTADISTICAS);
  }
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  // --- 2. Tareas hechas en ese rango ---
  const respuesta = await db.from("hechas").select("*")
    .gte("fecha", fechaTexto(desde))
    .lte("fecha", fechaTexto(hasta));

  if (respuesta.error) {
    contenido.innerHTML = `<p class="vacio">No se ha podido cargar las estadísticas.</p>`;
    return;
  }

  // --- 3. Contar asignadas por personas y por día ---
  const porPersona = {};
  familia.forEach(function (miembro) {
    porPersona[miembro.id] = { asignadas: 0, hechas: 0 };
  });

  const dias = [];
  for (let dia = new Date(desde); dia <= hasta; dia = sumarDias(dia, 1)) {
    let asignadasDia = 0;

    tareasDelDia(dia).forEach(function (tarea) {
      if (tarea.opcional) return;
      tarea.responsables.forEach(function (id) {
        if (porPersona[id]) porPersona[id].asignadas++;
        asignadasDia++;
      });
    });

    dias.push({ fecha: new Date(dia), texto: fechaTexto(dia), asignadas: asignadasDia, hechas: 0 });
  }

  // --- 4. Contar hechas por persona y por día ---
  respuesta.data.forEach(function (fila) {
    // Solo cuenta si ese día  era una tarea obligatoria de esa persona
    const fechaFila = new Date(fila.fecha + "T00:00");
    const cuenta = tareasDelDia(fechaFila).some(function (t) {
      return t.id === fila.tarea_id && !t.opcional && t.responsables.includes(fila.miembro_id);
    });
    if (!cuenta) return;

    if (porPersona[fila.miembro_id]) porPersona[fila.miembro_id].hechas++;

    const dia = dias.find(function (d) {
      return d.texto === fila.fecha;
    });
    if (dia) dia.hechas++;
  });

  // --- 5. Totales ---
  let totalAsignadas = 0;
  let totalHechas = 0;
  familia.forEach(function (miembro) {
    totalAsignadas += porPersona[miembro.id].asignadas;
    totalHechas += porPersona[miembro.id].hechas;
  });

  // --- 6. Ranking: de mayor a menor % de cumplimiento ---
  const ranking = familia.slice().sort(function (a, b) {
    const pctA = porcentaje(porPersona[a.id].hechas, porPersona[a.id].asignadas);
    const pctB = porcentaje(porPersona[b.id].hechas, porPersona[b.id].asignadas);
    return pctB - pctA;
  });

  // --- 7. Dibujar ---
  let html = `
    <div class="selector-periodo">
      <button class="periodo ${periodoResumen === "semana" ? "activo" : ""}" data-periodo="semana">Esta semana</button>
      <button class="periodo ${periodoResumen === "mes" ? "activo" : ""}" data-periodo="mes">Este mes</button>
    </div>

    <div class="metricas">
    <div class="metrica"><span class="etiqueta">Completadas</span><span class="valor">${totalHechas}</span></div>
    <div class="metrica"><span class="etiqueta">Asignadas</span><span class="valor">${totalAsignadas}</span></div>
    <div class="metrica"><span class="etiqueta">Cumplimiento</span><span class="valor">${porcentaje(totalHechas, totalAsignadas)}%</span></div>
    </div>

    <h3 class="titulo-seccion">Por persona</h3>
    <div class="ranking">`;

  ranking.forEach(function (miembro, posicion) {
    const datos = porPersona[miembro.id];
    const pct = porcentaje(datos.hechas, datos.asignadas);
    const medalla = ["🥇", "🥈", "🥉"][posicion] || "";

    html += `
      <div class="fila-ranking" data-ficha-persona="${miembro.id}">
        <div class="avatar" style="background: ${miembro.color}">${miembro.nombre.charAt(0)}</div>
          <div class="datos-ranking">
           <div class="cabecera-ranking">
             <span>${medalla} ${miembro.nombre}</span>
             <span>${datos.hechas}/${datos.asignadas} · ${pct}%</span>
           </div>
          <div class="barra"><div class="relleno" style="width: ${pct}%; background: ${miembro.color}"></div></div>
        </div>
      </div>`;
  });

  html += `</div>
    <h3 class="titulo-seccion">Día a día</h3>
    <div class="grafico-dias">`;

  dias.forEach(function (d) {
    const pct = porcentaje(d.hechas, d.asignadas);
    html += `
      <div class="columna-dia" data-ficha-dia="${d.texto}" title="${d.hechas} de ${d.asignadas} (${pct}%)">
        <div class="barra-vertical"><div class="relleno-vertical" style="height: ${pct}%"></div></div>
           <span class="etiqueta-dia">${["D", "L", "M", "X", "J", "V", "S"][d.fecha.getDay()]}<br>${d.fecha.getDate()}</span>
      </div>`;
  });

  html += `</div>`;
  contenido.innerHTML = html;
}


// ===== 6. Cambiar de vista con el menú =====
const botonesMenu = document.querySelectorAll(".menu-boton");

function mostrarVista(vista) {
  if (vista === "hoy") {
    pintarHoy();
  } else if (vista === "semana") {
    desplazamientoSemana = 0;
    pintarSemana();
  } else if (vista === "mes") {
    desplazamientoMes = 0;
    diaSeleccionado = hoy.getDate();
    pintarMes();
  } else if (vista === "familia") {
    pintarFamilia();
  } else if (vista === "resumen") {
    pintarResumen();
  }
}

function refrescarVista() {
  const botonActivo = document.querySelector(".menu-boton.activo");
  mostrarVista(botonActivo.dataset.vista);
}

botonesMenu.forEach(function (boton) {
  boton.addEventListener("click", function () {
    botonesMenu.forEach(function (b) {
      b.classList.remove("activo");
    });
    boton.classList.add("activo");
    mostrarVista(boton.dataset.vista);
  });
});


// ===== 7. Marcar tareas como hechas (se guarda en Supabase) =====
contenido.addEventListener("click", async function (evento) {
  const tareaPulsada = evento.target.closest(".tarea[data-clave]");
  if (!tareaPulsada) return;

  const clave = tareaPulsada.dataset.clave;
  const partes = clave.split("|"); // [fecha, idTarea, idMiembro]
  const fila = { fecha: partes[0], tarea_id: Number(partes[1]), miembro_id: partes[2] };

  let respuesta;
  if (hechas[clave]) {
    delete hechas[clave];
    pintarHoy();
    respuesta = await db.from("hechas").delete().match(fila);
  } else {
    hechas[clave] = true;
    pintarHoy();
    respuesta = await db.from("hechas").insert(fila);
  }

  if (respuesta.error) {
    avisarError(respuesta.error);
    await cargarDatos();
    pintarHoy();
  }
});


// ===== 8. Flechas y días del calendario =====
contenido.addEventListener("click", function (evento) {
  const flecha = evento.target.closest(".flecha");

  if (flecha) {
    if (flecha.dataset.mover) {
      desplazamientoSemana += Number(flecha.dataset.mover);
      pintarSemana();
    } else if (flecha.dataset.moverMes) {
      desplazamientoMes += Number(flecha.dataset.moverMes);
      diaSeleccionado = null;
      pintarMes();
    }
    return;
  }

  const celda = evento.target.closest(".celda-dia");
  if (celda) {
    diaSeleccionado = Number(celda.dataset.dia);
    pintarMes();
    abrirFichaDia(celda.dataset.fecha);
  }
});

// ==== 8b. Selector de periodo del resumen ====
contenido.addEventListener("click", function (evento) {
  const botonPeriodo = evento.target.closest("[data-periodo]");
  if (!botonPeriodo) return;

  periodoResumen = botonPeriodo.dataset.periodo;
  pintarResumen();
});


// ===== 9. Gestionar tareas (botón +) =====
const modal = document.getElementById("modal");
const pantallaLista = document.getElementById("pantallaLista");
const formTarea = document.getElementById("formTarea");
const campoFrecuencia = document.getElementById("campoFrecuencia");
const grupoCadaDias = document.getElementById("grupoCadaDias");
const errorForm = document.getElementById("errorForm");

let posicionEditando = null;

const textosFrecuencia = {
  diaria: "Todos los días",
  cadaNDias: "Cada X días",
  semanal: "Semanal (sábado)",
  mensual: "Mensual (primer sábado)"
};

function pintarListaGestion() {
  let html = "";

  tareas.forEach(function (tarea, posicion) {
    let frecuencia = textosFrecuencia[tarea.frecuencia];
    if (tarea.frecuencia === "cadaNDias") {
      frecuencia = "Cada " + tarea.cadaDias + " días";
    }
    const reparto = tarea.reparto === "rotar" ? "por turnos" : "todos";

    let avatares = "";
    tarea.responsables.forEach(function (id) {
      const miembro = buscarMiembro(id);
      avatares += `<span class="mini-avatar" style="background: ${miembro.color}" title="${miembro.nombre}">${miembro.nombre.charAt(0)}</span>`;
    });

    html += `
      <li>
        <div class="info-gestion">
          <span class="titulo-gestion">${tarea.titulo}</span>
          <span class="detalle-gestion">${frecuencia} · ${reparto}</span>
        </div>
        <span class="avatares">${avatares}</span>
        <button type="button" class="boton-icono" data-editar="${posicion}" title="Editar">✎</button>
        <button type="button" class="boton-icono boton-borrar" data-borrar="${posicion}" title="Borrar">✕</button>
      </li>`;
  });

  document.getElementById("listaGestion").innerHTML = html;
}

function mostrarPantallaLista() {
  pintarListaGestion();
  formTarea.hidden = true;
  pantallaLista.hidden = false;
}

function mostrarFormulario(posicion) {
  posicionEditando = posicion;

  let html = "";
  familia.forEach(function (miembro) {
    html += `
      <label class="opcion-miembro">
        <input type="checkbox" value="${miembro.id}">
        <span class="mini-avatar" style="background: ${miembro.color}">${miembro.nombre.charAt(0)}</span>
        ${miembro.nombre}
      </label>`;
  });
  document.getElementById("campoResponsables").innerHTML = html;

  formTarea.reset();
  errorForm.textContent = "";

  if (posicion === null) {
    document.getElementById("tituloForm").textContent = "Nueva tarea";
  } else {
    const tarea = tareas[posicion];
    document.getElementById("tituloForm").textContent = "Editar tarea";
    document.getElementById("campoTitulo").value = tarea.titulo;
    campoFrecuencia.value = tarea.frecuencia;
    document.getElementById("campoReparto").value = tarea.reparto;
    if (tarea.cadaDias) {
      document.getElementById("campoCadaDias").value = tarea.cadaDias;
    }
    document.querySelectorAll("#campoResponsables input").forEach(function (casilla) {
      casilla.checked = tarea.responsables.includes(casilla.value);
    });
  }

  grupoCadaDias.hidden = campoFrecuencia.value !== "cadaNDias";
  pantallaLista.hidden = true;
  formTarea.hidden = false;
}

function abrirModal() {
  mostrarPantallaLista();
  modal.hidden = false;
}

function cerrarModal() {
  modal.hidden = true;
}

document.getElementById("botonNueva").addEventListener("click", abrirModal);
document.getElementById("botonCerrar").addEventListener("click", cerrarModal);
document.getElementById("botonCancelar").addEventListener("click", mostrarPantallaLista);

document.getElementById("botonNuevaTarea").addEventListener("click", function () {
  mostrarFormulario(null);
});

modal.addEventListener("click", async function (evento) {
  if (evento.target === modal) {
    cerrarModal();
    return;
  }

  const botonEditar = evento.target.closest("[data-editar]");
  if (botonEditar) {
    mostrarFormulario(Number(botonEditar.dataset.editar));
    return;
  }

  const botonBorrar = evento.target.closest("[data-borrar]");
  if (botonBorrar) {
    const tarea = tareas[Number(botonBorrar.dataset.borrar)];
    if (confirm(`¿Borrar la tarea "${tarea.titulo}"?`)) {
      const respuesta = await db.from("tareas").delete().eq("id", tarea.id);
      if (respuesta.error) {
        avisarError(respuesta.error);
        return;
      }
      await cargarDatos();
      pintarListaGestion();
      refrescarVista();
    }
  }
});

campoFrecuencia.addEventListener("change", function () {
  grupoCadaDias.hidden = campoFrecuencia.value !== "cadaNDias";
});

formTarea.addEventListener("submit", async function (evento) {
  evento.preventDefault();

  const marcados = [];
  document.querySelectorAll("#campoResponsables input:checked").forEach(function (casilla) {
    marcados.push(casilla.value);
  });

  if (marcados.length === 0) {
    errorForm.textContent = "Elige al menos un responsable.";
    return;
  }

  // Al editar, mantenemos el orden original de los turnos
  const anteriores = posicionEditando === null ? [] : tareas[posicionEditando].responsables;
  const responsables = anteriores.filter(function (id) {
    return marcados.includes(id);
  }).concat(marcados.filter(function (id) {
    return !anteriores.includes(id);
  }));

  const frecuencia = campoFrecuencia.value;
  const fila = {
    titulo: document.getElementById("campoTitulo").value.trim(),
    frecuencia: frecuencia,
    reparto: document.getElementById("campoReparto").value,
    responsables: responsables,
    cada_dias: frecuencia === "cadaNDias" ? Number(document.getElementById("campoCadaDias").value) : null
  };

  let respuesta;
  if (posicionEditando === null) {
    respuesta = await db.from("tareas").insert(fila);
  } else {
    respuesta = await db.from("tareas").update(fila).eq("id", tareas[posicionEditando].id);
  }

  if (respuesta.error) {
    avisarError(respuesta.error);
    return;
  }

  await cargarDatos();
  mostrarPantallaLista();
  refrescarVista();
});

// ===== 9b. Cambiar contraseña =====
const modalPassword = document.getElementById("modalPassword");
const formPassword = document.getElementById("formPassword");
const errorPassword = document.getElementById("errorPassword");


document.getElementById("botonPassword").addEventListener("click", function () {
  formPassword.reset();
  errorPassword.textContent = "";
  modalPassword.hidden = false;
});

document.getElementById("botonCancelarPassword").addEventListener("click", function () {
  modalPassword.hidden = true;
});

formPassword.addEventListener("submit", async function (evento) {
  evento.preventDefault();

  const nueva = document.getElementById("campoNuevaPassword").value;
  const repetida = document.getElementById("campoRepitePassword").value;

  if (nueva !== repetida) {
    errorPassword.textContent = "Las contraseñas no coinciden.";
    return;
  }

  const respuesta = await db.auth.updateUser({ password: nueva });

  if (respuesta.error) {
    errorPassword.textContent = "No se ha podido cambiar: " + respuesta.error.message;
    return;
  }

  modalPassword.hidden = true;
  alert("!Contraseña cambiada! La próxima vez que entres, usa la nueva.");
});


// ==== 9d. Tablón familiar y campanita ====
let notas = [];
let pestanaTablon = "compra";
let vistoAlAbrir = "";
let temporizadorToast = null;

const modalTablon = document.getElementById("modalTablon")
const listaTablon = document.getElementById("listaTablon")
const formTablon = document.getElementById("formTablon")
const campoNota = document.getElementById("campoNota")
const globoAvisos = document.getElementById("globoAvisos")
const toast = document.getElementById("toast")

const textoPestana = {
  compra: { placeholder: "¿Qué falta? Ej.: aceite", boton: "Añadir" },
  aviso: { placeholder: "Escribe un aviso para todos...", boton: "Publicar" }
};
// Convierte < > & en texto normal, para que nadie ueda "colar" HTML en una nota
function escaparHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function cuandoFue(texto) {
  const fecha = new Date(texto);
  if (mismoDia(fecha, new Date())) {
    return "hoy " + fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }
  return fecha.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })
}

function fechaCorta(texto) {
  return new Date(texto + "T00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
}

async function cargarNotas() {
  const respuesta = await db.from("observaciones").select("*")
    .order("creada_el", { ascending: false })
    .limit(100);
  if (respuesta.error) throw respuesta.error;
  notas = respuesta.data;
}

// --- La campanita: cuántas notas de otros hay desde la última vez que abrí ---
function claveVisto() {
  return "tablonVisto_" + yo.id;
}

function actualizarGlobo() {
  const visto = localStorage.getItem(claveVisto()) || "";
  const nuevas = notas.filter(function (nota) {
    return nota.autor_id !== yo.id && nota.creada_el > visto;
  }).length;

  globoAvisos.textContent = nuevas > 9 ? "9+" : nuevas;
  globoAvisos.hidden = nuevas === 0;
}

function marcarTodoVisto() {
  if (notas.length > 0) {
    localStorage.setItem(claveVisto(), notas[0].creada_el);
  }
  actualizarGlobo();
}


// --- Pintar el tablón ---
function pintarTablon() {
  document.querySelectorAll(".pestana").forEach(function (boton) {
    boton.classList.toggle("activa", boton.dataset.pestana === pestanaTablon);
  });

  const deEstaPestana = notas.filter(function (nota) {
    return nota.tipo === pestanaTablon;
  });

  // En la compra, lo pendiente primero
  if (pestanaTablon === "compra") {
    deEstaPestana.sort(function (a, b) {
      return a.resuelta - b.resuelta;
    });
  }

  let html = "";
  if (deEstaPestana.length === 0) {
    html = `<li class="vacio">No hay nada por aquí</li>`;
  }

  deEstaPestana.forEach(function (nota) {
    const autor = buscarMiembro(nota.autor_id);
    const esNueva = nota.autor_id !== yo.id && nota.creada_el > vistoAlAbrir;
    const puedeBorrar = nota.autor_id === yo.id || yo.admin;

    let detalle = "";
    if (nota.tipo === "tarea") {
      const tarea = tareas.find(function (t) { return t.id === nota.tarea_id; });
      const dueno = buscarMiembro(nota.miembro_id);
      detalle = `<b>${tarea ? escaparHTML(tarea.titulo) : "Tarea borrada"}</b> de ${dueno.nombre} (${fechaCorta(nota.fecha)}) :`;
    }

    html += `
         <li class="nota ${esNueva ? "nueva" : ""} ${nota.resuelta ? "resuelta" : ""}">
         
         ${nota.tipo === "compra" ? `<button type="button" class="casilla" data-resolver="${nota.id}">${nota.resuelta ? "✓" : ""}</button>` : ""}
           <div class="nota-texto">
             <span class="nota-meta">
               <span class="mini-avatar" style="background: ${autor.color}">${autor.nombre.charAt(0)}</span>
               ${autor.nombre} · ${cuandoFue(nota.creada_el)}              
               </span>
             <span class="nota-cuerpo">${detalle}${escaparHTML(nota.texto)}</span>
           </div>
           ${puedeBorrar ? `<button type="button" class="boton-borrar-nota" data-borrar-nota="${nota.id}" title="Borrar">🗑</button>` : ""}
           </li>`;
  });

  listaTablon.innerHTML = html;


  // --- Las observaciones se ecriben desde la ficha, aquí solo se leen ---
  formTablon.hidden = pestanaTablon === "tarea";
  if (pestanaTablon !== "tarea") {
    campoNota.placeholder = textoPestana[pestanaTablon].placeholder;
    document.getElementById("botonNota").textContent = textoPestana[pestanaTablon].boton;
  }
}

function abrirTablon(pestana) {
  if (pestana) pestanaTablon = pestana;
  vistoAlAbrir = localStorage.getItem(claveVisto()) || "";
  marcarTodoVisto();
  pintarTablon();
  modalTablon.hidden = false;
  comprobarBotonAvisos();
}

document.getElementById("botonCampana").addEventListener("click", function () {
  abrirTablon();
});

document.getElementById("botonCerrarTablon").addEventListener("click", function () {
  modalTablon.hidden = true;
});

// --- Clics dentro del tablón: pestañas, casillas y papelera ---
modalTablon.addEventListener("click", async function (evento) {
  const pestana = evento.target.closest(".pestana");
  if (pestana) {
    pestanaTablon = pestana.dataset.pestana;
    pintarTablon();
    return;
  }

  const casilla = evento.target.closest("[data-resolver]");
  if (casilla) {
    const nota = notas.find(function (n) { return n.id === Number(casilla.dataset.resolver); });
    nota.resuelta = !nota.resuelta;
    pintarTablon();
    const respuesta = await db.from("observaciones").update({ resuelta: nota.resuelta }).eq("id", nota.id);
    if (respuesta.error) avisarError(respuesta.error);
    return;
  }

  const papelera = evento.target.closest("[data-borrar-nota]");
  if (papelera) {
    if (!confirm("¿Borrar esta nota?")) return;
    const id = Number(papelera.dataset.borrarNota);
    const respuesta = await db.from("observaciones").delete().eq("id", id);
    if (respuesta.error) {
      avisarError(respuesta.error);
      return;
    }
    notas = notas.filter(function (n) { return n.id !== id; });
    pintarTablon();
    return;
  }
});

// --- Añadir compra o aviso ---
formTablon.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  const texto = campoNota.value.trim();
  if (!texto) return;

  const respuesta = await db.from("observaciones")
    .insert({ tipo: pestanaTablon, texto: texto })
    .select()
    .single();

  if (respuesta.error) {
    avisarError(respuesta.error);
    return;
  }

  notas.unshift(respuesta.data);
  campoNota.value = "";
  marcarTodoVisto();
  pintarTablon();
});

// --- Aviso emergente arriba ---
const frasesToast = {
  compra: "ha añadido a la compra",
  aviso: "ha publicado un aviso",
  tarea: "ha puesto una observación"
};

function mostrarToast(nota) {
  const autor = buscarMiembro(nota.autor_id);
  toast.textContent = "💬 " + (autor ? autor.nombre : "Alguien") + " " + frasesToast[nota.tipo] + ": " + nota.texto;
  toast.dataset.pestana = nota.tipo;
  toast.hidden = false;

  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(function () {
    toast.hidden = true;
  }, 5000);
}

toast.addEventListener("click", function () {
  toast.hidden = true;
  abrirTablon(toast.dataset.pestana);
});

// --- Lo que llega por tiempo real ---
function cambioEnNotas(cambio) {
  if (cambio.eventType === "INSERT") {
    const nota = cambio.new;
    const yaLaTengo = notas.some(function (n) { return n.id === nota.id });
    if (!yaLaTengo) notas.unshift(nota);
    if (nota.autor_id !== yo.id) mostrarToast(nota);
  } else if (cambio.eventType === "UPDATE") {
    notas = notas.map(function (n) {
      return n.id === cambio.new.id ? cambio.new : n;
    });
  } else if (cambio.eventType === "DELETE") {
    notas = notas.filter(function (n) { return n.id !== cambio.old.id; });
  }

  if (!modalTablon.hidden) {
    marcarTodoVisto();
    pintarTablon();
  } else {
    actualizarGlobo();

  }
  if (!modalFicha.hidden) pintarFicha();
}


// ==== 9e. Ficha de regitro (se abre desde el resumen) ====
const modalFicha = document.getElementById("modalFicha");
const contenidoFicha = document.getElementById("contenidoFicha");

let fichaPersona = null;  // id de la persona, o null si es la ficha de un día
let fichaFecha = null;    // el lunes de la semana (persona) o el día (día)
let fichaAbierta = "";    // clave de la tarea con las observaciones desplegadas
let hechasFicha = {};
let obsFicha = [];

const CIRCUNFERENCIA = 2 * Math.PI * 54;  // largo del borde del anillo (radio 54)



// --- Abrir ---
function abrirFichaPersona(idMiembro) {
  fichaPersona = idMiembro;
  fichaFecha = lunesDeLaSemana(hoy);
  fichaAbierta = "";
  modalFicha.hidden = false;
  pintarFicha();
}

function abrirFichaDia(texto) {
  fichaPersona = null;
  fichaFecha = new Date(texto + "T00:00");
  fichaAbierta = "";
  modalFicha.hidden = false;
  pintarFicha();
}



// --- Traer de Supabase lo hecho y las observaciones de esas fechas ---
async function cargarDatosFicha(desde, hasta) {
  const respuestaHechas = await db.from("hechas").select("*")
    .gte("fecha", fechaTexto(desde))
    .lte("fecha", fechaTexto(hasta));
  if (respuestaHechas.error) throw respuestaHechas.error;

  hechasFicha = {};
  respuestaHechas.data.forEach(function (fila) {
    hechasFicha[fila.fecha + "|" + fila.tarea_id + "|" + fila.miembro_id] = true;
  });

  const respuestaObs = await db.from("observaciones").select("*")
    .eq("tipo", "tarea")
    .gte("fecha", fechaTexto(desde))
    .lte("fecha", fechaTexto(hasta))
    .order("creada_el");
  if (respuestaObs.error) throw respuestaObs.error;

  obsFicha = respuestaObs.data;
}



// --- ¿Cómo está cada tarea? ok, x (no hecha), p (pendiente hoy), op (optional), f (futuro), sin (antes de usar la app ---)
function estadoTarea(fecha, tarea, idMiembro) {
  if (hechasFicha[claveTarea(fecha, tarea.id, idMiembro)]) return "ok";
  if (tarea.opcional) return "op";

  const dia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const hoySinhora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  if (dia < FECHA_ESTADISTICAS) return "sin";
  if (dia < hoySinhora) return "x";
  if (dia.getTime() === hoySinhora.getTime()) return "p";
  return "f";
}

function observacionesDe(clave) {
  return obsFicha.filter(function (o) {
    return o.fecha + "|" + o.tarea_id + "|" + o.miembro_id === clave;
  });
}


// --- Una tarea de la ficha (y su panel de observaciones si esta abierta) ---
function htmlTareaFicha(fecha, tarea, idMiembro, estado) {
  const clave = claveTarea(fecha, tarea.id, idMiembro);
  const susObs = observacionesDe(clave);
  const simbolos = { ok: "✓", x: "✕" };
  const etiquetas = { op: "opcional", p: "hoy" };

  let html = `
        <li class="tarea-ficha ${estado}" data-abrir-obs="${clave}">
     <span class="marca ${estado}">${simbolos[estado] || ""}</span>
     <span class="titulo-ficha">${escaparHTML(tarea.titulo)}</span>
     ${etiquetas[estado] ? `<span class="etiqueta-ficha">${etiquetas[estado]}</span>` : ""}
     ${susObs.length > 0 ? `<span class="etiqueta-ficha">💬 ${susObs.length}</span>` : ""}
    </li>`;

  if (fichaAbierta === clave) {
    html += `<li class="panel-obs">`;

    susObs.forEach(function (o) {
      const autor = buscarMiembro(o.autor_id);
      html += `<p class="obs-linea"><b>${autor.nombre}:</b> ${escaparHTML(o.texto)}</p>`;
    });

    if (yo.admin || idMiembro === yo.id) {
      html += `
        <form class="form-obs" data-obs-clave="${clave}">
          <input type="text" maxlength="300" required placeholder="¿Por qué no se hizo?">
          <button type="submit" class="boton-principal">Guardar</button>
        </form>`;
    } else if (susObs.length === 0) {
      html += `<p class="obs-linea">Sin observaciones.</p>`;
    }

    html += `</li>`;
  }

  return html;
}


// --- Un bloque: un día (ficha de persona) o una persona (ficha de día) ---
function htmlBloque(titulo, fecha, lista, idMiembro, cuenta) {
  const obligatorias = lista.filter(function (t) { return !t.opcional; });
  const hechasBloque = obligatorias.filter(function (t) {
    return hechasFicha[claveTarea(fecha, t.id, idMiembro)];
  }).length;
  const esHoy = fichaPersona && mismoDia(fecha, hoy);

  let html = `
    <div class="bloque-ficha ${esHoy ? "es-hoy" : ""}">
      <div class="cabecera-bloque">
        <span>${titulo}</span>
        <span>${lista.length === 0 ? "Descanso" : hechasBloque + "/" + obligatorias.length}</span>
      </div>
      <ul class="lista-ficha">`;

  lista.forEach(function (tarea) {
    const estado = estadoTarea(fecha, tarea, idMiembro);
    if (!tarea.opcional && cuenta[estado] !== undefined) cuenta[estado]++;
    html += htmlTareaFicha(fecha, tarea, idMiembro, estado);
  });

  html += `</ul></div>`;
  return html;
}

// --- el anilo con el porcentaje ---
function htmlAnillo(cuenta) {
  const total = cuenta.ok + cuenta.x + cuenta.p;
  const pct = porcentaje(cuenta.ok, total);

  return `
    <div class="lado-ficha">
      <div class="anillo">
        <svg viewBox="0 0 130 130">
          <circle cx="65" cy="65" r="54" class="anillo-fondo"></circle>
          <circle cx="65" cy="65" r="54" class="anillo-relleno" id="anilloRelleno"
            stroke-dasharray="${CIRCUNFERENCIA}" stroke-dashoffset="${CIRCUNFERENCIA}" data-pct="${pct}"></circle>
        </svg>
        <div class="anillo-texto"><b>${pct}%</b><span>${fichaPersona ? "de la semana" : "del día"}</span></div>
      </div>
      <div class="leyenda-ficha">
        <span><i class="cuadro ok"></i>Hechas: ${cuenta.ok}</span>
        <span><i class="cuadro x"></i>No hechas: ${cuenta.x}</span>
        <span><i class="cuadro p"></i>Pendientes hoy: ${cuenta.p}</span>
      </div>
    </div>`;
}

function animarAnillo() {
  const relleno = document.getElementById("anilloRelleno");
  if (!relleno) return;
  const pct = Number(relleno.dataset.pct);
  setTimeout(function () {
    relleno.style.strokeDashoffset = CIRCUNFERENCIA * (1 - pct / 100);
  }, 50);
}


// --- Lista de observaciones al final de la ficha ---
function htmlResumenObs() {
  const lista = obsFicha.filter(function (o) {
    return !fichaPersona || o.miembro_id === fichaPersona;
  });
  if (lista.length === 0) return "";

  let html = `<div class="resumen-obs"><h3>Observaciones</h3>`;
  lista.forEach(function (o) {
    const tarea = tareas.find(function (t) { return t.id === o.tarea_id; });
    const autor = buscarMiembro(o.autor_id);
    const dueno = buscarMiembro(o.miembro_id);
    html += `
      <p><b>${fechaCorta(o.fecha)} · ${tarea ? escaparHTML(tarea.titulo) : "Tarea borrada"}${fichaPersona ? "" : " (" + dueno.nombre + ")"}:</b>
      ${escaparHTML(o.texto)} <span class="etiqueta-ficha">— ${autor.nombre}</span></p>`;
  });
  return html + `</d>`;
}


// --- Dibujar la ficha con los datos que ya tenemos ---
function dibujarFicha() {
  const cuenta = { ok: 0, x: 0, p: 0 };
  let cuerpo = "";
  let titulo = "";

  if (fichaPersona) {
    const miembro = buscarMiembro(fichaPersona);
    const domingo = sumarDias(fichaFecha, 6);
    titulo = `
      <div class="avatar" style="background: ${miembro.color}">${miembro.nombre.charAt(0)}</div>
      <div><h2>${miembro.nombre}</h2>
      <p>Semana del ${fichaFecha.getDate()} al ${domingo.getDate()} de ${nombresMeses[domingo.getMonth()].toLowerCase()}</p></div>`;

    for (let i = 0; i < 7; i++) {
      const dia = sumarDias(fichaFecha, i);
      const suyas = tareasDelDia(dia).filter(function (t) {
        return t.responsables.includes(fichaPersona);
      });
      cuerpo += htmlBloque(nombresDias[i] + " " + dia.getDate(), dia, suyas, fichaPersona, cuenta);
    }
  } else {
    let textoDia = fichaFecha.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    textoDia = textoDia.charAt(0).toUpperCase() + textoDia.slice(1);
    titulo = `<div><h2>${textoDia}</h2><p>Toda la familia</p></div>`;

    familia.forEach(function (miembro) {
      const suyas = tareasDelDia(fichaFecha).filter(function (t) {
        return t.responsables.includes(miembro.id);
      });
      const nombre = `<span class="mini-avatar" style="background: ${miembro.color}">${miembro.nombre.charAt(0)}</span> ${miembro.nombre}`;
      cuerpo += htmlBloque(nombre, fichaFecha, suyas, miembro.id, cuenta);
    });
  }

  contenidoFicha.innerHTML = `
    <div class="cabecera-modal">
      <div class="titulo-ficha-grande">${titulo}</div>
      <div class="botones-ficha">
        <button type="button" class="boton-ficha" data-mover-ficha="-1">◀</button>
        <button type="button" class="boton-ficha" data-mover-ficha="1">▶</button>
        <button type="button" class="boton-cerrar" data-cerrar-ficha>✕</button>
      </div>
    </div>
    <div class="cuerpo-ficha">
      <div class="dias-ficha">${cuerpo}</div>
      ${htmlAnillo(cuenta)}
    </div>
    ${htmlResumenObs()}`;
  animarAnillo();
}


// --- Cargar y dibujar ---
async function pintarFicha() {
  const hasta = fichaPersona ? sumarDias(fichaFecha, 6) : fichaFecha;
  try {
    await cargarDatosFicha(fichaFecha, hasta);
    dibujarFicha();
  } catch (error) {
    console.error(error);
    contenidoFicha.innerHTML = `<p class="vacio">No se ha podido cargar la ficha.</p>`;
  }
}


// --- Abrir desde el Resumen ---
contenido.addEventListener("click", function (evento) {
  const persona = evento.target.closest("[data-ficha-persona]");
  if (persona) {
    abrirFichaPersona(persona.dataset.fichaPersona);
    return;
  }
  const dia = evento.target.closest("[data-ficha-dia]");
  if (dia) abrirFichaDia(dia.dataset.fichaDia);
});


// --- Clics dentro de la fecha ---
modalFicha.addEventListener("click", function (evento) {
  if (evento.target.closest("[data-cerrar-ficha]")) {
    modalFicha.hidden = true;
    return;
  }

  const mover = evento.target.closest("[data-mover-ficha]");
  if (mover) {
    const paso = Number(mover.dataset.moverFicha) * (fichaPersona ? 7 : 1);
    fichaFecha = sumarDias(fichaFecha, paso);
    fichaAbierta = "";
    pintarFicha();
    return;
  }

  const fila = evento.target.closest("[data-abrir-obs]");
  if (fila) {
    fichaAbierta = fichaAbierta === fila.dataset.abrirObs ? "" : fila.dataset.abrirObs;
    dibujarFicha();
  }
});


// --- guardar una observación ---
modalFicha.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  const form = evento.target;
  const input = form.querySelector("input");
  const texto = input.value.trim();
  if (!texto) return;

  const partes = form.dataset.obsClave.split("|"); // [fecha, idTarea, idMiembro]
  const respuesta = await db.from("observaciones")
    .insert({ tipo: "tarea", fecha: partes[0], tarea_id: Number(partes[1]), miembro_id: partes[2], texto: texto })
    .select()
    .single();

  if (respuesta.error) {
    avisarError(respuesta.error);
    return;
  }

  obsFicha.push(respuesta.data);
  if (!notas.some(function (n) { return n.id === respuesta.data.id; })) {
    notas.unshift(respuesta.data);
  }
  marcarTodoVisto();
  dibujarFicha();
});



// ==== = 9c. tiempo real =====
let canalTiempoReal = null;

function repintarVistaActual() {
  const vista = document.querySelector(".menu-boton.activo").dataset.vista;

  if (vista === "hoy") {
    pintarHoy();
  } else if (vista === "semana") {
    pintarSemana();
  } else if (vista === "mes") {
    pintarMes();
  } else if (vista === "familia") {
    pintarFamilia();
  } else if (vista === "resumen") {
    pintarResumen();
  }
}

async function recargarPorCambio() {
  try {
    await cargarDatos();
    await cargarNotas();
    actualizarGlobo();
    repintarVistaActual();
  } catch (error) {
    console.error(error);
  }
}

function activarTiempoReal() {
  if (canalTiempoReal) return; // ya estaba activo

  canalTiempoReal = db.channel("cambios-agenda")
    .on("postgres_changes", { event: "*", schema: "public", table: "hechas" }, recargarPorCambio)
    .on("postgres_changes", { event: "*", schema: "public", table: "tareas" }, recargarPorCambio)
    .on("postgres_changes", { event: "*", schema: "public", table: "observaciones" }, cambioEnNotas)
    .subscribe();
}

function desactivarTiempoReal() {
  if (canalTiempoReal) {
    db.removeChannel(canalTiempoReal);
    canalTiempoReal = null;
  }
}

// Al volver a la app (desbloquear el móvil, cambiar de pestaña,...) recargar por si nos perdimos algo
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && yo) {
    recargarPorCambio();
  }
});




// ===== 10. Inicio de sesión y arranque =====
const pantallaLogin = document.getElementById("pantallaLogin");
const formLogin = document.getElementById("formLogin");
const errorLogin = document.getElementById("errorLogin");

formLogin.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  errorLogin.textContent = "";

  const respuesta = await db.auth.signInWithPassword({
    email: document.getElementById("campoEmail").value.trim(),
    password: document.getElementById("campoPassword").value
  });

  if (respuesta.error) {
    errorLogin.textContent = "Email o contraseña incorrectos.";
    return;
  }

  formLogin.reset();
  iniciar();
});

document.getElementById("botonSalir").addEventListener("click", async function () {
  desactivarTiempoReal();
  await db.auth.signOut();
  yo = null;
  iniciar();
});

async function iniciar() {
  // ¿Hay alguien con la sesión iniciada en este navegador?
  const respuestaSesion = await db.auth.getSession();
  const sesion = respuestaSesion.data.session;

  if (!sesion) {
    document.body.classList.add("sin-sesion")
    document.getElementById("barraUsuario").hidden = true;
    pantallaLogin.hidden = false;
    return;
  }

  document.body.classList.remove("sin-sesion")
  pantallaLogin.hidden = true;
  contenido.innerHTML = `<p class="vacio">Cargando…</p>`;

  try {
    await cargarDatos();

    yo = familia.find(function (miembro) {
      return miembro.usuario_id === sesion.user.id;
    });

    if (!yo) {
      contenido.innerHTML = `<p class="vacio">Tu cuenta no está vinculada a ningún miembro de la familia.</p>`;
      return;
    }

    document.getElementById("saludo").textContent = "Hola, " + yo.nombre;
    document.getElementById("barraUsuario").hidden = false;
    document.getElementById("botonNueva").hidden = !yo.admin;

    await cargarNotas();
    actualizarGlobo();
    mostrarVista("hoy");
    activarTiempoReal();
  } catch (error) {
    console.error(error);
    contenido.innerHTML = `<p class="vacio">No se ha podido conectar con la base de datos.<br>${error.message}</p>`;
  }
}

// ==== 11. Service worker (notificaciones en el móvil) ====
const botonActivarAvisos = document.getElementById("botonActivarAvisos");
const pistaAvisos = document.getElementById("pistaAvisos");

// ¿Este navegador puede recibir notificaciones push?
function pushDisponible() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// La clave pública está en texto base64url; el navegador la quiere en bytes
function claveEnBytes(texto) {
  const relleno = "=".repeat((4 - (texto.length % 4)) % 4);
  const base64 = (texto + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64);
  return Uint8Array.from(binario, function (c) { return c.charCodeAt(0); });
}

// Enseñar el botón solo si hace falta 
async function comprobarBotonAvisos() {
  if (!pushDisponible()) {
    botonActivarAvisos.hidden = true;
    pistaAvisos.hidden = false;
    return;
  }

  pistaAvisos.hidden = true;
  const registro = await navigator.serviceWorker.ready;
  const suscripcion = await registro.pushManager.getSubscription();
  botonActivarAvisos.hidden = suscripcion !== null && Notification.permission === "granted";
}

async function activarAvisos() {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    alert("Sin permiso no se pueden enviar avisos. Puedes activarlo en los ajustes del navegador.");
    return;
  }

  const registro = await navigator.serviceWorker.ready;
  let suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) {
    suscripcion = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: claveEnBytes(VAPID_PUBLICA)
  });
}

  const datos = suscripcion.toJSON();
  const respuesta = await db.from("suscripciones").upsert(
   { endpoint: datos.endpoint, p256dh: datos.keys.p256dh, auth: datos.keys.auth},
   { onConflict: "endpoint", ignoreDuplicates: true }
  );

  if (respuesta.error) {
    avisarError(respuesta.error);
   return;
  }

  botonActivarAvisos.hidden = true;
  alert("¡Listo! Este dispositivo recibirá los avisos de la familia.");
} 

botonActivarAvisos.addEventListener("click", function () {
  activarAvisos().catch(avisarError);
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(function (error) {
    console.error("No se pudo registrar el service worker", error);
  });
}

iniciar();