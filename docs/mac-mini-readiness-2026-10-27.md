# AeroTrade: mejoras locales y pendientes del traspaso

Fecha: 27 de octubre de 2026. Estado: candidato local; **no desplegado**.

Esta nota sustituye los resúmenes de agosto como punto de entrada para el trabajo
local. Los informes antiguos conservan su valor histórico, pero no prueban el
estado productivo de hoy.

## Base y entorno

- Rama de trabajo: `codex/aerotrade-reliability-20261027`, separada de `main`.
- Base de implementación: `105500fba1d15062c99920d6fdf93b23b6abab73`.
- `production` observada durante el traspaso: `de2dc0b7decd9a6b7337ffadf8f2d5956d93b676`.
- Deploy publicado observado el 27/10 a las 14:43 UTC: `6adef8a98bf0bba36d1ea3e7`,
  asociado a esa referencia productiva. Revalidar el puntero publicado antes de
  cualquier liberación; una referencia Git no demuestra el deploy activo.
- Mac mini de Jordi, usuario `jordi`; Git 2.54.0 (Apple Git-157).
- Node 24.11.1 y npm 11.6.2 fijados para reproducir el entorno del traspaso.
  Las dependencias se regeneran con `npm ci`; no se transfieren cachés ni sesiones.

## Cambios implementados

1. **Dependencias:** Next y eslint-config-next 16.4.3; Sharp 0.35.5;
   correcciones transitivas compatibles. Jimp y su cadena vulnerable de Zod se
   eliminan. Sharp genera las tarjetas con entradas raster limitadas, texto
   escapado y fuentes Geist incluidas con licencia. No se fuerza una regresión de Jimp.
2. **Newsletter:** un validador de elegibilidad común rechaza dominios reservados
   en la solicitud pública, generación de confirmación y selección de destinatarios,
   incluido el destinatario de pruebas. La normalización criptográfica histórica
   y las bajas permanecen compatibles. Las pruebas de la acción comprueban que una
   dirección reservada se rechaza antes de acceder a cabeceras, base de datos o proveedor.
3. **Redes:** el horario existente encola `social-publish-background`; un 202
   sólo acredita la admisión del trabajo. La función comparte la lógica con las
   rutas existentes, conserva la fecha de despacho y dispone de un presupuesto de
   diez minutos para las operaciones de red controladas, con veinte segundos por
   petición de Meta/Supabase. Las respuestas se limitan por tamaño y las imágenes
   se restringen a los dos hosts ya admitidos por la aplicación. Los recibos de cada
   publicación conservan el ID conocido de Meta ante un fallo posterior de base
   de datos. Un resultado ambiguo bloquea el reintento automático. Los errores
   controlados del trabajador se registran y no solicitan a Netlify que vuelva a
   seleccionar contenido. Un fallo abrupto de infraestructura puede ser reintentado
   por Netlify; los recibos pendientes/aceptados bloquean repetir esa publicación.
4. **Auditorías de cobros:** paginación acotada, ventana temporal con fin fijo,
   modo Stripe explícito y webhook de URL exacta. La conciliación de Stripe usa
   `charge_id`, importe, moneda y modo; ya no compara dos cantidades de filas.
   El baseline de Supabase relaciona recibos por `stripe_event_id`; declara la
   cobertura por cargo como no verificada porque el registro histórico de eventos
   no conserva `charge_id` ni modo. No se añade ninguna migración.
5. **Automatizaciones:** `audit:production-automations` sólo observa tablas mediante
   GET/HEAD, con paginación y huellas. `simulate:production-automations` es un comando
   separado que exige además `CONFIRM_PRODUCTION_CRON_SIMULATION=1` y la referencia
   productiva verificada. No afirma cero mensajes enviados ni atribuye los cambios
   concurrentes a la simulación. Ninguno se ha ejecutado contra producción en esta implementación.
6. **Compilación:** las fuentes ya no se descargan de Google durante build.
   CI para pull requests ejecuta instalación, auditoría de dependencias, tests,
   contratos, lint, TypeScript y build; no tiene horario, secretos productivos ni
   despliegue. Las acciones se fijan por SHA. Su ejecución en GitHub está pendiente.
7. **Identidad de redes:** la auditoría de Meta compara la cuenta configurada con
   Instagram `@balloonconsulting` y Facebook `balloonpilotshop`, confirmados por Jordi.
   No enumera páginas de otros proyectos. Esta implementación no cambia cuentas,
   tokens, permisos ni integraciones existentes.

## Validación local

