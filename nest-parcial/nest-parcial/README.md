# Proyecto Base — Parcial Práctico Backend (NestJS + MongoDB)

API REST en NestJS y Mongoose para la gestión de **Usuarios (`/users`)** y **Tareas (`/tasks`)**.

---

## Requisitos Previos

- **Node.js** 18+ y **npm**
- **Docker Desktop** (o instancia local de MongoDB en el puerto `27017`)

---

## Instalación y Puesta en Marcha

1. **Levantar la base de datos MongoDB:**
   ```bash
   docker compose up -d
   ```
   *(Si utilizas una instancia local o MongoDB Atlas diferente a `mongodb://localhost:27017/nest-parcial`, configura la variable `MONGODB_URI` en un archivo `.env` tomando como base `.env.example`.)*

2. **Instalar dependencias del proyecto:**
   ```bash
   npm install
   ```

3. **Iniciar la aplicación en modo desarrollo:**
   ```bash
   npm run start:dev
   ```
   El servidor quedará disponible en `http://localhost:3000`.

---

## Pruebas y Validación

- **Ejecutar pruebas unitarias:**
  ```bash
  npm test
  ```
- **Ejecutar pruebas end-to-end:**
  ```bash
  npm run test:e2e
  ```
- **Verificar compilación y linter:**
  ```bash
  npm run build
  npm run lint
  ```

---

## Endpoints del Sistema

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Público | Verificación básica del servidor |
| `POST` | `/users` | Público | Crear usuario (`name`, `email`) |
| `GET` | `/users` | Público | Listar usuarios registrados |
| `GET` | `/users/:id` | Público | Consultar usuario por ID |
| `GET` | `/tasks` | Público | Listar tareas registradas |
| `GET` | `/tasks/:id` | Público | Consultar tarea por ID |
| `POST` | `/tasks` | Restringido (`Authorization: admin-secret-token`) | Crear una tarea asociada a un usuario |

También puedes importar `nest-parcial.postman_collection.json` en Postman o utilizar `requests.http` con la extensión REST Client de VS Code para probar manualmente los endpoints.

---

## Refactorización — Parcial Práctico 2 (evidencia de los 4 casos)

### Cómo verificar

```bash
npm install
npm run build                                          
# compila sin errores
npm test                                               
# pruebas unitarias (6/6)
npx jest --config ./test/jest-e2e.json test/tasks.e2e-spec.ts --verbose   
# e2e de los 4 casos (10/10)
```

`test/tasks.e2e-spec.ts` levanta la aplicación HTTP real de Nest (mismo `ValidationPipe` global que `main.ts` vía `configureApp`, `AuthGuard`, controladores y servicios reales). Solo los modelos de Mongoose se reemplazan en este caso por un almacén en memoria que pasa cada documento por el `TaskSchema` real, así que no hace falta MongoDB para ejecutarlas en razon de palabra. Para probar contra MongoDB real: `docker compose up -d`, `npm run start:dev` y `requests.http`.

### Caso 1: Mass Assignment / BOPLA en `POST /tasks`

| | Antes | Después |
| :--- | :--- | :--- |
| Entrada | `@Body() payload: any` | `@Body() createTaskDto: CreateTaskDto` ([src/tasks/dto/create-task.dto.ts](src/tasks/dto/create-task.dto.ts)): `title` (string, ≥3, trim), `description?` (string), `completed?` (boolean), `userId` (`@IsMongoId`) |
| Pipe | ninguno | `ValidationPipe({ transform, whitelist, forbidNonWhitelisted })` global ([src/app.setup.ts](src/app.setup.ts), usado en [src/main.ts](src/main.ts)) |
| Esquema | `@Schema({ strict: false })` | `@Schema({ timestamps: true, strict: true, strictQuery: true })` |

Petición del incidente (`isAdmin`, `role`, `internalFlag`) -> ahora **400 Bad Request**:

```json
{
  "message": [
    "property isAdmin should not exist",
    "property role should not exist",
    "property internalFlag should not exist"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

Y aunque una capa superior fallara, el esquema estricto descarta los atributos fuera del modelo (defensa en profundidad).

### Caso 2: Acoplamiento al modelo de usuarios

- [src/users/users.module.ts](src/users/users.module.ts): `exports: [UsersService]`.
- [src/tasks/tasks.module.ts](src/tasks/tasks.module.ts): se elimina `{ name: User.name, schema: UserSchema }` del `forFeature` y se importa `UsersModule`.
- [src/tasks/tasks.service.ts](src/tasks/tasks.service.ts): `create` verifica el usuario con `usersService.findById(userId)` (lanza `NotFoundException` genera **404**).

El dominio de tareas ya no conoce la colección `users`; el equipo de usuarios puede cambiar su esquema sin romper tareas mientras mantenga el contrato de `UsersService`.

### Caso 3: Middleware bloq rutas pub

- Se elimina `src/auth.middleware.ts` y su registro en `AppModule.configure()`.
- Nuevo [src/auth/auth.guard.ts](src/auth/auth.guard.ts) (`CanActivate`): valida `Authorization: admin-secret-token` y lanza `ForbiddenException`.
- `@UseGuards(AuthGuard)` solo en `POST /tasks`.

| Petición | Antes | Después |
| :--- | :--- | :--- |
| `GET /tasks` (sin cabeceras) | 403 `{"error":"Prohibido"}` | **200** `[...]` |
| `GET /tasks/:id` (sin cabeceras) | 403 | **200** |
| `POST /tasks` sin token / token inválido | 403 (manual) | **403** `{"message":"Token de autorización inválido o ausente","error":"Forbidden","statusCode":403}` |
| `POST /tasks` con `admin-secret-token` | 201 | **201** |

### Caso 4: Contr acoplado a Mongoose / no testeable

- [src/tasks/tasks.controller.ts](src/tasks/tasks.controller.ts): el constructor solo recibe `TasksService`; `POST /tasks` recibe el DTO validado y delega en `tasksService.create(dto)`.
- La validación del usuario y la persistencia viven en `TasksService.create`.
- [src/tasks/tasks.controller.spec.ts](src/tasks/tasks.controller.spec.ts) mockea **únicamente** `TasksService` y compila sin el error `Nest can't resolve dependencies of the TasksController (?, ?, TasksService)`.

### Resultado de las pruebas

```
PASS src/app.controller.spec.ts
PASS src/tasks/tasks.controller.spec.ts
PASS src/tasks/tasks.service.spec.ts
Tests: 6 passed, 6 total

PASS test/tasks.e2e-spec.ts

  Caso 1: prop no autorizadas
    POST /tasks con isAdmin/role/internalFlag -> 400 y no se guarda nada
    POST /tasks con tipos inválidos -> 400
    
    el esquema Task es estricto: descarta atributos fuera del modelo
  Caso 2: encapsulamiento del dominio de usuarios
    UsersModule exporta UsersService y TasksModule importa UsersModule
    POST /tasks con usuarioo inexistente -> 404 (verificado vía UsersService)

  Caso 3: GET público, POST restringido con AuthGuard
    GET /tasks sin cabeceras -> 200
    GET /tasks/:id sin cabeceras -> 200
    POST /tasks sin Authorization -> 403 ForbiddenException estándar
    POST /tasks con token incorrecto -> 403

  Caso 4: creacion delegada en TasksService
    POST /tasks válido -> 201 y la tarea se persiste vía TasksService.create
Tests: 10 passed, 10 total
```

Cobertura de `TasksService.create` durante la creacion: 100 % de sus líneas (antes 0 %, porque la lógica estaba en el controlador).
