import { FastifyInstance } from 'fastify';
import { UserController } from '../controllers/user.controller';

export async function userRoutes(app: FastifyInstance) {
  const controller = new UserController();

  app.get('/', controller.list);
  app.get('/:id', controller.getById);
  app.put('/:id', controller.update);
  app.delete('/:id', controller.delete);
  app.get('/:id/roles', controller.getRoles);
  app.put('/:id/roles', controller.updateRoles);
}

