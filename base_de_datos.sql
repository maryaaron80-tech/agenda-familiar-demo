-- ===== 1. Tabla de miembros =====
create table miembros (
  id     text primary key,
  nombre text not null,
  rol    text,
  admin  boolean not null default false,
  color  text not null,
  orden  int not null default 0
);

-- ===== 2. Tabla de tareas =====
create table tareas (
  id           bigint generated always as identity primary key,
  titulo       text not null,
  frecuencia   text not null check (frecuencia in ('diaria', 'cadaNDias', 'semanal', 'mensual')),
  reparto      text not null check (reparto in ('todos', 'rotar')),
  responsables text[] not null,
  cada_dias    int,
  desfase      int not null default 0,
  creada_el    timestamptz not null default now()
);

-- ===== 3. Tabla de tareas hechas =====
create table hechas (
  fecha      date not null,
  tarea_id   bigint not null references tareas(id) on delete cascade,
  miembro_id text not null references miembros(id) on delete cascade,
  primary key (fecha, tarea_id, miembro_id)
);

-- ===== 4. Datos iniciales: la familia =====
insert into miembros (id, nombre, rol, admin, color, orden) values
  ('javier', 'Javier',  'Papá',    true,  '#3b6ea5', 1),
  ('lucia',  'Lucía',  'Mamá',    true,  '#c2185b', 2),
  ('rosa',   'Rosa', 'Abuela',  false, '#8e6bbf', 3),
  ('sofia',  'Sofía',   'Hija',    false, '#e08a3c', 4),
  ('daniel', 'Daniel',  'Hijo',    false, '#2e9e6a', 5),
  ('pablo',  'Pablo',   'Sobrino', false, '#c9a227', 6);

-- ===== 5. Datos iniciales: las tareas =====
insert into tareas (titulo, frecuencia, reparto, responsables, cada_dias, desfase) values
  ('Cocinar',                          'diaria',    'todos', array['javier'],                                       null, 0),
  ('Lavandería',                       'diaria',    'todos', array['rosa'],                                      null, 0),
  ('Lavar platos',                     'diaria',    'rotar', array['sofia','daniel','pablo'],                         null, 0),
  ('Barrer sala, cocina y pasillos',   'diaria',    'rotar', array['sofia','daniel','pablo'],                         null, 1),
  ('Barrer baño aseo',                 'diaria',    'rotar', array['lucia','sofia'],                                null, 0),
  ('Barrer baño ducha',                'diaria',    'rotar', array['daniel','pablo'],                                null, 0),
  ('Barrer su dormitorio',             'diaria',    'todos', array['javier','lucia','rosa','sofia','daniel','pablo'], null, 0),
  ('Tirar la basura',                  'cadaNDias', 'rotar', array['javier','sofia','daniel','pablo'],                 2,    0),
  ('Baño aseo a fondo',                'semanal',   'rotar', array['lucia','sofia'],                                null, 0),
  ('Baño ducha y cocina a fondo',      'semanal',   'rotar', array['daniel','pablo'],                                null, 0),
  ('Sala, balcones y pasillos a fondo','semanal',   'rotar', array['pablo','daniel'],                                null, 0),
  ('Su dormitorio a fondo',            'semanal',   'todos', array['javier','lucia','rosa','sofia','daniel','pablo'], null, 0),
  ('Puertas y ventanas',               'mensual',   'todos', array['javier','daniel','pablo'],                        null, 0);

  -- (Reglas provisionales: se sustituyen por las definitivas más abajo)
-- ===== 6. Seguridad (provisional, se endurece en la fase 7d) =====
alter table miembros enable row level security;
alter table tareas   enable row level security;
alter table hechas   enable row level security;

create policy "Acceso provisional" on miembros for all using (true) with check (true);
create policy "Acceso provisional" on tareas   for all using (true) with check (true);
create policy "Acceso provisional" on hechas   for all using (true) with check (true);

grant select, insert, update, delete on miembros, tareas, hechas to anon, authenticated;





-- 1. Nueva columna en miembros para guardar el id de su cuenta
alter table miembros
  add column usuario_id uuid unique references auth.users(id) on delete set null;

-- 2. Vincular cada miembro con su cuenta, buscándola por el email
update miembros set usuario_id = (select id from auth.users where email = 'EMAIL_DE_JAVIER')  where id = 'javier';
update miembros set usuario_id = (select id from auth.users where email = 'EMAIL_DE_LUCIA')  where id = 'lucia';
update miembros set usuario_id = (select id from auth.users where email = 'EMAIL_DE_ROSA') where id = 'rosa';
update miembros set usuario_id = (select id from auth.users where email = 'EMAIL_DE_SOFIA')   where id = 'sofia';
update miembros set usuario_id = (select id from auth.users where email = 'EMAIL_DE_DANIEL')  where id = 'daniel';
update miembros set usuario_id = (select id from auth.users where email = 'EMAIL_DE_PABLO')   where id = 'pablo';



-- ===== 7. Funciones de ayuda =====
-- ¿Qué miembro soy yo? (devuelve 'javier', 'sofia'…)
create or replace function public.mi_miembro()
returns text
language sql stable security definer
set search_path = public
as $$
  select id from miembros where usuario_id = auth.uid()
$$;

-- ¿Soy administrador? (devuelve true o false)
create or replace function public.soy_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select admin from miembros where usuario_id = auth.uid()), false)
$$;


