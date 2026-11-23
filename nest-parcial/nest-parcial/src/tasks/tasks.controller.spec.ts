import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';

describe('TasksController', () => {
  let controller: TasksController;
  const tasksService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Solo se mockea TasksService
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: tasksService }],
    }).compile();

    controller = module.get<TasksController>(TasksController);
  });

  it('se resuelve con únicamente TasksService', () => {
    expect(controller).toBeDefined();
  });

  it('POST /tasks delega la creación a TasksService.create', async () => {
    const dto: CreateTaskDto = {
      title: 'Implementar pruebas',
      userId: '6af691f7ad6c0c0e2753eaf2',
    };
    const created = { _id: 'abc', ...dto, completed: false };
    tasksService.create.mockResolvedValue(created);

    await expect(controller.create(dto)).resolves.toEqual(created);
    expect(tasksService.create).toHaveBeenCalledWith(dto);
  });

  it('GET /tasks delega en TasksService.findAll', async () => {
    tasksService.findAll.mockResolvedValue([]);
    await expect(controller.findAll()).resolves.toEqual([]);
    expect(tasksService.findAll).toHaveBeenCalled();
  });
});
