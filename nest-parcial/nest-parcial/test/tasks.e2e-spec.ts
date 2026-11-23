// Pruebas e2e de los 4 casos
import { INestApplication } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../src/app.setup';
import { Task, TaskSchema } from '../src/tasks/schemas/task.schema';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksModule } from '../src/tasks/tasks.module';
import { TasksService } from '../src/tasks/tasks.service';
import { User } from '../src/users/schemas/user.schema';
import { UsersController } from '../src/users/users.controller';
import { UsersModule } from '../src/users/users.module';
import { UsersService } from '../src/users/users.service';

const ADMIN = 'admin-secret-token';
const USER_ID = new Types.ObjectId().toString();

// Modelo sin conexión para aplicar el esquema
const TaskModelForSchema = mongoose.model('TaskSchemaCheck', TaskSchema);

function execOf<T>(value: T) {
  return { exec: () => Promise.resolve(value) };
}

function buildTaskModelDouble(store: Record<string, unknown>[]) {
  return {
    create: (data: Record<string, unknown>) => {
      // El esquema estricto quita campos extra
      const stored = new TaskModelForSchema(data).toObject() as Record<
        string,
        unknown
      >;
      store.push(stored);
      return Promise.resolve(stored);
    },
    find: () => execOf(store),
    findById: (id: string) =>
      execOf(store.find((t) => String(t._id) === id) ?? null),
  };
}

describe('Tasks (e2e) — casos del parcial', () => {
  let app: INestApplication<App>;
  let store: Record<string, unknown>[];

  beforeEach(async () => {
    store = [];
    const users = [{ _id: USER_ID, name: 'Maria Garcia', email: 'm@x.com' }];

    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController, UsersController],
      providers: [
        TasksService,
        UsersService,
        {
          provide: getModelToken(Task.name),
          useValue: buildTaskModelDouble(store),
        },
        {
          provide: getModelToken(User.name),
          useValue: {
            findById: (id: string) =>
              execOf(users.find((u) => u._id === id) ?? null),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Caso 1 — propiedades no autorizadas', () => {
    it('POST /tasks con isAdmin/role/internalFlag → 400 y no se guarda nada', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', ADMIN)
        .send({
          title: 'Revisión de infraestructura',
          userId: USER_ID,
          isAdmin: true,
          role: 'superuser',
          internalFlag: 'MODIFIED_BY_ATTACKER',
        })
        .expect(400);

      const body = res.body as { message: string[] };
      expect(body.message).toEqual(
        expect.arrayContaining([
          'property isAdmin should not exist',
          'property role should not exist',
          'property internalFlag should not exist',
        ]),
      );
      expect(store).toHaveLength(0);
    });

    it('POST /tasks con tipos inválidos → 400', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', ADMIN)
        .send({ title: '', userId: 'no-es-un-objectid', completed: 'si' })
        .expect(400);
    });

    it('el esquema Task es estricto: descarta atributos fuera del modelo', () => {
      expect(TaskSchema.get('strict')).toBe(true);
      const doc = new TaskModelForSchema({
        title: 'x',
        userId: USER_ID,
        isAdmin: true,
        role: 'superuser',
      }).toObject() as Record<string, unknown>;
      expect(doc).not.toHaveProperty('isAdmin');
      expect(doc).not.toHaveProperty('role');
    });
  });

  describe('Caso 2 — encapsulamiento del dominio de usuarios', () => {
    it('UsersModule exporta UsersService y TasksModule importa UsersModule', () => {
      const exportsMeta = Reflect.getMetadata(
        MODULE_METADATA.EXPORTS,
        UsersModule,
      ) as unknown[];
      const importsMeta = Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        TasksModule,
      ) as unknown[];
      expect(exportsMeta).toContain(UsersService);
      expect(importsMeta).toContain(UsersModule);
    });

    it('POST /tasks con usuario inexistente → 404 (verificado vía UsersService)', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', ADMIN)
        .send({ title: 'Auditar dependencias', userId: new Types.ObjectId() })
        .expect(404);
      expect(store).toHaveLength(0);
    });
  });

  describe('Caso 3 — GET público, POST restringido con AuthGuard', () => {
    it('GET /tasks sin cabeceras → 200', async () => {
      await request(app.getHttpServer()).get('/tasks').expect(200);
    });

    it('GET /tasks/:id sin cabeceras → 200', async () => {
      const created = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', ADMIN)
        .send({ title: 'Implementar pruebas', userId: USER_ID })
        .expect(201);
      const id = String((created.body as { _id: string })._id);
      await request(app.getHttpServer()).get(`/tasks/${id}`).expect(200);
    });

    it('POST /tasks sin Authorization → 403 ForbiddenException estándar', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .send({ title: 'Configurar pipeline CI/CD', userId: USER_ID })
        .expect(403);
      expect(res.body).toMatchObject({ statusCode: 403, error: 'Forbidden' });
    });

    it('POST /tasks con token incorrecto → 403', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', 'otro-token')
        .send({ title: 'Configurar pipeline CI/CD', userId: USER_ID })
        .expect(403);
    });
  });

  describe('Caso 4 — creación delegada en TasksService', () => {
    it('POST /tasks válido → 201 y la tarea se persiste vía TasksService.create', async () => {
      const spy = jest.spyOn(app.get(TasksService), 'create');
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', ADMIN)
        .send({
          title: '  Implementar pruebas  ',
          description: 'Cobertura de tareas',
          userId: USER_ID,
        })
        .expect(201);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(res.body).toMatchObject({
        title: 'Implementar pruebas',
        description: 'Cobertura de tareas',
        completed: false,
      });
      expect(store).toHaveLength(1);
    });
  });
});
