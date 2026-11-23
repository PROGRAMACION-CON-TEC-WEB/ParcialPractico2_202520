import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TasksService } from './tasks.service';
import { Task } from './schemas/task.schema';
import { UsersService } from '../users/users.service';

describe('TasksService', () => {
  let service: TasksService;
  const taskModel = { create: jest.fn(), find: jest.fn(), findById: jest.fn() };
  const usersService = { findById: jest.fn() };
  const dto = {
    title: 'Implementar pruebas',
    userId: '6af691f7ad6c0c0e2753eaf2',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getModelToken(Task.name), useValue: taskModel },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  it('create verifica el usuario vía UsersService y persiste la tarea', async () => {
    usersService.findById.mockResolvedValue({ _id: dto.userId });
    taskModel.create.mockResolvedValue({ _id: 't1', ...dto, completed: false });

    await expect(service.create(dto)).resolves.toMatchObject({ _id: 't1' });
    expect(usersService.findById).toHaveBeenCalledWith(dto.userId);
    expect(taskModel.create).toHaveBeenCalledWith(dto);
  });

  it('create no persiste si el usuario no existe', async () => {
    usersService.findById.mockRejectedValue(new NotFoundException());

    await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(taskModel.create).not.toHaveBeenCalled();
  });
});
