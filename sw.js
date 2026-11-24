// sw.js  — Service worker: recibe las notificaciones aun que la app esté cerrada


self.addEventListener("install", function () {
    self.skipWaiting(); // activarse sin espera
});

self.addEventListener("activate", function (evento) {
    evento.waitUntil(self.clients.claim()); // controlar ya las pestañas abiertas
});


// Llega un aviso desde el servidor → mostrar la notificación
self.addEventListener("push", function (evento) {
  let datos = {titulo: "Agenda familiar", cuerpo: "Hay novedades"};

    if (evento.data) {
        try {
        datos = evento.data.json();
    } catch (error) {
        datos.cuerpo = evento.data.text();
    }
  }

  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
        body: datos.cuerpo,
        icon: "icono-192.png",
        badge: "icono-192.png",
        data: { url: datos.url || "/" }
    })
  );
});


// Al pulsar la notificaciones → abrir la app (o traerla al frente si ya esta abierta)
self.addEventListener("notificationclick", function (evento) {
    evento.notification.close();

    evento.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (ventanas) {
            for (const ventana of ventanas) {
                if ("focus" in ventana) return ventana.focus();
            }
            return self.clients.openWindow(evento.notification.data.url);
        })
    );
});