- `npm ci`: correcta; instalación nueva a partir del lockfile.
- `npm audit`: cero vulnerabilidades tras eliminar Jimp.
- `npm test`: 273 pruebas correctas, incluidas concurrencia, recibo no persistido,
  timeout ambiguo, paginación, bloqueo de escrituras y elegibilidad de newsletter.
- `npm run audit:local`: 245 contratos correctos.
- `npm run lint` y `npx tsc --noEmit`: correctos.
- `npm run build`: correcto con Next 16.4.3/Turbopack. La primera ejecución dentro
  del sandbox se interrumpió sin terminar; la ejecución local con permiso ampliado
  pasó. No hubo sustitución por una compilación Webpack.
- Empaquetado local con la biblioteca de Netlify: cinco horarios y un trabajador
  sin horario; fuentes incluidas. No se subieron los paquetes.
- Tarjetas post/story generadas con datos sintéticos y revisadas localmente.
- Next avisa de la deprecación del Edge Runtime en las rutas de imágenes existentes.
  Ese aviso no impide el build; su eventual cambio requiere revisar esas rutas.

Los resultados locales no demuestran entrega real de correos, publicación en Meta,
operaciones de Stripe ni funcionamiento del nuevo trabajador en Linux/Netlify.

## Automatizaciones existentes

| Plataforma | Función | Horario UTC |
| --- | --- | --- |
| GitHub Actions | Newsletter | 09:00, días 1 y 16 |
| GitHub Actions | IndexNow | 04:15, diario |
| GitHub Actions | Recuperación de newsletter | Manual |
| Netlify | Redes | 07:00, diario |
| Netlify | Wanted match | 07:30, diario |
| Netlify | Opportunity follow-up | 06:00, diario |
| Netlify | Calidad de catálogo | 05:30, diario |
| Netlify | Listing watch | Minuto 15, cada cuatro horas |

El trabajador nuevo carece de `schedule`. No se crea ninguna automatización local.

## Accesos y comprobaciones pendientes

Durante el traspaso se comprobaron GitHub (`jordidc86`), Netlify y el proyecto
Supabase `balloonmarket` (`vqdpveyshgvdhbsgskns`, ACTIVE_HEALTHY). La disponibilidad
HTTP de portada, catálogo, robots y sitemap se comprobó el 27/10 a las 15:35 UTC.
Eso no equivale a comprobar las integraciones comerciales.

Antes de una liberación, cotejar en las sesiones existentes del proveedor:

- En Meta, que los identificadores configurados correspondan a las dos cuentas
  confirmadas y que permisos y caducidad permitan las operaciones previstas.
- En Stripe, el webhook canónico y la cobertura real por cargo del modo correcto.
- En Resend, dominio/remitente y eventos de entrega, sin enviar un correo de prueba.
- En Supabase, disponibilidad y retención de los respaldos de datos. El bundle Git
  preserva código e historia, no los datos productivos.
- En Netlify, disponibilidad de Background Functions y empaquetado Linux de Sharp.
  La prueba local de macOS no sustituye esa verificación.

Si hace falta login, Jordi lo completa en la interfaz del proveedor. No pegar
credenciales en el chat ni descargar automáticamente variables productivas.

## Respaldo y reconciliación

El ZIP histórico y su bundle se verificaron y se preservaron por separado:

- ZIP: `7cb97cee04f153f420e5a3e6a55f695138ef45be355059fe218a7ebca6929edd`.
- Bundle: `3e6965b5982d1dbaf12c670d70f625a77d6f756e9866e46784bd23ae4c21fa8d`.
- 13 ramas, 34 referencias y 4088 objetos alcanzables verificados.
- 21 archivos pendientes clasificados: cuatro idénticos a main y 17 revisados.
  La mejora de newsletter se incorpora mediante cambios nuevos revisados; los
  parches históricos y metadatos de Supabase no se restauran en la configuración.
- Los respaldos privados permanecen fuera del repositorio y no se publican.
- Jordi no dispone ahora de disco externo. Una segunda carpeta del mismo Mac
  no es una copia independiente: **conservar el Mac anterior** hasta disponer
  de otro soporte o ubicación privada acordada y verificar sus hashes.

## Siguiente paso

Revisar este candidato y sus tarjetas, completar las comprobaciones de proveedor
sin envíos y cerrar la copia independiente cuando haya destino. Después preparar
una liberación concreta siguiendo `docs/aerotrade-production-release.md`, con
aprobación expresa de Jordi. Esta rama no mueve `production` ni cambia el marcador
de liberación. No se han ejecutado migraciones, cron, pagos, emails ni publicaciones.

Referencias técnicas: [Background Functions de Netlify](https://docs.netlify.com/build/functions/background-functions/),
[checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node).