-- ===== 8. Quitar el acceso provisional =====
drop policy "Accseso provisional" on miembros;
drop policy "Accseso provisional" on tareas;
drop policy "Accseso provisional" on hechas;

revoke all on miembros, tareas, hechas from anon;

-- ===== 9. Reglas definitivas =====
-- Miembros: solo leer
create policy "Ver miembros" on miembros
  for select to authenticated using (true);

-- Tareas: todos leen, solo los administradores modifican
create policy "Ver tareas" on tareas
  for select to authenticated using (true);

create policy "Admins crean tareas" on tareas
  for insert to authenticated with check (soy_admin());

create policy "Admins editan tareas" on tareas
  for update to authenticated using (soy_admin()) with check (soy_admin());

create policy "Admins borran tareas" on tareas
  for delete to authenticated using (soy_admin());

-- Hechas: todos leen; cada uno marca las suyas y los administradores las de cualquiera
create policy "Ver hechas" on hechas
  for select to authenticated using (true);

create policy "Marcar hechas" on hechas
  for insert to authenticated with check (miembro_id = mi_miembro() or soy_admin());

create policy "Desmarcar hechas" on hechas
  for delete to authenticated using (miembro_id = mi_miembro() or soy_admin());



-- ===== 10. Tiempo real =====
alter publication supabase_realtime add table hechas, tareas;




-- =========================================
--  11. Días de la semana y tareas opcionales (21/11/2026)
-- =========================================

-- 1. Columnas nuevas (por defecto: todos los días, ninguno opcional)
alter table tareas
   add column dias_semana int[] not null default '{0,1,2,3,4,5,6}',
   add column dias_opcionales int[] not null default '{}',
   add column depende_de bigint references tareas(id) on delete set null;


-- 2. solo se admiten números del 0 al 6
alter table tareas
   add constraint dias_validos check (
    dias_semana <@ array[0,1,2,3,4,5,6]
    and dias_opcionales <@ array[0,1,2,3,4,5,6]
  );


-- 3. Barrer: de lunes a viernes
update tareas set dias_semana = '{1,2,3,4,5}'
where titulo ilike 'Barrer%';


-- 4. Lavandería: de lunes a sábado
update tareas set dias_semana = '{1,2,3,4,5,6}'
where titulo ilike 'Lavander%';


-- 5. Cocinar: el domingo es opcional
update tareas set dias_opcionales = '{0}'
where titulo ilike 'Cocinar%';


-- 6. Lavar platos: el domingo es opcional y solo si alguien cocinó
update tareas set
  dias_opcionales = '{0}',
  depende_de = (select id from tareas where titulo ilike 'Cocinar%' limit 1)
where titulo ilike 'Lavar platos%';


-- ================================================
-- Observaciones, compra y avisos (22/11/2026)
-- ================================================

-- 1. La tabla
create table observaciones (
  id bigint generated always as identity primary key,
  tipo text not null default 'tarea' check (tipo in ('tarea', 'compra', 'aviso')),
  fecha date not null default current_date,
  tarea_id bigint references tareas(id) on delete cascade,
  miembro_id text references miembros(id),
  autor_id text not null default mi_miembro() references miembros(id),
  texto text not null check (char_length(texto) between 1 and 300),
  resuelta boolean not null default false,
  creada_el timestamptz not null default now(),

  -- Las de tipo tarea nesecitan tarea y dueño; las demas no llevan
  check (
    (tipo = 'tarea' and tarea_id is not null and miembro_id is not null)
    or (tipo <> 'tarea' and tarea_id is null and miembro_id is null)
  )
);


-- 2. Activar la seguridad
alter table observaciones enable row level security;


-- 3. Leer: toda la familia
create policy "Ver observaciones"
on observaciones for select
to authenticated
using (true);


-- 4. Escribir: firmado con tu nombre.
--    Si es de una tarea, solo en las tuyas (o en cualquiera si eres admin)
create policy "Escribir observaciones"
on observaciones for insert
to authenticated
with check (
  autor_id = mi_miembro()
  and (tipo <> 'tarea' or miembro_id = mi_miembro() or soy_admin())
);


-- 5. Editar: el autor o un admin.
--    En las compras, cualquiera (para marcar "comprado")
create policy "Editar observaciones"
on observaciones for update
to authenticated
using (autor_id = mi_miembro() or soy_admin() or tipo = 'compra');


-- 6. Borrar: el autor o un admin
create policy "Borrar observaciones"
on observaciones for delete
to authenticated
using (autor_id = mi_miembro() or soy_admin());


-- 7. Nada para quien no ha iniciado sesión
revoke all on observaciones from anon;


-- 8. Tiempo real (para la campanita)
alter publication supabase_realtime add table observaciones;


-- 9. Suscripciones a notificaciones (23/11/2026)

create table suscripciones(
  id bigint generated always as identity primary key,
  miembro_id text not null default mi_miembro() references miembros(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creada_el timestamptz not null default now()
);

alter table suscripciones enable row level security;


-- Cada persona solo ve, crea y borra las suyas
create policy "Ver mis suscripciones"
on suscripciones for select to authenticated
using (miembro_id = mi_miembro());


create policy "Crear mi suscripcion"
on suscripciones for insert to authenticated
with check (miembro_id = mi_miembro());

create policy "Borrar mi suscripcion"
on suscripciones for delete to authenticated
using (miembro_id = mi_miembro());

revoke all on suscripciones from anon;